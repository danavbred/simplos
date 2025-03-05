document.addEventListener('DOMContentLoaded', function() {
    const fields = ["fullName", "phone", "parentName", "parentPhone"];
    
    fields.forEach(field => {
      const el = document.getElementById(field);
      if (el) {
        el.addEventListener('input', function() {
          this.style.border = "1px solid rgba(255, 255, 255, 0.2)";
        });
      }
    });
    
    // Also ensure the form has the submit handler directly attached
    const form = document.getElementById('upgradeForm');
    if (form) {
      form.addEventListener('submit', function(e) {
        console.log("Form submit event triggered");
        handleUpgradeSubmit(e);
      });
    }
  });

  // Replace window.onload with:
document.addEventListener('DOMContentLoaded', () => {
    gameInit.init();
});

const { createClient } = supabase;
const supabaseClient = createClient(
    'https://mczfgzffyyyacisrccqb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jemZnemZmeXl5YWNpc3JjY3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzODYyMDQsImV4cCI6MjA1Mzk2MjIwNH0.rLga_B29Coz1LMeJzFTGLIhckdcojGXnD1ae1bw-QAI',
    {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
);

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Define CustomListsManager first before any functions try to use it
        if (!window.CustomListsManager) {
            window.CustomListsManager = {
                lists: [],
                
                async initialize() {
                    if (currentUser) {
                        await this.loadFromSupabase();
                    } else {
                        this.loadFromLocalStorage();
                    }
                },
                
                async loadFromSupabase() {
                    try {
                        const { data, error } = await supabaseClient
                            .from('custom_lists')
                            .select('*')
                            .or(`user_id.eq.${currentUser.id},shared_with.cs.{${currentUser.id}}`);
                            
                        if (error) throw error;
                        
                        this.lists = data.map(item => ({
                            id: item.id,
                            name: item.name,
                            words: item.words || [],
                            translations: item.translations || [],
                            isShared: item.is_shared,
                            sharedBy: item.shared_by,
                            userId: item.user_id,
                            createdAt: item.created_at
                        }));
                        
                        console.log('Loaded lists from Supabase:', this.lists.length);
                    } catch (error) {
                        console.error('Error loading lists from Supabase:', error);
                        this.lists = [];
                    }
                },
                
                loadFromLocalStorage() {
                    try {
                        const savedLists = localStorage.getItem('simploxCustomLists');
                        this.lists = savedLists ? JSON.parse(savedLists) : [];
                        console.log('Loaded lists from localStorage:', this.lists.length);
                    } catch (error) {
                        console.error('Error loading lists from localStorage:', error);
                        this.lists = [];
                    }
                },
                
                async save(list) {
                    if (!list) return null;
                    
                    if (currentUser) {
                        return await this.saveToSupabase(list);
                    } else {
                        return this.saveToLocalStorage(list);
                    }
                },
                
                async saveToSupabase(list) {
                    try {
                        const listData = {
                            name: list.name,
                            words: list.words || [],
                            translations: list.translations || [],
                            user_id: currentUser.id
                        };
                        
                        if (list.id && typeof list.id === 'string' && list.id.length === 36) {
                            const { data, error } = await supabaseClient
                                .from('custom_lists')
                                .update(listData)
                                .eq('id', list.id)
                                .select()
                                .single();
                                
                            if (error) throw error;
                            return data;
                        } else {
                            const { data, error } = await supabaseClient
                                .from('custom_lists')
                                .insert(listData)
                                .select()
                                .single();
                                
                            if (error) throw error;
                            
                            const index = this.lists.findIndex(l => 
                                l.id === list.id || 
                                (l.tempId && l.tempId === list.tempId));
                                
                            if (index !== -1) {
                                this.lists[index] = {
                                    ...data,
                                    words: data.words || [],
                                    translations: data.translations || []
                                };
                            } else {
                                this.lists.push({
                                    ...data,
                                    words: data.words || [],
                                    translations: data.translations || []
                                });
                            }
                            
                            return data;
                        }
                    } catch (error) {
                        console.error('Error saving list to Supabase:', error);
                        return null;
                    }
                },
                
                saveToLocalStorage(list) {
                    try {
                        const newList = {
                            ...list,
                            id: list.id || Date.now(),
                            tempId: list.tempId || Date.now()
                        };
                        
                        const index = this.lists.findIndex(l => 
                            l.id === list.id || 
                            (l.tempId && l.tempId === list.tempId));
                            
                        if (index !== -1) {
                            this.lists[index] = newList;
                        } else {
                            this.lists.push(newList);
                        }
                        
                        localStorage.setItem('simploxCustomLists', JSON.stringify(this.lists));
                        return newList;
                    } catch (error) {
                        console.error('Error saving list to localStorage:', error);
                        return null;
                    }
                },
                
                async delete(listId) {
                    if (currentUser) {
                        try {
                            if (typeof listId === 'string' && listId.length === 36) {
                                const { error } = await supabaseClient
                                    .from('custom_lists')
                                    .delete()
                                    .eq('id', listId);
                                    
                                if (error) throw error;
                            }
                            
                            this.lists = this.lists.filter(list => list.id !== listId);
                            return true;
                        } catch (error) {
                            console.error('Error deleting list from Supabase:', error);
                            return false;
                        }
                    } else {
                        this.lists = this.lists.filter(list => list.id !== listId);
                        localStorage.setItem('simploxCustomLists', JSON.stringify(this.lists));
                        return true;
                    }
                },
                
                async share(listId, recipientId) {
                    if (!currentUser) return false;
                    
                    try {
                        const list = this.lists.find(l => l.id === listId);
                        if (!list) return false;
                        
                        const result = await supabaseClient.rpc('insert_shared_list', {
                            p_user_id: recipientId,
                            p_name: `${list.name} (Shared by ${currentUser.user_metadata?.username || 'User'})`,
                            p_words: list.words || [],
                            p_translations: list.translations || [],
                            p_is_shared: true,
                            p_local_id: Date.now(),
                            p_shared_with: [recipientId],
                            p_shared_by: currentUser.id
                        });
                        
                        return !result.error;
                    } catch (error) {
                        console.error('Error sharing list:', error);
                        return false;
                    }
                },
                
                getListLimits() {
                    if (!currentUser) {
                        return {
                            maxLists: 3,
                            maxWords: 10,
                            maxPlays: 5,
                            canShare: false,
                            playDisplay: '5'
                        };
                    }
                    
                    const userStatus = currentUser.status || 'free';
                    
                    switch(userStatus) {
                        case 'premium':
                            return {
                                maxLists: 30,
                                maxWords: 50,
                                maxPlays: Infinity,
                                canShare: true,
                                playDisplay: '∞'
                            };
                        case 'pending':
                            return {
                                maxLists: 30,
                                maxWords: 50,
                                maxPlays: Infinity,
                                canShare: false,
                                playDisplay: '∞'
                            };
                        case 'free':
                            return {
                                maxLists: 5,
                                maxWords: 20,
                                maxPlays: 10,
                                canShare: false,
                                playDisplay: '10'
                            };
                        default:
                            return {
                                maxLists: 3,
                                maxWords: 10,
                                maxPlays: 5,
                                canShare: false,
                                playDisplay: '5'
                            };
                    }
                },
                
                canCreateMoreLists() {
                    const limits = this.getListLimits();
                    return this.lists.length < limits.maxLists;
                }
            };
        }
        
        // Next, check session and initialize the game
        await checkExistingSession();
        initializeGame();
        updatePerkButtons();
        updateGuestPlayButton();
        
        // Initialize managers in correct order
        CoinsManager.initialize();
        WordsManager.initialize();
        await CustomListsManager.initialize();
 
        // Load initial coins
        if (currentUser) {
            gameState.coins = await CoinsManager.loadUserCoins();
            CoinsManager.updateDisplays();
            
            const words = await WordsManager.loadUserWords();
            WordsManager.updateDisplays(words);
        }
        
        // Handle QR code joining
        window.addEventListener('hashchange', handleHashChange);
        window.addEventListener('load', handleHashChange);
        
        // Check for join hash on initial load
        if (window.location.hash.startsWith('#join=')) {
            console.log('Initial join hash detected');
            const otp = window.location.hash.replace('#join=', '');
            history.pushState("", document.title, window.location.pathname);
            showJoinModal(otp);
        }
 
        // Ensure particles on welcome screen
        const welcomeScreen = document.getElementById('welcome-screen');
        initializeParticles(welcomeScreen);
        
        // Mobile fullscreen handling
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            // Request on first touch
            document.addEventListener('touchstart', function onFirstTouch() {
                document.removeEventListener('touchstart', onFirstTouch);
            }, { once: true });
            
            // Request when clicking any button
            document.addEventListener('click', function(e) {
                if (e.target.tagName === 'BUTTON') {
                }
            });
            
            // Screen orientation handling
            if (screen.orientation) {
                screen.orientation.lock('portrait')
                    .catch(err => console.log('Failed to lock orientation:', err));
            }
        }
 
        // OTP input handling
        const otpInput = document.getElementById('otpInput');
        if (otpInput) {
            otpInput.addEventListener('input', function(e) {
                // Remove any non-numeric characters
                this.value = this.value.replace(/[^0-9]/g, '');
                
                // Limit to 4 digits
                if (this.value.length > 4) {
                    this.value = this.value.slice(0, 4);
                }
            });
        }
 
        // Initialize real-time channels if user is logged in
        if (currentUser) {
            setupUserStatusSubscription();
            initializeStatusCheck();
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
 });

 document.addEventListener('DOMContentLoaded', function() {
    currentUser = null;
    checkExistingSession().then(() => {
        initializeGame();
        updatePerkButtons();
        updateNavigationContainer();
    });
});

