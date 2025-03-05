// Utility debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeInput(input) {
    return input
        .replace(/[<>]/g, '') // Remove potential HTML
        .trim()
        .slice(0, 500); // Reasonable length limit
}

// New helper function for smooth number transition
function animateNumberChange(element, startValue, endValue) {
    if (!element) return;
    
    const duration = 300; // Shorter animation for quick updates
    const frames = 20;
    const increment = (endValue - startValue) / frames;
    
    let currentFrame = 0;
    let currentValue = startValue;

    function updateFrame() {
        currentFrame++;
        currentValue += increment;
        
        if (currentFrame <= frames) {
            // Round to nearest integer
            element.textContent = Math.round(currentValue);
            requestAnimationFrame(updateFrame);
        } else {
            // Ensure final value is exact
            element.textContent = endValue;
        }
    }

    requestAnimationFrame(updateFrame);
}

function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => document.body.removeChild(toast), 600);
    }, 3000);
}

function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => document.body.removeChild(toast), 600);
    }, 3000);
}

function showScreen(screenId, forceRefresh = false) {
    // Prevent unregistered users from seeing upgrade screen
    if (screenId === "upgrade-screen" && !currentUser) {
      console.log("Unregistered user attempt to access upgrade screen, redirecting to auth modal");
      screenId = "welcome-screen"; // Redirect to welcome screen first
      
      // Show auth modal with signup form after a brief delay
      setTimeout(() => {
        showAuthModal();
        // Switch to signup form
        setTimeout(() => {
          const loginForm = document.getElementById('loginForm');
          const signupForm = document.getElementById('signupForm');
          if (loginForm && signupForm) {
            loginForm.classList.add('hidden');
            signupForm.classList.remove('hidden');
          }
        }, 100);
      }, 200);
    }
  
    // When returning to welcome screen, clear game context
    if (screenId === "welcome-screen") {
      console.log("Returning to welcome screen, clearing game context");
      localStorage.removeItem("gameContext");
    }
     
    console.log("showScreen called with:", {
      screenId: screenId,
      forceRefresh: forceRefresh,
      currentUser: currentUser ? currentUser.id : "No user"
    });
     
    // Special handling for leaderboard screen cleanup
    if (document.querySelector('.screen.visible')?.id === 'leaderboard-screen') {
      cleanupLeaderboard();
    }
     
    // Get currently visible screen
    const currentScreen = document.querySelector('.screen.visible');
     
    // Cleanup if leaving question screen
    if (currentScreen && currentScreen.id === 'question-screen') {
      clearTimer();
      isFrozen = false;
    }
     
    // Handle force refresh
    if (forceRefresh && screenId === "welcome-screen") {
      console.log("Initiating full page reload");
      saveProgress();
      window.location.reload(true);
      return;
    }
  
    if (["question-screen", "custom-practice-screen", "moderator-screen", "leaderboard-screen"].includes(screenId)) {
      updateNavigationContainer();
    }
     
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('visible');
         
      // Remove particle containers
      const particleContainer = screen.querySelector('.particle-container');
      if (particleContainer) {
        particleContainer.remove();
      }
    });
     
    // Show requested screen
    const screenElement = document.getElementById(screenId);
    if (screenElement) {
      // Make screen visible
      screenElement.classList.add('visible');
         
      // Initialize particles for the screen
      initializeParticles(screenElement);
         
      // Update UI elements
      updateAllCoinDisplays();
         
      // Special handling for different screens
      switch (screenId) {
        case "question-screen":
          updatePerkButtons();
                 
          // Check for admin user and add test button
          console.log("Question screen shown, checking for admin button");
          setTimeout(() => {
            addAdminTestButton();
          }, 100);
          break;
               
        case "welcome-screen":
          if (restoreGameContext()) {
            startGame();
          }
          break;
               
        case "stage-cascade-screen":
          // Handle the cascading stage screen specially
          return showStageCascadeScreen();
      }
         
      console.log(`Switched to screen: ${screenId}`);
    } else {
      console.error(`Screen with id ${screenId} not found`);
    }
  }
  
  document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.home-button').forEach(button => {
          button.addEventListener('click', (event) => {
              event.preventDefault();
              showScreen('welcome-screen', true);
          });
      });
  });

  async function transitionScreen(screenType) {
    const currentScreen = document.querySelector('.screen.visible');
    if (currentScreen) {
        currentScreen.style.opacity = 0;
        await new Promise(r => setTimeout(r, 300));
        currentScreen.style.display = 'none';
    }
    
    const nextScreen = document.getElementById(`${screenType}-screen`);
    nextScreen.style.display = 'flex';
    requestAnimationFrame(() => {
        nextScreen.style.opacity = 1;
    });
}

// Call this before showScreen
function safeShowScreen(screenId, forceRefresh = false) {
    ensureScreenExists(screenId);
    showScreen(screenId, forceRefresh);
}

function ensureScreenExists(screenId) {
    if (!document.getElementById(screenId)) {
        console.warn(`Screen ${screenId} doesn't exist. Creating it.`);
        const screen = document.createElement('div');
        screen.id = screenId;
        screen.className = 'screen';
        document.body.appendChild(screen);
    }
}

function updateNavigationIcons(screenId) {
    // Remove existing navigation containers
    
    // Screens that should have navigation
    const screensWithNav = ['stage-screen', 'set-screen', 'level-screen', 'question-screen'];
    
    if (screensWithNav.includes(screenId)) {
        const navContainer = document.createElement('div');
        navContainer.className = 'screen-nav';
        
        // Home button (always present)
        const homeButton = document.createElement('button');
        homeButton.className = 'home-button';
        homeButton.innerHTML = '<i class="fas fa-home"></i>';
        homeButton.onclick = () => showScreen('welcome-screen');
        navContainer.appendChild(homeButton);
        
        // Back button (not for stage screen)
        if (screenId !== 'stage-screen') {
            const backButton = document.createElement('button');
            backButton.className = 'back-button';
            backButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
            
            // Determine back navigation based on current screen
            switch(screenId) {
                case 'set-screen':
                    backButton.onclick = () => showScreen('stage-screen');
                    break;
                case 'level-screen':
                    backButton.onclick = () => showSetScreen(gameState.currentStage);
                    break;
                case 'question-screen':
                    backButton.onclick = () => stopLevelAndGoBack();
                    break;
            }
            
            navContainer.appendChild(backButton);
        }
        
        // Add navigation to the current screen
        const currentScreen = document.getElementById(screenId);
        currentScreen.appendChild(navContainer);
    }
}

function updateNavigationContainer() {
    // Remove any existing navigation menu
    const existingMenu = document.querySelector('.navigation-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // Use our vertical navigation container instead
    let navContainer = document.querySelector('.vertical-nav-container');
    
    // If container doesn't exist, create it
    if (!navContainer) {
        navContainer = document.createElement('div');
        navContainer.className = 'vertical-nav-container';
        document.body.appendChild(navContainer);
        
        // Create hamburger button
        const hamburgerBtn = document.createElement('button');
        hamburgerBtn.className = 'hamburger-button';
        hamburgerBtn.id = 'nav-hamburger-btn';
        hamburgerBtn.innerHTML = '<i class="fas fa-bars"></i>';
        hamburgerBtn.onclick = toggleSidePanel;
        navContainer.appendChild(hamburgerBtn);
        
        // Create home button
        const homeBtn = document.createElement('button');
        homeBtn.className = 'nav-button home-button';
        homeBtn.id = 'nav-home-btn';
        homeBtn.innerHTML = '<i class="fas fa-home"></i>';
        homeBtn.onclick = navigateHome || function() { showScreen('welcome-screen'); };
        navContainer.appendChild(homeBtn);
        
        // Create fullscreen button
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'nav-button fullscreen-button';
        fullscreenBtn.id = 'nav-fullscreen-btn';
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.onclick = toggleFullScreen;
        navContainer.appendChild(fullscreenBtn);
        
        // Create reset button
        const resetBtn = document.createElement('button');
        resetBtn.className = 'nav-button reset-button';
        resetBtn.id = 'nav-reset-btn';
        resetBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        resetBtn.onclick = handleResetProgress;
        navContainer.appendChild(resetBtn);
        
        // Create settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'nav-button settings-button';
        settingsBtn.id = 'nav-settings-btn';
        settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
        settingsBtn.onclick = function() {
            const accessibilityModal = document.querySelector('.accessibility-modal');
            if (accessibilityModal) {
                accessibilityModal.classList.add('show');
            }
        };
        navContainer.appendChild(settingsBtn);
        
        // Create accessibility button
        const accessBtn = document.createElement('button');
        accessBtn.className = 'nav-button accessibility-button';
        accessBtn.id = 'nav-accessibility-btn';
        accessBtn.innerHTML = '<i class="fas fa-universal-access"></i>';
        accessBtn.onclick = function() {
            const accessibilityModal = document.querySelector('.accessibility-modal');
            if (accessibilityModal) {
                accessibilityModal.classList.add('show');
            }
        };
        navContainer.appendChild(accessBtn);
    }
    
    // Remove any standalone buttons that might conflict
    const existingButtons = {
        hamburger: document.querySelector('.hamburger-button:not(.vertical-nav-container .hamburger-button)'),
        home: document.querySelector('.home-button:not(.vertical-nav-container .home-button)'),
        fullscreen: document.querySelector('.fullscreen-button:not(.vertical-nav-container .fullscreen-button)'),
        reset: document.querySelector('.reset-button:not(.vertical-nav-container .reset-button)'),
        settings: document.querySelector('.settings-button:not(.vertical-nav-container .settings-button)'),
        accessibility: document.querySelector('.accessibility-toggle')
    };
    
    Object.values(existingButtons).forEach(button => {
        if (button && button.parentNode) {
            button.parentNode.removeChild(button);
        }
    });
}

function optimizeMobileRendering() {
    // Throttle particle generation
    ParticleSystem.maxParticles = 20; // Reduce from 50
    
    const debouncedShowScreen = debounce(showScreen, 200);
    
    // Limit complex animations on mobile
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        document.body.classList.add('mobile-device');
        
        // Reduce complex CSS animations
        document.head.insertAdjacentHTML('beforeend', `
            <style>
                @media (max-width: 768px) {
                    .confetti, .particle {
                        display: none;
                    }
                }
            </style>
        `);
    }
}

function optimizeMobileEvents() {
    // Use passive event listeners
    document.addEventListener('touchstart', () => {}, { passive: true });
    document.addEventListener('touchmove', () => {}, { passive: true });
    
    // Remove unnecessary event listeners
    const cleanupEventListeners = () => {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.removeEventListener('touchstart', () => {});
            screen.removeEventListener('touchmove', () => {});
        });
    };
}