document.addEventListener('DOMContentLoaded', () => {
    // Immediately invoke an async function
    (async () => {
        await checkExistingSession();
        initializeGame();
        updatePerkButtons();
        updateGuestPlayButton();
        
        CoinsManager.initialize();
        WordsManager.initialize();
        
        // Load initial values if user is logged in
        if (currentUser) {
            const [coins, words] = await Promise.all([
                CoinsManager.loadUserCoins(),
                WordsManager.loadUserWords()
            ]);
            
            gameState.coins = coins;
            CoinsManager.updateDisplays();
            WordsManager.updateDisplays(words);
        }
        
        // Check for join hash on initial load
        if (window.location.hash.startsWith('#join=')) {
            console.log('Initial join hash detected');
            const otp = window.location.hash.replace('#join=', '');
            history.pushState("", document.title, window.location.pathname);
            showJoinModal(otp);
        }

        // Ensure particles on welcome screen
        const welcomeScreen = document.getElementById('welcome-screen');
        initializeParticles(welcomeScreen);
        
        await loadCustomLists();

        // Mobile fullscreen handling
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            // Request on first touch
            document.addEventListener('touchstart', function onFirstTouch() {
                document.removeEventListener('touchstart', onFirstTouch);
            }, { once: true });
            
            // Request when clicking any button
            document.addEventListener('click', function(e) {
                if (e.target.tagName === 'BUTTON') {
                }
            });
            
            // Screen orientation handling
            if (screen.orientation) {
                screen.orientation.lock('portrait')
                    .catch(err => console.log('Failed to lock orientation:', err));
            }
        }

        // Initialize real-time channels if user is logged in
        if (currentUser) {
            setupUserStatusSubscription();
            initializeStatusCheck();
        }
    })().catch(error => {
        console.error('Initialization error:', error);
    });
});

document.addEventListener('DOMContentLoaded', function() {
    // Existing code...
    
    // Check for admin user and add test button if we're on the question screen
    if (document.getElementById('question-screen').classList.contains('visible')) {
      console.log("Question screen is visible on load, adding admin button");
      addAdminTestButton();
    }
    
    // Also add a direct check just to be safe
    setTimeout(() => {
      if (currentUser && currentUser.email === 'admin123@gmail.com') {
        console.log("Admin user detected on page load");
        addAdminTestButton();
      }
    }, 2000); // Give time for user to be loaded
  });

  document.addEventListener('DOMContentLoaded', function() {
    // Set up a mutation observer to handle dynamically added crowns
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        const crowns = node.querySelectorAll('.fa-crown');
                        crowns.forEach(crown => {
                            crown.addEventListener('click', function(event) {
                                event.stopPropagation();
                                // Always force show the upgrade screen
                                showScreen("upgrade-screen");
                            });
                        });
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
});

document.addEventListener('DOMContentLoaded', () => {
    const otpInput = document.getElementById('otpInput');
    if (otpInput) {
        otpInput.addEventListener('input', function(e) {
            // Remove any non-numeric characters
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // Limit to 4 digits
            if (this.value.length > 4) {
                this.value = this.value.slice(0, 4);
            }
        });
    }
});

document.addEventListener('progressSaved', (event) => {
    // If the stage-cascade screen is currently visible, refresh it
    const stageCascadeScreen = document.getElementById("stage-cascade-screen");
    if (stageCascadeScreen && stageCascadeScreen.classList.contains("visible")) {
      console.log("Refreshing stage cascade screen after progress save");
      renderStageCascadeScreen();
    }
  });
     
      document.addEventListener('DOMContentLoaded', () => {
      const logoutButton = document.querySelector('.logout-button');
      if (logoutButton) {
          logoutButton.addEventListener('click', handleLogout);
      }
  });

  document.addEventListener('click', (e) => {
    const sidePanel = document.querySelector('.side-panel');
    const hamburgerButton = document.querySelector('.hamburger-button');
    
    if (sidePanel.classList.contains('open') && 
        !sidePanel.contains(e.target) && 
        !hamburgerButton.contains(e.target)) {
        toggleSidePanel();
    }
});

    document.addEventListener('DOMContentLoaded', () => {
    const gameAssets = {
        stages: {}, // Cache stage data
        currentWords: [], // Cache current level words
        particles: new Set() // Reuse particle elements
    };
});


document.addEventListener('click', (e) => {
    const target = e.target;
    
    if (target.matches('.game-btn')) {
        handleButtonClick(target);
    } else if (target.matches('.level')) {
        handleLevelClick(target);
    }
});

document.addEventListener('click', (e) => {
    const authModal = document.getElementById('authModal');
    const authContent = authModal?.querySelector('.auth-modal-content');
    const arcadeModal = document.getElementById('arcade-modal');
    const arcadeContent = arcadeModal?.querySelector('.modal-content');
    
    // Handle auth modal
    if (authModal?.classList.contains('show') && 
        !authContent.contains(e.target) && 
        !e.target.matches('.main-button')) {
        hideAuthModal();
    }
    
    // Handle arcade modal
    if (arcadeModal?.style.display === 'block' && 
        !arcadeContent.contains(e.target) && 
        !e.target.matches('.arcade-button')) {
        arcadeModal.style.display = 'none';
    }
});

const ParticleSystem = {
    particlePool: [],
    maxParticles: 20, // Reduced from 50
    
    init() {
        // Pre-create fewer particles
        for(let i = 0; i < this.maxParticles; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle mobile-particle'; // Add mobile class
            this.particlePool.push(particle);
        }
    },
    
    createParticle(x, y) {
        // Check if mobile before creating
        if (window.innerWidth <= 768) {
            return; // Skip particle creation on mobile
        }
        
        const particle = this.particlePool.pop();
        if (!particle) return;
        
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        
        setTimeout(() => {
            this.particlePool.push(particle);
        }, 500); // Reduced timeout
    }
};

const crownStyleElement = document.createElement('style');
crownStyleElement.textContent = `
    @keyframes crownGlow {
        0% {
            text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
            filter: brightness(1) drop-shadow(0 0 3px rgba(255, 215, 0, 0.7));
        }
        100% {
            text-shadow: 0 0 15px rgba(255, 215, 0, 0.8);
            filter: brightness(1.4) drop-shadow(0 0 5px rgba(255, 215, 0, 0.9));
        }
    }
    
    .premium-crown {
        animation: crownGlow 2s infinite alternate;
    }
`;
document.head.appendChild(crownStyleElement);


const readyPhrases = [
    "Born Ready!",
    "Ready to Roll!",
    "All Set!",
    "Locked & Loaded!",
    "Ready Player!",
    "Game Face On!",
    "In Position!",
    "Ready to Rock!",
    "Standing By!",
    "Powered Up!",
    "Challenge Ready!",
    "Mission Ready!",
    "Ready to Shine!",
    "Bring it On!",
    "Ready to Rumble!",
    "Set for Success!",
    "Level Ready!",
    "Shields Up!",
    "Word Warrior Ready!",
    "Let's Do This!"
];

const shineColors = [
    '#1E90FF',  // Blue
    '#FF1493',  // Deep Pink
    '#00CED1',  // Dark Turquoise
    '#9370DB',  // Medium Purple
    '#FFD700',  // Gold
    '#FF4500',  // Orange Red
    '#32CD32',  // Lime Green
    '#FF69B4',  // Hot Pink
    '#4169E1',  // Royal Blue
    '#8A2BE2'   // Blue Violet
];


const CoinsManager = {
    // Flag to prevent concurrent updates
    isUpdating: false,
    
    // Queue for pending updates
    updateQueue: [],
    
    updateCoins: async function(amount) {
        // If already updating, add to queue
        if (this.isUpdating) {
            return new Promise((resolve, reject) => {
                this.updateQueue.push({amount, resolve, reject});
            });
        }
        
        this.isUpdating = true;
        
        try {
            // Get current coin value
            const currentCoins = gameState.coins || 0;
            const newCoins = currentCoins + amount;
            
            // Update the state
            gameState.coins = newCoins;
            
            // Animate all coin displays
            const coinDisplays = document.querySelectorAll('.coin-count');
            coinDisplays.forEach(el => {
                animateCoinsChange(el, currentCoins, newCoins);
            });
            
            // Visual pulse effect for immediate feedback
            if (amount !== 0) {
                pulseCoins(amount);
            }
            
            // Save progress
            await saveProgress();
            
            // Update UI that depends on coins
            updatePerkButtons();
            
            // Process any queued updates
            this.isUpdating = false;
            if (this.updateQueue.length > 0) {
                const nextUpdate = this.updateQueue.shift();
                this.updateCoins(nextUpdate.amount)
                    .then(nextUpdate.resolve)
                    .catch(nextUpdate.reject);
            }
            
            return newCoins;
        } catch (error) {
            this.isUpdating = false;
            console.error("Error updating coins:", error);
            throw error;
        }
    }
};

const WordsManager = {
  displayElements: new Set(),
  
  initialize() {
    this.displayElements.clear();
    document.querySelectorAll("#totalWords").forEach(el => {
      this.displayElements.add(el);
    });
    
    // Initialize word counts for logged-in users
    if (currentUser) {
      this.loadUserWords().then(wordCount => {
        this.updateDisplays(wordCount);
      });
    }
  },
  
  async loadUserWords() {
    if (!currentUser) return 0;
    
    try {
      const { data, error } = await supabaseClient
        .from("player_stats")
        .select("unique_words_practiced")
        .eq("user_id", currentUser.id)
        .single();
        
      if (error) throw error;
      return data?.unique_words_practiced || 0;
    } catch (err) {
      console.error("Error loading words:", err);
      return 0;
    }
  },
  
  async updateWords(count) {
    try {
      const currentCount = parseInt(document.getElementById("totalWords").textContent) || 0;
      const newCount = currentCount + count;
      
      this.displayElements.forEach(el => {
        let value = currentCount;
        const startTime = performance.now();
        
        requestAnimationFrame(function updateValue(timestamp) {
          const elapsed = timestamp - startTime;
          const progress = Math.min(elapsed / 1000, 1);
          
          value = currentCount + (newCount - currentCount) * progress;
          el.textContent = Math.round(value);
          
          if (progress < 1) {
            requestAnimationFrame(updateValue);
          } else {
            el.textContent = newCount;
          }
        });
      });
      
      if (currentUser) {
        const { error } = await supabaseClient
          .from("player_stats")
          .update({ unique_words_practiced: newCount })
          .eq("user_id", currentUser.id);
          
        if (error) throw error;
      }
      
      return true;
    } catch (err) {
      console.error("Failed to update words:", err);
      return false;
    }
  },
  
  updateDisplays(count) {
    this.displayElements.forEach(el => {
      el.textContent = count;
    });
  }
};


const perkButtons = {
    timeFreeze: document.getElementById('timeFreezePerk'),
    skip: document.getElementById('skipPerk'),
    clue: document.getElementById('cluePerk'),
    reveal: document.getElementById('revealPerk')
};


class RateLimiter {
    constructor(maxRequests = 100, timeWindow = 60000) {
        this.requests = new Map();
    }
    
    checkLimit(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        const recentRequests = userRequests.filter(time => now - time < this.timeWindow);
        
        if (recentRequests.length >= this.maxRequests) {
            return false;
        }
        
        recentRequests.push(now);
        this.requests.set(userId, recentRequests);
        return true;
    }
}



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
    const userStatus = currentUser ? currentUser.status : "unregistered";
    
    // If user is already premium, no need to check
    if (userStatus === "premium") return true;
    
    // Get stored user identifier for upgrade tracking
    const userIdentifier = currentUser ? `upgradeRequested_${currentUser.id}` : 'upgradeRequested_guest';
    
    // Check if upgrade has been requested before
    const upgradeRequested = localStorage.getItem(userIdentifier);
    
    // If this is the first visit to the page in this session, reset the flag
    // This ensures users see the prompt at least once per session
    if (!sessionStorage.getItem('upgradePromptShownThisSession')) {
      sessionStorage.setItem('upgradePromptShownThisSession', 'true');
      return false;
    }
    
    // Return whether the user has already seen the upgrade prompt
    return !!upgradeRequested;
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
    console.log("Showing upgrade prompt");
    
    // Store current game state for later
    const gameContext = {
      stage: gameState.currentStage,
      set: gameState.currentSet,
      level: gameState.currentLevel,
      timestamp: Date.now()
    };
    localStorage.setItem("gameContext", JSON.stringify(gameContext));
    
    // Show the upgrade screen
    showScreen("upgrade-screen");
    
    // If we have a callback, store it for later use
    if (typeof callback === 'function') {
      window.upgradeCallback = callback;
    }
    
    return false;
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
              // Remove first_practiced_at - it doesn't exist in schema
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

  function createResurrectionParticles() {
    const container = document.querySelector('.resurrection-animation');
    if (!container) return;
    
    // Get center of container
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create particles
    for (let i = 0; i < 40; i++) {
        const particle = document.createElement('div');
        particle.className = 'resurrection-particle';
        
        // Random angle and distance
        const angle = Math.random() * Math.PI * 2;
        const distance = 100 + Math.random() * 150;
        const duration = 1 + Math.random() * 1.5;
        const delay = Math.random() * 0.5;
        const size = 3 + Math.random() * 7;
        
        // Calculate end position
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance;
        
        // Set particle style
        particle.style.cssText = `
            position: fixed;
            left: ${centerX}px;
            top: ${centerY}px;
            width: ${size}px;
            height: ${size}px;
            background: #FFD700;
            border-radius: 50%;
            opacity: 0;
            z-index: 1001;
            box-shadow: 0 0 ${size}px #FFD700;
            transform: translate(-50%, -50%);
            animation: particleFlow ${duration}s ease-out ${delay}s forwards;
        `;
        
        // Set custom properties for animation
        particle.style.setProperty('--end-x', `${endX}px`);
        particle.style.setProperty('--end-y', `${endY}px`);
        
        document.body.appendChild(particle);
        
        // Clean up after animation
        setTimeout(() => {
            particle.remove();
        }, (duration + delay) * 1000);
    }
}