// Call this when showing the question screen
document.addEventListener('DOMContentLoaded', function() {
    // Run on existing showScreen function calls
    const originalShowScreen = window.showScreen;
    if (typeof originalShowScreen === 'function') {
      window.showScreen = function(screenId, forceRefresh) {
        originalShowScreen(screenId, forceRefresh);
        if (screenId === 'question-screen') {
          optimizeQuestionScreenForMobile();
        }
      };
    }
    
    // Also apply when the question screen is already visible
    if (document.getElementById('question-screen')?.classList.contains('visible')) {
      optimizeQuestionScreenForMobile();
    }
  });

  function initVerticalNavigation() {
    // Find existing buttons on the page
    const existingButtons = {
        hamburger: document.querySelector('.hamburger-button:not(.vertical-nav-container .hamburger-button)'),
        home: document.querySelector('.home-button:not(.vertical-nav-container .home-button)'),
        fullscreen: document.querySelector('.fullscreen-button:not(.vertical-nav-container .fullscreen-button)'),
        reset: document.querySelector('.reset-button:not(.vertical-nav-container .reset-button)'),
        settings: document.querySelector('.settings-button:not(.vertical-nav-container .settings-button)'),
        accessibility: document.querySelector('.accessibility-toggle')
    };
    
    // Get or create the navigation container
    let navContainer = document.querySelector('.vertical-nav-container');
    if (!navContainer) {
        navContainer = document.createElement('div');
        navContainer.className = 'vertical-nav-container';
        document.body.appendChild(navContainer);
    }
    
    // Clear container
    navContainer.innerHTML = '';
    
    // Create new buttons in the container with the same functionality
    // Hamburger button
    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'hamburger-button';
    hamburgerBtn.id = 'nav-hamburger-btn';
    hamburgerBtn.innerHTML = '<i class="fas fa-bars"></i>';
    hamburgerBtn.onclick = toggleSidePanel;
    navContainer.appendChild(hamburgerBtn);
    
    // Home button
    const homeBtn = document.createElement('button');
    homeBtn.className = 'nav-button home-button';
    homeBtn.id = 'nav-home-btn';
    homeBtn.innerHTML = '<i class="fas fa-home"></i>';
    homeBtn.onclick = navigateHome || function() { showScreen('welcome-screen'); };
    navContainer.appendChild(homeBtn);
    
    // Fullscreen button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'nav-button fullscreen-button';
    fullscreenBtn.id = 'nav-fullscreen-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.onclick = toggleFullScreen;
    navContainer.appendChild(fullscreenBtn);
    
    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'nav-button reset-button';
    resetBtn.id = 'nav-reset-btn';
    resetBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    resetBtn.onclick = handleResetProgress;
    navContainer.appendChild(resetBtn);
    
    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'nav-button settings-button';
    settingsBtn.id = 'nav-settings-btn';
    settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
    settingsBtn.onclick = function() { 
        // Replace with actual settings function if available
        const accessibilityModal = document.querySelector('.accessibility-modal');
        if (accessibilityModal) accessibilityModal.classList.add('show');
    };
    navContainer.appendChild(settingsBtn);
    
    // Accessibility button
    const accessBtn = document.createElement('button');
    accessBtn.className = 'nav-button accessibility-button';
    accessBtn.id = 'nav-accessibility-btn';
    accessBtn.innerHTML = '<i class="fas fa-universal-access"></i>';
    accessBtn.onclick = function() { 
        const accessibilityModal = document.querySelector('.accessibility-modal');
        if (accessibilityModal) accessibilityModal.classList.add('show');
    };
    navContainer.appendChild(accessBtn);
    
    // Remove original buttons
    Object.values(existingButtons).forEach(button => {
        if (button && button.parentNode) {
            button.parentNode.removeChild(button);
        }
    });
}

// Call this function when the DOM is loaded
document.addEventListener('DOMContentLoaded', initVerticalNavigation);


function updateSidePanelLinks() {
    const levelMapLink = document.querySelector('.nav-link[onclick*="stage-screen"]');
    if (levelMapLink) {
        levelMapLink.setAttribute('onclick', "safeShowScreen('stage-cascade-screen'); return false;");
    }
    
    // Update any other links that might go to this screen
    document.querySelectorAll('button[onclick*="stage-screen"]').forEach(button => {
        const onclick = button.getAttribute('onclick');
        if (onclick && onclick.includes('stage-screen')) {
            button.setAttribute('onclick', onclick.replace('stage-screen', 'stage-cascade-screen'));
        }
    });
}

function showStagesFromMenu() {
    showScreen('stage-screen');
}

function showSetScreen(stageId) {
    // This function now redirects to the cascade screen
    gameState.currentStage = stageId;
    showStageCascadeScreen();
    
    // Automatically open the selected stage
    setTimeout(() => {
        const stageWrapper = document.querySelector(`.stage-wrapper[data-stage="${stageId}"]`);
        if (stageWrapper && !stageWrapper.classList.contains('open')) {
            stageWrapper.classList.add('open');
        }
    }, 100);
}

function showStageCascadeScreen() {
    // First, ensure we have the latest game state
    if (currentUser) {
        // For logged-in users, optionally refresh from database
        const savedProgress = localStorage.getItem("simploxProgress");
        if (savedProgress) {
            try {
                const progress = JSON.parse(savedProgress);
                updateGameStateFromProgress(progress);
            } catch (error) {
                console.error("Error parsing local progress:", error);
            }
        }
    }
    
    console.log("Showing stage cascade screen, current game state:", {
        currentStage: gameState.currentStage,
        unlockedSets: gameState.unlockedSets,
        completedLevels: gameState.completedLevels ? Array.from(gameState.completedLevels).length : 0
    });
    
    const container = document.querySelector('.stages-container');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create stage wrappers for each stage
    gameStructure.stages.forEach(stage => {
        // Create stage wrapper
        const stageWrapper = document.createElement('div');
        stageWrapper.className = 'stage-wrapper';
        stageWrapper.dataset.stage = stage.id;
        
        // Get stage completion data
        const totalSets = stage.numSets;
        const unlockedSets = gameState.unlockedSets[stage.id] || new Set();
        
        console.log(`Stage ${stage.id} unlocked sets:`, Array.from(unlockedSets));
        
        const unlockedCount = unlockedSets.size;
        let completedSets = 0;
        
        // Count completed sets
        if (unlockedSets.size > 0) {
            unlockedSets.forEach(setId => {
                const setKey = `${stage.id}_${setId}`;
                const levelCount = gameStructure.stages[stage.id - 1].levelsPerSet;
                const completedLevels = new Set();
                
                // Count levels that are in completedLevels or perfectLevels
                for (let level = 1; level <= levelCount; level++) {
                    const levelKey = `${stage.id}_${setId}_${level}`;
                    if (gameState.completedLevels.has(levelKey) || gameState.perfectLevels.has(levelKey)) {
                        completedLevels.add(level);
                    }
                }
                
                // If all levels in a set are completed, count it as a completed set
                if (completedLevels.size === levelCount) {
                    completedSets++;
                    console.log(`Set ${stage.id}-${setId} is fully completed`);
                }
            });
        }
        
        // Stage button content
        const stageIcon = getStageIcon(stage.id);
        const stageName = getStageHebrewName(stage.id);
        const stageDesc = getStageDescription(stage.id);
        const stageStatus = getStageStatus(stage.id, completedSets, totalSets);
        
        // Create stage button
        stageWrapper.innerHTML = `
            <div class="stage-button">
                <div class="stage-info">
                    <div class="stage-icon">
                        <i class="${stageIcon}"></i>
                    </div>
                    <div class="stage-text">
                        <div class="stage-name">${stageName} - Stage ${stage.id}</div>
                        <div class="stage-desc">${stageDesc}</div>
                    </div>
                </div>
                <div class="stage-status">${stageStatus}</div>
                <div class="stage-toggle">
                    <i class="fas fa-chevron-down"></i>
                </div>
            </div>
            
            <div class="sets-container">
                <div class="sets-grid" id="sets-grid-${stage.id}"></div>
            </div>
        `;
        
        container.appendChild(stageWrapper);
        
        // Populate sets grid
        populateSetsGrid(stage.id);
    });
    
    // Add event listeners to stage buttons
    addStageToggleListeners();
    
    // Initial state: open the current stage
    if (gameState.currentStage) {
        const currentStageWrapper = document.querySelector(`.stage-wrapper[data-stage="${gameState.currentStage}"]`);
        if (currentStageWrapper) {
            currentStageWrapper.classList.add('open');
        }
    }
    
    const cascadeScreen = document.getElementById('stage-cascade-screen'); 
    if (cascadeScreen) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('visible');
        });
        cascadeScreen.classList.add('visible');
    }
}

function renderStageCascadeScreen() {
    const stagesContainer = document.querySelector(".stages-container");
    if (!stagesContainer) return;
    
    // Clear the container
    stagesContainer.innerHTML = "";
    
    // Debug: Log the current state of unlocked sets
    console.log("Current unlocked sets:", gameState.unlockedSets);
    
    // Render stages and sets
    gameStructure.stages.forEach(stage => {
      const stageWrapper = document.createElement("div");
      stageWrapper.className = "stage-wrapper";
      stageWrapper.dataset.stage = stage.id;
      
      const numSets = stage.numSets;
      const unlockedSets = gameState.unlockedSets[stage.id] || new Set();
      const unlockedSetCount = unlockedSets.size;
      
      let completedSets = 0;
      if (unlockedSetCount > 0) {
        unlockedSets.forEach(setNum => {
          // Check if this set is completed
          if (isSetCompleted(stage.id, setNum)) {
            completedSets++;
          }
        });
      }
      
      const stageIcon = getStageIcon(stage.id);
      const stageHebrewName = getStageHebrewName(stage.id);
      const stageDescription = getStageDescription(stage.id);
      const stageStatus = getStageStatus(stage.id, completedSets, numSets);
      
      stageWrapper.innerHTML = `
        <div class="stage-button">
          <div class="stage-info">
            <div class="stage-icon">
              <i class="${stageIcon}"></i>
            </div>
            <div class="stage-text">
              <div class="stage-name">${stageHebrewName} - Stage ${stage.id}</div>
              <div class="stage-desc">${stageDescription}</div>
            </div>
          </div>
          <div class="stage-status">${stageStatus}</div>
          <div class="stage-toggle">
            <i class="fas fa-chevron-down"></i>
          </div>
        </div>
        
        <div class="sets-container">
          <div class="sets-grid" id="sets-grid-${stage.id}"></div>
        </div>
      `;
      
      stagesContainer.appendChild(stageWrapper);
      
      // Populate the sets grid for this stage
      populateSetsGrid(stage.id);
    });
    
    // Add toggle listeners for stage expansion
    addStageToggleListeners();
    
    // Auto-expand the current stage
    if (gameState.currentStage) {
      const currentStageWrapper = document.querySelector(`.stage-wrapper[data-stage="${gameState.currentStage}"]`);
      if (currentStageWrapper) {
        currentStageWrapper.classList.add("open");
      }
    }
    
    // Show the stage cascade screen
    const stageCascadeScreen = document.getElementById("stage-cascade-screen");
    if (stageCascadeScreen) {
      document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("visible");
      });
      stageCascadeScreen.classList.add("visible");
    }
  }

  function updateAllCoinDisplays() {
    const displays = document.querySelectorAll('.coin-count');
    displays.forEach(display => {
        const currentValue = parseInt(display.textContent) || 0;
        let targetValue;

        // Determine the target value based on the context
        if (window.location.pathname.includes('arcade')) {
            targetValue = currentGame.coins || 0;
        } else {
            targetValue = gameState.coins || 0;
        }

        // Ensure we're using actual numeric values
        const startNum = Number(currentValue);
        const endNum = Number(targetValue);

        animateNumber(display, startNum, endNum);
    });
}