function updateSidePanelLink() {
    const levelMapLink = document.querySelector('.nav-link[onclick*="stage-screen"]');
    if (levelMapLink) {
        levelMapLink.setAttribute('onclick', "showScreen('stage-cascade-screen'); return false;");
    }
}

updateSidePanelLink();

// Also call it when DOM is loaded to ensure it works
document.addEventListener('DOMContentLoaded', () => {
    updateSidePanelLink();
});

function showReviveOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'revive-overlay';
    overlay.innerHTML = `
        <div class="revive-content">
            <div class="ankh-symbol">☥</div>
            <h2 class="revive-title">Revive?</h2>
            <div class="revive-timer">5</div>
            <button class="revive-button">Revive</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Fade in animation
    requestAnimationFrame(() => {
        overlay.classList.add('show');
    });
    
    // Set up countdown
    let seconds = 5;
    const timerDisplay = overlay.querySelector('.revive-timer');
    
    const countdownInterval = setInterval(() => {
        seconds--;
        timerDisplay.textContent = seconds;
        
        if (seconds <= 0) {
            clearInterval(countdownInterval);
            handleReviveTimeout();
        }
    }, 1000);
    
    // Handle revive button click
    const reviveButton = overlay.querySelector('.revive-button');
    reviveButton.onclick = () => {
        clearInterval(countdownInterval);
        handleRevive();
    };
    
    // Store interval for cleanup
    overlay.dataset.intervalId = countdownInterval;
}

function handleReviveTimeout() {
    const overlay = document.querySelector('.revive-overlay');
    
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.remove();
            showScreen('welcome-screen');
        }, 500);
    }
}

function handleRevive() {
    const overlay = document.querySelector('.revive-overlay');
    
    if (overlay) {
        // First change content to show resurrection animation
        const content = overlay.querySelector('.revive-content');
        content.innerHTML = `
            <div class="resurrection-animation">
                <div class="progress-circle resurrection-circle">
                    <svg width="100%" height="100%" viewBox="0 0 120 120">
                        <circle class="bg" cx="60" cy="60" r="54" stroke-width="8"/>
                        <circle class="resurrection-progress" cx="60" cy="60" r="54" stroke-width="8"/>
                    </svg>
                    <div class="ankh-symbol resurrection-ankh">☥</div>
                </div>
            </div>
        `;
        
        // Start resurrection animation
        const progressCircle = overlay.querySelector('.resurrection-progress');
        const circumference = 2 * Math.PI * 54;
        progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressCircle.style.strokeDashoffset = circumference;
        
        // Create light particles effect
        createResurrectionParticles();
        
        // Animate progress circle filling
        setTimeout(() => {
            progressCircle.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1)';
            progressCircle.style.strokeDashoffset = '0';
        }, 100);
        
        // After animation completes, restart level
        setTimeout(() => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                
                // Reset game state
                currentGame.wrongStreak = 0;
                timeRemaining = currentGame.initialTimeRemaining;
                
                // If in custom practice, handle specially
                if (currentGame.isCustomPractice) {
                    startCustomLevel(currentGame.customLevel);
                } else {
                    startLevel(gameState.currentLevel);
                }
            }, 500);
        }, 2500);
    }
}

function createResurrectionParticles() {
    const container = document.querySelector('.resurrection-animation');
    if (!container) return;
    
    // Get center of container
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create particles
    for (let i = 0; i < 40; i++) {
        const particle = document.createElement('div');
        particle.className = 'resurrection-particle';
        
        // Random angle and distance
        const angle = Math.random() * Math.PI * 2;
        const distance = 100 + Math.random() * 150;
        const duration = 1 + Math.random() * 1.5;
        const delay = Math.random() * 0.5;
        const size = 3 + Math.random() * 7;
        
        // Calculate end position
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance;
        
        // Set particle style
        particle.style.cssText = `
            position: fixed;
            left: ${centerX}px;
            top: ${centerY}px;
            width: ${size}px;
            height: ${size}px;
            background: #FFD700;
            border-radius: 50%;
            opacity: 0;
            z-index: 1001;
            box-shadow: 0 0 ${size}px #FFD700;
            transform: translate(-50%, -50%);
            animation: particleFlow ${duration}s ease-out ${delay}s forwards;
        `;
        
        // Set custom properties for animation
        particle.style.setProperty('--end-x', `${endX}px`);
        particle.style.setProperty('--end-y', `${endY}px`);
        
        document.body.appendChild(particle);
        
        // Clean up after animation
        setTimeout(() => {
            particle.remove();
        }, (duration + delay) * 1000);
    }
}

function updateSidePanelLink() {
    const levelMapLink = document.querySelector('.nav-link[onclick*="stage-screen"]');
    if (levelMapLink) {
        levelMapLink.setAttribute('onclick', "showScreen('stage-cascade-screen'); return false;");
    }
}


function getStageIcon(stageId) {
    const icons = {
        1: 'fas fa-book',
        2: 'fas fa-graduation-cap',
        3: 'fas fa-school',
        4: 'fas fa-university',
        5: 'fas fa-brain'
    };
    return icons[stageId] || 'fas fa-star';
}

function getStageHebrewName(stageId) {
    const names = {
        1: 'מתחילים',
        2: 'יסודי',
        3: 'חטיבת ביניים',
        4: 'תיכון',
        5: 'אוניברסיטה'
    };
    return names[stageId] || `Stage ${stageId}`;
}

function getStageDescription(stageId) {
    const descriptions = {
        1: 'Beginner level words and simple phrases',
        2: 'Elementary level vocabulary and structures',
        3: 'Middle school level vocabulary',
        4: 'High school level vocabulary',
        5: 'University level vocabulary'
    };
    return descriptions[stageId] || 'Advanced vocabulary';
}

function getStageStatus(stageId, completedSets, totalSets) {
    // For premium stages, show premium status for non-premium users
    if (stageId > 2 && (!currentUser || currentUser.status !== 'premium')) {
        return 'Premium Feature';
    }
    
    // For unlocked stages, show completion status
    return `${completedSets}/${totalSets} Sets Completed`;
}

function populateSetsGrid(e) {
    const t = document.getElementById(`sets-grid-${e}`);
    if (!t) return;
    console.log(`Populating sets grid for stage ${e}`);
    console.log("Unlocked sets:", gameState.unlockedSets);
    const n = gameStructure.stages[e - 1],
        r = gameState.unlockedSets[e] || new Set,
        o = currentUser ? currentUser.status : "unregistered";
    console.log(`Stage ${e} unlocked sets:`, Array.from(r));
    t.innerHTML = "";
    for (let s = 1; s <= n.numSets; s++) {
        const n = document.createElement("div"),
            a = r.has(s);
        let i = !1;
        e >= 2 && s > 1 && "premium" !== o && (i = !0);
        n.className = "set-button";
        a && !i ? n.classList.add("active") : n.classList.add("locked");
        const c = isSetCompleted(e, s);
        
        n.innerHTML = `
      <span>Set ${s}</span>
      ${c ? '\n      <div class="completed-indicator">\n        <i class="fas fa-check-circle"></i>\n      </div>' : ""}
      ${!a || i ? `
      <div class="lock-icon">
        <i class="fas ${i ? "fa-crown crown-premium" : "fa-lock"}"></i>
      </div>` : ""}
    `;
        
        if (a && !i) {
            n.onclick = () => {
                gameState.currentStage = e;
                gameState.currentSet = s;
                showLevelScreen(s);
            };
        } else if (i) {
            // Make the whole button show upgrade prompt
            n.onclick = () => showUpgradePrompt();
            
            // Add specific handler for the crown icon
            setTimeout(() => {
                const crownIcon = n.querySelector(".fa-crown");
                if (crownIcon) {
                    crownIcon.addEventListener("click", (event) => {
                        event.stopPropagation();
                        showUpgradePrompt();
                    });
                }
            }, 0);
        }
        
        t.appendChild(n);
    }
}

function isSetCompleted(stage, set) {
  const stageData = gameStructure.stages;
  if (!stageData || !stageData[stage-1]) {
    console.warn(`Invalid stage ${stage} in isSetCompleted`);
    return false;
  }
  
  const totalLevels = stageData[stage-1].levelsPerSet;
  let completedCount = 0;
  
  console.log(`Checking if set ${stage}-${set} is completed. Total levels: ${totalLevels}`);
  
  for (let level = 1; level <= totalLevels; level++) {
    const levelKey = `${stage}_${set}_${level}`;
    if (gameState.completedLevels.has(levelKey) || gameState.perfectLevels.has(levelKey)) {
      completedCount++;
      console.log(`Level ${levelKey} is completed`);
    }
  }
  
  const isComplete = completedCount === totalLevels;
  console.log(`Set ${stage}-${set} completion check: ${completedCount}/${totalLevels} = ${isComplete}`);
  
  return isComplete;
}

function handleCrownClick(e) {
  e.stopPropagation();
  
  if (!currentUser) {
    // Unregistered user - show signup form
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
  } else {
    // Logged in user - show upgrade form
    localStorage.removeItem(`upgradeRequested_${currentUser.id}`);
    showUpgradePrompt();
  }
}

function forceShowUpgradeForm() {
    // Remove the flag that prevents the form from showing again
    if (currentUser) {
        localStorage.removeItem(`upgradeRequested_${currentUser.id}`);
    } else {
        localStorage.removeItem('upgradeRequested_guest');
    }
    
    // Show the upgrade form
    showScreen("upgrade-screen");
}

/* ADD this code to ensure crowns are clickable after DOM loads */
document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers to all crown icons
    document.querySelectorAll('.fa-crown').forEach(crown => {
        crown.addEventListener('click', handleCrownClick);
    });
    
    // Set up a mutation observer to handle dynamically added crowns
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        const crowns = node.querySelectorAll('.fa-crown');
                        crowns.forEach(crown => {
                            crown.addEventListener('click', handleCrownClick);
                        });
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
});



function addStageToggleListeners() {
    document.querySelectorAll('.stage-wrapper .stage-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const wrapper = button.closest('.stage-wrapper');
            wrapper.classList.toggle('open');
            e.stopPropagation(); // Prevent event bubbling
        });
    });
}


// Add to document ready function
document.addEventListener('DOMContentLoaded', () => {
    // Make sure all the necessary screens exist
    ensureScreenExists('stage-cascade-screen');
    
    // Update navigation links
    updateSidePanelLinks();
    
    // If any other initialization is needed for stage-cascade-screen
    initializeStageCascadeScreen();
});

// Simple initialization function for the stage cascade screen
function initializeStageCascadeScreen() {
    const screen = document.getElementById('stage-cascade-screen');
    if (!screen.querySelector('.stages-container')) {
        const container = document.createElement('div');
        container.className = 'stages-container';
        screen.appendChild(container);
    }
}

const SessionManager = {
    maxInactiveTime: 30 * 60 * 1000, // 30 minutes
    lastActivity: Date.now(),
    
    init() {
        document.addEventListener('click', () => this.updateActivity());
        document.addEventListener('keypress', () => this.updateActivity());
        setInterval(() => this.checkSession(), 60000);
    },
    
    updateActivity() {
        this.lastActivity = Date.now();
    },
    
    async checkSession() {
        if (Date.now() - this.lastActivity > this.maxInactiveTime) {
            await handleLogout();
            modalSystem.show('timeout', {
                title: "Session Expired",
                message: "Please log in again"
            });
        }
    }
};

const DataValidator = {
    validateGameProgress(progress) {
        const maxAllowedCoins = 100000;
        const maxAllowedPerks = 100;
        
        return {
            ...progress,
            coins: Math.min(progress.coins, maxAllowedCoins),
            perks: Object.fromEntries(
                Object.entries(progress.perks).map(([key, value]) => 
                    [key, Math.min(value, maxAllowedPerks)]
                )
            )
        };
    },
    
    validateCustomList(list) {
        return {
            ...list,
            words: list.words.slice(0, 1000).map(sanitizeInput),
            translations: list.translations.slice(0, 1000).map(sanitizeInput)
        };
    }
};

const ErrorHandler = {
    async logError(error, context) {
        if (currentUser) {
            await supabaseClient
                .from('error_logs')
                .insert([{
                    user_id: currentUser.id,
                    error: error.message,
                    stack: error.stack,
                    context,
                    timestamp: new Date()
                }]);
        }
        console.error(`${context}:`, error);
    },
    
    handleError(error, context) {
        this.logError(error, context);
        modalSystem.show('error', {
            title: "Oops!",
            message: "Something went wrong. Please try again."
        });
    }
};


function handleUpgradeClick() {
    hideUpgradePrompt();
    showPaymentScreen();
}











function toggleParentPhone() {
    const isAdult = document.getElementById('isAdult').checked;
    const parentPhoneGroup = document.getElementById('parentPhoneGroup');
    const parentPhoneInput = document.getElementById('parentPhone');
    
    parentPhoneGroup.style.display = isAdult ? 'none' : 'block';
    parentPhoneInput.required = !isAdult;
}


function handleHashChange() {
    console.log('Hash change detected:', window.location.hash);
    
    if (window.location.hash.startsWith('#join=')) {
        const otp = window.location.hash.replace('#join=', '');
        console.log('Join OTP detected:', otp);
        
        // Show landing page on mobile
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            const qrLanding = document.getElementById('qr-landing');
            const codeDisplay = qrLanding.querySelector('.game-code-display');
            
            // Hide all other screens
            document.querySelectorAll('.screen').forEach(screen => {
                screen.style.display = 'none';
            });
            
            // Show and populate landing page
            qrLanding.style.display = 'flex';
            codeDisplay.textContent = otp;
            
            // Store OTP for later use
            qrLanding.dataset.otp = otp;
        } else {
            // Desktop behavior
            history.pushState("", document.title, window.location.pathname);
            showJoinModal(otp);
        }
    }
}

function updateUI() {
    // Batch DOM updates
    requestAnimationFrame(() => {
        const fragment = document.createDocumentFragment();
        // Add elements to fragment
        document.body.appendChild(fragment);
    });
}


function updateGuestPlayButton() {
    const guestPlayButton = document.querySelector('.guest-play-button');
    
    if (!currentUser || (currentUser && currentUser.status === 'unregistered')) {
        guestPlayButton.textContent = 'Play as Guest';
    } else {
        guestPlayButton.textContent = 'Start Game';
    }
}

function toggleParentFields() {
    const isAdult = document.getElementById('isAdult').checked;
    const parentSection = document.getElementById('parentInfoSection');
    const adultSection = document.getElementById('adultInfoSection');
    
    // Get input elements
    const parentInputs = parentSection.querySelectorAll('input');
    const adultInputs = adultSection.querySelectorAll('input');
    
    if (isAdult) {
        parentSection.style.display = 'none';
        adultSection.style.display = 'block';
        
        // Toggle required attributes
        parentInputs.forEach(input => input.required = false);
        adultInputs.forEach(input => input.required = true);
    } else {
        parentSection.style.display = 'block';
        adultSection.style.display = 'none';
        
        // Toggle required attributes
        parentInputs.forEach(input => input.required = true);
        adultInputs.forEach(input => input.required = false);
    }
}


// Add a debug helper function to check popup status
function checkPopupStatus() {
  const popups = document.querySelectorAll('.confirmation-popup');
  if (popups.length === 0) {
    console.log("No confirmation popups found in the DOM");
    return;
  }
  
  popups.forEach((popup, index) => {
    console.log(`Popup ${index + 1}:`, {
      visibility: window.getComputedStyle(popup).visibility,
      opacity: window.getComputedStyle(popup).opacity,
      display: window.getComputedStyle(popup).display,
      zIndex: window.getComputedStyle(popup).zIndex,
      transform: window.getComputedStyle(popup).transform,
      position: window.getComputedStyle(popup).position
    });
  });
}

// Add a global debug function for the upgrade process
window.debugUpgrade = function() {
  checkPopupStatus();
  console.log("Upgrade screen visible:", document.getElementById("upgrade-screen").classList.contains("visible"));
  console.log("Upgrade form:", document.getElementById("upgradeForm"));
  console.log("Current user:", currentUser);
};


function skipUpgrade() {
    console.log("Skip upgrade button clicked");
    
    // Store that this user has seen the upgrade prompt to prevent repeated showings
    if (currentUser && currentUser.id) {
      localStorage.setItem(`upgradeRequested_${currentUser.id}`, 'true');
    } else {
      localStorage.setItem('upgradeRequested_guest', 'true');
    }
    
    // Get the stored stage/set/level that the user was trying to access
    const storedContext = localStorage.getItem("gameContext");
    let targetStage = gameState.currentStage;
    let targetSet = gameState.currentSet;
    let targetLevel = gameState.currentLevel;
    
    if (storedContext) {
      try {
        const context = JSON.parse(storedContext);
        if (context.stage) targetStage = context.stage;
        if (context.set) targetSet = context.set;
        if (context.level) targetLevel = context.level;
      } catch (e) {
        console.error("Error parsing saved context:", e);
      }
    }
    
    // Set the current game state
    gameState.currentStage = targetStage;
    gameState.currentSet = targetSet;
    gameState.currentLevel = targetLevel;
    
    // Hide the upgrade screen
    document.getElementById('upgrade-screen').classList.remove('visible');
    
    // Start the level directly
    startLevel(gameState.currentLevel);
  }

  function handleUpgradeSubmit(event) {
    event.preventDefault();
    
    // Mark that this user has requested an upgrade
    if (currentUser && currentUser.id) {
      localStorage.setItem(`upgradeRequested_${currentUser.id}`, 'true');
    } else {
      localStorage.setItem('upgradeRequested_guest', 'true');
    }
    
    // Get form data
    const form = document.getElementById('upgradeForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Log the request (you might want to send this to your backend)
    console.log("Upgrade request data:", data);
    
    // Show a success message
    showNotification("Thanks for your interest! We'll contact you soon.", "success");
    
    // Mark user as "pending" if they're logged in
    if (currentUser && currentUser.id) {
      updateUserStatus("pending").then(() => {
        console.log("User status updated to pending");
      }).catch(error => {
        console.error("Failed to update user status:", error);
      });
    }
    
    // Hide the upgrade screen
    document.getElementById('upgrade-screen').classList.remove('visible');
    
    // Get the stored stage/set/level that the user was trying to access
    const storedContext = localStorage.getItem("gameContext");
    let targetStage = gameState.currentStage;
    let targetSet = gameState.currentSet;
    let targetLevel = gameState.currentLevel;
    
    if (storedContext) {
      try {
        const context = JSON.parse(storedContext);
        if (context.stage) targetStage = context.stage;
        if (context.set) targetSet = context.set;
        if (context.level) targetLevel = context.level;
      } catch (e) {
        console.error("Error parsing saved context:", e);
      }
    }
    
    // Set the current game state
    gameState.currentStage = targetStage;
    gameState.currentSet = targetSet;
    gameState.currentLevel = targetLevel;
    
    // Execute callback if it exists (resume game)
    if (typeof window.upgradeCallback === 'function') {
      setTimeout(() => {
        window.upgradeCallback();
        window.upgradeCallback = null;
      }, 500);
    } else {
      // Otherwise, just start the level
      startLevel(gameState.currentLevel);
    }
  }

  async function updateUserStatus(status) {
    if (!currentUser || !currentUser.id) {
      console.error("No user to update status");
      return Promise.reject("No user logged in");
    }
    
    try {
      const { data, error } = await supabaseClient
        .from("user_profiles")
        .update({ status: status })
        .eq("id", currentUser.id);
        
      if (error) throw error;
      
      // Update local user object
      currentUser.status = status;
      
      return data;
    } catch (error) {
      console.error("Error updating user status:", error);
      return Promise.reject(error);
    }
  }

  function showUnregisteredWarning(callback) {
    // Prevent multiple popups in the same page load
    if (window.unregisteredWarningShown) {
        if (callback) callback();
        return;
    }

    // Mark that the warning has been shown
    window.unregisteredWarningShown = true;

    // Create full-screen signup page
    const fullscreenPrompt = document.createElement('div');
    fullscreenPrompt.className = 'fullscreen-signup-page';
    fullscreenPrompt.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--gradient);
        z-index: 2000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 2rem;
        animation: fadeIn 0.3s ease-in-out;
    `;

    // Create content container
    fullscreenPrompt.innerHTML = `
        <div class="signup-header" style="width: 100%; display: flex; justify-content: flex-start; margin-bottom: 2rem;">
            <button class="skip-signup-button" style="
                background: rgba(255,255,255,0.15);
                border: none;
                color: var(--text);
                padding: 0.75rem 1.5rem;
                border-radius: 50px;
                font-size: 0.9rem;
                cursor: pointer;
                transition: all 0.3s ease;
            ">
                Skip
            </button>
        </div>
        
        <div class="signup-content" style="
            text-align: center;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            max-width: 600px;
            width: 100%;
        ">
            <h2 style="
                font-size: 2rem;
                color: var(--gold);
                margin-bottom: 1.5rem;
                animation: floatAnimation 3s ease-in-out infinite;
            ">Save Your Progress!</h2>
            
            <p style="
                font-size: 1.2rem;
                line-height: 1.6;
                margin-bottom: 2rem;
                color: var(--text);
            ">Create a free account to track your vocabulary progress, earn rewards, and unlock more advanced content</p>
            
            <div class="features-list" style="
                display: flex;
                flex-direction: column;
                gap: 1rem;
                margin-bottom: 3rem;
                text-align: left;
            ">
                <div class="feature-item" style="
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                ">
                    <i class="fas fa-check-circle" style="color: var(--gold); font-size: 1.5rem;"></i>
                    <span>Track your learning progress</span>
                </div>
                <div class="feature-item" style="
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                ">
                    <i class="fas fa-check-circle" style="color: var(--gold); font-size: 1.5rem;"></i>
                    <span>Practice custom word lists</span>
                </div>
                <div class="feature-item" style="
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                ">
                    <i class="fas fa-check-circle" style="color: var(--gold); font-size: 1.5rem;"></i>
                    <span>Earn coins for premium content</span>
                </div>
            </div>
        </div>
        
        <div class="signup-footer" style="
            width: 100%;
            display: flex;
            justify-content: center;
            padding-bottom: 2rem;
        ">
            <button class="signup-now-button" style="
                background: var(--gold);
                color: var(--primary-dark);
                border: none;
                padding: 1.25rem 3rem;
                border-radius: 50px;
                font-size: 1.2rem;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 10px 20px rgba(255, 215, 0, 0.2);
                animation: pulseAnimation 1.5s infinite ease-in-out;
            ">
                Sign Up Now
            </button>
        </div>
    `;

    // Add to body
    document.body.appendChild(fullscreenPrompt);
    
    // Add animations CSS
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes floatAnimation {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        
        @keyframes pulseAnimation {
            0%, 100% { transform: scale(1); box-shadow: 0 10px 20px rgba(255, 215, 0, 0.2); }
            50% { transform: scale(1.05); box-shadow: 0 10px 30px rgba(255, 215, 0, 0.4); }
        }
    `;
    document.head.appendChild(styleElement);

    // Store that this user has seen the signup prompt
    localStorage.setItem('upgradeRequested_guest', 'true');
    
    // Store current game context for later
    const gameContext = {
        stage: gameState.currentStage,
        set: gameState.currentSet,
        level: gameState.currentLevel,
        timestamp: Date.now()
    };
    localStorage.setItem("gameContext", JSON.stringify(gameContext));

    // Add event listeners
    const skipButton = fullscreenPrompt.querySelector('.skip-signup-button');
    const signupButton = fullscreenPrompt.querySelector('.signup-now-button');
    
    skipButton.addEventListener('click', function() {
        // Remove the prompt
        document.body.removeChild(fullscreenPrompt);
        if (styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
        
        // Execute callback to continue game
        if (callback) {
            callback();
        }
    });
    
    signupButton.addEventListener('click', function() {
        // Remove the prompt
        document.body.removeChild(fullscreenPrompt);
        if (styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
        
        // First, make sure we're on welcome screen since auth modal works best there
        showScreen('welcome-screen');
        
        // Show the auth modal with signup form
        setTimeout(function() {
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.classList.add('show');
                
                // Switch to signup form
                const signupForm = document.getElementById('signupForm');
                const loginForm = document.getElementById('loginForm');
                if (signupForm && loginForm) {
                    signupForm.classList.remove('hidden');
                    loginForm.classList.add('hidden');
                }
            }
        }, 100); // Short delay to ensure welcome screen is visible first
    });
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
        
        // Get the stored game context
        const storedContext = localStorage.getItem("gameContext");
        if (storedContext) {
          try {
            const context = JSON.parse(storedContext);
            // If we have stored context, restore and continue from where we left off
            if (context.stage && context.set && context.level) {
              gameState.currentStage = context.stage;
              gameState.currentSet = context.set;
              gameState.currentLevel = context.level;
              
              // Execute any pending callbacks
              if (typeof window.signupCallback === 'function') {
                setTimeout(() => {
                  window.signupCallback();
                  window.signupCallback = null;
                }, 500);
              } else {
                // Otherwise start the level directly
                setTimeout(() => {
                  startLevel(gameState.currentLevel);
                }, 500);
              }
              return;
            }
          } catch (e) {
            console.error("Error parsing stored context:", e);
          }
        }
        
        // Default fallback - show welcome screen
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

async function updateUserStats() {
  try {
    if (!currentUser) return;
    
    const { data: gameData } = await supabaseClient
      .from("game_progress")
      .select("coins")
      .eq("user_id", currentUser.id)
      .single();
      
    const { data: statsData } = await supabaseClient
      .from("player_stats")
      .select("unique_words_practiced")
      .eq("user_id", currentUser.id)
      .single();
    
    if (gameData) {
      document.getElementById("totalCoins").textContent = gameData.coins || 0;
    }
    
    if (statsData) {
      document.getElementById("totalWords").textContent = statsData.unique_words_practiced || 0;
    }
    
    // Add this to force UI refresh
    updateAllCoinDisplays();
    WordsManager.updateDisplays(statsData?.unique_words_practiced || 0);
  } catch (err) {
    console.error("Error updating user stats:", err);
  }
}




function restoreGameContext() {
    const savedContext = localStorage.getItem('gameContext');
    if (savedContext) {
        const context = JSON.parse(savedContext);
        gameState.currentStage = context.stage || 1;
        gameState.currentSet = context.set || 1;
        gameState.currentLevel = context.level;
        
        // Clear the saved context
        localStorage.removeItem('gameContext');
        
        return true;
    }
    return false;
}



function navigateHome() {
    console.log('Navigating home with full refresh');
    saveProgress();  // Ensure current state is saved
    window.location.reload(true);
}

function forceReload() {
    console.log('Force Reload Initiated');
    
    // Multiple reload strategies
    if (window.location) {
        window.location.href = window.location.href;  // Reload current page
    }
    
    if (window.location.reload) {
        window.location.reload(true);  // Hard reload with cache bypass
    }
    
    // Fallback reload method
    window.location.replace(window.location.pathname);
}

// Replace ALL home button onclick events with this
document.querySelectorAll('.home-button').forEach(button => {
    button.onclick = function() {
        console.log('Home button clicked');
        forceReload();
    };
});

async function showLeaderboard() {
    showScreen("leaderboard-screen");
    const entriesContainer = document.getElementById("leaderboard-entries");
    
    try {
        async function updateLeaderboard() {
            const { data, error } = await supabaseClient.from("player_leaderboard").select("*");
            
            if (error) {
                console.error("Leaderboard fetch error:", error);
                return;
            }
            
            // Store current positions for animation
            const currentEntries = entriesContainer.children;
            const positions = {};
            
            Array.from(currentEntries).forEach(entry => {
                const username = entry.querySelector("[data-username]").dataset.username;
                positions[username] = entry.getBoundingClientRect();
            });
            
            // Update the leaderboard HTML
            entriesContainer.innerHTML = data.map((player, index) => `
                <div class="leaderboard-entry ${player.username === currentUser?.user_metadata?.username ? "you" : ""} ${index < 3 ? `rank-${index+1}` : ""}"
                     data-rank="${index+1}">
                    <div>${player.player_rank}</div>
                    <div data-username="${player.username}">${player.username || "Anonymous"}</div>
                    <div>${player.total_levels_completed}</div>
                    <div>${player.total_words_learned}</div>
                </div>
            `).join("");
            
            // Apply animations for position changes
            const newEntries = entriesContainer.children;
            
            Array.from(newEntries).forEach(entry => {
                const username = entry.querySelector("[data-username]").dataset.username;
                
                if (positions[username]) {
                    const oldPos = positions[username];
                    const newPos = entry.getBoundingClientRect();
                    const yDiff = oldPos.top - newPos.top;
                    
                    if (yDiff > 0) {
                        entry.classList.add("moving-up");
                    } else if (yDiff < 0) {
                        entry.classList.add("moving-down");
                    }
                    
                    entry.addEventListener("animationend", () => {
                        entry.classList.remove("moving-up", "moving-down");
                    }, { once: true });
                }
            });
        }
        
        // Initial update
        await updateLeaderboard();
        
        // Set interval for polling updates
        const pollInterval = setInterval(updateLeaderboard, 10000);
        
        // Store interval ID so we can clear it when needed
        const leaderboardScreen = document.getElementById("leaderboard-screen");
        if (leaderboardScreen) {
            if (leaderboardScreen.dataset.pollInterval) {
                clearInterval(parseInt(leaderboardScreen.dataset.pollInterval));
            }
            leaderboardScreen.dataset.pollInterval = pollInterval;
        }
        
    } catch (detailedError) {
        console.error("Detailed leaderboard error:", detailedError);
        entriesContainer.innerHTML = `<p>Error loading leaderboard: ${detailedError.message}</p>`;
    }
}

function cleanupLeaderboard() {
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    if (leaderboardScreen) {
        // Cleanup channel
        if (leaderboardScreen.dataset.channel) {
            supabaseClient.removeChannel(leaderboardScreen.dataset.channel);
            delete leaderboardScreen.dataset.channel;
        }
        // Cleanup interval
        if (leaderboardScreen.dataset.pollInterval) {
            clearInterval(parseInt(leaderboardScreen.dataset.pollInterval));
            delete leaderboardScreen.dataset.pollInterval;
        }
    }
}

async function updatePlayerStats(levelTime, mistakes, currentStreak) {
    if (currentUser && "premium" === currentUser.status) {
        try {
            // Get current player stats
            const { data: currentStats, error: statsError } = 
                await supabaseClient.from("player_stats")
                    .select("*")
                    .eq("user_id", currentUser.id)
                    .single();

            if (statsError && statsError.code !== "PGRST116") throw statsError;

            // Calculate unique words (remove duplicates)
            const uniqueWords = [...new Set(currentGame.words)];
            const wordsToAdd = uniqueWords.length;

            // Prepare update object
            const statsUpdate = {
                user_id: currentUser.id,
                total_levels_completed: (currentStats?.total_levels_completed || 0) + 1,
                unique_words_practiced: (currentStats?.unique_words_practiced || 0) + wordsToAdd,
                last_updated: new Date().toISOString()
            };

            // Update database
            const { error: upsertError } = 
                await supabaseClient.from("player_stats")
                    .upsert(statsUpdate, { onConflict: "user_id", returning: "minimal" });

            if (upsertError) throw upsertError;

            // Immediately update UI
            await WordsManager.updateWords(wordsToAdd);

        } catch (error) {
            console.error("Error updating player stats:", error);
        }
    }
}

function addAdminTestButton() {
    console.log("Checking for admin user...");
    
    // Remove any existing button
    const existingButton = document.getElementById("admin-test-button");
    if (existingButton) {
      existingButton.remove();
    }
    
    console.log("Current user:", currentUser ? currentUser.email : "No user");
    
    // Check if the current user is admin
    if (!currentUser || (currentUser.email !== "admin123@gmail.com" && !currentUser.email?.includes("admin123"))) {
      console.log("Not admin user, not adding button");
      return;
    }
    
    console.log("Admin user detected, adding test buttons");
    
    // Add level 20 button
    const button = document.createElement("button");
    button.id = "admin-test-button";
    button.textContent = "Jump to Level 20";
    button.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: #ff5722;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      z-index: 2000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      font-weight: bold;
    `;
    
    button.onclick = function() {
      console.log("Admin button clicked, jumping to level 20");
      gameState.currentLevel = 21;
      startLevel(21);
    };
    
    document.body.appendChild(button);
    console.log("Admin test button added to body");
    
    // Now also add our skip button
    addAdminSkipButton();
  }

  // ADD this function to check if the current user is the admin
function isAdminUser() {
    return currentUser && currentUser.email === "admin123@gmail.com";
  }
  
  // ADD this function to create the admin skip button
  function addAdminSkipButton() {
    // Only add for admin user
    if (!isAdminUser()) return;
    
    // Remove any existing admin skip button first
    const existingButton = document.getElementById("admin-skip-10-button");
    if (existingButton) existingButton.remove();
    
    // Create the admin skip button
    const skipButton = document.createElement("button");
    skipButton.id = "admin-skip-10-button";
    skipButton.innerHTML = '<i class="fas fa-forward"></i> Skip 10';
    skipButton.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: #9c27b0;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      z-index: 2000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      font-weight: bold;
    `;
    
    // Add the click handler
    skipButton.onclick = function() {
      console.log("Admin skip-10 button clicked");
      handleAdminSkip10();
    };
    
    // Add the button to the question screen
    const questionScreen = document.getElementById("question-screen");
    if (questionScreen) {
      questionScreen.appendChild(skipButton);
    }
  }
  
  // ADD this function to handle the skip-10 action
  function handleAdminSkip10() {
    // Only work for admin user
    if (!isAdminUser()) return;
    
    // Check if we're in an active game
    if (!currentGame || !currentGame.words || !currentGame.words.length) {
      console.error("No active game found");
      return;
    }
    
    // Skip 10 questions or all remaining if less than 10 left
    const skipCount = Math.min(10, currentGame.words.length - currentGame.currentIndex);
    console.log(`Skipping ${skipCount} questions`);
    
    // If this is a boss level, handle it differently
    if (currentGame.isBossLevel) {
      // For boss levels, we directly set the index near the end
      // This will trigger the boss defeat sequence on the next answer
      currentGame.currentIndex = Math.max(0, currentGame.words.length - 1);
      updateBossHealthBar();
      loadNextBossQuestion();
      showNotification(`Boss almost defeated! One more hit!`, "success");
      return;
    }
    
    // For regular levels
    currentGame.currentIndex += skipCount;
    
    // If we've reached the end of the level
    if (currentGame.currentIndex >= currentGame.words.length) {
      handleLevelCompletion();
      return;
    }
    
    // Otherwise update progress and load the next question
    updateProgressCircle();
    loadNextQuestion();
    showNotification(`Skipped ${skipCount} questions!`, "success");
  }
  
  function createRainingParticles() {
    const questionScreen = document.getElementById('question-screen');
    if (!questionScreen) return;
    
    const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",..."אבגדהוזחטיכלמנסעפצקרשת"];
    const containerWidth = questionScreen.clientWidth;
    
    // Clear any existing interval
    if (window.rainingLettersInterval) {
      clearInterval(window.rainingLettersInterval);
    }
    
    // Create raining letters
    window.rainingLettersInterval = setInterval(() => {
      // Create between 1 and 3 letters each interval
      const count = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < count; i++) {
        const letter = document.createElement('div');
        letter.className = 'raining-letter';
        letter.textContent = letters[Math.floor(Math.random() * letters.length)];
        
        // Random position and speed
        const left = Math.random() * containerWidth;
        const duration = 5 + Math.random() * 5; // 5-10 seconds
        
        letter.style.left = `${left}px`;
        letter.style.animationDuration = `${duration}s`;
        
        questionScreen.appendChild(letter);
        
        // Remove letter after animation completes
        setTimeout(() => {
          if (letter.parentNode === questionScreen) {
            questionScreen.removeChild(letter);
          }
        }, duration * 1000);
      }
    }, 300);
  }
  
  /**
 * Hides the upgrade prompt and continues with the user flow
 * This function cleans up upgrade-related UI elements and continues gameplay
 */
function hideUpgradePromptAndContinue() {
    console.log("Hiding upgrade prompt and continuing gameplay");
    
    // Hide upgrade screen if visible
    const upgradeScreen = document.getElementById("upgrade-screen");
    if (upgradeScreen) {
      upgradeScreen.classList.remove("visible");
    }
    
    // Reset upgrade form
    const upgradeForm = document.getElementById("upgradeForm");
    if (upgradeForm) {
      upgradeForm.reset();
    }
    
    // Remove any upgrade confirmation overlays
    const confirmationOverlay = document.querySelector('.upgrade-confirmation-overlay');
    if (confirmationOverlay) {
      confirmationOverlay.remove();
    }
    
    // Remove any confirmation popups
    document.querySelectorAll(".confirmation-popup").forEach(popup => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    });
    
    // Get stored game context for continuation
    const gameContext = localStorage.getItem("gameContext");
    let destination = "welcome-screen"; // Default fallback
    
    if (gameContext) {
      try {
        const context = JSON.parse(gameContext);
        console.log("Resuming from stored game context:", context);
        
        // Check if we have a level to continue to
        if (context.level) {
          // Handle level continuation
          if (typeof startLevel === 'function') {
            setTimeout(() => {
              startLevel(context.level);
              return; // Skip showing welcome screen
            }, 100);
          } else if (context.screen && typeof showScreen === 'function') {
            // If we can't directly start the level, show the last screen
            destination = context.screen;
          }
        } else if (context.screen && typeof showScreen === 'function') {
          // If no specific level but we have a screen, go there
          destination = context.screen;
        }
      } catch (e) {
        console.error("Error parsing game context:", e);
      }
    }
    
    // If we couldn't find a level to continue to, show the specified screen
    if (typeof showScreen === 'function') {
      showScreen(destination);
    }
    
    // Don't clear the game context as it might be needed for resuming
    // Only clear if we've successfully handled the continuation
    if (destination !== "welcome-screen") {
      localStorage.removeItem("gameContext");
    }
  }

  