function pulseCoins(times = 1) {
    // Update both the header coin icon and the in-game coin icon
    const coinIcons = document.querySelectorAll('.coin-icon');
    
    coinIcons.forEach(coinIcon => {
        let pulseCount = 0;
        const doPulse = () => {
            coinIcon.classList.add('coin-pulse');
            setTimeout(() => {
                coinIcon.classList.remove('coin-pulse');
                pulseCount++;
                if (pulseCount < times) {
                    setTimeout(doPulse, 100);
                }
            }, 500);
        };
        
        doPulse();
    });
}

function showGameOverOverlay() {
    clearTimer();
    const overlay = document.querySelector('.failure-overlay');
    const title = overlay.querySelector('.failure-title');
    title.textContent = 'Game Over!';
    
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('show');
    }, 100);
    
    // Set up restart button
    document.querySelector('.restart-button').onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.style.display = 'none';
            if (currentGame.isCustomPractice) {
                startCustomLevel(currentGame.practiceState.currentLevel, currentGame.practiceState);
            } else {
                startLevel(gameState.currentLevel);
            }
        }, 1000);
    };
    
    // Set up home button
    document.querySelector('.home-button').onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.style.display = 'none';
            showScreen('welcome-screen');
        }, 1000);
    };
}

function updateTimerCircle(timeRemaining, totalTime) {
    const timerProgress = document.querySelector('.timer-progress');
    if (!timerProgress) return;

    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    
    timerProgress.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const percentage = timeRemaining / totalTime;
    const dashoffset = circumference * (1 - percentage);
    timerProgress.style.strokeDashoffset = dashoffset;

    // Add warning state when time is low
    if (timeRemaining <= 10) {
        timerProgress.classList.add('warning');
    } else {
        timerProgress.classList.remove('warning');
    }
}

async function handleSignup() {
    const email = document.getElementById("signupEmail").value;
    const username = document.getElementById("signupUsername").value;
    const password = document.getElementById("signupPassword").value;
  
    if (email && username && password) {
      try {
        // 1. Sign up the user
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              username: username,
              full_name: username
            }
          }
        });
        
        if (authError) throw authError;
        
        // 2. Create the user profile
        const { error: profileError } = await supabaseClient
          .from("user_profiles")
          .upsert({
            id: authData.user.id,
            username: username,
            email: email,
            status: "free",
            role: "student"
          }, { onConflict: "id" });
        
        if (profileError) {
          console.error("Profile upsert error:", profileError);
        }
        
        // 3. Check if game progress exists and create if needed
        const { data: existingProgress, error: progressCheckError } = await supabaseClient
          .from("game_progress")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .single();
        
        // Only insert if record doesn't exist
        if (progressCheckError && progressCheckError.code === "PGRST116") {
          const gameProgressData = {
            user_id: authData.user.id,
            stage: 1,
            set_number: 1,
            level: 1,
            coins: 0,
            perks: {},
            unlocked_sets: {1: [1]},
            unlocked_levels: {"1_1": [1]},
            perfect_levels: [],
            completed_levels: []
          };
          
          const { error: insertProgressError } = await supabaseClient
            .from("game_progress")
            .insert([gameProgressData]);
          
          if (insertProgressError && insertProgressError.code !== "23505") {
            // Log error but continue if it's not a duplicate key error
            console.error("Game progress initialization error:", insertProgressError);
          }
        }
        
        // 4. Check if player stats exists and create if needed
        const { data: existingStats, error: statsCheckError } = await supabaseClient
          .from("player_stats")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .single();
        
        // Only insert if record doesn't exist
        if (statsCheckError && statsCheckError.code === "PGRST116") {
          const playerStatsData = {
            user_id: authData.user.id,
            total_levels_completed: 0,
            unique_words_practiced: 0
          };
          
          const { error: insertStatsError } = await supabaseClient
            .from("player_stats")
            .insert([playerStatsData]);
          
          if (insertStatsError && insertStatsError.code !== "23505") {
            // Log error but continue if it's not a duplicate key error
            console.error("Player stats initialization error:", insertStatsError);
          }
        }
        
        // 5. Sign in the user
        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        });
        
        if (signInError) throw signInError;
        
        // 6. Update the UI and game state
        hideAuthModal();
        currentUser = signInData.user;
        gameState.currentStage = 1;
        gameState.currentSet = 1;
        gameState.currentLevel = 1;
        gameState.coins = 0;
        gameState.perks = {};
        gameState.unlockedSets = {1: new Set([1])};
        gameState.unlockedLevels = {"1_1": new Set([1])};
        gameState.perfectLevels = new Set;
        gameState.completedLevels = new Set;
        updateAuthUI();
        showScreen("welcome-screen");
        
      } catch (error) {
        console.error("Detailed signup error:", error);
        if (error.message && error.message.includes("duplicate key")) {
          alert("This username or email is already taken. Please try another.");
        } else {
          alert("Signup error: " + error.message);
        }
      }
    } else {
      alert("All fields are required");
    }
  }

  async function handleLogin() {
    const loginInput = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!loginInput || !password) {
        alert('Please enter both username/email and password');
        return;
    }

    try {
        // Determine if input is an email or username
        const isEmail = loginInput.includes('@');
        
        let loginMethod;
        if (isEmail) {
            // Login with email
            loginMethod = supabaseClient.auth.signInWithPassword({
                email: loginInput,
                password: password
            });
        } else {
            // Login with username
            const { data: userProfile, error: profileError } = await supabaseClient
                .from('user_profiles')
                .select('email')
                .eq('username', loginInput)
                .single();

            if (profileError || !userProfile) {
                alert('Username not found');
                return;
            }

            loginMethod = supabaseClient.auth.signInWithPassword({
                email: userProfile.email,
                password: password
            });
        }

        const { data, error } = await loginMethod;

        if (error) {
            console.error('Login Error:', error);
            alert(error.message);
            return;
        }

        if (data.user) {
            currentUser = data.user;
            
            // Hide auth modal first
            hideAuthModal();
            
            // Then update UI and load data
            const { data: profile } = await supabaseClient
                .from('user_profiles')
                .select('status')
                .eq('id', currentUser.id)
                .single();
                
            if (profile) {
                currentUser.status = profile.status;
                updateUserStatusDisplay(profile.status);
            }

            await Promise.all([
                loadCustomLists(),
                loadUserGameProgress(currentUser.id)
            ]);

            updateAuthUI();
            updateGuestPlayButton();
            showScreen('welcome-screen');
        }

    } catch (error) {
        console.error('Unexpected Login Error:', error);
        alert('An unexpected error occurred during login');
    }
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function toggleAuthMode() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    loginForm.classList.toggle('hidden');
    signupForm.classList.toggle('hidden');
}

async function checkUserAccess() {
    if (!currentUser) {
        return {
            fullAccess: false,
            unlockedStages: {
                1: [1],     // Only set 1 of stage 1
                2: [1],     // Only set 1 of stage 2
                3: [1],     // Only set 1 of stage 3
                4: [1],     // Only set 1 of stage 4
                5: [1]      // Only set 1 of stage 5
            },
            defaultUnlockedLevels: {
                1: true,    // Level 1 always unlocked in set 1
            }
        };
    }

    // Check user access level
    const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('status, payment_pending')
        .eq('id', currentUser.id)
        .single();

    if (error) return null;

    // Free/Pending/Unregistered users
    if (data.payment_pending || data.status === 'free' || data.status === 'pending') {
        return {
            fullAccess: false,
            unlockedStages: {
                1: [1],     // Only set 1 of stage 1
                2: [1],     // Only set 1 of stage 2
                3: [1],     // Only set 1 of stage 3
                4: [1],     // Only set 1 of stage 4
                5: [1]      // Only set 1 of stage 5
            },
            defaultUnlockedLevels: {
                1: true,    // Level 1 always unlocked in set 1
            }
        };
    }

    // Premium users
    if (data.status === 'premium') {
        return {
            fullAccess: true,
            unlockedStages: {
                1: [1],     // Only set 1 initially unlocked
                2: [1],     // Only set 1 initially unlocked
                3: [1],     // Only set 1 initially unlocked
                4: [1],     // Only set 1 initially unlocked
                5: [1]      // Only set 1 initially unlocked
            },
            defaultUnlockedLevels: {
                1: true,    // Level 1 always unlocked in set 1
            }
        };
    }
}

function switchAuthTab(tab) {
    const loginTab = document.querySelector('.auth-tab[onclick="switchAuthTab(\'login\')"]');
    const signupTab = document.querySelector('.auth-tab[onclick="switchAuthTab(\'signup\')"]');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (tab === 'login') {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    } else {
        loginTab.classList.remove('active');
        signupTab.classList.add('active');
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    }
}

function showJoinModal(otp = "") {
    console.log("Opening join modal with OTP:", otp);
    const modal = document.getElementById("arcade-modal");
    const teacherView = document.getElementById("teacher-view");
    const playerView = document.getElementById("player-view");
    const otpInput = document.getElementById("otpInput");
    
    if (modal) {
      modal.style.display = "block";
      if (teacherView) teacherView.style.display = "none";
      if (playerView) playerView.style.display = "block";
      
      // Clear previous inputs and displays
      if (otpInput) otpInput.value = "";
      const usernameInput = document.getElementById("arcadeUsername");
      if (usernameInput) {
        usernameInput.value = "";
        usernameInput.readOnly = false;
        usernameInput.style.display = "block";
        
        // Remove any previous username display element
        const usernameDisplay = usernameInput.closest(".input-group")?.querySelector(".username-display");
        if (usernameDisplay) {
          usernameDisplay.remove();
        }
        
        // Set new OTP if provided
        if (otpInput && otp) {
          otpInput.value = otp;
          setTimeout(() => usernameInput.focus(), 300);
        }
      }
      
      // Check if currentUser exists before using it
      if (typeof currentUser !== 'undefined' && currentUser) {
        try {
          const username = currentUser.user_metadata?.username || currentUser.email.split("@")[0];
          if (usernameInput && username) {
            usernameInput.value = username;
            usernameInput.readOnly = true;
            usernameInput.style.display = "none";
            
            const inputGroup = usernameInput.closest(".input-group");
            if (inputGroup && !inputGroup.querySelector(".username-display")) {
              const usernameDisplay = document.createElement("div");
              usernameDisplay.className = "username-display";
              usernameDisplay.textContent = `Joining as: ${username}`;
              inputGroup.insertBefore(usernameDisplay, usernameInput);
            }
          }
        } catch (e) {
          console.error("Error setting username in arcade modal:", e);
        }
      }
    }
  }

  function generateQRCode(otp) {
    // Get the base URL without any parameters or hash
    const baseUrl = window.location.origin + window.location.pathname;
    const joinUrl = `${baseUrl}#join=${otp}`;
    
    // Add console logging for debugging
    console.log('Generating QR code with URL:', joinUrl);
    
    new QRious({
        element: document.getElementById('qrCode'),
        value: joinUrl,
        size: 200,
        backgroundAlpha: 1,
        foreground: '#16213e',
        background: '#ffffff',
        level: 'H'
    });
}

async function updateUserCoins(amount) {
    // Update local game state
    const previousCoins = gameState.coins;
    gameState.coins += amount;
    
    // Update UI
    updateAllCoinDisplays();
    updatePerkButtons();
    
    // Save to database if logged in
    if (currentUser) {
        try {
            const { error } = await supabaseClient
                .from("game_progress")
                .update({ coins: gameState.coins })
                .eq("user_id", currentUser.id);
                
            if (error) {
                console.error("Failed to update coins in database:", error);
                // Revert local change if database save fails
                gameState.coins = previousCoins;
                updateAllCoinDisplays();
                updatePerkButtons();
                return false;
            }
        } catch (err) {
            console.error("Error updating coins:", err);
            // Revert local change
            gameState.coins = previousCoins;
            updateAllCoinDisplays();
            updatePerkButtons();
            return false;
        }
    }
    
    // Also save to localStorage
    const progressData = JSON.parse(localStorage.getItem("simploxProgress") || "{}");
    progressData.coins = gameState.coins;
    localStorage.setItem("simploxProgress", JSON.stringify(progressData));
    
    return true;
}

function updateUserStatusDisplay(status) {
    const userProfileSection = document.querySelector('.user-profile-section');
    const userTierText = document.getElementById('userTierText');
    
    if (userProfileSection && userTierText) {
      userTierText.className = 'status-badge';
      
      if (currentUser) {
        userProfileSection.style.display = 'block';
        switch (status) {
          case 'free':
          default:
            userTierText.classList.add('trial');
            userTierText.textContent = 'Trial Account';
            break;
          case 'pending':
            userTierText.classList.add('pending');
            userTierText.textContent = 'Premium Pending';
            break;
          case 'premium':
            userTierText.classList.add('premium');
            userTierText.textContent = 'Premium';
            break;
        }
        
        updateUserStats();
        
        // Dispatch event for ad logic to respond to
        document.dispatchEvent(new CustomEvent('userStatusChanged', { 
          detail: { status: status } 
        }));
      } else {
        userTierText.classList.add('unregistered');
        userTierText.textContent = 'Unregistered';
        userProfileSection.style.display = 'none';
        
        // Also dispatch for unregistered users
        document.dispatchEvent(new CustomEvent('userStatusChanged', { 
          detail: { status: 'unregistered' } 
        }));
      }
    } else {
      console.warn('User profile elements not found');
    }
  }

  function setupUserStatusSubscription() {
    if (!currentUser) return;

    const subscription = supabaseClient
        .channel('user-status-' + currentUser.id)  // Unique channel per user
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_profiles',
            filter: `id=eq.${currentUser.id}`
        }, 
        payload => {
            console.log('Profile update received:', payload.new); // Debug log
            if (payload.new && payload.new.status) {
                updateUserStatusDisplay(payload.new.status);
                
                // If status changed to premium, trigger celebration
                if (payload.new.status === 'premium') {
                    showPremiumCelebration();
                }
            }
        })
        .subscribe(status => {
            console.log('Subscription status:', status); // Debug log
        });

    return subscription;
}

function checkUpgradeStatus() {
    if (!currentUser) return false;
    
    const hasRequestedUpgrade = localStorage.getItem(`upgradeRequested_${currentUser.id}`);
    const isPremium = currentUser.status === 'premium';
    const isPending = currentUser.status === 'pending';
    
    return hasRequestedUpgrade || isPremium || isPending;
}

function showUpgradeScreen() {
    // Check if user already submitted upgrade request
    if (localStorage.getItem(`upgradeRequested_${currentUser.id}`)) {
        hideUpgradePromptAndContinue();
        return;
    }
    
    showScreen('upgrade-screen');
}

function showUpgradePrompt(callback) {
    // If user is not logged in, show auth modal with signup form
    if (!currentUser) {
      console.log("Unregistered user attempting to access premium content");
      showAuthModal();
      // Switch to signup form
      setTimeout(() => {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        if (loginForm && signupForm) {
          loginForm.classList.add('hidden');
          signupForm.classList.remove('hidden');
        }
      }, 100);
      return;
    }
    
    // Continue with upgrade prompt for logged in users
    const t = {
      screen: document.querySelector(".screen.visible")?.id,
      stage: gameState.currentStage,
      set: gameState.currentSet,
      level: gameState.currentLevel
    };
    
    t.screen && localStorage.setItem("gameContext", JSON.stringify(t));
    currentUser && localStorage.removeItem(`upgradeRequested_${currentUser.id}`);
    showScreen("upgrade-screen");
  }

  async function handleUpgradeSubmit(e) {
    console.log("handleUpgradeSubmit called");
    
    if (e) {
        e.preventDefault();
    }
    
    const isAdult = document.getElementById("isAdult").checked;
    
    try {
        // Form validation
        if (isAdult) {
            const fullName = document.getElementById("fullName");
            const phone = document.getElementById("phone");
            
            if (!fullName.value.trim()) {
                fullName.style.border = "2px solid #ff4444";
                alert("Please enter your full name");
                return false;
            }
            
            if (!phone.value.trim()) {
                phone.style.border = "2px solid #ff4444";
                alert("Please enter your phone number");
                return false;
            }
        } else {
            const parentName = document.getElementById("parentName");
            const parentPhone = document.getElementById("parentPhone");
            
            if (!parentName.value.trim()) {
                parentName.style.border = "2px solid #ff4444";
                alert("Please enter your parent's full name");
                return false;
            }
            
            if (!parentPhone.value.trim()) {
                parentPhone.style.border = "2px solid #ff4444";
                alert("Please enter your parent's phone number");
                return false;
            }
        }
        
        // Create request data
        let requestData = {
            user_id: currentUser.id,
            is_adult: isAdult,
            full_name: isAdult ? document.getElementById("fullName").value : document.getElementById("parentName").value,
            phone: isAdult ? document.getElementById("phone").value : document.getElementById("parentPhone").value,
            parent_name: isAdult ? null : document.getElementById("parentName").value,
            parent_phone: isAdult ? null : document.getElementById("parentPhone").value,
            referral_source: document.getElementById("referralSource").value
        };
        
        // Try to insert into upgrade_requests table
        try {
            const { data, error } = await supabaseClient
                .from("upgrade_requests")
                .insert([requestData])
                .select();
                
            if (error) {
                console.warn("Could not save to upgrade_requests table:", error.message);
            }
        } catch (err) {
            console.warn("Error with upgrade_requests table, continuing:", err.message);
        }
        
        // Update user profile status
        const { error: updateError } = await supabaseClient
            .from("user_profiles")
            .update({ status: "pending" })
            .eq("id", currentUser.id);
            
        if (updateError) throw updateError;
        

localStorage.setItem(`upgradeRequested_${currentUser.id}`, "true");
updateUserStatusDisplay("pending");
showUpgradeConfirmation();  // This will now use our new implementation
return true;
    } catch (error) {
        console.error("Upgrade Request Error:", error);
        alert("Error processing request. Please try again.");
        return false;
    }
}

function handleUpgradeButtonClick(event) {
    console.log("Upgrade button clicked directly");
    
    // Prevent the default form submission if this is a direct click
    // so we can handle it manually
    if (event) {
      event.preventDefault();
    }
    
    // Call the form submission handler manually
    handleUpgradeSubmit(event);
  }

  function validateForm(isAdult) {
    try {
      if (isAdult) {
        return document.getElementById("fullName").value.trim() && 
               document.getElementById("phone").value.trim();
      } else {
        return document.getElementById("parentName").value.trim() && 
               document.getElementById("parentPhone").value.trim();
      }
    } catch (e) {
      console.error("Error in validateForm:", e);
      return false;
    }
  }

  function showUpgradeConfirmation() {
    // First remove any existing popups
    document.querySelectorAll('.upgrade-confirmation-popup, .confirmation-popup').forEach(popup => popup.remove());
    
    // Create a new container for the popup
    const popupOverlay = document.createElement('div');
    popupOverlay.className = 'upgrade-confirmation-overlay';
    popupOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2002;
    `;
    
    // Create the popup content
    const popupContent = document.createElement('div');
    popupContent.className = 'upgrade-confirmation-content';
    popupContent.style.cssText = `
      background: var(--primary-dark);
      border: 3px solid var(--gold);
      border-radius: 20px;
      padding: 2.5rem 2rem;
      text-align: center;
      width: 90%;
      max-width: 450px;
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5);
      position: relative;
    `;
    
    // Add the content
    popupContent.innerHTML = `
      <h2 style="color: var(--gold); margin-bottom: 1.5rem; font-size: 2rem;">Thank You!</h2>
      <p style="margin-bottom: 2.5rem; color: var(--text); font-size: 1.1rem; line-height: 1.6;">
        We've received your upgrade request. We'll contact you soon with payment details.
      </p>
      <button id="upgrade-continue-button" style="
        background: var(--gold);
        color: var(--primary-dark);
        border: none;
        padding: 1rem 2rem;
        border-radius: 50px;
        font-size: 1.2rem;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 5px 15px rgba(255, 215, 0, 0.3);
        width: 80%;
        max-width: 300px;
      ">Continue Playing</button>
    `;
    
    // Append to DOM
    popupOverlay.appendChild(popupContent);
    document.body.appendChild(popupOverlay);
    
    // Add event listeners after the element is in the DOM
    setTimeout(() => {
      const continueButton = document.getElementById('upgrade-continue-button');
      
      if (continueButton) {
        console.log("Adding event listener to continue button");
        
        // Use multiple event listeners to ensure it works
        continueButton.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log("Continue button clicked!");
          handleUpgradeContinue();
          return false;
        };
        
        continueButton.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log("Continue button clicked (addEventListener)!");
          handleUpgradeContinue();
        }, true);
        
        // Add hover effect
        continueButton.addEventListener('mouseover', function() {
          this.style.background = 'linear-gradient(to bottom, var(--gold), #ffa500)';
          this.style.transform = 'translateY(-2px)';
          this.style.boxShadow = '0 7px 20px rgba(255, 215, 0, 0.4)';
        });
        
        continueButton.addEventListener('mouseout', function() {
          this.style.background = 'var(--gold)';
          this.style.transform = 'translateY(0)';
          this.style.boxShadow = '0 5px 15px rgba(255, 215, 0, 0.3)';
        });
      } else {
        console.error("Continue button not found in the DOM");
      }
      
      // Add click handler to close when clicking outside
      popupOverlay.addEventListener('click', function(e) {
        if (e.target === this) {
          handleUpgradeContinue();
        }
      });
      
    }, 100);
    
    console.log("Upgrade confirmation popup added to DOM");
  }

  function handleUpgradeContinue() {
    console.log("handleUpgradeContinue called");
    const overlay = document.querySelector(".upgrade-confirmation-overlay");
    if (overlay) {
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 0.3s ease";
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    }
    
    document.querySelectorAll(".confirmation-popup").forEach(popup => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    });
    
    const upgradeScreen = document.getElementById("upgrade-screen");
    if (upgradeScreen) {
      upgradeScreen.classList.remove("visible");
    }
    
    const upgradeForm = document.getElementById("upgradeForm");
    if (upgradeForm) {
      upgradeForm.reset();
    }
    
    // Remove game context to prevent auto-resume
    localStorage.removeItem("gameContext");
    
    // Simply hide the upgrade prompt and go to welcome screen
    hideUpgradePromptAndContinue();
    showScreen("welcome-screen");
    
    console.log("Upgrade process completed, redirected to welcome screen");
  }

  function showPremiumCelebration() {
    // Create the celebration overlay
    const celebrationOverlay = document.createElement('div');
    celebrationOverlay.className = 'premium-celebration';
    
    celebrationOverlay.innerHTML = `
        <div class="celebration-content">
            <h1 class="celebration-title">Congratulations!</h1>
            <p class="celebration-message">You've unlocked Premium Access!</p>
            <button class="celebration-button" onclick="handlePremiumCelebrationComplete()">
                Continue
            </button>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(celebrationOverlay);
    
    // Trigger show animation
    setTimeout(() => {
        celebrationOverlay.classList.add('show');
    }, 100);
}

async function safeUpsertRecord(table, data, keyField = 'user_id') {
    try {
      // First check if the record exists
      const { data: existingData, error: checkError } = await supabaseClient
        .from(table)
        .select(keyField)
        .eq(keyField, data[keyField])
        .single();
      
      if (checkError && checkError.code === "PGRST116") {
        // Record doesn't exist, try to insert it
        const { error: insertError } = await supabaseClient
          .from(table)
          .insert([data]);
        
        if (insertError) {
          // If insert fails with a duplicate key error, try to update instead
          if (insertError.code === "23505") {
            const { error: updateError } = await supabaseClient
              .from(table)
              .update(data)
              .eq(keyField, data[keyField]);
            
            if (updateError) {
              console.error(`Error updating ${table}:`, updateError);
              return false;
            }
          } else {
            console.error(`Error inserting into ${table}:`, insertError);
            return false;
          }
        }
      } else if (!checkError) {
        // Record exists, update it
        const { error: updateError } = await supabaseClient
          .from(table)
          .update(data)
          .eq(keyField, data[keyField]);
        
        if (updateError) {
          console.error(`Error updating ${table}:`, updateError);
          return false;
        }
      } else {
        console.error(`Error checking ${table}:`, checkError);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Unexpected error in safeUpsertRecord for ${table}:`, error);
      return false;
    }
  }

  async function checkAndFixDatabaseSchema() {
    if (!currentUser) return false;
    
    try {
        // First check the schema
        const { data, error } = await supabaseClient
            .from("game_progress")
            .select("*")
            .eq("user_id", currentUser.id)
            .single();
            
        if (error) {
            console.error("Error checking database schema:", error);
            return false;
        }
        
        // Check if we need to add the missing columns
        const missingCompletedLevels = !('completed_levels' in data);
        const missingPerfectLevels = !('perfect_levels' in data);
        
        if (!missingCompletedLevels && !missingPerfectLevels) {
            console.log("Database schema is up to date");
            return true;
        }
        
        console.log("Adding missing columns to database schema");
        
        // Create a migration update with the minimal required fields
        const updateData = {
            user_id: currentUser.id,
            stage: data.stage || 1,
            set_number: data.set_number || 1,
            level: data.level || 1
        };
        
        // Try to preserve existing data
        if ('coins' in data) updateData.coins = data.coins || 0;
        if ('unlocked_sets' in data) updateData.unlocked_sets = data.unlocked_sets || {};
        if ('unlocked_levels' in data) updateData.unlocked_levels = data.unlocked_levels || {};
        
        // Add the missing columns with default values
        if (missingCompletedLevels) updateData.completed_levels = [];
        if (missingPerfectLevels) updateData.perfect_levels = [];
        
        // Update the record
        const { error: updateError } = await supabaseClient
            .from("game_progress")
            .update(updateData)
            .eq("user_id", currentUser.id);
            
        if (updateError) {
            console.error("Failed to update database schema:", updateError);
            return false;
        }
        
        console.log("Database schema successfully updated");
        return true;
    } catch (err) {
        console.error("Error fixing database schema:", err);
        return false;
    }
}

async function loadUserGameProgress(userId) {
    console.log("Loading game progress for user:", userId);
    
    try {
        // Set up default values
        gameState.currentStage = 1;
        gameState.currentSet = 1;
        gameState.currentLevel = 1;
        gameState.coins = 0;
        gameState.perks = {};
        gameState.unlockedSets = { "1": new Set([1]) };
        gameState.unlockedLevels = { "1_1": new Set([1]) };
        gameState.perfectLevels = new Set();
        gameState.completedLevels = new Set();
        
        // First try to load from localStorage (this includes extended fields)
        const localProgress = localStorage.getItem("simploxProgress");
        if (localProgress) {
            try {
                const parsedProgress = JSON.parse(localProgress);
                console.log("Found progress in localStorage:", parsedProgress);
                
                // Load basic fields
                if (parsedProgress.stage) gameState.currentStage = parsedProgress.stage;
                if (parsedProgress.set_number) gameState.currentSet = parsedProgress.set_number;
                if (parsedProgress.level) gameState.currentLevel = parsedProgress.level;
                if (parsedProgress.coins) gameState.coins = parsedProgress.coins;
                if (parsedProgress.perks) gameState.perks = parsedProgress.perks;
                
                // Load unlocked sets
                if (parsedProgress.unlocked_sets) {
                    gameState.unlockedSets = {};
                    Object.entries(parsedProgress.unlocked_sets).forEach(([stage, sets]) => {
                        gameState.unlockedSets[stage] = new Set(sets);
                    });
                }
                
                // Load unlocked levels
                if (parsedProgress.unlocked_levels) {
                    gameState.unlockedLevels = {};
                    Object.entries(parsedProgress.unlocked_levels).forEach(([setKey, levels]) => {
                        gameState.unlockedLevels[setKey] = new Set(levels);
                    });
                }
                
                // Load completed and perfect levels
                if (parsedProgress.perfect_levels) {
                    gameState.perfectLevels = new Set(parsedProgress.perfect_levels);
                }
                
                if (parsedProgress.completed_levels) {
                    gameState.completedLevels = new Set(parsedProgress.completed_levels);
                }
            } catch (e) {
                console.error("Error parsing localStorage progress:", e);
            }
        }
        
        // Then try to load from database (this might not include all fields)
        const { data, error } = await supabaseClient
            .from("game_progress")
            .select("*")
            .eq("user_id", userId)
            .single();
            
        if (error) {
            if (error.code === "PGRST116") {
                console.log("No progress record found, creating initial progress");
                
                // Create a new record with minimal fields
                const initialProgress = {
                    user_id: userId,
                    stage: gameState.currentStage,
                    set_number: gameState.currentSet,
                    level: gameState.currentLevel,
                    coins: gameState.coins
                };
                
                const { error: insertError } = await supabaseClient
                    .from("game_progress")
                    .insert([initialProgress]);
                    
                if (insertError) {
                    console.error("Error creating initial game progress:", insertError);
                }
            } else {
                console.error("Error loading game progress:", error);
            }
        } else if (data) {
            // We found database data - prioritize this for core fields
            console.log("Game progress loaded from database:", data);
            
            // Core fields - always use database values if present
            gameState.currentStage = data.stage || gameState.currentStage;
            gameState.currentSet = data.set_number || gameState.currentSet;
            gameState.currentLevel = data.level || gameState.currentLevel;
            gameState.coins = data.coins || gameState.coins;
            
            // Extended fields - only use if present in database
            try {
                // Perks
                if (data.perks && Object.keys(data.perks).length > 0) {
                    gameState.perks = data.perks;
                }
                
                // Unlocked sets
                if (data.unlocked_sets && Object.keys(data.unlocked_sets).length > 0) {
                    gameState.unlockedSets = {};
                    Object.entries(data.unlocked_sets).forEach(([stage, sets]) => {
                        gameState.unlockedSets[stage] = new Set(sets);
                    });
                }
                
                // Unlocked levels
                if (data.unlocked_levels && Object.keys(data.unlocked_levels).length > 0) {
                    gameState.unlockedLevels = {};
                    Object.entries(data.unlocked_levels).forEach(([setKey, levels]) => {
                        gameState.unlockedLevels[setKey] = new Set(levels);
                    });
                }
                
                // Perfect levels
                if (data.perfect_levels && data.perfect_levels.length > 0) {
                    gameState.perfectLevels = new Set(data.perfect_levels);
                }
                
                // Completed levels
                if (data.completed_levels && data.completed_levels.length > 0) {
                    gameState.completedLevels = new Set(data.completed_levels);
                }
            } catch (e) {
                console.error("Error loading extended fields from database:", e);
            }
        }
        
        // Always setup default unlocks to ensure valid state
        setupDefaultUnlocks();
        
        console.log("Game state after loading progress:", {
            currentStage: gameState.currentStage,
            currentSet: gameState.currentSet,
            currentLevel: gameState.currentLevel
        });
        
        updateAllCoinDisplays();
        return true;
    } catch (err) {
        console.error("Unexpected error in loadUserGameProgress:", err);
        return false;
    }
}

function loadProgress() {
    const saved = localStorage.getItem('simploxProgress');
    if (saved) {
        const data = JSON.parse(saved);
        gameState.unlockedSets = Object.fromEntries(
            Object.entries(data.unlockedSets).map(([k, v]) => [k, new Set(v)])
        );
        gameState.unlockedLevels = Object.fromEntries(
            Object.entries(data.unlockedLevels).map(([k, v]) => [k, new Set(v)])
        );
        gameState.perfectLevels = new Set(data.perfectLevels);
        gameState.completedLevels = new Set(data.completedLevels || []);
        gameState.coins = data.coins;
        gameState.perks = data.perks || {timeFreeze: 0, skip: 0, clue: 0, reveal: 0};
    }
    const savedCustomCoins = localStorage.getItem('simploxCustomCoins');
    if (savedCustomCoins) {
        gameState.coins = parseInt(savedCustomCoins);
    }
}

async function ensureCorrectSchema() {
    if (!currentUser) return false;
    
    console.log("Checking database schema for user:", currentUser.id);
    
    try {
        // First check if the user has a game_progress record
        const { data, error } = await supabaseClient
            .from("game_progress")
            .select("*")
            .eq("user_id", currentUser.id)
            .single();
            
        if (error) {
            if (error.code === "PGRST116") {
                // Record doesn't exist, create it
                console.log("Creating game progress record for user");
                
                const initialData = {
                    user_id: currentUser.id,
                    stage: 1,
                    set_number: 1,
                    level: 1,
                    coins: 0,
                    perks: {},
                    unlocked_sets: { "1": [1] },
                    unlocked_levels: { "1_1": [1] },
                    perfect_levels: [],
                    completed_levels: []
                };
                
                const { error: insertError } = await supabaseClient
                    .from("game_progress")
                    .insert([initialData]);
                    
                if (insertError) {
                    console.error("Error creating game progress record:", insertError);
                    return false;
                }
                
                return true;
            }
            
            console.error("Error checking game progress record:", error);
            return false;
        }
        
        // Check if we need to add missing data
        let needsUpdate = false;
        const updateData = { ...data };
        
        // Check each required field
        const requiredFields = [
            { name: 'unlocked_sets', defaultValue: { "1": [1] } },
            { name: 'unlocked_levels', defaultValue: { "1_1": [1] } },
            { name: 'perfect_levels', defaultValue: [] },
            { name: 'completed_levels', defaultValue: [] }
        ];
        
        for (const field of requiredFields) {
            if (!(field.name in data) || data[field.name] === null) {
                updateData[field.name] = field.defaultValue;
                needsUpdate = true;
                console.log(`Field "${field.name}" missing, will add it`);
            }
        }
        
        if (needsUpdate) {
            console.log("Updating record with missing fields");
            const { error: updateError } = await supabaseClient
                .from("game_progress")
                .update(updateData)
                .eq("user_id", currentUser.id);
                
            if (updateError) {
                console.error("Error updating game progress record:", updateError);
                return false;
            }
        }
        
        return true;
    } catch (err) {
        console.error("Unexpected error in ensureCorrectSchema:", err);
        return false;
    }
}

function updateGameStateFromProgress(progress) {
    console.log("Updating game state from saved progress");
    
    // Update unlocked sets
    if (progress.unlocked_sets) {
        console.log("Updating unlocked sets from:", progress.unlocked_sets);
        gameState.unlockedSets = {};
        Object.entries(progress.unlocked_sets).forEach(([stage, sets]) => {
            gameState.unlockedSets[stage] = new Set(Array.isArray(sets) ? sets : []);
        });
    }
    
    // Update unlocked levels
    if (progress.unlocked_levels) {
        console.log("Updating unlocked levels from saved data");
        gameState.unlockedLevels = {};
        Object.entries(progress.unlocked_levels).forEach(([setKey, levels]) => {
            gameState.unlockedLevels[setKey] = new Set(Array.isArray(levels) ? levels : []);
        });
    }
    
    // Update completed levels
    if (progress.completed_levels) {
        console.log("Updating completed levels from saved data");
        gameState.completedLevels = new Set(progress.completed_levels);
    }
    
    // Update perfect levels
    if (progress.perfect_levels) {
        console.log("Updating perfect levels from saved data");
        gameState.perfectLevels = new Set(progress.perfect_levels);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize accessibility menu
    initAccessibilityMenu();
});

function initAccessibilityMenu() {
    // Set up toggle button
    const toggleButton = document.querySelector('.accessibility-toggle');
    const modal = document.querySelector('.accessibility-modal');
    const closeButton = document.querySelector('.close-accessibility');
    
    // Load saved settings
    loadAccessibilitySettings();
    
    // Toggle modal visibility
    if (toggleButton && modal) {
        toggleButton.addEventListener('click', function() {
            modal.classList.add('show');
        });
    }
    
    // Close modal
    if (closeButton && modal) {
        closeButton.addEventListener('click', function() {
            modal.classList.remove('show');
        });
        
        // Close when clicking outside the content
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
    
    // Add event listeners to all accessibility buttons
    const accessibilityButtons = document.querySelectorAll('.accessibility-button');
    accessibilityButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const value = this.getAttribute('data-value');
            
            applyAccessibilitySetting(action, value);
            
            // Update active state on buttons
            if (action !== 'fontSize' && action !== 'reset') {
                const siblings = document.querySelectorAll(`[data-action="${action}"]`);
                siblings.forEach(sibling => sibling.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
}

function applyAccessibilitySetting(action, value) {
    const body = document.body;
    
    // Handle each setting type
    switch(action) {
        case 'contrast':
            body.classList.remove('high-contrast', 'inverted-colors');
            if (value === 'high') body.classList.add('high-contrast');
            if (value === 'inverted') body.classList.add('inverted-colors');
            break;
            
        case 'theme':
            body.classList.remove('light-theme', 'dark-theme');
            if (value === 'light') body.classList.add('light-theme');
            if (value === 'dark') body.classList.add('dark-theme');
            break;
            
        case 'saturation':
            body.classList.remove('grayscale');
            if (value === 'grayscale') body.classList.add('grayscale');
            break;
            
        case 'fontSize':
            let currentScale = parseFloat(getComputedStyle(body).getPropertyValue('--font-scale') || 1);
            
            if (value === 'increase') {
                currentScale = Math.min(currentScale + 0.1, 1.8);
                body.style.setProperty('--font-scale', currentScale);
                body.style.fontSize = `calc(1rem * ${currentScale})`;
            } else if (value === 'decrease') {
                currentScale = Math.max(currentScale - 0.1, 0.8);
                body.style.setProperty('--font-scale', currentScale);
                body.style.fontSize = `calc(1rem * ${currentScale})`;
            } else if (value === 'reset') {
                body.style.removeProperty('--font-scale');
                body.style.fontSize = '';
            }
            break;
            
        case 'fontFamily':
            body.classList.remove('dyslexic-font');
            if (value === 'dyslexic') body.classList.add('dyslexic-font');
            break;
            
        case 'letterSpacing':
            body.classList.remove('increased-letter-spacing');
            if (value === 'increased') body.classList.add('increased-letter-spacing');
            break;
            
        case 'animations':
            body.classList.remove('no-animations', 'reduced-animations');
            if (value === 'disabled') body.classList.add('no-animations');
            if (value === 'reduced') body.classList.add('reduced-animations');
            break;
            
        case 'focus':
            body.classList.remove('high-focus');
            if (value === 'high') body.classList.add('high-focus');
            break;
            
        case 'buttonSize':
            body.classList.remove('large-buttons');
            if (value === 'large') body.classList.add('large-buttons');
            break;
            
        case 'cursorSize':
            body.classList.remove('large-cursor');
            if (value === 'large') body.classList.add('large-cursor');
            break;
            
        case 'reset':
            if (value === 'all') resetAllAccessibilitySettings();
            break;
    }
    
    // Save settings
    saveAccessibilitySettings();
}

function saveAccessibilitySettings() {
    const body = document.body;
    const settings = {
        classNames: body.className,
        fontSize: body.style.fontSize,
        fontScale: body.style.getPropertyValue('--font-scale')
    };
    
    localStorage.setItem('accessibilitySettings', JSON.stringify(settings));
}

function loadAccessibilitySettings() {
    const savedSettings = localStorage.getItem('accessibilitySettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        const body = document.body;
        
        // Apply saved class names
        if (settings.classNames) {
            body.className = settings.classNames;
        }
        
        // Apply font size
        if (settings.fontSize) {
            body.style.fontSize = settings.fontSize;
        }
        
        // Apply font scale
        if (settings.fontScale) {
            body.style.setProperty('--font-scale', settings.fontScale);
        }
        
        // Mark active buttons
        updateActiveButtons();
    }
}

function updateActiveButtons() {
    const body = document.body;
    
    // Check classes and update button states
    const classesToCheck = {
        'high-contrast': { action: 'contrast', value: 'high' },
        'inverted-colors': { action: 'contrast', value: 'inverted' },
        'light-theme': { action: 'theme', value: 'light' },
        'dark-theme': { action: 'theme', value: 'dark' },
        'grayscale': { action: 'saturation', value: 'grayscale' },
        'dyslexic-font': { action: 'fontFamily', value: 'dyslexic' },
        'increased-letter-spacing': { action: 'letterSpacing', value: 'increased' },
        'no-animations': { action: 'animations', value: 'disabled' },
        'reduced-animations': { action: 'animations', value: 'reduced' },
        'high-focus': { action: 'focus', value: 'high' },
        'large-buttons': { action: 'buttonSize', value: 'large' },
        'large-cursor': { action: 'cursorSize', value: 'large' }
    };
    
    // Loop through possible classes and update buttons
    Object.entries(classesToCheck).forEach(([className, buttonData]) => {
        const hasClass = body.classList.contains(className);
        const button = document.querySelector(`[data-action="${buttonData.action}"][data-value="${buttonData.value}"]`);
        
        if (button) {
            if (hasClass) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }
    });
    
    // Set default buttons if no special settings
    if (!document.querySelector('[data-action="contrast"].active')) {
        document.querySelector('[data-action="contrast"][data-value="normal"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="theme"].active')) {
        document.querySelector('[data-action="theme"][data-value="default"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="saturation"].active')) {
        document.querySelector('[data-action="saturation"][data-value="normal"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="fontFamily"].active')) {
        document.querySelector('[data-action="fontFamily"][data-value="default"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="letterSpacing"].active')) {
        document.querySelector('[data-action="letterSpacing"][data-value="normal"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="animations"].active')) {
        document.querySelector('[data-action="animations"][data-value="enabled"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="focus"].active')) {
        document.querySelector('[data-action="focus"][data-value="normal"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="buttonSize"].active')) {
        document.querySelector('[data-action="buttonSize"][data-value="normal"]')?.classList.add('active');
    }
    
    if (!document.querySelector('[data-action="cursorSize"].active')) {
        document.querySelector('[data-action="cursorSize"][data-value="normal"]')?.classList.add('active');
    }
}

function resetAllAccessibilitySettings() {
    const body = document.body;
    
    // Remove all accessibility classes
    body.classList.remove(
        'high-contrast', 'inverted-colors', 'light-theme', 'dark-theme',
        'grayscale', 'dyslexic-font', 'increased-letter-spacing',
        'no-animations', 'reduced-animations', 'high-focus',
        'large-buttons', 'large-cursor'
    );
    
    // Reset inline styles
    body.style.fontSize = '';
    body.style.removeProperty('--font-scale');
    
    // Reset active buttons
    document.querySelectorAll('.accessibility-button.active').forEach(button => {
        button.classList.remove('active');
    });
    
    // Set default buttons as active
    document.querySelector('[data-action="contrast"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="theme"][data-value="default"]')?.classList.add('active');
    document.querySelector('[data-action="saturation"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="fontFamily"][data-value="default"]')?.classList.add('active');
    document.querySelector('[data-action="letterSpacing"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="animations"][data-value="enabled"]')?.classList.add('active');
    document.querySelector('[data-action="focus"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="buttonSize"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="cursorSize"][data-value="normal"]')?.classList.add('active');
    
    // Clear saved settings
    localStorage.removeItem('accessibilitySettings');
}

function animateNumber(element, start, end, duration = 500) {
    // Ensure start and end are numbers
    start = Number(start);
    end = Number(end);
    
    // If start and end are the same, just set the value
    if (start === end) {
        element.textContent = end;
        return;
    }

    const difference = end - start;
    const frames = 30; // Increased for smoother animation
    const step = difference / frames;
    let current = start;
    let frameCount = 0;
    
    // Add animating class if present in DOM
    element.classList.add("animating");
    
    function updateNumber() {
        current += step;
        frameCount++;
        
        // Round to handle floating point imprecision
        if (frameCount >= frames || 
            (step > 0 && current >= end) || 
            (step < 0 && current <= end)) {
            element.textContent = Math.round(end);
            
            // Reset color after animation completes
            setTimeout(() => {
                element.style.color = "var(--text)";
                element.classList.remove("animating");
            }, 300);
            
            return;
        }
        
        element.textContent = Math.round(current);
        
        // Set color based on increase/decrease
        if (step > 0) {
            element.style.color = "var(--success)";
        } else if (step < 0) {
            element.style.color = "var(--error)";
        }
        
        requestAnimationFrame(updateNumber);
    }
    
    requestAnimationFrame(updateNumber);
}

function createParticles(x, y, type) {
    // Detect mobile device
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    
    // Define particle parameters based on device type and type parameter
    let particleConfig;
    let colors;
    
    if (type) {
        // Type-specific particles (blessing or curse type)
        particleConfig = {
            count: isMobile ? 8 : 15,
            size: 8, // Random size will be added
            distance: isMobile ? 50 : 100,
            opacity: isMobile ? 0.7 : 1,
            duration: isMobile ? 800 : 1000
        };
        
        colors = type === 'blessing' ? 
            ['#3498db', '#2980b9', '#1abc9c'] : 
            ['#e74c3c', '#c0392b', '#d35400'];
    } else {
        // Default celebration particles
        particleConfig = isMobile 
            ? {
                count: 10,      // Fewer particles on mobile
                size: 6,        // Smaller particles
                distance: 50,   // Shorter spread
                opacity: 0.7,   // Lower opacity
                duration: 1000  // Shorter animation
            }
            : {
                count: 40,      // More particles on desktop
                size: 10,       // Standard particle size
                distance: 150,  // Wider spread
                opacity: 1,     // Full opacity
                duration: 1500  // Longer animation
            };
            
        colors = ['#ffd700', '#FFA500', '#4CAF50', '#FFD700'];
    }

    const container = document.body;
    
    for (let i = 0; i < particleConfig.count; i++) {
        const particle = document.createElement('div');
        particle.className = type ? `particle ${type}` : 'particle';
        
        // Generate random size if type-specific
        const size = type ? Math.random() * 8 + 4 : particleConfig.size;
        const angle = (Math.random() * Math.PI * 2);
        const distance = particleConfig.distance + (Math.random() * 50);
        
        // Position relative to click point
        particle.style.position = 'fixed';
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.opacity = `${particleConfig.opacity}`;
        
        // Apply color
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        if (type) {
            // Use Web Animations API for type-specific particles
            particle.style.borderRadius = '50%';
            
            const destinationX = x + Math.cos(angle) * distance;
            const destinationY = y + Math.sin(angle) * distance;
            
            particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${destinationX - x}px, ${destinationY - y}px) scale(0)`, opacity: 0 }
            ], {
                duration: particleConfig.duration,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
            }).onfinish = () => particle.remove();
        } else {
            // CSS variables for regular particles
            particle.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
            particle.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
            
            // Apply animation
            particle.style.animation = `particleBurst ${particleConfig.duration / 1000}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
            
            container.appendChild(particle);
            
            // Remove particle after animation completes
            setTimeout(() => {
                if (particle.parentNode === container) {
                    container.removeChild(particle);
                }
            }, particleConfig.duration);
        }
        
        if (type) {
            container.appendChild(particle);
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `game-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Small delay to ensure DOM update before adding show class
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Hide notification after delay
    setTimeout(() => {
        notification.classList.remove('show');
        // Remove from DOM after transition completes
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `game-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Small delay to ensure DOM update before adding show class
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Hide notification after delay
    setTimeout(() => {
        notification.classList.remove('show');
        // Remove from DOM after transition completes
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

function toggleFullScreen() {
    const root = document.documentElement;
    
    // Look for fullscreen icon in both possible locations
    const fullscreenIcon = document.querySelector('#nav-fullscreen-btn i') || 
                          document.querySelector('.vertical-nav-container .fullscreen-button i');
    
    if (document.fullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
                if (fullscreenIcon) {
                    // Handle different icon class styles
                    if (fullscreenIcon.classList.contains('fa-compress')) {
                        fullscreenIcon.classList.remove('fa-compress');
                        fullscreenIcon.classList.add('fa-expand');
                    } else {
                        fullscreenIcon.className = 'fas fa-expand';
                    }
                }
            }).catch(err => {
                console.log(`Error attempting to exit fullscreen: ${err.message}`);
            });
        }
    } else if (root.requestFullscreen) {
        root.requestFullscreen().then(() => {
            if (fullscreenIcon) {
                // Handle different icon class styles
                if (fullscreenIcon.classList.contains('fa-expand')) {
                    fullscreenIcon.classList.remove('fa-expand');
                    fullscreenIcon.classList.add('fa-compress');
                } else {
                    fullscreenIcon.className = 'fas fa-compress';
                }
            }
        }).catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    }
}

function toggleSidePanel() {
    const sidePanel = document.querySelector('.side-panel');
    const hamburgerButton = document.querySelector('.hamburger-button');
    const navContainer = document.querySelector('.vertical-nav-container');
    const modalOverlay = document.querySelector('.modal-overlay');
    
    if (sidePanel.classList.contains('open')) {
        sidePanel.classList.remove('open');
        hamburgerButton.classList.remove('open');
        
        if (navContainer) {
            navContainer.classList.remove('panel-open');
        }
        
        if (modalOverlay) {
            modalOverlay.classList.remove('open');
        }
    } else {
        sidePanel.classList.add('open');
        hamburgerButton.classList.add('open');
        
        if (navContainer) {
            navContainer.classList.add('panel-open');
        }
        
        if (modalOverlay) {
            modalOverlay.classList.add('open');
        }
    }
}

async function handleLogout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        
        if (error) {
            console.error('Supabase logout error:', error.message);
        }

        // Reset game state
        gameState.coins = 0;
        gameState.unlockedSets = {};
        gameState.unlockedLevels = {};
        gameState.perfectLevels = new Set();
        gameState.completedLevels = new Set();

        // Clear all input fields and UI state
        if (typeof clearCustomPracticeUI === 'function') {
            clearCustomPracticeUI();
        }

        // Reset current user and update UI
        currentUser = null;
        updateAuthUI();
        
        // Update additional UI elements if the functions exist
        if (typeof updateUserStatusDisplay === 'function') {
            updateUserStatusDisplay(null);
        }
        
        if (typeof updateGuestPlayButton === 'function') {
            updateGuestPlayButton();
        }
        
        // Show welcome screen
        showScreen('welcome-screen');
        
        // Reload game progress from localStorage
        if (typeof initializeGame === 'function') {
            initializeGame();
        }

    } catch (error) {
        console.error('Unexpected error during logout:', error);
        // Ensure UI is reset even if logout fails
        currentUser = null;
        updateAuthUI();
        
        if (typeof updateUserStatusDisplay === 'function') {
            updateUserStatusDisplay(null);
        }
        
        if (typeof updateGuestPlayButton === 'function') {
            updateGuestPlayButton();
        }
        
        showScreen('welcome-screen');
    }
}

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        // Check which class is used by inspecting modal or defaulting to 'show'
        if (modal.classList.contains('open') || document.querySelector('.modal.open')) {
            modal.classList.add('open');
        } else {
            modal.classList.add('show');
        }
    }
}

function updateAuthUI() {
    const authBox = document.getElementById('authBox');
    const userInfo = document.getElementById('userInfo');
    const userEmailElement = document.getElementById('userEmail');
    const logoutButton = document.querySelector('.logout-button');
    const userProfileSection = document.querySelector('.user-profile-section');
    const mainLoginButton = document.querySelector('.main-button');

    if (currentUser) {
        // Hide the auth box and show user info
        if (authBox) {
            authBox.classList.add('hidden');
        }
        
        if (userInfo) {
            userInfo.classList.remove('hidden');
        }
        
        if (logoutButton) {
            logoutButton.classList.remove('hidden');
            logoutButton.style.display = 'block';
        }
        
        if (userProfileSection) {
            userProfileSection.style.display = 'block';
        }
        
        // Hide main login button
        if (mainLoginButton) {
            mainLoginButton.style.display = 'none';
        }
        
        // Display username from metadata if available, fallback to email
        if (userEmailElement) {
            userEmailElement.textContent = currentUser.user_metadata?.username || currentUser.email;
        }
        
        // Get and display user status
        if (currentUser.id) {
            supabaseClient
                .from('user_profiles')
                .select('status, username')
                .eq('id', currentUser.id)
                .single()
                .then(({ data }) => {
                    if (data) {
                        // If we have a username in the profile, use it
                        if (data.username && userEmailElement) {
                            userEmailElement.textContent = data.username;
                        }
                        
                        if (typeof updateUserStatusDisplay === 'function') {
                            updateUserStatusDisplay(data.status);
                        }
                    }
                })
                .catch(error => console.error('Error fetching user status:', error));
        }
        
        // Update stats if function exists
        if (typeof updateUserStats === 'function') {
            updateUserStats();
        }
    } else {
        // User is not logged in
        if (authBox) {
            authBox.classList.remove('hidden');
        }
        
        if (userInfo) {
            userInfo.classList.add('hidden');
        }
        
        if (logoutButton) {
            logoutButton.classList.add('hidden');
            logoutButton.style.display = 'none';
        }
        
        if (userProfileSection) {
            userProfileSection.style.display = 'none';
        }
        
        // Show main login button
        if (mainLoginButton) {
            mainLoginButton.style.display = 'block';
        }
        
        // Clear user email display
        if (userEmailElement) {
            userEmailElement.textContent = '';
        }
    }
}

function hideUpgradePrompt() {
    const prompt = document.querySelector('.upgrade-prompt');
    const overlay = document.querySelector('.modal-backdrop');
    
    if (prompt) {
        prompt.classList.remove('show');
        setTimeout(() => {
            if (prompt.parentNode) {
                prompt.remove();
            }
        }, 300);
    }
    
    if (overlay) {
        overlay.remove();
    }
}

function continueAfterUpgrade() {
    console.log("continueAfterUpgrade called");
    
    // Handle popup cleanup
    const popup = document.querySelector(".confirmation-popup");
    if (popup) {
        popup.style.opacity = "0";
        popup.style.transform = "translate(-50%, -50%) scale(0.7)";
        setTimeout(() => {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }, 300);
    }

    // Reset upgrade screen
    const upgradeScreen = document.getElementById("upgrade-screen");
    if (upgradeScreen) {
        upgradeScreen.classList.remove("visible");
    }

    // Reset form
    const upgradeForm = document.getElementById("upgradeForm");
    if (upgradeForm) {
        upgradeForm.reset();
    }

    // Store the current game level/state for possible resume
    const currentLevel = gameState.currentLevel;
    
    // Prevent auto-resume in most cases
    localStorage.removeItem("gameContext");
    
    // Call helper function to clean up additional elements
    if (typeof hideUpgradePromptAndContinue === 'function') {
        hideUpgradePromptAndContinue();
    }
    
    // Default to welcome screen
    showScreen("welcome-screen");
    
    // If the player was in the middle of a level and we want to resume
    if (currentLevel && false) { // Set to false to disable auto-resume behavior
        console.log(`Resuming gameplay at level ${currentLevel}`);
        setTimeout(() => {
            // Check if we're in a level and resume from there
            const gameContext = localStorage.getItem("gameContext");
            if (gameContext) {
                try {
                    const context = JSON.parse(gameContext);
                    if (context.level) {
                        gameState.currentLevel = context.level;
                        startLevel(context.level);
                    }
                } catch (e) {
                    console.error("Error parsing game context:", e);
                }
            }
        }, 500);
    }
    
    console.log("Upgrade process completed, redirected to welcome screen");
}

function handlePremiumCelebrationComplete() {
    const overlay = document.querySelector('.premium-celebration');
    if (overlay) {
        overlay.classList.remove('show');
        
        // Check if we need to unlock a set for a previously completed stage
        const completedStage = localStorage.getItem("unlockNextSetForStage");
        if (completedStage) {
            const stageNum = parseInt(completedStage, 10);
            if (!isNaN(stageNum) && stageNum >= 2 && stageNum <= 5) {
                console.log(`Unlocking set 2 for previously completed stage ${stageNum}`);
                
                // Make sure the stage exists in unlockedSets
                gameState.unlockedSets[stageNum] = gameState.unlockedSets[stageNum] || new Set();
                
                // Add set 2 to the unlocked sets
                gameState.unlockedSets[stageNum].add(2);
                
                // Make sure the set exists in unlockedLevels
                const setKey = `${stageNum}_2`;
                gameState.unlockedLevels[setKey] = gameState.unlockedLevels[setKey] || new Set();
                
                // Add level 1 to the set
                gameState.unlockedLevels[setKey].add(1);
                
                // Save progress
                if (typeof saveProgress === 'function') {
                    saveProgress();
                }
                
                // Clear the flag
                localStorage.removeItem("unlockNextSetForStage");
            }
        }
        
        setTimeout(() => {
            overlay.remove();
            // Refresh game state with new premium access
            showScreen('welcome-screen');
        }, 500);
    }
}

async function saveProgress() {
    try {
        // Prepare progress data structure
        const progressData = {
            stage: gameState.currentStage,
            set_number: gameState.currentSet,
            level: gameState.currentLevel,
            coins: gameState.coins,
            perks: gameState.perks || {},
            unlocked_sets: serializeSetMap(gameState.unlockedSets),
            unlocked_levels: serializeSetMap(gameState.unlockedLevels),
            perfect_levels: Array.from(gameState.perfectLevels || []),
            completed_levels: Array.from(gameState.completedLevels || [])
        };
        
        console.log(`Saving progress to ${currentUser ? 'Supabase' : 'localStorage'} for user: ${currentUser?.id || 'guest'}`);
        
        // Save to localStorage as backup
        localStorage.setItem("simploxProgress", JSON.stringify(progressData));
        
        // If user is logged in, save to Supabase
        if (currentUser) {
            try {
                // First, check if a record exists for this user
                const { data, error: fetchError } = await supabaseClient
                    .from('game_progress')
                    .select('user_id')
                    .eq('user_id', currentUser.id)
                    .single();
                
                if (fetchError && fetchError.code !== 'PGRST116') {
                    console.error("Error checking user progress:", fetchError);
                }
                
                if (data) {
                    // Record exists, use UPDATE
                    const { error } = await supabaseClient
                        .from('game_progress')
                        .update(progressData)
                        .eq('user_id', currentUser.id);
                    
                    if (error) throw error;
                } else {
                    // Record doesn't exist, use INSERT
                    const { error } = await supabaseClient
                        .from('game_progress')
                        .insert([{
                            user_id: currentUser.id,
                            ...progressData
                        }]);
                    
                    if (error) throw error;
                }
                
                // Dispatch event for other parts of the app that need to know progress was saved
                document.dispatchEvent(new CustomEvent('progressSaved', { detail: progressData }));
            } catch (error) {
                console.error("Error saving core progress:", error);
            }
        }
        
        return true;
    } catch (e) {
        console.error("Error in saveProgress:", e);
        return false;
    }
}



function setupDefaultUnlocks() {
    console.log('Setting up default unlocks...');
    console.log('Before setup:', gameState.unlockedSets, gameState.unlockedLevels);
    
    // Stage 1: Level 1 of all sets should be unlocked
    if (!gameState.unlockedSets[1]) {
        gameState.unlockedSets[1] = new Set();
    }
    
    for (let i = 1; i <= 9; i++) {
        gameState.unlockedSets[1].add(i);
        const setKey = `1_${i}`;
        if (!gameState.unlockedLevels[setKey]) {
            gameState.unlockedLevels[setKey] = new Set([1]);
        }
    }

    // Stages 2-5: Level 1 of Set 1 should be unlocked
    for (let stage = 2; stage <= 5; stage++) {
        if (!gameState.unlockedSets[stage]) {
            gameState.unlockedSets[stage] = new Set([1]);
        }
        const setKey = `${stage}_1`;
        if (!gameState.unlockedLevels[setKey]) {
            gameState.unlockedLevels[setKey] = new Set([1]);
        }
    }
    
    // Handle progressed levels - ensure continuity
    // If level 5 is unlocked, make sure 1-4 are also unlocked
    Object.entries(gameState.unlockedLevels).forEach(([setKey, levels]) => {
        const maxLevel = Math.max(...Array.from(levels));
        for (let i = 1; i < maxLevel; i++) {
            levels.add(i);
        }
    });
    
    console.log('After setup:', gameState.unlockedSets, gameState.unlockedLevels);
}


/**
 * ADD the optimizeQuestionScreenForMobile function
 * This function applies mobile-specific optimizations to the question screen
 */
function optimizeQuestionScreenForMobile() {
    var questionScreen = document.getElementById("question-screen");
    if (questionScreen && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        // Add mobile-optimized class to enable mobile-specific CSS
        questionScreen.classList.add("mobile-optimized");
        
        // Reduce animations and transitions for better performance
        if (!document.body.classList.contains("reduced-animations")) {
            let buttons = questionScreen.querySelectorAll(".buttons button");
            buttons.forEach(button => {
                button.style.transition = "transform 0.15s, background-color 0.2s";
            });
        }
        
        // Adjust layout spacing for better mobile view
        let progressCircle = questionScreen.querySelector(".progress-circle");
        if (progressCircle) {
            progressCircle.style.margin = "0.5rem auto";
        }
        
        console.log("Mobile optimizations applied to question screen");
    }
}


/**
 * Converts a map of Sets to a format suitable for storage in Supabase
 * @param {Object} setMap - Object with Set values
 * @returns {Object} - Object with array values
 */
function serializeSetMap(setMap) {
    if (!setMap) return {};
    
    const result = {};
    Object.keys(setMap).forEach(key => {
        if (setMap[key] instanceof Set) {
            result[key] = Array.from(setMap[key]);
        } else {
            result[key] = setMap[key]; // Keep as is if not a Set
        }
    });
    return result;
}

/**
 * Updates the word practice history for a user
 * @param {string} word - The word that was practiced
 * @param {string} gameMode - The game mode ('story', 'custom', 'arcade')
 * @param {number} coinsEarned - Number of coins earned (optional)
 * @returns {Promise<boolean>} - Success status
 */
async function updateWordPracticeHistory(word, gameMode, coinsEarned = 0) {
    if (!currentUser || !word) {
        console.log("Missing user or word, skipping word history update");
        return false;
    }
    
    try {
        console.log(`Updating word practice history for word: ${word}, mode: ${gameMode}`);
        
        // First check if the word exists in history
        const { data, error: fetchError } = await supabaseClient
            .from('word_practice_history')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('word', word)
            .maybeSingle();
        
        if (fetchError) {
            console.error("Error fetching word history:", fetchError);
            return false;
        }
        
        if (data) {
            // Word exists, update count and timestamp
            console.log("Word exists in history, updating record");
            const { error: updateError } = await supabaseClient
                .from('word_practice_history')
                .update({
                    practice_count: data.practice_count + 1,
                    last_practiced_at: new Date().toISOString(),
                    coins_earned: data.coins_earned + coinsEarned,
                    game_mode: gameMode
                })
                .eq('id', data.id);
            
            if (updateError) {
                console.error("Error updating word history:", updateError);
                return false;
            }
        } else {
            // Word doesn't exist, insert new record
            console.log("Word not found in history, creating new record");
            const { error: insertError } = await supabaseClient
                .from('word_practice_history')
                .insert([{
                    user_id: currentUser.id,
                    word: word,
                    practice_count: 1,
                    game_mode: gameMode,
                    coins_earned: coinsEarned,
                    last_practiced_at: new Date().toISOString()
                }]);
            
            if (insertError) {
                console.error("Error inserting word history:", insertError);
                return false;
            }
        }
        
        console.log("Word practice history updated successfully");
        return true;
    } catch (error) {
        console.error("Unexpected error in updateWordPracticeHistory:", error);
        return false;
    }
}

/**
 * Track when a user encounters a word
 * @param {string} word - The word being practiced
 * @param {string} gameMode - The game mode being played
 * @returns {Promise<Object|null>} - Result with isNewWord and coinReward
 */
async function trackWordEncounter(word, gameMode = 'standard') {
    // Only track for logged-in users
    if (!currentUser || !currentUser.id) {
      console.log('No user logged in, skipping word tracking');
      return null;
    }
  
    try {
      // Ensure the word is properly trimmed and sanitized
      const trimmedWord = String(word).trim();
      const userId = currentUser.id;
      
      // First ensure user initialization
      await ensureUserInitialization(userId);
      
      // Track timing for debugging
      const startTime = performance.now();
      
      try {
        // Try to get existing record
        const { data, error } = await supabaseClient
          .from("word_practice_history")
          .select("*")
          .eq("user_id", userId)
          .eq("word", trimmedWord)
          .single();
        
        const requestTime = performance.now() - startTime;
        if (requestTime > 1000) {
          console.warn(`Slow Supabase request (${requestTime.toFixed(0)}ms) for word: ${trimmedWord}`);
        }
        
        let isNewWord = false;
        let coinReward = 0;
        
        // Handle potential errors
        if (error && error.code !== "PGRST116") {
          console.error("Error fetching word history:", error);
          
          // Try alternative approach if the regular one fails
          try {
            const result = await supabaseClient.rpc("get_word_history", {
              p_user_id: userId,
              p_word: trimmedWord
            });
            
            if (!result.error && result.data) {
              data = result.data;
            }
          } catch (e) {
            console.error("Alternative fetch also failed:", e);
          }
        }
        
        if (data) {
          // Word exists, increment practice count
          const newCount = (data.practice_count || 0) + 1;
          coinReward = newCount <= 5 ? 3 : 1;
          
          const { error } = await supabaseClient
            .from("word_practice_history")
            .update({
              practice_count: newCount,
              last_practiced_at: new Date().toISOString(),
              game_mode: gameMode,
              coins_earned: (data.coins_earned || 0) + coinReward
            })
            .eq("user_id", userId)
            .eq("word", trimmedWord);
            
          if (error) {
            console.error("Error updating word history:", error);
          }
        } else {
          // New word, create record
          isNewWord = true;
          coinReward = 3;
          
          const { error } = await supabaseClient
            .from("word_practice_history")
            .insert([{
              user_id: userId,
              word: trimmedWord,
              practice_count: 1,
              game_mode: gameMode,
              coins_earned: coinReward,
              last_practiced_at: new Date().toISOString()
            }]);
            
          if (error) {
            console.error("Error inserting word history:", error);
          } else {
            // Update player stats with new unique word
            const { data, error } = await supabaseClient
              .from("player_stats")
              .select("unique_words_practiced")
              .eq("user_id", userId)
              .single();
              
            if (!error) {
              const newTotal = (data?.unique_words_practiced || 0) + 1;
              const updateResult = await supabaseClient
                .from("player_stats")
                .update({ unique_words_practiced: newTotal })
                .eq("user_id", userId);
                
              if (!updateResult.error) {
                // Update UI word count immediately
                document.querySelectorAll("#totalWords").forEach(el => {
                  if (typeof animateNumber === 'function') {
                    animateNumber(el, parseInt(el.textContent) || 0, newTotal);
                  } else {
                    el.textContent = newTotal;
                  }
                });
              } else {
                console.error("Error updating player stats:", updateResult.error);
              }
            }
          }
        }
        
        // Award coins
        if (coinReward > 0 && typeof CoinsManager !== 'undefined' && CoinsManager.updateCoins) {
          await CoinsManager.updateCoins(coinReward);
        }
        
        return { isNewWord, coinReward };
      } catch (error) {
        console.error("Error in trackWordEncounter:", error);
        return { isNewWord: false, coinReward: 0, error };
      }
    } catch (outerError) {
      console.error("Error in trackWordEncounter outer try/catch:", outerError);
      return null;
    }
  }

