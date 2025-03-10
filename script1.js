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
    initializeCarousel();
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


// REPLACE: CoinsManager - Complete replacement
const CoinsManager = {
    initialized: false,
    updateLock: false,
    pendingUpdates: [],
    animationTimers: new Map(),
    lastUpdateTimestamp: 0,
    
    // Initialize the coins manager
    initialize: async function() {
        if (this.initialized) return;
        
        console.log("Initializing CoinsManager");
        this.initialized = true;
        
        // Load initial coin values
        await this.loadUserCoins();
        
        // Watch for DOM changes that might add new coin displays
        this.observeCoinsDisplay();
        
        // Initial update
        this.updateDisplays();
    },
    
    // Load user's coins from database or localStorage
    loadUserCoins: async function() {
        try {
            // For logged in users, load from database
            if (currentUser?.id) {
                const { data, error } = await supabaseClient
                    .from("game_progress")
                    .select("coins")
                    .eq("user_id", currentUser.id)
                    .single();
                    
                if (!error && data && typeof data.coins === 'number') {
                    gameState.coins = data.coins;
                    console.log("Loaded coins from database:", gameState.coins);
                    return gameState.coins;
                }
            }
            
            // Fall back to localStorage
            const savedProgress = localStorage.getItem("simploxProgress");
            if (savedProgress) {
                try {
                    const progress = JSON.parse(savedProgress);
                    if (typeof progress.coins === 'number') {
                        gameState.coins = progress.coins;
                        console.log("Loaded coins from localStorage:", gameState.coins);
                        return gameState.coins;
                    }
                } catch (e) {
                    console.error("Error parsing saved progress:", e);
                }
            }
            
            // Default to 0 if no saved coins found
            gameState.coins = 0;
            return 0;
        } catch (error) {
            console.error("Error loading user coins:", error);
            gameState.coins = 0;
            return 0;
        }
    },
    
    // Update coin amount and all displays
    updateCoins: async function(amount) {
        if (this.updateLock) {
            this.pendingUpdates.push(amount);
            console.log("Coin update queued:", amount);
            return gameState.coins;
        }
        
        try {
            this.updateLock = true;
            this.lastUpdateTimestamp = Date.now();
            
            const previousCoins = gameState.coins;
            gameState.coins += amount;
            
            console.log(`Updating coins: ${previousCoins} + (${amount}) = ${gameState.coins}`);
            
            // Update all displays
            this.updateDisplays(previousCoins);
            
            // Also update currentGame.coins for arcade mode
            if (currentGame) {
                currentGame.coins = gameState.coins;
            }
            
            // Store the updated value
            await this.saveUserCoins();
            
            // Update arcade participant data if applicable
            this.updateArcadeParticipant();
            
            // Broadcast in arcade mode
            this.broadcastArcadeUpdate();
            
            return gameState.coins;
        } catch (error) {
            console.error("Error updating coins:", error);
            return gameState.coins;
        } finally {
            // Process any pending updates after a short delay
            setTimeout(() => {
                this.updateLock = false;
                
                if (this.pendingUpdates.length > 0) {
                    const nextAmount = this.pendingUpdates.shift();
                    this.updateCoins(nextAmount);
                }
            }, 300);
        }
    },
    
    // Set coin amount directly (overwrite instead of add)
    setCoins: async function(newValue) {
        if (this.updateLock) {
            this.pendingUpdates.push(newValue - gameState.coins);
            return gameState.coins;
        }
        
        try {
            this.updateLock = true;
            this.lastUpdateTimestamp = Date.now();
            
            const previousCoins = gameState.coins;
            gameState.coins = newValue;
            
            console.log(`Setting coins: ${previousCoins} => ${newValue}`);
            
            // Update all displays
            this.updateDisplays(previousCoins);
            
            // Also update currentGame.coins for arcade mode
            if (currentGame) {
                currentGame.coins = gameState.coins;
            }
            
            // Store the updated value
            await this.saveUserCoins();
            
            // Update arcade participant data if applicable
            this.updateArcadeParticipant();
            
            // Broadcast in arcade mode
            this.broadcastArcadeUpdate();
            
            return gameState.coins;
        } catch (error) {
            console.error("Error setting coins:", error);
            return gameState.coins;
        } finally {
            setTimeout(() => {
                this.updateLock = false;
                
                if (this.pendingUpdates.length > 0) {
                    const nextAmount = this.pendingUpdates.shift();
                    this.updateCoins(nextAmount);
                }
            }, 300);
        }
    },
    
    // Save coins to database and localStorage
    saveUserCoins: async function() {
        // Save to database for logged in users
        if (currentUser?.id) {
            try {
                const { error } = await supabaseClient
                    .from("game_progress")
                    .update({ coins: gameState.coins })
                    .eq("user_id", currentUser.id);
                    
                if (error) {
                    console.error("Error saving coins to database:", error);
                }
            } catch (error) {
                console.error("Error saving coins to database:", error);
            }
        }
        
        // Always save to localStorage as backup
        try {
            const savedProgress = localStorage.getItem("simploxProgress");
            let progress = {};
            
            if (savedProgress) {
                progress = JSON.parse(savedProgress);
            }
            
            progress.coins = gameState.coins;
            localStorage.setItem("simploxProgress", JSON.stringify(progress));
        } catch (error) {
            console.error("Error saving coins to localStorage:", error);
        }
    },
    
    // Update coin displays with animation
    updateDisplays: function(previousValue = null) {
        if (previousValue === null) {
            previousValue = gameState.coins;
        }
        
        document.querySelectorAll('.coin-count').forEach(display => {
            this.animateCoinDisplay(display, previousValue, gameState.coins);
        });
        
        // Update perk buttons based on new coin amount
        if (typeof updatePerkButtons === 'function') {
            updatePerkButtons();
        }
    },
    
    // Animate a single coin display
    // Animate a single coin display
animateCoinDisplay: function(element, startValue, endValue) {
    if (!element) return;
    
    // Cancel any ongoing animation for this element
    const existingTimerId = this.animationTimers.get(element);
    if (existingTimerId) {
        cancelAnimationFrame(existingTimerId);
        this.animationTimers.delete(element);
    }
    
    startValue = parseFloat(startValue) || 0;
    endValue = parseFloat(endValue) || 0;
    
    // Skip animation if values are the same
    if (startValue === endValue) {
        element.textContent = endValue;
        return;
    }
    
    // Duration in ms, shorter for more responsiveness
    const duration = 600; 
    const frameRate = 1000 / 60; // 60fps
    const totalFrames = duration / frameRate;
    const changePerFrame = (endValue - startValue) / totalFrames;
    
    let currentFrame = 0;
    let currentValue = startValue;
    
    element.classList.add('animating');
    
    const animate = () => {
        currentFrame++;
        currentValue += changePerFrame;
        
        // Handle end conditions properly
        if (currentFrame <= totalFrames && 
            ((changePerFrame > 0 && currentValue < endValue) || 
             (changePerFrame < 0 && currentValue > endValue))) {
            
            element.textContent = Math.round(currentValue);
            
            if (changePerFrame > 0) {
                element.style.color = 'var(--success)';
            } else if (changePerFrame < 0) {
                element.style.color = 'var(--error)';
            }
            
            // Schedule next frame and store the timer ID
            const newTimerId = requestAnimationFrame(animate);
            this.animationTimers.set(element, newTimerId);
        } else {
            // Ensure final value is exactly right
            element.textContent = endValue;
            this.animationTimers.delete(element);
            
            setTimeout(() => {
                element.style.color = '';
                element.classList.remove('animating');
            }, 300);
        }
    };
    
    // Start animation and store the timer ID
    const initialTimerId = requestAnimationFrame(animate);
    this.animationTimers.set(element, initialTimerId);
},
    
    // Observe DOM for new coin displays
    observeCoinsDisplay: function() {
        const observer = new MutationObserver(mutations => {
            let shouldUpdate = false;
            
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    // Check if any added nodes contain coin displays
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Element node
                            if (node.classList?.contains('coin-count') || 
                                node.querySelector?.('.coin-count')) {
                                shouldUpdate = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldUpdate) {
                this.updateDisplays();
            }
        });
        
        // Observe the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },
    
    // Update arcade participant data
    updateArcadeParticipant: function() {
        if (!currentArcadeSession?.playerName) return;
        
        const index = currentArcadeSession.participants.findIndex(
            p => p.username === currentArcadeSession.playerName
        );
        
        if (index !== -1) {
            currentArcadeSession.participants[index].coins = gameState.coins;
        }
    },
    
    // Broadcast coin update in arcade mode
    broadcastArcadeUpdate: function() {
        if (!window.arcadeChannel || 
            !currentArcadeSession?.playerName || 
            window.arcadeChannel.subscription?.state !== "SUBSCRIBED") {
            return;
        }
        
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'progress_update',
            payload: {
                username: currentArcadeSession.playerName,
                wordsCompleted: currentGame?.wordsCompleted || 0,
                coins: gameState.coins,
                timestamp: Date.now(),
                source: 'coinsManager',
                isTrusted: true
            }
        });
    },
    
    // Add visual pulse effect to coins
    pulseCoins: function(times = 1) {
        const coinIcons = document.querySelectorAll('.coin-icon');
        
        coinIcons.forEach(coinIcon => {
            if (!coinIcon) return;
            
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
    // Debug statement to help track screen navigation
    console.log(`Attempting to show screen: ${screenId}`);
    
    // Special handling for stage-cascade-screen
    if (screenId === "stage-cascade-screen") {
      return renderStageCascadeScreen();
    }
    
    // MODIFIED: Remove the unregistered user restriction for upgrade screen
    // Now everyone can access the upgrade screen, registered or not
    
    console.log("showScreen called with:", {
      screenId: screenId,
      forceRefresh: forceRefresh,
      currentUser: currentUser ? currentUser.id : "No user"
    });
    
    // Check if screen exists before proceeding
    const targetScreen = document.getElementById(screenId);
    if (!targetScreen) {
        console.error(`ERROR: Screen with id "${screenId}" not found in the DOM!`);
        // List all available screens for debugging
        const availableScreens = Array.from(document.querySelectorAll('.screen')).map(s => s.id);
        console.log("Available screens:", availableScreens);
        return;
    }
     
    // Special handling for leaderboard screen cleanup
    if (document.querySelector('.screen.visible')?.id === 'leaderboard-screen') {
      cleanupLeaderboard();
    }
     
  const event = new CustomEvent('screenChange', { 
    detail: { screen: screenId } 
  });
  document.dispatchEvent(event);

    // Get currently visible screen
    const currentScreen = document.querySelector('.screen.visible');
     
    // Cleanup if leaving question screen
    if (currentScreen && currentScreen.id === 'question-screen') {
      if (typeof clearTimer === 'function') {
        clearTimer();
      }
      window.isFrozen = false;
    }
     
    // Handle force refresh
    if (forceRefresh && screenId === "welcome-screen") {
      console.log("Initiating full page reload");
      if (typeof saveProgress === 'function') {
        saveProgress();
      }
      window.location.reload(true);
      return;
    }
  
    if (["question-screen", "custom-practice-screen", "moderator-screen", "leaderboard-screen"].includes(screenId)) {
      if (typeof updateNavigationContainer === 'function') {
        updateNavigationContainer();
      }
    }
     
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('visible');
      
      // Don't remove particles automatically, just let them be replaced
      // This avoids errors when the element doesn't exist
    });
     
    // Show requested screen
    if (targetScreen) {
      // Make screen visible
      targetScreen.classList.add('visible');
         
      // Initialize particles for the screen if function exists
      if (typeof initializeParticles === 'function') {
        // Only create new particle container if none exists
        let particleContainer = targetScreen.querySelector('.particle-container');
        if (!particleContainer) {
          particleContainer = document.createElement('div');
          particleContainer.className = 'particle-container';
          targetScreen.appendChild(particleContainer);
        }
        
        try {
          initializeParticles(targetScreen);
        } catch (error) {
          console.warn("Error initializing particles:", error);
        }
      }
         
      // Update UI elements if function exists
      if (typeof updateAllCoinDisplays === 'function') {
        updateAllCoinDisplays();
      }
         
      // Special handling for different screens
      switch (screenId) {
        case "question-screen":
          if (typeof updatePerkButtons === 'function') {
            updatePerkButtons();
          }
                 
          // Check for admin user and add test button
          console.log("Question screen shown, checking for admin button");
          setTimeout(() => {
            if (typeof addAdminTestButton === 'function') {
              addAdminTestButton();
            }
          }, 100);
          break;
               
        case "welcome-screen":
          if (typeof restoreGameContext === 'function' && restoreGameContext()) {
            if (typeof startGame === 'function') {
              startGame();
            }
          }
          break;
               
        case "stage-cascade-screen":
          // Handle the cascading stage screen specially
          if (typeof renderStageCascadeScreen === 'function') {
            return renderStageCascadeScreen();
          }
          break;
          
        case "about-screen":
          console.log("About screen is now visible");
          break;
      }
         
      console.log(`Successfully switched to screen: ${screenId}`);
    }
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




function createOptionsMenu() {
    // Remove existing menu if it exists
    const existingMenu = document.getElementById('options-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const optionsMenu = document.createElement('div');
    optionsMenu.id = 'options-menu';
    optionsMenu.className = 'floating-menu';
    
    // Define all possible menu items
    const menuItems = [
        {
            id: 'profile-item',
            icon: 'fa-user',
            text: 'Profile',
            onClick: 'openProfileModal()',
            visibleTo: ['all'] // visible to all users
        },
        {
            id: 'custom-practice-item',
            icon: 'fa-pen',
            text: 'Custom Practice',
            onClick: 'showScreen(\'custom-practice-screen\')',
            visibleTo: ['all'] // visible to all users
        },
        {
            id: 'leaderboard-item',
            icon: 'fa-trophy',
            text: 'Leaderboard',
            onClick: 'showLeaderboard()',
            visibleTo: ['all'] // visible to all users
        },
        {
            id: 'premium-item',
            icon: 'fa-crown premium-crown',
            text: 'Premium',
            onClick: 'showUpgradeScreen()', // This now shows upgrade screen for all non-premium users
            visibleTo: ['free', 'pending', 'unregistered'] // visible only to non-premium users
        },
        {
            id: 'about-item',
            icon: 'fa-info-circle',
            text: 'About',
            onClick: 'showAboutScreen()',
            visibleTo: ['all'] // visible to all users
        },
        {
            id: 'shop-item',
            icon: 'fa-store',
            text: 'Shop',
            onClick: 'showScreen(\'shop-screen\')',
            visibleTo: ['all'] // visible to all users
        },
        {
            id: 'accessibility-item',
            icon: 'fa-universal-access',
            text: 'Accessibility',
            onClick: 'openAccessibilitySettings()',
            visibleTo: ['all'] // visible to all users
        }
    ];
    
    // Add menu grid container
    const menuGrid = document.createElement('div');
    menuGrid.className = 'menu-grid';
    optionsMenu.appendChild(menuGrid);
    
    // Filter menu items based on user status
    const userStatus = currentUser ? (currentUser.status || 'free') : 'unregistered';
    
    // Add filtered items to the menu
    menuItems.forEach(item => {
        // Check if this item should be visible to the current user
        if (item.visibleTo.includes('all') || item.visibleTo.includes(userStatus)) {
            const menuItem = document.createElement('div');
            menuItem.className = 'menu-item';
            menuItem.id = item.id;
            menuItem.setAttribute('onclick', item.onClick);
            
            menuItem.innerHTML = `
                <i class="fas ${item.icon}"></i>
                <span>${item.text}</span>
            `;
            
            menuGrid.appendChild(menuItem);
        }
    });
    
    document.body.appendChild(optionsMenu);
    return optionsMenu;
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
    // First, hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    
    // Then show the stage-cascade screen
    const stageCascadeScreen = document.getElementById('stage-cascade-screen');
    if (stageCascadeScreen) {
        stageCascadeScreen.classList.add('visible');
    }
    
    // Now populate the content
    let stageCascadeContainer = document.querySelector('.stage-cascade-container');
    if (!stageCascadeContainer) {
        // Create container if it doesn't exist
        const container = document.createElement('div');
        container.className = 'stage-cascade-container';
        stageCascadeScreen.appendChild(container);
        stageCascadeContainer = container; // Now works with let instead of const
    } else {
        // Clear existing content
        stageCascadeContainer.innerHTML = '';
    }
    
    // Create stage cards for each stage
    const totalStages = gameStructure.stages.length;
    for (let stageIndex = 0; stageIndex < totalStages; stageIndex++) {
        const stage = gameStructure.stages[stageIndex];
        const stageNumber = stageIndex + 1;
        
        // Create stage card
        const stageCard = document.createElement('div');
        stageCard.className = 'stage-card';
        
        // Determine if stage is unlocked
        const isUnlocked = gameState.unlockedSets[stageNumber] && gameState.unlockedSets[stageNumber].size > 0;
        if (!isUnlocked) {
            stageCard.classList.add('locked');
        }
        
        // Add content to stage card
        stageCard.innerHTML = `
            <div class="stage-header">
                <h2>Stage ${stageNumber}</h2>
                <span class="stage-description">${getStageDescription(stageNumber)}</span>
            </div>
            <div class="stage-sets">
                ${createSetsHTML(stageNumber, stage)}
            </div>
            ${!isUnlocked ? '<div class="locked-overlay"><i class="fas fa-lock"></i></div>' : ''}
        `;
        
        // Add click handler if unlocked
        if (isUnlocked) {
            stageCard.addEventListener('click', () => {
                gameState.currentStage = stageNumber;
                showStageScreen();
            });
        }
        
        stageCascadeContainer.appendChild(stageCard);
    }
    
    // Add back button if it doesn't exist
    let backButton = stageCascadeScreen.querySelector('.back-button');
    if (!backButton) {
        backButton = document.createElement('button');
        backButton.className = 'back-button';
        backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back';
        backButton.addEventListener('click', () => {
            showScreen('welcome-screen');
        });
        stageCascadeScreen.appendChild(backButton);
    }

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
      });
      
      document.getElementById('stage-cascade-screen').classList.add('visible');
      
      // Update stage completion stats
      updateStageCompletionStats();
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
    const loginInput = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!loginInput || !password) {
        alert('Please enter both username/email and password');
        return;
    }

    try {
        // First determine if the input looks like an email
        const isEmail = loginInput.includes('@');
        let userEmail = loginInput;
        
        // If it's not an email, try to construct one
        if (!isEmail) {
            // Try with common email domain
            userEmail = `${loginInput}@gmail.com`;
        }
        
        // Attempt login with direct email
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: userEmail,
            password: password
        });

        // Handle errors
        if (error) {
            // If direct login failed and we auto-generated the email, try other options
            if (!isEmail && error.message.includes('Invalid login')) {
                // We could try to look up the username in user_profiles here,
                // but since we know our database is not properly set up for that,
                // we'll just alert the user
                alert('Login failed. Please try using your full email address.');
            } else {
                alert(error.message);
            }
            return;
        }

        // Handle successful login
        if (data && data.user) {
            currentUser = data.user;
            
            // Hide auth modal first
            hideAuthModal();
            
            // Then update UI and load data
            try {
                const { data: profile } = await supabaseClient
                    .from('user_profiles')
                    .select('status')
                    .eq('id', currentUser.id)
                    .single();
                    
                if (profile) {
                    currentUser.status = profile.status;
                    updateUserStatusDisplay(profile.status);
                }
            } catch (profileError) {
                console.warn('Could not load user profile:', profileError);
            }

            // Load user data
            try {
                await Promise.all([
                    loadCustomLists(),
                    loadUserGameProgress(currentUser.id)
                ]);
            } catch (loadError) {
                console.warn('Error loading user data:', loadError);
            }

            // Update UI elements
            updateAuthUI();
            updateGuestPlayButton();
            showScreen('welcome-screen');
        }
    } catch (error) {
        console.error('Unexpected Login Error:', error);
        alert('An unexpected error occurred during login');
    }
}

// Add this function to script1.js
function setupFormKeyboardNavigation() {
    // Find all forms in the document
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        // Get all focusable elements within the form
        const inputs = form.querySelectorAll('input, select, textarea, button');
        
        // Add event listeners for each input
        inputs.forEach(input => {
            // Handle Enter key presses
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    
                    // If it's a button, simulate a click
                    if (input.tagName === 'BUTTON') {
                        input.click();
                        return;
                    }
                    
                    // Find the next focusable element
                    const currentIndex = Array.from(inputs).indexOf(input);
                    const nextElement = inputs[currentIndex + 1];
                    
                    // If there's a next element, focus it
                    if (nextElement) {
                        nextElement.focus();
                    } else {
                        // If we're at the last element, submit the form if possible
                        const submitButton = form.querySelector('button[type="submit"]') || 
                                          form.querySelector('input[type="submit"]') ||
                                          form.querySelector('button:not([type="button"])');
                        
                        if (submitButton) {
                            submitButton.click();
                        }
                    }
                }
            });
        });
    });
    
    // Also handle specific auth forms that may not be present initially
    const authForms = ['loginForm', 'signupForm', 'upgradeForm'];
    
    authForms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            setupFormSubmitOnEnter(form);
        }
    });
    
    // Add mutation observer to detect when new forms are added
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                    const newForms = node.tagName === 'FORM' ? [node] : node.querySelectorAll('form');
                    newForms.forEach(form => {
                        setupFormSubmitOnEnter(form);
                    });
                    
                    // Also check for our specific auth forms
                    authForms.forEach(formId => {
                        if (node.id === formId) {
                            setupFormSubmitOnEnter(node);
                        }
                    });
                }
            });
        });
    });
    
    // Start observing the document
    observer.observe(document.body, { childList: true, subtree: true });
}

// Helper function to set up form submission on Enter key
function setupFormSubmitOnEnter(form) {
    if (!form) return;
    
    const inputs = form.querySelectorAll('input, select, textarea');
    const submitButton = form.querySelector('button[type="submit"]') || 
                        form.querySelector('input[type="submit"]') ||
                        form.querySelector('button:not([type="button"])');
    
    inputs.forEach(input => {
        // Check if it already has an enter key handler
        const hasHandler = input.getAttribute('data-enter-handler');
        if (hasHandler === 'true') return;
        
        // Add enter key handler
        input.setAttribute('data-enter-handler', 'true');
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                
                // Find the next input
                const currentIndex = Array.from(inputs).indexOf(input);
                const nextInput = inputs[currentIndex + 1];
                
                // If there's a next input, focus it
                if (nextInput) {
                    nextInput.focus();
                } else if (submitButton) {
                    // Otherwise, click the submit button
                    submitButton.click();
                }
            }
        });
    });
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
    // Check if user is already premium
    if (currentUser && currentUser.status === 'premium') {
        console.log("User is already premium, no need to show upgrade screen");
        // Maybe show a notification or just do nothing
        showNotification("You already have premium access!", "info");
        return;
    }
    
    // Check if user already submitted upgrade request
    if (currentUser && localStorage.getItem(`upgradeRequested_${currentUser.id}`)) {
        hideUpgradePromptAndContinue();
        return;
    }
    
    console.log("Showing upgrade screen to", currentUser ? currentUser.status : "unregistered user");
    
    // Show upgrade screen regardless of user status (registered or not)
    showScreen('upgrade-screen');
}

function showUpgradePrompt(callback) {
    // Check if user is already premium - no need to show prompt
    if (currentUser && currentUser.status === 'premium') {
        console.log("User is premium, skipping upgrade prompt");
        // Immediately execute callback if provided
        if (callback) callback();
        return true; // Indicate we're skipping the prompt
    }
    
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

// Add this debug function to trace what's calling the upgrade functions
function addUpgradeTracing() {
    // Store original functions
    const originalShowUpgradeScreen = window.showUpgradeScreen;
    const originalShowUpgradePrompt = window.showUpgradePrompt;
    
    // Replace showUpgradeScreen with traced version
    window.showUpgradeScreen = function() {
        console.group("Upgrade Screen Trace");
        console.log("showUpgradeScreen called with user status:", currentUser?.status || "unregistered");
        console.trace("Call stack for showUpgradeScreen");
        console.groupEnd();
        
        // Call original with arguments
        return originalShowUpgradeScreen.apply(this, arguments);
    };
    
    // Replace showUpgradePrompt with traced version
    window.showUpgradePrompt = function() {
        console.group("Upgrade Prompt Trace");
        console.log("showUpgradePrompt called with user status:", currentUser?.status || "unregistered");
        console.trace("Call stack for showUpgradePrompt");
        console.groupEnd();
        
        // Call original with arguments
        return originalShowUpgradePrompt.apply(this, arguments);
    };
    
    console.log("Upgrade function tracing enabled");
}

// Call this on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(addUpgradeTracing, 1000);
});

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
    setupFormKeyboardNavigation();
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



// Original handleLogout function (likely)
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
    const avatarButton = document.getElementById('login-avatar-btn');

    if (currentUser) {
        // User is logged in
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
        
        // Update avatar button to show logged-in state
        if (avatarButton) {
            // Remove all status classes first
            avatarButton.classList.remove('status-unregistered', 'status-free', 'status-pending', 'status-premium');
            
            // Add default free status
            avatarButton.classList.add('status-free');
            
            // Change icon to indicate logged in
            const avatarIcon = avatarButton.querySelector('i');
            if (avatarIcon) {
                avatarIcon.className = 'fas fa-user-check';
            }
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
                        
                        // Update avatar button status
                        if (avatarButton) {
                            avatarButton.classList.remove('status-unregistered', 'status-free', 'status-premium', 'status-pending');
                            avatarButton.classList.add(`status-${data.status || 'free'}`);
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
        
        // Update avatar button to show unregistered state
        if (avatarButton) {
            avatarButton.classList.remove('status-free', 'status-premium', 'status-pending');
            avatarButton.classList.add('status-unregistered');
            
            // Reset icon to default user icon
            const avatarIcon = avatarButton.querySelector('i');
            if (avatarIcon) {
                avatarIcon.className = 'fas fa-user';
            }
        }
        
        // Clear user email display
        if (userEmailElement) {
            userEmailElement.textContent = '';
        }
        
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Existing initialization code...
    
    // Make avatar button more reliably clickable
    const avatarButton = document.getElementById('login-avatar-btn');
    if (avatarButton) {
        // Set initial unregistered status
        avatarButton.classList.add('status-unregistered');
        
        // Ensure the whole button area is clickable
        avatarButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleAvatarButtonClick();
        });
        
        // Also ensure child elements pass clicks to the button
        const avatarContainer = avatarButton.querySelector('.avatar-container');
        if (avatarContainer) {
            avatarContainer.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handleAvatarButtonClick();
            });
        }
        
        const avatarIcon = avatarButton.querySelector('i');
        if (avatarIcon) {
            avatarIcon.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handleAvatarButtonClick();
            });
        }
        
        // Update once we know the user's status
        if (typeof updateAuthUI === 'function') {
            updateAuthUI();
        }
    }
});

// REPLACE: Avatar button click handler
function handleAvatarButtonClick() {
  console.log("Avatar button clicked");
  
  // If user is logged in, show profile modal
  // Otherwise, show auth modal
  if (currentUser) {
    openProfileModal();
  } else {
    showAuthModal();
  }
}

// Update the avatar button click handler when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  const avatarButton = document.getElementById('login-avatar-btn');
  if (avatarButton) {
    avatarButton.onclick = handleAvatarButtonClick;
    console.log("Avatar button click handler updated");
  }
});

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

function showBossDefeatEffect() {
    console.log('Starting boss defeat effect sequence');
    
    if (currentGame.bossDefeatedEffectShown) {
        console.log('Boss defeat effect already shown, skipping');
        return;
    }
    
    // Set animation flag to block other coin updates
    window.bossVictoryAnimationInProgress = true;
    
    // IMPORTANT ADDITION: Mark boss level as completed in the game state
    // Get the stage configuration to find the boss level number
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (stage && stage.bossLevel) {
        const bossLevelId = stage.bossLevel;
        const levelKey = `${gameState.currentStage}_${gameState.currentSet}_${bossLevelId}`;
        
        console.log(`Marking boss level as completed: ${levelKey}`);
        
        // Add to completed levels set
        gameState.completedLevels.add(levelKey);
        
        // Update stage completion stats
        updateStageCompletionStats();
        updateStageCompletionCounters();
        
        // Save progress immediately
        saveProgress();
    } else {
        console.error("Could not find boss level configuration");
    }
    
    // Set flag to prevent multiple executions
    currentGame.bossDefeatedEffectShown = true;
    
    // Store current coin value for animation
    const originalCoins = gameState.coins;
    const targetCoins = originalCoins + 100;
    
    // Flag that we've acknowledged the boss reward
    currentGame.bossRewardApplied = true;
    
    // Background transition
    const questionScreen = document.querySelector('.question-screen');
    if (questionScreen) {
        console.log('Creating background transition overlay');
        
        const transitionOverlay = document.createElement('div');
        transitionOverlay.className = 'background-transition-overlay';
        transitionOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #800000, #3a0000); 
            z-index: -1;
            animation: fade-to-blue 5s ease-in-out forwards;
            pointer-events: none;
        `;
        
        questionScreen.insertBefore(transitionOverlay, questionScreen.firstChild);
    }
    
    // Boss orb disappearing animation
    setTimeout(() => {
        const bossOrb = document.querySelector('.boss-orb-inner');
        
        if (bossOrb) {
            console.log('Disintegrating boss orb');
            
            const incinerationEffect = document.createElement('div');
            incinerationEffect.className = 'incineration-effect';
            bossOrb.appendChild(incinerationEffect);
            
            bossOrb.style.animation = 'boss-shrink 2.5s forwards';
            
            // After boss orb starts disappearing, show coin animation
            setTimeout(() => {
                console.log('Applying coin reward animation');
                
                const coinsContainer = document.querySelector('.coins-container');
                
                if (coinsContainer && window.originalCoinsHTML) {
                    // Restore original coins HTML
                    coinsContainer.innerHTML = window.originalCoinsHTML;
                    
                    // Protect ALL coin displays from other updates during animation
                    document.querySelectorAll('.coin-count').forEach(el => {
                        el.dataset.protectedValue = 'true';
                        el.textContent = originalCoins;
                    });
                    
                    const coinIcon = coinsContainer.querySelector('.coin-icon');
                    const coinCount = coinsContainer.querySelector('.coin-count');
                    
                    if (coinCount) {
                        // Make it prominent
                        coinsContainer.style.transform = 'scale(1.2)';
                        coinsContainer.style.transition = 'transform 0.3s ease';
                        
                        // Visual animation for the 100 coins
                        const steps = 60;
                        const stepDelay = 2000 / steps;
                        let currentStep = 0;
                        
                        const animateCoins = () => {
                            if (currentStep <= steps) {
                                const progress = currentStep / steps;
                                const currentValue = Math.round(originalCoins + (targetCoins - originalCoins) * progress);
                                
                                // Update ALL coin displays
                                document.querySelectorAll('.coin-count').forEach(el => {
                                    el.textContent = currentValue;
                                    el.style.color = 'var(--gold)';
                                    el.style.textShadow = '0 0 10px var(--gold)';
                                });
                                
                                currentStep++;
                                setTimeout(animateCoins, stepDelay);
                            } else {
                                // Animation complete - update actual game state
                                gameState.coins = targetCoins;
                                saveProgress();
                                
                                // Ensure final value shown matches target on all displays
                                document.querySelectorAll('.coin-count').forEach(el => {
                                    el.textContent = targetCoins;
                                    delete el.dataset.protectedValue;
                                });
                                
                                // Maintain emphasis for a while
                                setTimeout(() => {
                                    document.querySelectorAll('.coin-count').forEach(el => {
                                        el.style.color = '';
                                        el.style.textShadow = '';
                                    });
                                    coinsContainer.style.transform = 'scale(1)';
                                }, 1000);
                            }
                        };
                        
                        // Start animation
                        animateCoins();
                        
                        // Pulse coin icon
                        if (coinIcon) {
                            coinIcon.classList.add('coin-pulse');
                            coinIcon.style.animation = 'coinPulse 0.5s ease-in-out 6';
                        }
                    }
                }
            }, 500);
            
            // Show victory notification after animations
            setTimeout(() => {
                console.log('Showing victory notification');
                
                // Victory notification does NOT need to add coins again
                showBossVictoryNotification(false);
            }, 5000);
        } else {
            setTimeout(() => {
                showBossVictoryNotification(false);
            }, 3000);
        }
    }, 1000);

    // Add animation styles if needed
    if (!document.getElementById('boss-transition-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'boss-transition-style';
        styleEl.textContent = `
            @keyframes fade-to-blue {
                0% { background: linear-gradient(135deg, #800000, #3a0000); }
                20% { background: linear-gradient(135deg, #800000, #3a0000); }
                60% { background: linear-gradient(135deg, #4a1582, #0d47a1); }
                100% { background: radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%); }
            }
            
            @keyframes boss-shrink {
                0% { transform: scale(1); opacity: 1; }
                30% { transform: scale(0.8); opacity: 0.8; }
                100% { transform: scale(0); opacity: 0; }
            }
        `;
        document.head.appendChild(styleEl);
    }
}

// ADD this global function to force refresh the sets display
window.refreshSetsDisplay = function() {
    console.log("Forcing refresh of sets display");
    
    // Re-add styles
    addGoldShineStyles();
    
    // Force repopulation of all set grids
    gameStructure.stages.forEach(stage => {
        populateSetsGrid(stage.id);
    });
    
    // Update stage completion stats
    updateStageCompletionStats();
    updateStageCompletionCounters();
    
    return "Sets display refreshed!";
};

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
    } else if (currentUser.status === 'premium') {
      // Premium user - show friendly notification
      showNotification("You're already enjoying premium access! Thank you for your support!", "success");
    } else {
      // Logged in non-premium user - show upgrade form
      localStorage.removeItem(`upgradeRequested_${currentUser.id}`);
      showUpgradePrompt();
    }
  }

  // Function to hide crown icons for premium users
function hideCrownIconsForPremiumUsers() {
    // Only proceed if user is premium
    if (!currentUser || currentUser.status !== 'premium') return;
    
    console.log("Hiding crown icons for premium user");
    
    // Find all crown icons in the UI (any element with fa-crown class)
    const crownIcons = document.querySelectorAll('.fa-crown');
    
    crownIcons.forEach(crown => {
      // Find the nearest container element (could be a button, div, etc.)
      let container = crown;
      let depth = 0;
      const maxDepth = 5; // Prevent infinite loop
      
      // Go up max 5 levels to find a suitable container
      while (depth < maxDepth && container && container.tagName !== 'BODY') {
        // Look for containers that indicate premium features
        if (container.classList.contains('premium-item') || 
            container.classList.contains('premium-feature') ||
            container.id === 'premium-menu-item' ||
            container.classList.contains('premium-crown') ||
            container.getAttribute('onclick')?.includes('upgrade') ||
            container.getAttribute('data-feature') === 'premium') {
          
          // Hide the container
          container.style.display = 'none';
          console.log("Hidden premium container:", container);
          break;
        }
        
        // Move up to parent
        container = container.parentElement;
        depth++;
      }
      
      // If we couldn't find a proper container, at least disable the crown icon
      if (depth >= maxDepth || !container || container.tagName === 'BODY') {
        // Disable click events
        crown.style.pointerEvents = 'none';
        // Make it less prominent
        crown.style.opacity = '0.5';
        console.log("Disabled individual crown icon");
      }
    });
  }
  
  // Call this function when page loads and when user status changes
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(hideCrownIconsForPremiumUsers, 1000);
    
    // Also call it periodically to catch new elements
    setInterval(hideCrownIconsForPremiumUsers, 5000);
  });
  
  // Add event listener for user status change
  document.addEventListener('userStatusChanged', function(event) {
    setTimeout(hideCrownIconsForPremiumUsers, 100);
  });

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
    
    // Check if the button exists before trying to modify it
    if (guestPlayButton) {
        if (!currentUser || (currentUser && currentUser.status === 'unregistered')) {
            guestPlayButton.textContent = 'Play as Guest';
        } else {
            guestPlayButton.textContent = 'Start Game';
        }
    }
}

function openAccessibilitySettings() {
    const accessibilityModal = document.querySelector('.accessibility-modal');
    if (accessibilityModal) {
        accessibilityModal.classList.add('show');
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
    
    // Clear any stored game context to prevent level resumption
    localStorage.removeItem("gameContext");
    
    // Hide the upgrade screen
    document.getElementById('upgrade-screen').classList.remove('visible');
    
    // Reset upgrade form
    const upgradeForm = document.getElementById("upgradeForm");
    if (upgradeForm) {
      upgradeForm.reset();
    }
    
    // Navigate back to welcome screen
    showScreen('welcome-screen');
}

document.addEventListener('DOMContentLoaded', function() {
    // Find all skip buttons on the upgrade screen and ensure they call skipUpgrade()
    const skipButtons = document.querySelectorAll('#upgrade-screen .skip-button, #upgrade-screen button[onclick*="skip"], #upgrade-screen button:contains("Skip")');
    
    skipButtons.forEach(button => {
        // Remove any existing onclick handlers
        button.removeAttribute('onclick');
        
        // Add our direct event listener
        button.addEventListener('click', function(e) {
            e.preventDefault();
            console.log("Skip button clicked via direct handler");
            skipUpgrade();
        });
    });
    
    // Also check for the specific button shown in your screenshot
    const directSkipButton = document.querySelector('#upgrade-screen button.skip-signup-button, #upgrade-screen button:contains("Skip")');
    if (directSkipButton) {
        directSkipButton.onclick = function(e) {
            e.preventDefault();
            console.log("Skip button clicked via direct button selector");
            skipUpgrade();
        };
    }
});

function handleUpgradeSubmit(event) {
    console.log("Upgrade form submitted");
    
    // Prevent the default form submission if this is a direct click
    if (event) {
      event.preventDefault();
    }
    
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
    
    // Show confirmation
    showUpgradeConfirmation();
    
    // Do NOT initiate a level or execute callback
    // Just return to allow user to continue from where they were
    console.log("Upgrade form closed, user can continue");
}

document.addEventListener('DOMContentLoaded', function() {
    // Ensure toggle function is properly set up for the upgrade form
    const isAdultCheckbox = document.getElementById('isAdult');
    
    if (isAdultCheckbox) {
      isAdultCheckbox.checked = true; // Default to adult checked
      toggleParentFields(); // Call once to set initial state
      
      isAdultCheckbox.addEventListener('change', toggleParentFields);
    }
  });

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

  // ADD: Function to handle unregistered user inactivity
function setupUnregisteredUserInactivityWipe() {
    let inactivityTimer;
    const inactivityTimeout = 15000; // 3 minutes in milliseconds
    let lastActivityTime = Date.now();
    
    // Function to reset the timer
    function resetInactivityTimer() {
        // Update last activity time
        lastActivityTime = Date.now();
        
        // Clear existing timer
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }
        
        // Only set the timer if user is not logged in
        if (!currentUser) {
            inactivityTimer = setTimeout(checkInactivity, 30000); // Check every 30 seconds
        }
    }
    
    // Function to check if we've been inactive long enough to wipe coins
    function checkInactivity() {
        const currentTime = Date.now();
        const inactiveTime = currentTime - lastActivityTime;
        
        // If inactive for more than our threshold and still not logged in
        if (inactiveTime >= inactivityTimeout && !currentUser) {
            console.log(`Unregistered user inactive for ${Math.floor(inactiveTime/60000)} minutes - wiping coins`);
            resetCoinsToZero();
        } else {
            // Not time to wipe yet, continue checking
            inactivityTimer = setTimeout(checkInactivity, 30000);
        }
    }
    
    // Set up event listeners for user activity
    const activityEvents = [
        'mousedown', 'mousemove', 'keypress', 
        'scroll', 'touchstart', 'click', 'touchmove'
    ];
    
    activityEvents.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
    
    // Start the initial timer
    resetInactivityTimer();
    
    // Also check on visibility change (user coming back to tab)
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            const currentTime = Date.now();
            const inactiveTime = currentTime - lastActivityTime;
            
            // If we've been away/hidden for over 3 minutes and not logged in
            if (inactiveTime >= inactivityTimeout && !currentUser) {
                console.log(`Tab inactive for ${Math.floor(inactiveTime/60000)} minutes - wiping coins`);
                resetCoinsToZero();
            }
            
            // Reset the timer as we're now active
            resetInactivityTimer();
        }
    });
}

// ADD: Call this function during initialization
document.addEventListener('DOMContentLoaded', function() {
    // Find the logout button in the side panel (as in previous solution)
    // ...logout button code from previous solution...
    
    // Setup inactivity wipe for unregistered users
    setupUnregisteredUserInactivityWipe();
    
    console.log("Unregistered user inactivity coin wipe setup complete (3 minute timeout)");
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


document.addEventListener('DOMContentLoaded', function() {
    // Set up carousel button clicks
    const carouselButtons = document.querySelectorAll('.carousel-button');
    const descriptionElement = document.getElementById('carousel-description');
    
    carouselButtons.forEach(button => {
      if (button.id !== 'settings-toggle') {
        button.addEventListener('click', function() {
          // Update active state
          carouselButtons.forEach(btn => btn.classList.remove('active'));
          this.classList.add('active');
          
          // Update description
          if (descriptionElement) {
            descriptionElement.textContent = this.getAttribute('data-description');
          }
          
          // Execute the action
          const action = this.getAttribute('data-action');
          if (action) {
            try {
              new Function(action)();
            } catch (e) {
              console.error('Error executing action:', e);
            }
          }
          
          // Hide floating menu if open
          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu && optionsMenu.classList.contains('show')) {
            optionsMenu.classList.remove('show');
          }
        });
      }
    });
    
    // Set up settings toggle for floating menu
    const settingsToggle = document.getElementById('settings-toggle');
    const optionsMenu = document.getElementById('options-menu');
    
    if (settingsToggle && optionsMenu) {
      settingsToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        optionsMenu.classList.toggle('show');
        
        // Update active state for settings button
        if (optionsMenu.classList.contains('show')) {
          carouselButtons.forEach(btn => btn.classList.remove('active'));
          this.classList.add('active');
        }
      });
      
      // Close menu when clicking elsewhere
      document.addEventListener('click', function(e) {
        if (optionsMenu.classList.contains('show') && 
            !optionsMenu.contains(e.target) && 
            e.target !== settingsToggle) {
          optionsMenu.classList.remove('show');
        }
      });
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    // Add direct click handler for the premium menu item to ensure it works for unregistered users
    function setupPremiumButton() {
      const premiumItem = document.querySelector('#premium-item');
      if (premiumItem) {
        // Remove the default onclick attribute and add direct listener
        const originalAction = premiumItem.getAttribute('onclick');
        premiumItem.removeAttribute('onclick');
        
        premiumItem.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Premium menu item clicked by', currentUser ? currentUser.status : 'unregistered user');
          
          // Always show the upgrade screen directly
          showScreen('upgrade-screen');
          
          // Close the options menu
          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu) {
            optionsMenu.classList.remove('show');
          }
        });
        
        console.log('Direct premium button handler set up');
      }
    }
    
    // Call setup initially
    setupPremiumButton();
    
    // Also set up after the menu is refreshed
    document.addEventListener('menuRefreshed', setupPremiumButton);
    
    // Re-check when menu is shown
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function() {
        setTimeout(setupPremiumButton, 100);
      });
    }
  });

  // Profile Modal functions
function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) {
        console.error("Profile modal element not found");
        return;
    }
    
    // Update username
    const usernameEl = document.getElementById('modal-username');
    if (usernameEl) {
        usernameEl.textContent = currentUser?.user_metadata?.username || 
                                currentUser?.email?.split('@')[0] || 
                                'Guest';
    }
    
    // Update status badge
    const statusEl = document.getElementById('modal-status');
    if (statusEl) {
        const status = currentUser?.status || 'free';
        
        // Remove all status classes first
        statusEl.className = 'status-badge';
        
        // Add appropriate status class
        statusEl.classList.add(status);
        
        // Set appropriate text
        if (status === 'premium') {
            statusEl.textContent = 'PREMIUM';
        } else if (status === 'pending') {
            statusEl.textContent = 'PENDING';
        } else if (status === 'free') {
            statusEl.textContent = 'FREE';
        } else {
            statusEl.textContent = 'GUEST';
        }
    }
    
    // Update stats
    const wordCountEl = document.getElementById('modal-word-count');
    const coinCountEl = document.getElementById('modal-coin-count');
    
    if (wordCountEl) {
        wordCountEl.textContent = document.getElementById('totalWords')?.textContent || '0';
    }
    
    if (coinCountEl) {
        coinCountEl.textContent = document.getElementById('totalCoins')?.textContent || '0';
    }
    
    // Show the modal
    modal.classList.add('show');
    
    // Close options menu if open
    closeOptionsMenu();
    
    console.log("Profile modal opened");
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
        modal.classList.remove('show');
        console.log("Profile modal closed");
    }
}

// Make sure this runs when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Find profile button in the options menu and update it
    const profileButton = document.querySelector('.menu-item[onclick="showScreen(\'user-stats-screen\')"]');
    if (profileButton) {
        profileButton.setAttribute('onclick', 'openProfileModal()');
        console.log("Profile button found and updated to open modal");
    } else {
        console.warn("Profile button not found in the menu");
    }
    
    // Also update the profile button in the avatar button if it exists
    const avatarButton = document.getElementById('login-avatar-btn');
    if (avatarButton) {
        avatarButton.onclick = function() {
            // If user is logged in, show profile modal
            // Otherwise, show auth modal
            if (currentUser) {
                openProfileModal();
            } else {
                showAuthModal();
            }
        };
        console.log("Avatar button updated to handle profile/auth");
    }
});

// Ultra simple about screen solution
(function() {
    // Execute when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
      // Create a standalone about screen function that doesn't depend on existing CSS
      window.showAboutScreen = function() {
        console.log("Showing about screen");
        
        // First remove any existing about overlay
        const existingOverlay = document.getElementById('simple-about-overlay');
        if (existingOverlay) {
          existingOverlay.remove();
        }
        
        // Create a full-page overlay with inline styles (no CSS dependencies)
        const overlay = document.createElement('div');
        overlay.id = 'simple-about-overlay';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(26, 26, 46, 0.95);
          z-index: 10000;
          overflow-y: auto;
          padding: 20px;
          box-sizing: border-box;
          color: white;
          font-family: 'Montserrat', sans-serif;
        `;
        
        // Add content with inline styles
        overlay.innerHTML = `
          <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #FFD700; text-align: center; margin-bottom: 30px; font-size: 28px;">Simplos Game App</h1>
            
            <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
              <h2 style="color: #FFD700; margin-bottom: 15px; font-size: 22px;">Privacy Policy</h2>
              <p style="margin-bottom: 15px; line-height: 1.6;">We respect your privacy and are committed to protecting your personal information. This privacy policy explains how we collect, use, and safeguard your data when you use our game app.</p>
              <ul style="padding-left: 20px; margin-bottom: 15px;">
                <li style="margin-bottom: 10px; line-height: 1.6;">We only collect personal information that you voluntarily provide to us, such as your email address when you create an account.</li>
                <li style="margin-bottom: 10px; line-height: 1.6;">We use your personal information to provide and improve our services, communicate with you, and personalize your experience.</li>
                <li style="margin-bottom: 10px; line-height: 1.6;">We do not sell, trade, or rent your personal information to third parties.</li>
                <li style="margin-bottom: 10px; line-height: 1.6;">We implement appropriate security measures to protect against unauthorized access, alteration, disclosure, or destruction of your personal information.</li>
              </ul>
            </div>
            
            <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
              <h2 style="color: #FFD700; margin-bottom: 15px; font-size: 22px;">Rights & Policies</h2>
              <p style="margin-bottom: 15px; line-height: 1.6;">By using our game app, you agree to the following rights and policies:</p>
              <ul style="padding-left: 20px; margin-bottom: 15px;">
                <li style="margin-bottom: 10px; line-height: 1.6;">You retain ownership of any intellectual property you submit to the app, such as custom word lists.</li>
                <li style="margin-bottom: 10px; line-height: 1.6;">We reserve the right to modify or terminate the app or your access to it for any reason, without notice, at any time, and without liability to you.</li>
                <li style="margin-bottom: 10px; line-height: 1.6;">Our app is provided "as is" without warranty of any kind. We are not liable for any damages arising from your use of the app.</li>
                <li style="margin-bottom: 10px; line-height: 1.6;">These terms are governed by the laws of Israel. Any dispute will be resolved through arbitration in Israel.</li>
              </ul>
            </div>
            
            <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 20px; margin-bottom: 30px;">
              <h2 style="color: #FFD700; margin-bottom: 15px; font-size: 22px;">About Simplos Game App</h2>
              <p style="margin-bottom: 15px; line-height: 1.6;">Simplos is a fun and educational game app designed to help you learn Hebrew vocabulary. With engaging gameplay, customizable word lists, and a variety of learning modes, Simplos makes it easy and enjoyable to expand your Hebrew language skills.</p>
              <p style="margin-bottom: 15px; line-height: 1.6;">Our app is perfect for learners of all levels, from beginners to advanced students. You can practice at your own pace, track your progress, and compete with friends in exciting arcade challenges.</p>
              <p style="margin-bottom: 15px; line-height: 1.6;">Simplos was created by a team of language enthusiasts and experienced developers who are passionate about making language learning accessible and effective for everyone. We are constantly working to improve the app and add new features based on user feedback.</p>
              <p style="margin-bottom: 15px; line-height: 1.6;">If you have any questions, comments, or suggestions, please don't hesitate to contact us. We'd love to hear from you!</p>
            </div>
            
            <button id="about-close-btn" style="
              display: block;
              margin: 0 auto;
              background: #1E90FF;
              color: white;
              border: none;
              padding: 12px 30px;
              border-radius: 50px;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            ">Back to Game</button>
          </div>
        `;
        
        // Add to body
        document.body.appendChild(overlay);
        
        // Add event listener to close button
        document.getElementById('about-close-btn').addEventListener('click', function() {
          overlay.remove();
        });
        
        // Also close when clicking escape key
        document.addEventListener('keydown', function(event) {
          if (event.key === 'Escape') {
            overlay.remove();
          }
        });
      };
      
      // Update the about button to use our new function
      function updateAboutButton() {
        // Find the about button in the menu
        const aboutButton = document.querySelector('.menu-item i.fa-info-circle')?.closest('.menu-item');
        if (aboutButton) {
          aboutButton.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Close the options menu if it's open
            const optionsMenu = document.getElementById('options-menu');
            if (optionsMenu && optionsMenu.classList.contains('show')) {
              optionsMenu.classList.remove('show');
            }
            
            window.showAboutScreen();
            return false;
          };
          console.log("About button updated");
        }
        
        // Also update the about link in the side panel
        const aboutLink = document.querySelector('a[href*="about.html"]');
        if (aboutLink) {
          aboutLink.href = '#';
          aboutLink.onclick = function(e) {
            e.preventDefault();
            window.showAboutScreen();
            return false;
          };
          console.log("Side panel about link updated");
        }
      }
      
      // Try to update immediately and after a delay
      updateAboutButton();
      setTimeout(updateAboutButton, 2000);
    });
  })();

  function setupStandaloneHomeButton() {
    // Remove existing buttons if they exist
    const existingButtons = document.querySelectorAll('.standalone-home-button');
    existingButtons.forEach(button => button.remove());
    
    // Create new standalone home button
    const homeButton = document.createElement('button');
    homeButton.className = 'standalone-home-button';
    homeButton.id = 'standalone-home-btn';
    homeButton.innerHTML = '<i class="fas fa-home"></i>';
    homeButton.onclick = navigateHome;
    
    // Add to body to ensure it's available on all screens
    document.body.appendChild(homeButton);
  }
  
  // Call this function when DOM is loaded and when screens change
  document.addEventListener('DOMContentLoaded', setupStandaloneHomeButton);
  
  // Modify the showScreen function to ensure the home button is visible on all screens
  const originalShowScreen = window.showScreen;
  window.showScreen = function(screenId, forceRefresh) {
    originalShowScreen(screenId, forceRefresh);
    setupStandaloneHomeButton();
  };

  function updateAllCoinDisplays() {
    // Skip if boss victory animation is in progress
    if (window.bossVictoryAnimationInProgress) {
        console.log('Boss victory animation in progress, skipping updateAllCoinDisplays');
        return;
    }
    
    const displays = document.querySelectorAll('.coin-count');
    displays.forEach(display => {
        // Skip protected elements
        if (display.dataset.protectedValue === 'true') {
            console.log('Skipping protected element in updateAllCoinDisplays');
            return;
        }
        
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

function positionOptionsMenu() {
    const optionsMenu = document.getElementById('options-menu');
    const settingsToggle = document.getElementById('settings-toggle');
    
    if (!optionsMenu || !settingsToggle) return;
    
    // Check if menu is shown
    if (!optionsMenu.classList.contains('show')) return;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get menu and toggle button dimensions and positions
    const menuRect = optionsMenu.getBoundingClientRect();
    const toggleRect = settingsToggle.getBoundingClientRect();
    
    // Calculate menu position
    let left = toggleRect.left + (toggleRect.width / 2) - (menuRect.width / 2);
    let top = toggleRect.bottom + 10; // 10px below toggle button
    
    // Check if menu would overflow right edge
    if (left + menuRect.width > viewportWidth - 10) {
        left = viewportWidth - menuRect.width - 10;
    }
    
    // Check if menu would overflow left edge
    if (left < 10) {
        left = 10;
    }
    
    // Check if menu would overflow bottom edge
    if (top + menuRect.height > viewportHeight - 10) {
        // Position above toggle button instead
        top = toggleRect.top - menuRect.height - 10;
        
        // If still overflowing (not enough space above either)
        if (top < 10) {
            // Center in viewport as fallback
            top = Math.max(10, (viewportHeight - menuRect.height) / 2);
            
            // Ensure menu is fully on screen by checking height
            if (top + menuRect.height > viewportHeight - 10) {
                // Limit height if necessary and add scrolling
                const maxHeight = viewportHeight - 20;
                optionsMenu.style.maxHeight = `${maxHeight}px`;
                optionsMenu.style.overflow = 'auto';
            }
        }
    }
    
    // Apply calculated position
    optionsMenu.style.left = `${left}px`;
    optionsMenu.style.top = `${top}px`;
    optionsMenu.style.transform = 'none'; // Remove default transform
}

function refreshOptionsMenu() {
    // Find the existing options menu
    const existingMenu = document.getElementById('options-menu');
    if (existingMenu) {
        // Hide the menu before recreating it to avoid visual glitches
        existingMenu.classList.remove('show');
        
        // Create a new menu
        setTimeout(() => {
            // Remove the old menu
            if (existingMenu.parentNode) {
                existingMenu.parentNode.removeChild(existingMenu);
            }
            
            // Initialize the carousel which will recreate the menu
            initializeCarousel();
        }, 100);
    }
}

  // Find where the arcade button click is defined in the code
document.addEventListener('DOMContentLoaded', function() {
    // Find the arcade button by its data-action attribute
    const arcadeButton = document.querySelector('.carousel-button[data-action="showArcadeModal()"]');
    
    if (arcadeButton) {
      // Remove any existing click handlers
      arcadeButton.removeEventListener('click', window.showArcadeModal);
      
      // Add our direct click handler
      arcadeButton.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Arcade button clicked - directly calling showArcadeModal');
        showArcadeModal();
      });
    } else {
      console.error('Arcade button not found in the DOM');
    }
  });

  // Simple debugging version of showArcadeModal
function openArcadeModalSimple() {
    console.log('Simple arcade modal opener called');
    const modal = document.getElementById('arcade-modal');
    
    if (!modal) {
      console.error('Arcade modal element not found');
      return;
    }
    
    console.log('Found arcade modal, displaying it');
    modal.style.display = 'block';
    
    // Get the player view and teacher view
    const teacherView = document.getElementById('teacher-view');
    const playerView = document.getElementById('player-view');
    
    if (teacherView && playerView) {
      // Default to player view for everyone for testing
      teacherView.style.display = 'none';
      playerView.style.display = 'block';
      console.log('Showing player view');
    } else {
      console.error('Teacher or player view elements not found');
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Add a direct click handler to the Arcade button in the carousel
    document.querySelectorAll('.carousel-button').forEach(button => {
      const buttonText = button.querySelector('span')?.textContent?.trim();
      if (buttonText === 'Arcade') {
        button.onclick = function() {
          console.log('Arcade button clicked through direct handler');
          // Try the simplified function first for debugging
          openArcadeModalSimple();
          // If that works, switch back to the full function
          // showArcadeModal();
        };
      }
    });
    
    // Also add a direct click handler to any element with showArcadeModal in onclick attribute
    document.querySelectorAll('[onclick*="showArcadeModal"]').forEach(element => {
      element.onclick = function(e) {
        e.preventDefault();
        console.log('Element with showArcadeModal onclick attribute clicked');
        // Try the simplified function first for debugging
        openArcadeModalSimple();
        // If that works, switch back to the full function
        // showArcadeModal();
        return false;
      };
    });
  });

  // Add this to help diagnose the modal structure
function checkArcadeModalStructure() {
    console.log('Checking arcade modal structure...');
    
    const modal = document.getElementById('arcade-modal');
    if (!modal) {
      console.error('Arcade modal element not found');
      return false;
    }
    
    console.log('Modal element found:', modal);
    
    const teacherView = document.getElementById('teacher-view');
    const playerView = document.getElementById('player-view');
    
    if (!teacherView) {
      console.error('Teacher view not found in modal');
    } else {
      console.log('Teacher view found:', teacherView);
    }
    
    if (!playerView) {
      console.error('Player view not found in modal');
    } else {
      console.log('Player view found:', playerView);
    }
    
    return true;
  }
  
  // Call this on page load
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(checkArcadeModalStructure, 1000); // Give the page a second to fully load
  });

  // Function to ensure the arcade modal exists
function ensureArcadeModalExists() {
    let modal = document.getElementById('arcade-modal');
    
    if (!modal) {
      console.log('Creating arcade modal element as it was not found');
      modal = document.createElement('div');
      modal.id = 'arcade-modal';
      modal.className = 'modal';
      
      // Create basic structure
      modal.innerHTML = `
        <div class="modal-content">
          <div id="teacher-view" style="display: none;">
            <h2>Host Arcade Session</h2>
            <p>Game Code: <span id="otp">----</span></p>
            <p>Players: <span id="player-count">0</span></p>
            <div class="stage-selector">
              <h3>Select Word Pools:</h3>
              <div class="stage-checkboxes">
                <!-- Stage checkboxes will go here -->
              </div>
            </div>
            <button class="main-button" onclick="startArcade()">Start Session</button>
            <button class="end-arcade-button" onclick="endArcade()">End Session</button>
          </div>
          
          <div id="player-view" style="display: none;">
            <h2>Join Arcade</h2>
            <div class="input-group">
              <input type="text" id="arcadeUsername" placeholder="Choose your username" maxlength="15">
              <input type="text" id="otpInput" placeholder="Enter 4-digit Game Code" maxlength="4" pattern="[0-9]{4}" inputmode="numeric">
            </div>
            <button class="join-button" onclick="joinArcadeWithUsername()">Join Game</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      return true;
    }
    
    return false;
  }
  
  // Call this on page load
  document.addEventListener('DOMContentLoaded', function() {
    ensureArcadeModalExists();
  });

  // Direct fix for the arcade modal issue
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - Setting up arcade button handlers');
    
    // 1. Make sure the arcade modal exists
    const modalExists = ensureArcadeModalExists();
    if (modalExists) {
      console.log('Created arcade modal as it was missing');
    }
    
    // 2. Add click handlers to all possible arcade buttons
    document.querySelectorAll('.carousel-button').forEach(button => {
      const buttonText = button.querySelector('span')?.textContent?.trim();
      if (buttonText === 'Arcade') {
        console.log('Found Arcade button in carousel, adding direct click handler');
        
        button.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log('Arcade button clicked');
          
          // Show the modal directly first
          const modal = document.getElementById('arcade-modal');
          if (modal) {
            modal.style.display = 'block';
            
            // Then try to configure it
            try {
              showArcadeModal();
            } catch (error) {
              console.error('Error in showArcadeModal:', error);
              
              // Fallback to basic configuration
              const teacherView = document.getElementById('teacher-view');
              const playerView = document.getElementById('player-view');
              
              if (teacherView && playerView) {
                teacherView.style.display = 'none';
                playerView.style.display = 'block';
              }
            }
          } else {
            console.error('Arcade modal not found even after ensuring it exists');
          }
          
          return false;
        };
      }
    });
    
    // 3. Also fix any elements with onclick="showArcadeModal()"
    document.querySelectorAll('[onclick*="showArcadeModal"]').forEach(element => {
      console.log('Found element with showArcadeModal onclick attribute, replacing handler');
      
      element.setAttribute('onclick', ''); // Remove the attribute
      element.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Element with showArcadeModal onclick clicked');
        
        // Show the modal directly first
        const modal = document.getElementById('arcade-modal');
        if (modal) {
          modal.style.display = 'block';
          
          // Then try to configure it
          try {
            showArcadeModal();
          } catch (error) {
            console.error('Error in showArcadeModal:', error);
            
            // Fallback to basic configuration
            const teacherView = document.getElementById('teacher-view');
            const playerView = document.getElementById('player-view');
            
            if (teacherView && playerView) {
              teacherView.style.display = 'none';
              playerView.style.display = 'block';
            }
          }
        }
        
        return false;
      };
    });
  });


  
function initializeWaitingGame() {
  // Add shuffle function if not already defined
  if (typeof shuffleArray !== 'function') {
    window.shuffleArray = function(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };
  }
  
  // Get DOM elements
  const gameContainer = document.getElementById('waiting-game-container');
  const playerElement = document.getElementById('waiting-game-player');
  const scoreElement = document.getElementById('waiting-game-score');
  const livesElement = document.getElementById('waiting-game-lives');
  
  if (!gameContainer) {
    console.error('Game container not found!');
    return;
  }
  
  if (!playerElement) {
    console.error('Player element not found!');
    return;
  }
  
  if (!scoreElement) {
    console.error('Score element not found!');
    return;
  }
  
  // Create lives display if it doesn't exist
  if (!livesElement) {
    const livesDiv = document.createElement('div');
    livesDiv.id = 'waiting-game-lives';
    livesDiv.style.cssText = 'position: absolute; top: 40px; right: 10px; color: var(--gold); font-size: 1.2rem; z-index: 10;';
    livesDiv.textContent = '❤️❤️❤️';
    gameContainer.appendChild(livesDiv);
  }
  
  // Show the game container
  gameContainer.style.display = 'block';
  
  // Get appropriate vocabulary words from stage 1
  let wordPairs = [];
  try {
    for (const key in vocabularySets) {
      if (key.startsWith('1_')) {
        const words = vocabularySets[key].words;
        const translations = vocabularySets[key].translations;
        for (let i = 0; i < words.length && i < translations.length; i++) {
          wordPairs.push({
            hebrew: words[i],
            english: translations[i]
          });
        }
      }
    }
  } catch (e) {
    console.error('Error loading vocabulary for waiting game:', e);
    // Fallback words if vocabulary isn't available
    wordPairs = [
      { hebrew: 'כלב', english: 'dog' },
      { hebrew: 'חתול', english: 'cat' },
      { hebrew: 'בית', english: 'house' },
      { hebrew: 'אוכל', english: 'food' },
      { hebrew: 'מים', english: 'water' },
      { hebrew: 'ספר', english: 'book' },
      { hebrew: 'יד', english: 'hand' },
      { hebrew: 'עיר', english: 'city' },
      { hebrew: 'ילד', english: 'child' },
      { hebrew: 'אישה', english: 'woman' }
    ];
  }
  
  // Shuffle the word pairs
  wordPairs = window.shuffleArray([...wordPairs]);
  
  // Game state
  let gameActive = true;
  let score = 0;
  let speed = 1;
  let fallingWords = [];
  let currentHebrewWord = '';
  let playerPosition = gameContainer.offsetWidth / 2;
  let gameLoopId = null;
  let spawnIntervalId = null;
  let lives = 3;
  let missedMatches = 0;
  const maxMissed = 3;
  
  // Initialize player with random Hebrew word
  function setRandomHebrewWord() {
    const randomPair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    currentHebrewWord = randomPair.hebrew;
    playerElement.textContent = currentHebrewWord;
  }
  
  function createFallingWord() {
    if (!gameActive) return;
    
    // Find English words that match our current Hebrew word and some that don't
    const matchingWord = wordPairs.find(pair => pair.hebrew === currentHebrewWord)?.english;
    const nonMatchingWords = wordPairs
      .filter(pair => pair.hebrew !== currentHebrewWord)
      .map(pair => pair.english);
    
    // Decide whether to spawn a matching word (higher chance) or random word
    const isMatching = Math.random() < 0.4; // 40% chance for matching word
    
    // Create the falling word element
    const wordElement = document.createElement('div');
    wordElement.className = 'falling-word';
    
    // Choose the word text
    if (isMatching && matchingWord) {
      wordElement.textContent = matchingWord;
      wordElement.dataset.matching = 'true';
    } else {
      const randomNonMatching = nonMatchingWords[Math.floor(Math.random() * nonMatchingWords.length)];
      wordElement.textContent = randomNonMatching || 'word';
      wordElement.dataset.matching = 'false';
    }
    
    // Style the falling word
    wordElement.style.cssText = `
      position: absolute;
      top: -30px;
      left: ${Math.random() * (gameContainer.offsetWidth - 80) + 40}px;
      padding: 5px 10px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 15px;
      color: white;
      transition: top 0.1s linear;
    `;
    
    gameContainer.appendChild(wordElement);
    
    // Add to tracking array
    fallingWords.push({
      element: wordElement,
      y: -30,
      x: parseFloat(wordElement.style.left),
      width: 0, // Will be set in the game loop after element is rendered
      isMatching: wordElement.dataset.matching === 'true'
    });
  }
  
  function gameLoop() {
    if (!gameActive) return;
    
    const containerBottom = gameContainer.offsetHeight;
    const playerTop = containerBottom - 60;
    
    // Update position and check collision for each falling word
    for (let i = fallingWords.length - 1; i >= 0; i--) {
      const word = fallingWords[i];
      
      // Set width if not set yet
      if (word.width === 0) {
        word.width = word.element.offsetWidth;
      }
      
      // Move the word down
      word.y += speed;
      word.element.style.top = `${word.y}px`;
      
      // Check if word has reached the bottom
      if (word.y > containerBottom) {
        // Check if we missed a matching word
        if (word.isMatching) {
          missedMatches++;
          
          // Show a missed indicator
          const missIndicator = document.createElement('div');
          missIndicator.textContent = `Missed match! (${missedMatches}/${maxMissed})`;
          missIndicator.style.cssText = `
            position: absolute;
            left: ${word.x}px;
            bottom: 10px;
            color: var(--error);
            font-weight: bold;
            animation: float-up 1s forwards;
            z-index: 5;
          `;
          gameContainer.appendChild(missIndicator);
          setTimeout(() => {
            gameContainer.removeChild(missIndicator);
          }, 1000);
          
          // Update lives display
          const livesDisplay = document.getElementById('waiting-game-lives');
          if (livesDisplay) {
            livesDisplay.textContent = '❤️'.repeat(Math.max(0, 3 - missedMatches));
          }
          
          // Check for game over
          if (missedMatches >= maxMissed) {
            gameOver();
          }
        }
        
        // Remove the word
        gameContainer.removeChild(word.element);
        fallingWords.splice(i, 1);
        continue;
      }
      
      // Check for collision with player
      const playerRect = playerElement.getBoundingClientRect();
      const wordRect = word.element.getBoundingClientRect();
      
      if (word.y + word.element.offsetHeight >= playerTop &&
          word.x + word.width >= playerPosition - playerElement.offsetWidth/2 &&
          word.x <= playerPosition + playerElement.offsetWidth/2) {
        
        // Check if this is the correct word to match
        if (word.isMatching) {
          // Matching word - add points
          score += 10;
          scoreElement.textContent = `Score: ${score}`;
          
          // Create a +10 animation
          const pointAnimation = document.createElement('div');
          pointAnimation.textContent = '+10';
          pointAnimation.style.cssText = `
            position: absolute;
            left: ${word.x}px;
            top: ${word.y}px;
            color: var(--gold);
            font-weight: bold;
            animation: float-up 1s forwards;
            z-index: 5;
          `;
          gameContainer.appendChild(pointAnimation);
          setTimeout(() => {
            gameContainer.removeChild(pointAnimation);
          }, 1000);
          
          // Increase difficulty slightly
          speed += 0.05;
          
          // Change the Hebrew word
          setRandomHebrewWord();
        } else {
          // Wrong word - subtract points and lose a life
          score = Math.max(0, score - 5);
          scoreElement.textContent = `Score: ${score}`;
          
          lives--;
          
          // Update lives display
          const livesDisplay = document.getElementById('waiting-game-lives');
          if (livesDisplay) {
            livesDisplay.textContent = '❤️'.repeat(lives);
          }
          
          // Create a -5 animation
          const pointAnimation = document.createElement('div');
          pointAnimation.textContent = '-5';
          pointAnimation.style.cssText = `
            position: absolute;
            left: ${word.x}px;
            top: ${word.y}px;
            color: var(--error);
            font-weight: bold;
            animation: float-up 1s forwards;
            z-index: 5;
          `;
          gameContainer.appendChild(pointAnimation);
          setTimeout(() => {
            gameContainer.removeChild(pointAnimation);
          }, 1000);
          
          // Check for game over
          if (lives <= 0) {
            gameOver();
          }
        }
        
        // Remove the word
        gameContainer.removeChild(word.element);
        fallingWords.splice(i, 1);
      }
    }
    
    // Request next frame
    gameLoopId = requestAnimationFrame(gameLoop);
  }
  
  function gameOver() {
    gameActive = false;
    clearInterval(spawnIntervalId);
    
    // Create game over message
    const gameOverMsg = document.createElement('div');
    gameOverMsg.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      padding: 1rem 2rem;
      border-radius: 10px;
      text-align: center;
      z-index: 20;
    `;
    gameOverMsg.innerHTML = `
      <h3 style="color: var(--error); margin-bottom: 0.5rem;">Game Over!</h3>
      <p style="margin-bottom: 1rem;">Score: ${score}</p>
      <button id="game-restart-btn" class="start-button" style="font-size: 0.9rem; padding: 0.5rem 1rem;">Play Again</button>
    `;
    
    gameContainer.appendChild(gameOverMsg);
    
    // Add restart button handler
    document.getElementById('game-restart-btn').addEventListener('click', () => {
      gameContainer.removeChild(gameOverMsg);
      startGame();
    });
  }
  
  // Add event handlers for player movement
  let isDragging = false;
  
  function handleStart(e) {
    isDragging = true;
    const pageX = e.type.includes('touch') ? e.touches[0].pageX : e.pageX;
    const containerRect = gameContainer.getBoundingClientRect();
    playerPosition = pageX - containerRect.left;
    updatePlayerPosition();
    
    if (e.type.includes('touch')) {
      e.preventDefault();
    }
  }
  
  function handleMove(e) {
    if (!isDragging) return;
    
    const pageX = e.type.includes('touch') ? e.touches[0].pageX : e.pageX;
    const containerRect = gameContainer.getBoundingClientRect();
    playerPosition = pageX - containerRect.left;
    updatePlayerPosition();
    
    if (e.type.includes('touch')) {
      e.preventDefault();
    }
  }
  
  function handleEnd() {
    isDragging = false;
  }
  
  function updatePlayerPosition() {
    // Ensure player stays within boundaries
    playerPosition = Math.max(playerElement.offsetWidth/2, 
                     Math.min(gameContainer.offsetWidth - playerElement.offsetWidth/2, 
                     playerPosition));
    
    playerElement.style.left = `${playerPosition}px`;
  }
  
  // Add CSS animation
  const styleId = 'waiting-game-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes float-up {
        0% { transform: translateY(0); opacity: 1; }
        100% { transform: translateY(-30px); opacity: 0; }
      }
      
      .falling-word {
        animation: gentle-wobble 2s infinite alternate;
      }
      
      @keyframes gentle-wobble {
        0% { transform: translateX(0px); }
        100% { transform: translateX(5px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Add event listeners for player movement
  playerElement.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
  
  // Touch events for mobile
  playerElement.addEventListener('touchstart', handleStart, { passive: false });
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);
  
  function startGame() {
    // Reset game
    gameActive = true;
    score = 0;
    speed = 1;
    lives = 3;
    missedMatches = 0;
    
    // Update lives display
    const livesDisplay = document.getElementById('waiting-game-lives');
    if (livesDisplay) {
      livesDisplay.textContent = '❤️❤️❤️';
    }
    
    // Clear existing words
    fallingWords.forEach(word => {
      if (word.element.parentNode) {
        gameContainer.removeChild(word.element);
      }
    });
    fallingWords = [];
    
    // Reset score
    scoreElement.textContent = `Score: ${score}`;
    
    // Set initial Hebrew word
    setRandomHebrewWord();
    
    // Start game loop
    gameLoopId = requestAnimationFrame(gameLoop);
    
    // Start spawning words
    spawnIntervalId = setInterval(createFallingWord, 2000);
  }
  
  // Watch for game cancelation when arcade starts
  function checkArcadeStatus() {
    if (currentArcadeSession && currentArcadeSession.state === 'active') {
      // Clean up game
      clearInterval(spawnIntervalId);
      cancelAnimationFrame(gameLoopId);
      gameContainer.style.display = 'none';
      
      // Remove event listeners
      playerElement.removeEventListener('mousedown', handleStart);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      playerElement.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      
      // Clear interval for this check
      clearInterval(arcadeCheckId);
    }
  }
  
  const arcadeCheckId = setInterval(checkArcadeStatus, 1000);
  
  // Start the game
  startGame();
  
  return {
    stop: function() {
      gameActive = false;
      clearInterval(spawnIntervalId);
      cancelAnimationFrame(gameLoopId);
      clearInterval(arcadeCheckId);
    }
  };
}

function debugGameProgress() {
    console.group("Game Progress Debug");
    console.log("Current Stage:", gameState.currentStage);
    console.log("Current Set:", gameState.currentSet);
    console.log("Current Level:", gameState.currentLevel);
    
    console.log("Unlocked Sets:");
    Object.entries(gameState.unlockedSets).forEach(([stage, sets]) => {
        console.log(`Stage ${stage}:`, Array.from(sets).sort((a, b) => a - b));
    });
    
    console.log("Unlocked Levels:");
    Object.entries(gameState.unlockedLevels).forEach(([setKey, levels]) => {
        console.log(`Set ${setKey}:`, Array.from(levels).sort((a, b) => a - b));
    });
    
    console.log("Completed Levels:", Array.from(gameState.completedLevels).sort());
    console.log("Perfect Levels:", Array.from(gameState.perfectLevels).sort());
    console.groupEnd();
}


function updateBossHealthBar() {
  // Only update if we're in boss level
  if (!currentGame.isBossLevel) return;
  
  console.log("Updating boss health bar");

  const progressCircle = document.querySelector('.progress-circle');
  if (!progressCircle) {
    console.error("Progress circle not found");
    return;
  }
  
  const progress = progressCircle.querySelector('.progress');
  if (!progress) {
    console.error("Progress element not found");
    return;
  }
  
  // Calculate health values
  const totalWords = currentGame.words.length;
  const currentIndex = currentGame.currentIndex || 0;
  const remainingWords = Math.max(0, totalWords - currentIndex);
  const remainingPercentage = remainingWords / totalWords;
  
  console.log(`Boss health: ${remainingPercentage.toFixed(2) * 100}% (${remainingWords}/${totalWords})`);
  
  // Calculate the circumference
  const circumference = 2 * Math.PI * 54;
  
  // Update the stroke dash offset (reverse of normal progress)
  progress.style.strokeDashoffset = circumference * (1 - remainingPercentage);
  
  // Add boss-health class if not already present
  if (!progress.classList.contains('boss-health')) {
    progress.classList.add('boss-health');
  }
  
  // Change color based on health
  if (remainingPercentage > 0.66) {
    // Full health - green
    progress.style.stroke = '#4CAF50';
    progress.classList.remove('warning');
  } else if (remainingPercentage > 0.33) {
    // Medium health - yellow/orange
    progress.style.stroke = '#FFA500';
    progress.classList.remove('warning');
    
    // Boss health restoration at 2/3 health (once)
    if (remainingPercentage <= 0.66 && !currentGame.bossFirstHealthRestored) {
      currentGame.bossFirstHealthRestored = true;
      console.log("First boss health restoration");
      
      // Partially restore health (reduce current index)
      const newIndex = Math.floor(totalWords * 0.25); // 75% health
      currentGame.currentIndex = newIndex;
      
      // Show visual effect
      const bossOrb = document.querySelector('.boss-orb-inner');
      if (bossOrb) {
        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #FFEB3B, #FFA500)';
        setTimeout(() => {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      
      // Update health bar after restoring
      setTimeout(() => updateBossHealthBar(), 100);
    }
  } else {
    // Low health - red
    progress.style.stroke = '#FF3333';
    progress.classList.add('warning');
    
    // Boss health restoration at 1/3 health (once)
    if (remainingPercentage <= 0.33 && !currentGame.bossSecondHealthRestored) {
      currentGame.bossSecondHealthRestored = true;
      console.log("Second boss health restoration");
      
      // Partially restore health (reduce current index)
      const newIndex = Math.floor(totalWords * 0.5); // 50% health
      currentGame.currentIndex = newIndex;
      
      // Show visual effect
      const bossOrb = document.querySelector('.boss-orb-inner');
      if (bossOrb) {
        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #4CAF50, #388E3C)';
        setTimeout(() => {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      
      // Update health bar after restoring
      setTimeout(() => updateBossHealthBar(), 100);
    }
  }
}

function healBoss(newHealthPercentage, flashColor) {
  const progressCircle = document.querySelector('.progress-circle');
  const progress = progressCircle ? progressCircle.querySelector('.progress') : null;
  const bossOrb = document.querySelector('.boss-orb-inner');
  
  if (!progress || !bossOrb) return;
  
  // Flash the boss orb with the specified color
  const originalColor = bossOrb.style.background;
  bossOrb.style.background = flashColor;
  bossOrb.classList.add('boss-restore-health');
  
  // Flash the screen
  const questionScreen = document.querySelector('.question-screen');
  if (questionScreen) {
    questionScreen.style.animation = 'none';
    questionScreen.offsetHeight; // Trigger reflow
    questionScreen.style.animation = 'bossRestoreHealth 1s';
  }
  
  // Calculate new offset
  const circumference = 2 * Math.PI * 54;
  const newOffset = circumference * (1 - newHealthPercentage);
  
  // Animate health bar filling
  setTimeout(() => {
    progress.style.transition = 'stroke-dashoffset 1s ease-out';
    progress.style.strokeDashoffset = newOffset;
    
    // Reset boss orb
    setTimeout(() => {
      bossOrb.style.background = originalColor;
      bossOrb.classList.remove('boss-restore-health');
    }, 1000);
  }, 300);
}

function showBossHitEffect(randomColor = false) {
  const bossOrb = document.querySelector('.boss-orb-inner');
  if (!bossOrb) return;
  
  // Store original background
  const originalBg = bossOrb.style.background;
  
  // Apply random color if requested
  if (randomColor) {
    const colors = ['yellow', 'purple', 'turquoise', 'darkgreen', 'brown'];
    const randomColorChoice = colors[Math.floor(Math.random() * colors.length)];
    bossOrb.style.background = `radial-gradient(circle at 30% 30%, ${randomColorChoice}, #990000)`;
  }
  
  // Add hit effect
  bossOrb.classList.add('boss-orb-hit');
  
  // Reset after animation
  setTimeout(() => {
    bossOrb.classList.remove('boss-orb-hit');
    // Reset background only if we changed it
    if (randomColor) {
      bossOrb.style.background = originalBg;
    }
  }, 300);
}


function applyBossLevelStyles() {
  console.log("Forcefully applying boss level styles");
  
  const questionScreen = document.getElementById("question-screen");
  if (questionScreen) {
    questionScreen.style.setProperty("background", "linear-gradient(135deg, #800000, #3a0000)", "important");
    questionScreen.style.setProperty("animation", "pulseBg 4s infinite", "important");
  }
  
  // Add boss animations stylesheet if not already present
  if (!document.getElementById("boss-animations")) {
    const styleElem = document.createElement("style");
    styleElem.id = "boss-animations";
    styleElem.textContent = `
      @keyframes pulseBg {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.2); }
      }
      
      @keyframes pulseOrb {
        0%, 100% { transform: scale(1); filter: brightness(1); }
        50% { transform: scale(1.3); filter: brightness(1.4); }
      }
      
      @keyframes pulseWord {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
    `;
    document.head.appendChild(styleElem);
  }
  
  // Style the question word
  const questionWord = document.getElementById("question-word");
  if (questionWord) {
    questionWord.style.setProperty("color", "#ff3333", "important");
    questionWord.style.setProperty("text-shadow", "0 0 10px rgba(255, 0, 0, 0.5)", "important");
    questionWord.style.setProperty("animation", "pulseWord 2s infinite", "important");
  }
  
  // Replace coins container with boss orb
  const coinsContainer = document.querySelector(".coins-container");
  if (coinsContainer) {
    if (!window.originalCoinsHTML) {
      window.originalCoinsHTML = coinsContainer.innerHTML;
    }
    
    coinsContainer.innerHTML = `
    <div class="boss-orb" style="
      width: 85px;
      height: 85px;
      top: 50%;
      left: 50%;
      transform: translate(-75%, -75%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    ">
      <div class="boss-orb-inner" style="
        width: 50px;
        height: 50px;
        background: radial-gradient(circle at 30% 30%, #ff3333, #990000);
        border-radius: 50%;
        box-shadow: 0 0 20px #ff3333, inset 0 0 10px rgba(255,255,255,0.3);
        animation: pulseOrb 1s infinite;
      "></div>
    </div>
  `;
  }
}

function handleBossAnswer(correct) {
  if (correct) {
    // Make progress bar flicker
    const progressCircle = document.querySelector(".progress-circle");
    const progressBar = progressCircle?.querySelector(".progress");
    
    if (progressBar) {
      // Save original stroke color
      const originalColor = progressBar.style.stroke;
      
      // Create and apply flicker animation
      const flickerColors = ["#ffffff", "#ffff00", "#800080", "#990000"];
      const randomColor = flickerColors[Math.floor(Math.random() * flickerColors.length)];
      
      progressBar.style.transition = "stroke 0.2s ease";
      progressBar.style.stroke = randomColor;
      
      // Reset back to green after flicker
      setTimeout(() => {
        progressBar.style.stroke = originalColor;
      }, 200);
    }
  }
}

// Boss Level Visual and Interaction Enhancements

function createBossTimer() {
    const timerContainer = document.createElement('div');
    timerContainer.id = 'boss-timer';
    timerContainer.style.cssText = `
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        justify-content: center;
        z-index: 10;
    `;
    
    const timerDisplay = document.createElement('div');
    timerDisplay.style.cssText = `
        background-color: rgba(255, 215, 0, 0.8);
        color: #000;
        font-family: 'Digital', monospace;
        font-size: 2rem;
        padding: 5px 10px;
        border-radius: 5px;
        letter-spacing: 3px;
    `;
    
    timerContainer.appendChild(timerDisplay);
    return { container: timerContainer, display: timerDisplay };
}

function updateBossTimer(timerDisplay, timeRemaining) {
    if (timerDisplay) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function createLightningEffect() {
    const lightningContainer = document.createElement('div');
    lightningContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.8);
        z-index: 1000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.1s ease;
    `;
    document.body.appendChild(lightningContainer);

    const flickerCount = Math.floor(Math.random() * 3) + 1;
    let delay = 0;

    for (let i = 0; i < flickerCount; i++) {
        setTimeout(() => {
            lightningContainer.style.opacity = '1';
            setTimeout(() => {
                lightningContainer.style.opacity = '0';
            }, 50);
        }, delay);
        delay += 200;
    }

    setTimeout(() => {
        document.body.removeChild(lightningContainer);
    }, delay + 500);
}

function createBossRainingLetters() {
    const questionScreen = document.getElementById('question-screen');
    if (!questionScreen) return;

    // Clear any existing intervals
    if (window.rainingLettersInterval) {
        clearInterval(window.rainingLettersInterval);
    }

    const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'אבגדהוזחטיכלמנסעפצקרשת'];
    const screenWidth = questionScreen.clientWidth;

    window.rainingLettersInterval = setInterval(() => {
        const particleCount = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < particleCount; i++) {
            const letter = document.createElement('div');
            letter.className = 'boss-raining-letter';
            letter.textContent = letters[Math.floor(Math.random() * letters.length)];
            
            letter.style.cssText = `
                position: absolute;
                top: -20px;
                left: ${Math.random() * screenWidth}px;
                color: rgba(255, 0, 0, 0.4);
                font-size: 16px;
                animation: boss-letter-rain 5s linear forwards;
                z-index: 1;
                text-shadow: 0 0 5px rgba(255, 0, 0, 0.3);
            `;

            questionScreen.appendChild(letter);

            // Remove letter after animation
            setTimeout(() => {
                if (letter.parentNode === questionScreen) {
                    questionScreen.removeChild(letter);
                }
            }, 5000);
        }
    }, 300);
}

function stopBossRainingLetters() {
    if (window.rainingLettersInterval) {
        clearInterval(window.rainingLettersInterval);
        window.rainingLettersInterval = null;
    }
}

function createBossStyleSheet() {
  const styleElem = document.createElement("style");
  styleElem.id = "boss-level-styles";
  styleElem.textContent = `
    @keyframes boss-letter-rain {
      0% { 
        transform: translateY(-20px);
        opacity: 0.6;
      }
      100% { 
        transform: translateY(100vh);
        opacity: 0;
      }
    }

    @keyframes boss-shrink {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(0.8); opacity: 0.8; }
      100% { transform: scale(0); opacity: 0; }
    }

    @keyframes fade-to-blue {
      0% { background: linear-gradient(135deg, #800000, #3a0000); }
      20% { background: linear-gradient(135deg, #800000, #3a0000); }
      60% { background: linear-gradient(135deg, #4a1582, #0d47a1); }
      100% { background: radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%); }
    }
    
    @keyframes incinerateEffect {
      0% { transform: scale(0); opacity: 0; }
      10% { transform: scale(0.5); opacity: 0.8; }
      50% { transform: scale(1.5); opacity: 1; }
      100% { transform: scale(3); opacity: 0; }
    }
    
    .incineration-effect {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle, #ff9900, #ff3300);
      opacity: 0;
      transform: scale(0);
      animation: incinerateEffect 1.5s forwards;
    }
  `;
  document.head.appendChild(styleElem);
}

function showModernBossVictoryScreen() {
    const victoryOverlay = document.createElement('div');
    victoryOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        opacity: 0;
        transition: opacity 0.5s ease;
    `;

    const victoryContent = document.createElement('div');
    victoryContent.style.cssText = `
        background: linear-gradient(135deg, #00c6ff, #0072ff);
        padding: 2rem;
        border-radius: 20px;
        text-align: center;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    `;

    victoryContent.innerHTML = `
        <h2 style="color: white; font-size: 2.5rem; margin-bottom: 1rem;">🏆 Boss Defeated!</h2>
        <div class="victory-stats" style="display: flex; justify-content: space-around; margin: 1.5rem 0; color: white;">
            <div>
                <div style="font-size: 1.2rem; opacity: 0.7;">Words Learned</div>
                <div style="font-size: 2rem; font-weight: bold;">${currentGame.words.length}</div>
            </div>
            <div>
                <div style="font-size: 1.2rem; opacity: 0.7;">Coins Earned</div>
                <div style="font-size: 2rem; font-weight: bold;">100</div>
            </div>
        </div>
        <div style="display: flex; justify-content: center; gap: 1rem;">
            <button class="continue-btn" style="
                background: #4CAF50; 
                color: white; 
                border: none; 
                padding: 1rem 2rem; 
                border-radius: 50px; 
                font-size: 1rem; 
                cursor: pointer;
                transition: transform 0.3s ease;
            ">Continue to Next Set</button>
            <button class="home-btn" style="
                background: rgba(255,255,255,0.2); 
                color: white; 
                border: 2px solid white; 
                padding: 1rem 2rem; 
                border-radius: 50px; 
                font-size: 1rem; 
                cursor: pointer;
                transition: transform 0.3s ease;
            ">Return Home</button>
        </div>
    `;

    const continueBtn = victoryContent.querySelector('.continue-btn');
    const homeBtn = victoryContent.querySelector('.home-btn');

    [continueBtn, homeBtn].forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.05)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
        });
    });

    continueBtn.addEventListener('click', () => {
        victoryOverlay.style.opacity = '0';
        setTimeout(() => {
            victoryOverlay.remove();
            unlockNextSet();
            const nextSet = gameState.currentSet + 1;
            gameState.currentSet = nextSet;
            gameState.currentLevel = 1;
            startLevel(1);
        }, 500);
    });

    homeBtn.addEventListener('click', () => {
        victoryOverlay.style.opacity = '0';
        setTimeout(() => {
            victoryOverlay.remove();
            unlockNextSet();
            showScreen('welcome-screen');
        }, 500);
    });

    victoryOverlay.appendChild(victoryContent);
    document.body.appendChild(victoryOverlay);

    // Trigger fade-in
    requestAnimationFrame(() => {
        victoryOverlay.style.opacity = '1';
    });
}

// ADD a function to update coins after boss victory
function updateCoinsAfterBossVictory() {
    const currentCoins = gameState.coins;
    const newCoins = currentCoins;
    
    // Update gameState.coins but don't use CoinsManager to avoid duplicate animations
    gameState.coins = newCoins;
    
    // Update all coin displays with animation
    document.querySelectorAll('.coin-count').forEach(el => {
        animateCoinsChange(el, currentCoins, newCoins);
    });
    
    // Pulse the coin icons
    document.querySelectorAll('.coin-icon').forEach(icon => {
        icon.classList.add('coin-pulse');
        setTimeout(() => {
            icon.classList.remove('coin-pulse');
        }, 1500);
    });
    
    // Save progress
    saveProgress();
}

function updateStageCompletionCounters() {
    // Get all stage wrappers
    const stageWrappers = document.querySelectorAll('.stage-wrapper');
    
    stageWrappers.forEach(stageWrapper => {
      const stageId = stageWrapper.getAttribute('data-stage');
      if (!stageId) return;
      
      // Get stage structure for information about sets and levels
      const stageNum = parseInt(stageId);
      const stage = gameStructure.stages[stageNum - 1];
      if (!stage) return;
      
      // Initialize counters
      let completedSets = 0;
      const totalSets = stage.numSets;
      
      // Count completed sets by checking if all levels (including boss) are completed
      for (let setId = 1; setId <= totalSets; setId++) {
        let allLevelsComplete = true;
        
        // Check each level in the set
        for (let levelId = 1; levelId <= stage.levelsPerSet; levelId++) {
          const levelKey = `${stageNum}_${setId}_${levelId}`;
          if (!gameState.completedLevels.has(levelKey) && !gameState.perfectLevels.has(levelKey)) {
            allLevelsComplete = false;
            break;
          }
        }
        
        if (allLevelsComplete) {
          completedSets++;
        }
      }
      
      // Update the counter display
      const counterElement = stageWrapper.querySelector('.stage-status');
      if (counterElement) {
        counterElement.textContent = `${completedSets}/${totalSets} Sets Completed`;
      }
    });
  }

  function showBossVictoryNotification(coinRewardNeeded = false) {
    // CRITICAL ADDITION: Mark boss level as completed
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (stage && stage.bossLevel) {
        const bossLevelKey = `${gameState.currentStage}_${gameState.currentSet}_${stage.bossLevel}`;
        console.log(`Ensuring boss level ${bossLevelKey} is marked as completed before victory notification`);
        gameState.completedLevels.add(bossLevelKey);
        saveProgress();
    }
    
    // Apply coins only if needed (should not be needed anymore as it's done earlier)
    if (coinRewardNeeded) {
        console.log("Adding 100 coin bonus in showBossVictoryNotification");
        saveProgress();
    }
    
    // Clear animation flag
    window.bossVictoryAnimationInProgress = false;
    
    const modal = document.createElement('div');
    modal.className = 'arcade-completion-modal';
    modal.innerHTML = `
    <div class="completion-modal-content">
      <h1 style="color: var(--gold); margin-bottom: 0.5rem; font-size: 2.5rem;">
        Boss Defeated!
      </h1>
      <p style="font-size: 1.2rem; margin: 1rem 0; color: var(--success);">
        Congratulations! You've conquered this challenge!
      </p>
      
      <div class="stats-container" style="display: flex; justify-content: space-between; margin-bottom: 2rem;">
        <div class="stat-item" style="text-align: center; flex: 1;">
          <i class="fas fa-skull" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
          <div style="opacity: 0.7;">Boss Defeated</div>
          <div style="font-size: 1.5rem; color: var(--success); margin-top: 0.5rem;">✓</div>
        </div>
        <div class="stat-item" style="text-align: center; flex: 1;">
          <i class="fas fa-coins" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
          <div style="opacity: 0.7;">Bonus Coins</div>
          <div style="font-size: 1.5rem; color: var(--gold); margin-top: 0.5rem;">100</div>
        </div>
        <div class="stat-item" style="text-align: center; flex: 1;">
          <i class="fas fa-unlock" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
          <div style="opacity: 0.7;">New Set</div>
          <div style="font-size: 1.5rem; color: var(--accent); margin-top: 0.5rem;">Unlocked</div>
        </div>
      </div>
      
      <div class="set-progress-container" style="width: 100%; margin: 2rem 0; padding: 0 1rem;">
        <div style="text-align: left; margin-bottom: 0.5rem; opacity: 0.7; font-size: 0.9rem;">
          Set Completed
        </div>
        <div class="set-progress-bar" style="
          width: 100%;
          height: 10px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          overflow: hidden;
          position: relative;
        ">
          <div class="set-progress-fill" style="
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg, var(--accent), var(--gold));
            border-radius: 5px;
          "></div>
        </div>
      </div>
      
      <div class="button-container" style="display: flex; justify-content: center; gap: 1rem; margin-top: 2rem;">
        <button onclick="handleBossVictoryContinue()" class="start-button" style="
          background: var(--accent);
          color: var(--text);
          border: none;
          padding: 1rem 2.5rem;
          border-radius: 50px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 5px 15px rgba(30, 144, 255, 0.3);
        ">
          Next Set
        </button>
        <button onclick="handleBossVictoryHome()" class="start-button" style="
          background: transparent;
          color: var(--text);
          border: 2px solid var(--accent);
          padding: 1rem 2.5rem;
          border-radius: 50px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        ">
          Return Home
        </button>
      </div>
    </div>
  `;
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
}

function handleBossVictoryContinue() {
    console.log("Boss victory continue button clicked");
    
    // CRITICAL ADDITION: One last attempt to mark boss level complete
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (stage && stage.bossLevel) {
        const bossLevelKey = `${gameState.currentStage}_${gameState.currentSet}_${stage.bossLevel}`;
        console.log(`Final boss level completion check: ${bossLevelKey}`);
        gameState.completedLevels.add(bossLevelKey);
        saveProgress();
    }
    
    const modal = document.querySelector(".arcade-completion-modal");
    
    // Now that everything is complete, we can safely update all displays
    updateAllCoinDisplays();
    
    if (modal) {
        modal.classList.remove("show");
        setTimeout(() => {
            modal.remove();
            
            const bgTransition = document.querySelector(".background-transition-overlay");
            
            if (bgTransition) {
                console.log("Using existing transition overlay for smooth transition");
                bgTransition.style.background = "radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%)";
                resetBossStyles(true);
            } else {
                resetBossStyles();
            }
            
            unlockNextSet();
            
            // Get current stage configuration
            const currentStage = gameState.currentStage;
            const currentSet = gameState.currentSet;
            const stageStructure = gameStructure.stages[currentStage-1];
            
            if (!stageStructure) {
                console.error(`Invalid stage: ${currentStage}`);
                showScreen("welcome-screen");
                return;
            }
            
            const userStatus = currentUser ? currentUser.status : "unregistered";
            
            // Check if this is the last set in the stage
            const isLastSetInStage = currentSet >= stageStructure.numSets;
            
            if (isLastSetInStage) {
                // This is the last set in the stage, should move to next stage
                if (currentStage < 5) {
                    // Move to first set of next stage
                    if (currentStage >= 2 && userStatus !== "premium") {
                        // Non-premium users can't access beyond first set of stages 2-5
                        console.log("Non-premium user attempted to access next stage, showing upgrade prompt");
                        showScreen("welcome-screen");
                        setTimeout(() => {
                            showUpgradePrompt();
                        }, 500);
                        return;
                    }
                    
                    // For premium users or stage 1 users, proceed to next stage
                    gameState.currentStage += 1;
                    gameState.currentSet = 1;
                    gameState.currentLevel = 1;
                    
                    console.log(`Moving to Stage ${gameState.currentStage}, Set 1, Level 1`);
                } else {
                    // This is the final stage (5), show stage selection screen
                    console.log("Final stage completed, showing stage selection");
                    showScreen("stage-screen");
                    return;
                }
            } else {
                // Not the last set, move to next set in current stage
                const nextSet = currentSet + 1;
                
                // Premium check for stages 2-5
                if (currentStage >= 2 && nextSet > 1 && userStatus !== "premium") {
                    console.log("Non-premium user attempted to access premium set, showing upgrade prompt");
                    showScreen("welcome-screen");
                    setTimeout(() => {
                        showUpgradePrompt();
                    }, 500);
                    return;
                }
                
                gameState.currentSet = nextSet;
                gameState.currentLevel = 1;
                console.log(`Moving to Stage ${gameState.currentStage}, Set ${gameState.currentSet}, Level 1`);
            }
            
            // Save progress
            saveProgress();
            
            setTimeout(() => {
                console.log("Starting next level");
                if (bgTransition && bgTransition.parentNode) {
                    bgTransition.parentNode.removeChild(bgTransition);
                }
                startLevel(1);
            }, 500);
        }, 300);
    }
    
    // Ensure animation flag is cleared
    window.bossVictoryAnimationInProgress = false;
}

function resetBossStyles(e = false) {
  console.log("Resetting boss styles", e ? "(preserving overlay)" : "");

  // Reset boss health bar styling
  const progressCircle = document.querySelector('.progress-circle');
  if (progressCircle) {
    const progress = progressCircle.querySelector('.progress');
    if (progress) {
      progress.classList.remove('warning', 'boss-health');
      progress.style.stroke = '';  // Reset to default color
      progress.style.animation = 'none';
      
      // Force reflow to make sure animation removal takes effect
      void progress.offsetWidth;
      progress.style.animation = '';
    }
  }
  
  const t = document.getElementById("question-screen");
  if (t) {
    const n = t.querySelector(".background-transition-overlay");
    e && n && n.remove();
    t.removeAttribute("style");
    e && n && t.insertBefore(n, t.firstChild);
    e || (t.querySelectorAll(".background-transition-overlay").forEach(e => e.remove()),
    setTimeout(() => {
      t.style.background = "radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%)";
    }, 10));
  }
  
  const n = document.getElementById("question-word");
  n && n.removeAttribute("style");
  
  "function" == typeof stopBossRainingLetters && stopBossRainingLetters();
  
  const r = e ? ".incineration-effect, .boss-orb" : ".incineration-effect, .boss-orb, .background-transition-overlay";
  document.querySelectorAll(r).forEach(e => {
    e.parentNode && e.parentNode.removeChild(e);
  });
}

function handleBossVictoryHome() {
    console.log("Boss victory home button clicked");
    const modal = document.querySelector(".arcade-completion-modal");
    updateAllCoinDisplays();
    
    if (modal) {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.remove();
        resetBossStyles();
        
        // Unlock next set to record achievement
        unlockNextSet();
        
        // Mark boss level as completed for current stage/set
        const currentStage = gameState.currentStage;
        const currentSet = gameState.currentSet;
        const stageStructure = gameStructure.stages[currentStage-1];
        
        if (stageStructure && stageStructure.bossLevel) {
          const bossLevelKey = `${currentStage}_${currentSet}_${stageStructure.bossLevel}`;
          gameState.completedLevels.add(bossLevelKey);
        }
        
        // CRITICAL: Clear the stored game context to prevent auto-resuming the boss level
        localStorage.removeItem("gameContext");
        
        // Also reset current game state to prevent auto-resumption
        if (currentGame) {
          currentGame.active = false;
          currentGame.bossDefeatedEffectShown = false;
          currentGame.bossMadeComplete = false;
          currentGame.bossRewardApplied = false;
        }
        
        // Save progress
        saveProgress();
        
        // Force a true return to welcome screen
        window.location.hash = ''; // Clear any hash that might trigger resume
        showScreen("welcome-screen", true); // Pass true to force refresh
      }, 300);
    }
  }
  
  createBossStyleSheet();

function showStageCascadeScreen() {
    console.log("Showing stage cascade screen");
    
    // First, hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    
    // Then show the stage-cascade screen
    const stageCascadeScreen = document.getElementById('stage-cascade-screen');
    if (stageCascadeScreen) {
        stageCascadeScreen.classList.add('visible');
    } else {
        console.error("Stage cascade screen element not found");
        return;
    }
    
    // Now populate the content
    const stagesContainer = stageCascadeScreen.querySelector('.stages-container');
    if (!stagesContainer) {
        // Create container if it doesn't exist
        const container = document.createElement('div');
        container.className = 'stages-container';
        stageCascadeScreen.appendChild(container);
    }
    
    // Clear existing content
    stagesContainer.innerHTML = '';
    
    // Create stage wrappers for each stage
    gameStructure.stages.forEach(stage => {
        // Create stage wrapper
        const stageWrapper = document.createElement('div');
        stageWrapper.className = 'stage-wrapper';
        stageWrapper.dataset.stage = stage.id;
        
        // Get stage completion data
        const totalSets = stage.numSets;
        const unlockedSets = gameState.unlockedSets[stage.id] || new Set();
        let completedSets = 0;
        
        // Count completed sets
        unlockedSets.forEach(setId => {
            if (isSetCompleted(stage.id, setId)) {
                completedSets++;
            }
        });
        
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
        
        stagesContainer.appendChild(stageWrapper);
        
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
}

function updateStageCompletionStats() {
    const stageBlocks = document.querySelectorAll('.stage-block');
    
    stageBlocks.forEach((stageBlock, index) => {
      const stageNumber = index + 1;
      const stageStructure = gameStructure.stages[stageNumber - 1];
      
      if (!stageStructure) return;
      
      const totalSets = stageStructure.numSets;
      let completedSets = 0;
      
      // Count completed sets
      for (let setId = 1; setId <= totalSets; setId++) {
        let allLevelsInSetCompleted = true;
        
        for (let levelId = 1; levelId <= stageStructure.levelsPerSet; levelId++) {
          const levelKey = `${stageNumber}_${setId}_${levelId}`;
          if (!gameState.completedLevels.has(levelKey) && !gameState.perfectLevels.has(levelKey)) {
            allLevelsInSetCompleted = false;
            break;
          }
        }
        
        if (allLevelsInSetCompleted) {
          completedSets++;
        }
      }
      
      // Update the completion text
      const completionElement = stageBlock.querySelector('.stage-completion');
      if (completionElement) {
        completionElement.textContent = `${completedSets}/${totalSets} sets are completed`;
      }
    });
  }

  function showLevelScreen(setId) {
    gameState.currentSet = setId;
    debugUnlockState(); // Add debug call here
    
    // Clear existing screen
    const container = document.getElementById('level-container');
    if (!container) return;
    container.innerHTML = '';
    
    // Add return arrow to go back to stage-cascade screen
    const returnArrow = document.createElement('div');
    returnArrow.className = 'return-arrow';
    returnArrow.innerHTML = '<i class="fas fa-arrow-left"></i>';
    returnArrow.style.cssText = `
        position: absolute;
        top: 15px;
        left: 15px;
        font-size: 24px;
        color: var(--text);
        cursor: pointer;
        z-index: 10;
    `;
    returnArrow.onclick = function() {
        showScreen('stage-cascade-screen');
        updateStageCompletionStats(); // Update stats when returning
    };
    container.appendChild(returnArrow);
    
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (!stage) return;
    
    // Create level header
    const levelHeader = document.createElement('div');
    levelHeader.className = 'level-header';
    
    // Calculate level completion stats
    const totalLevels = stage.levelsPerSet;
    let completedCount = 0;
    let perfectCount = 0;
    
    for (let i = 1; i <= totalLevels; i++) {
        const levelKey = `${gameState.currentStage}_${setId}_${i}`;
        if (gameState.perfectLevels.has(levelKey)) {
            perfectCount++;
            completedCount++;
        } else if (gameState.completedLevels.has(levelKey)) {
            completedCount++;
        }
    }
    
    const progressPercentage = Math.round((completedCount / totalLevels) * 100);
    const setIcon = getSetIcon(gameState.currentStage, setId);
    const setDescription = getSetDescription(gameState.currentStage, setId);
    
    // Populate header
    levelHeader.innerHTML = `
        <div class="level-title-area">
            <div class="set-icon">
                <i class="${setIcon}"></i>
            </div>
            <div class="set-details">
                <div class="set-name">Stage ${gameState.currentStage} - Set ${setId}</div>
                <div class="set-desc">${setDescription}</div>
            </div>
        </div>
        <div class="set-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
            <div class="progress-text">${completedCount}/${totalLevels} levels</div>
        </div>
    `;
    
    container.appendChild(levelHeader);
    
    // Create level grid
    const levelGrid = document.createElement('div');
    levelGrid.className = 'level-grid';
    
    const testLevels = [3, 6, 9, 10, 13, 16, 19, 20];
    const setKey = `${gameState.currentStage}_${setId}`;
    
    // Ensure unlockedLevels exists for this set
    if (!gameState.unlockedLevels[setKey]) {
        gameState.unlockedLevels[setKey] = new Set([1]); // At minimum, level 1 should be unlocked
    }
    
    console.log(`Rendering levels for ${setKey}. Unlocked levels:`, 
                Array.from(gameState.unlockedLevels[setKey] || []));
    
    for (let i = 1; i <= stage.levelsPerSet; i++) {
        const levelItem = document.createElement('div');
        const levelKey = `${gameState.currentStage}_${setId}_${i}`;
        
        // Check if level is unlocked - use more direct access with fallback
        const isUnlocked = gameState.unlockedLevels[setKey]?.has(i);
        console.log(`Level ${i} unlocked:`, isUnlocked);
        
        const isPerfect = gameState.perfectLevels.has(levelKey);
        const isCompleted = gameState.completedLevels.has(levelKey);
        const isBossLevel = i === stage.bossLevel;
        const isTestLevel = testLevels.includes(i);
        
        // Set appropriate classes
        levelItem.className = 'level-item';
        if (isUnlocked) levelItem.classList.add('unlocked');
        if (isPerfect) levelItem.classList.add('perfect');
        else if (isCompleted) levelItem.classList.add('completed');
        if (isBossLevel) levelItem.classList.add('boss');
        if (isTestLevel) levelItem.classList.add('test');
        if (!isUnlocked) levelItem.classList.add('locked');
        
        levelItem.textContent = i;
        
        if (isUnlocked) {
            levelItem.onclick = () => startLevel(i);
        }
        
        levelGrid.appendChild(levelItem);
    }
    
    container.appendChild(levelGrid);
    
    // Add legend
    const legend = document.createElement('div');
    legend.className = 'level-type-legend';
    legend.innerHTML = `
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--accent), rgba(30, 144, 255, 0.7));"></div>
            <span>Normal</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--success), #45b649);"></div>
            <span>Completed</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--gold), #FFA500);"></div>
            <span>Perfect</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--gold), var(--accent));"></div>
            <span>Boss</span>
        </div>
    `;
    
    container.appendChild(legend);
    
    // Show the screen
    showScreen('level-screen');
}

// Add this to the existing styles or in a style tag
function addReturnArrowStyles() {
  const styleElement = document.createElement('style');
  styleElement.id = 'return-arrow-styles';
  styleElement.textContent = `
    .return-arrow {
      transition: transform 0.2s ease, color 0.2s ease;
    }
    .return-arrow:hover {
      transform: scale(1.2);
      color: var(--accent);
    }
  `;
  document.head.appendChild(styleElement);
}

// Call this on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  // Add other initializations
  addReturnArrowStyles();
});

// Helper functions for the level screen
function getSetIcon(stageId, setId) {
    const baseIcons = {
        1: 'fas fa-book',
        2: 'fas fa-graduation-cap',
        3: 'fas fa-school',
        4: 'fas fa-university',
        5: 'fas fa-brain'
    };
    
    // Adjust icon based on set number
    const variations = [
        'fas fa-book-open', 
        'fas fa-book-reader', 
        'fas fa-bookmark', 
        'fas fa-pencil-alt',
        'fas fa-pen'
    ];
    
    // Use base icon for first set, variations for others
    return setId === 1 ? baseIcons[stageId] || 'fas fa-star' : 
        variations[(setId - 2) % variations.length] || 'fas fa-star';
}

function getSetDescription(stageId, setId) {
    const stageNames = {
        1: 'Beginner',
        2: 'Elementary',
        3: 'Intermediate',
        4: 'Advanced',
        5: 'Expert'
    };
    
    // Generic descriptions that combine stage and set
    return `${stageNames[stageId] || 'Advanced'} vocabulary - Group ${setId}`;
}

function isSetCompleted(stageId, setId) {
    // Get stage structure to know how many levels and if there's a boss
    const stage = gameStructure.stages[stageId - 1];
    if (!stage) return false;
    
    // Console log for debugging
    console.log(`Checking if set ${stageId}-${setId} is completed...`);
    
    // Check each level in the set
    for (let levelId = 1; levelId <= stage.levelsPerSet; levelId++) {
        const levelKey = `${stageId}_${setId}_${levelId}`;
        const isBossLevel = (levelId === stage.bossLevel);
        
        // Debug log to see which levels are completed
        console.log(`Level ${levelKey}: Completed=${gameState.completedLevels.has(levelKey)}, Perfect=${gameState.perfectLevels.has(levelKey)}`);
        
        // If any level (including boss) isn't completed, the set isn't complete
        if (!gameState.completedLevels.has(levelKey) && !gameState.perfectLevels.has(levelKey)) {
            console.log(`Set ${stageId}-${setId} is NOT completed because level ${levelId} is not completed`);
            return false;
        }
    }
    
    // If we got here, all levels are completed
    console.log(`Set ${stageId}-${setId} is COMPLETED!`);
    return true;
}

  function updateLevelAndSetCompletionStatus() {
    // Update level indicators
    document.querySelectorAll('.level-item').forEach(levelItem => {
      // Parse level details from custom attributes or data
      const levelId = parseInt(levelItem.textContent);
      const setId = gameState.currentSet;
      const stageId = gameState.currentStage;
      
      if (!levelId || !setId || !stageId) return;
      
      const levelKey = `${stageId}_${setId}_${levelId}`;
      const isBossLevel = levelItem.classList.contains('boss');
      
      // Update visuals based on completion status
      if (gameState.perfectLevels.has(levelKey)) {
        levelItem.classList.add('perfect');
        levelItem.classList.add('completed');
      } else if (gameState.completedLevels.has(levelKey)) {
        levelItem.classList.add('completed');
      }
    });
    
    // Update set completion status
    const currentSetId = gameState.currentSet;
    const currentStageId = gameState.currentStage;
    
    if (currentSetId && currentStageId) {
      // Find the corresponding set button
      const setButton = document.querySelector(`.set-button[data-set-id="${currentSetId}"][data-stage-id="${currentStageId}"]`);
      
      if (setButton && isSetCompleted(currentStageId, currentSetId)) {
        setButton.classList.add('completed');
        
        // Check if ALL levels are perfect to add gold effect
        const stage = gameStructure.stages[currentStageId - 1];
        if (!stage) return;
        
        let allPerfect = true;
        for (let levelId = 1; levelId <= stage.levelsPerSet; levelId++) {
          const levelKey = `${currentStageId}_${currentSetId}_${levelId}`;
          if (!gameState.perfectLevels.has(levelKey)) {
            allPerfect = false;
            break;
          }
        }
        
        if (allPerfect) {
          setButton.classList.add('fully-completed');
        }
      }
    }
    
    // Update stage completion counters
    updateStageCompletionStats();
  }
  
  /**
   * Mark a level as completed, including boss levels
   * @param {number} levelId - The level ID to mark completed
   * @param {boolean} isPerfect - Whether the level was completed perfectly
   */
  function markLevelCompleted(levelId, isPerfect = false) {
    const stageId = gameState.currentStage;
    const setId = gameState.currentSet;
    
    if (!stageId || !setId) return;
    
    const levelKey = `${stageId}_${setId}_${levelId}`;
    
    // Add to completed levels
    gameState.completedLevels.add(levelKey);
    
    // If perfect, add to perfect levels too
    if (isPerfect) {
      gameState.perfectLevels.add(levelKey);
    }
    
    // Unlock next level if there is one
    const stage = gameStructure.stages[stageId - 1];
    if (!stage) return;
    
    // Set up set key
    const setKey = `${stageId}_${setId}`;
    
    // Initialize if needed
    if (!gameState.unlockedLevels[setKey]) {
      gameState.unlockedLevels[setKey] = new Set([1]);
    }
    
    // Unlock next level if not at max
    if (levelId < stage.levelsPerSet) {
      gameState.unlockedLevels[setKey].add(levelId + 1);
    }
    
    // Check if set is complete
    if (isSetCompleted(stageId, setId)) {
      // Unlock next set if there is one
      const nextSetId = setId + 1;
      if (nextSetId <= stage.numSets) {
        if (!gameState.unlockedSets[stageId]) {
          gameState.unlockedSets[stageId] = new Set([1]); // At minimum, set 1 is unlocked
        }
        gameState.unlockedSets[stageId].add(nextSetId);
      }
    }
    
    // Update UI
    updateLevelAndSetCompletionStatus();
    
    // Trigger event for listeners
    const event = new CustomEvent('levelCompleted', { 
      detail: { levelId, stageId, setId, isPerfect } 
    });
    document.dispatchEvent(event);
    
    // Save game state
    saveGameState();
  }

// ADD this standalone function
function markBossLevelCompleted(isPerfect = false) {
    // Don't mark if already marked
    if (currentGame && currentGame.bossMadeComplete) {
      console.log("Boss already marked as complete, skipping");
      return;
    }
    
    // Get stage config to find boss level number
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (!stage || !stage.bossLevel) {
      console.error("Cannot find boss level for current stage");
      return;
    }
    
    // Create the level key using the same format used elsewhere
    const levelKey = `${gameState.currentStage}_${gameState.currentSet}_${stage.bossLevel}`;
    
    console.log(`Marking boss level as completed: ${levelKey}`);
    
    // Add to completed levels
    gameState.completedLevels.add(levelKey);
    
    // If perfect, add to perfect levels too
    if (isPerfect) {
      gameState.perfectLevels.add(levelKey);
    }
    
    // Flag to prevent adding multiple times
    if (currentGame) {
      currentGame.bossMadeComplete = true;
    }
    
    // Save game progress - crucial for persistence
    if (typeof saveProgress === 'function') {
      saveProgress();
      console.log("Progress saved after boss completion");
    } else {
      console.warn("saveProgress function not found!");
    }
    
    // Log for verification
    console.log(`After marking - Boss completed: ${gameState.completedLevels.has(levelKey)}`);
    console.log(`All completed levels:`, Array.from(gameState.completedLevels));
    
    // Force refresh UI
    if (typeof showLevelScreen === 'function') {
      console.log("Refreshing level screen");
      setTimeout(() => showLevelScreen(gameState.currentSet), 100);
    }
  }

  function updateBossHealthBar() {
    // Only update if we're in boss level
    if (!currentGame.isBossLevel) return;
    
    console.log("Updating boss health bar");
  
    const progressCircle = document.querySelector('.progress-circle');
    if (!progressCircle) {
      console.error("Progress circle not found");
      return;
    }
    
    const progress = progressCircle.querySelector('.progress');
    if (!progress) {
      console.error("Progress element not found");
      return;
    }
    
    // Calculate health values
    const totalWords = currentGame.words.length;
    const currentIndex = currentGame.currentIndex || 0;
    const remainingWords = Math.max(0, totalWords - currentIndex);
    const remainingPercentage = remainingWords / totalWords;
    
    console.log(`Boss health: ${remainingPercentage.toFixed(2) * 100}% (${remainingWords}/${totalWords})`);
    
    // Calculate the circumference
    const circumference = 2 * Math.PI * 54;
    
    // Update the stroke dash offset (reverse of normal progress)
    progress.style.strokeDashoffset = circumference * (1 - remainingPercentage);
    
    // Add boss-health class if not already present
    if (!progress.classList.contains('boss-health')) {
      progress.classList.add('boss-health');
    }
    
    // Change color based on health
    if (remainingPercentage > 0.66) {
      // Full health - green
      progress.style.stroke = '#4CAF50';
      progress.classList.remove('warning');
    } else if (remainingPercentage > 0.33) {
      // Medium health - yellow/orange
      progress.style.stroke = '#FFA500';
      progress.classList.remove('warning');
      
      // Boss health restoration at 2/3 health (once)
      if (remainingPercentage <= 0.66 && !currentGame.bossFirstHealthRestored) {
        currentGame.bossFirstHealthRestored = true;
        console.log("First boss health restoration");
        
        // Partially restore health (reduce current index)
        const newIndex = Math.floor(totalWords * 0.25); // 75% health
        currentGame.currentIndex = newIndex;
        
        // Show visual effect
        const bossOrb = document.querySelector('.boss-orb-inner');
        if (bossOrb) {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #FFEB3B, #FFA500)';
          setTimeout(() => {
            bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
          }, 1000);
        }
        
        // Update health bar after restoring
        setTimeout(() => updateBossHealthBar(), 100);
      }
    } else {
      // Low health - red
      progress.style.stroke = '#FF3333';
      progress.classList.add('warning');
      
      // Boss health restoration at 1/3 health (once)
      if (remainingPercentage <= 0.33 && !currentGame.bossSecondHealthRestored) {
        currentGame.bossSecondHealthRestored = true;
        console.log("Second boss health restoration");
        
        // Partially restore health (reduce current index)
        const newIndex = Math.floor(totalWords * 0.5); // 50% health
        currentGame.currentIndex = newIndex;
        
        // Show visual effect
        const bossOrb = document.querySelector('.boss-orb-inner');
        if (bossOrb) {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #4CAF50, #388E3C)';
          setTimeout(() => {
            bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
          }, 1000);
        }
        
        // Update health bar after restoring
        setTimeout(() => updateBossHealthBar(), 100);
      }
    }
  }
  
  function healBoss(newHealthPercentage, flashColor) {
    const progressCircle = document.querySelector('.progress-circle');
    const progress = progressCircle ? progressCircle.querySelector('.progress') : null;
    const bossOrb = document.querySelector('.boss-orb-inner');
    
    if (!progress || !bossOrb) return;
    
    // Flash the boss orb with the specified color
    const originalColor = bossOrb.style.background;
    bossOrb.style.background = flashColor;
    bossOrb.classList.add('boss-restore-health');
    
    // Flash the screen
    const questionScreen = document.querySelector('.question-screen');
    if (questionScreen) {
      questionScreen.style.animation = 'none';
      questionScreen.offsetHeight; // Trigger reflow
      questionScreen.style.animation = 'bossRestoreHealth 1s';
    }
    
    // Calculate new offset
    const circumference = 2 * Math.PI * 54;
    const newOffset = circumference * (1 - newHealthPercentage);
    
    // Animate health bar filling
    setTimeout(() => {
      progress.style.transition = 'stroke-dashoffset 1s ease-out';
      progress.style.strokeDashoffset = newOffset;
      
      // Reset boss orb
      setTimeout(() => {
        bossOrb.style.background = originalColor;
        bossOrb.classList.remove('boss-restore-health');
      }, 1000);
    }, 300);
  }
  
  function showBossHitEffect(randomColor = false) {
    const bossOrb = document.querySelector('.boss-orb-inner');
    if (!bossOrb) return;
    
    // Store original background
    const originalBg = bossOrb.style.background;
    
    // Apply random color if requested
    if (randomColor) {
      const colors = ['yellow', 'purple', 'turquoise', 'darkgreen', 'brown'];
      const randomColorChoice = colors[Math.floor(Math.random() * colors.length)];
      bossOrb.style.background = `radial-gradient(circle at 30% 30%, ${randomColorChoice}, #990000)`;
    }
    
    // Add hit effect
    bossOrb.classList.add('boss-orb-hit');
    
    // Reset after animation
    setTimeout(() => {
      bossOrb.classList.remove('boss-orb-hit');
      // Reset background only if we changed it
      if (randomColor) {
        bossOrb.style.background = originalBg;
      }
    }, 300);
  }
  
  
  function applyBossLevelStyles() {
    console.log("Forcefully applying boss level styles");
    
    const questionScreen = document.getElementById("question-screen");
    if (questionScreen) {
      questionScreen.style.setProperty("background", "linear-gradient(135deg, #800000, #3a0000)", "important");
      questionScreen.style.setProperty("animation", "pulseBg 4s infinite", "important");
    }
    
    // Add boss animations stylesheet if not already present
    if (!document.getElementById("boss-animations")) {
      const styleElem = document.createElement("style");
      styleElem.id = "boss-animations";
      styleElem.textContent = `
        @keyframes pulseBg {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.2); }
        }
        
        @keyframes pulseOrb {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.3); filter: brightness(1.4); }
        }
        
        @keyframes pulseWord {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `;
      document.head.appendChild(styleElem);
    }
    
    // Style the question word
    const questionWord = document.getElementById("question-word");
    if (questionWord) {
      questionWord.style.setProperty("color", "#ff3333", "important");
      questionWord.style.setProperty("text-shadow", "0 0 10px rgba(255, 0, 0, 0.5)", "important");
      questionWord.style.setProperty("animation", "pulseWord 2s infinite", "important");
    }
    
    // Replace coins container with boss orb
    const coinsContainer = document.querySelector(".coins-container");
    if (coinsContainer) {
      if (!window.originalCoinsHTML) {
        window.originalCoinsHTML = coinsContainer.innerHTML;
      }
      
      coinsContainer.innerHTML = `
      <div class="boss-orb" style="
        width: 85px;
        height: 85px;
        top: 50%;
        left: 50%;
        transform: translate(-75%, -75%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      ">
        <div class="boss-orb-inner" style="
          width: 50px;
          height: 50px;
          background: radial-gradient(circle at 30% 30%, #ff3333, #990000);
          border-radius: 50%;
          box-shadow: 0 0 20px #ff3333, inset 0 0 10px rgba(255,255,255,0.3);
          animation: pulseOrb 1s infinite;
        "></div>
      </div>
    `;
    }
  }
  
  function handleBossAnswer(correct) {
    if (correct) {
      // Make progress bar flicker
      const progressCircle = document.querySelector(".progress-circle");
      const progressBar = progressCircle?.querySelector(".progress");
      
      if (progressBar) {
        // Save original stroke color
        const originalColor = progressBar.style.stroke;
        
        // Create and apply flicker animation
        const flickerColors = ["#ffffff", "#ffff00", "#800080", "#990000"];
        const randomColor = flickerColors[Math.floor(Math.random() * flickerColors.length)];
        
        progressBar.style.transition = "stroke 0.2s ease";
        progressBar.style.stroke = randomColor;
        
        // Reset back to green after flicker
        setTimeout(() => {
          progressBar.style.stroke = originalColor;
        }, 200);
      }
    }
  }
  
  // Boss Level Visual and Interaction Enhancements
  
  function createBossTimer() {
      const timerContainer = document.createElement('div');
      timerContainer.id = 'boss-timer';
      timerContainer.style.cssText = `
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          justify-content: center;
          z-index: 10;
      `;
      
      const timerDisplay = document.createElement('div');
      timerDisplay.style.cssText = `
          background-color: rgba(255, 215, 0, 0.8);
          color: #000;
          font-family: 'Digital', monospace;
          font-size: 2rem;
          padding: 5px 10px;
          border-radius: 5px;
          letter-spacing: 3px;
      `;
      
      timerContainer.appendChild(timerDisplay);
      return { container: timerContainer, display: timerDisplay };
  }
  
  function updateBossTimer(timerDisplay, timeRemaining) {
      if (timerDisplay) {
          const minutes = Math.floor(timeRemaining / 60);
          const seconds = timeRemaining % 60;
          timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
  }
  
  function createLightningEffect() {
      const lightningContainer = document.createElement('div');
      lightningContainer.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.8);
          z-index: 1000;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.1s ease;
      `;
      document.body.appendChild(lightningContainer);
  
      const flickerCount = Math.floor(Math.random() * 3) + 1;
      let delay = 0;
  
      for (let i = 0; i < flickerCount; i++) {
          setTimeout(() => {
              lightningContainer.style.opacity = '1';
              setTimeout(() => {
                  lightningContainer.style.opacity = '0';
              }, 50);
          }, delay);
          delay += 200;
      }
  
      setTimeout(() => {
          document.body.removeChild(lightningContainer);
      }, delay + 500);
  }
  
  function createBossRainingLetters() {
      const questionScreen = document.getElementById('question-screen');
      if (!questionScreen) return;
  
      // Clear any existing intervals
      if (window.rainingLettersInterval) {
          clearInterval(window.rainingLettersInterval);
      }
  
      const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'אבגדהוזחטיכלמנסעפצקרשת'];
      const screenWidth = questionScreen.clientWidth;
  
      window.rainingLettersInterval = setInterval(() => {
          const particleCount = Math.floor(Math.random() * 3) + 1;
          
          for (let i = 0; i < particleCount; i++) {
              const letter = document.createElement('div');
              letter.className = 'boss-raining-letter';
              letter.textContent = letters[Math.floor(Math.random() * letters.length)];
              
              letter.style.cssText = `
                  position: absolute;
                  top: -20px;
                  left: ${Math.random() * screenWidth}px;
                  color: rgba(255, 0, 0, 0.4);
                  font-size: 16px;
                  animation: boss-letter-rain 5s linear forwards;
                  z-index: 1;
                  text-shadow: 0 0 5px rgba(255, 0, 0, 0.3);
              `;
  
              questionScreen.appendChild(letter);
  
              // Remove letter after animation
              setTimeout(() => {
                  if (letter.parentNode === questionScreen) {
                      questionScreen.removeChild(letter);
                  }
              }, 5000);
          }
      }, 300);
  }
  
  function stopBossRainingLetters() {
      if (window.rainingLettersInterval) {
          clearInterval(window.rainingLettersInterval);
          window.rainingLettersInterval = null;
      }
  }
  
  function createBossStyleSheet() {
    const styleElem = document.createElement("style");
    styleElem.id = "boss-level-styles";
    styleElem.textContent = `
      @keyframes boss-letter-rain {
        0% { 
          transform: translateY(-20px);
          opacity: 0.6;
        }
        100% { 
          transform: translateY(100vh);
          opacity: 0;
        }
      }
  
      @keyframes boss-shrink {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(0.8); opacity: 0.8; }
        100% { transform: scale(0); opacity: 0; }
      }
  
      @keyframes fade-to-blue {
        0% { background: linear-gradient(135deg, #800000, #3a0000); }
        20% { background: linear-gradient(135deg, #800000, #3a0000); }
        60% { background: linear-gradient(135deg, #4a1582, #0d47a1); }
        100% { background: radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%); }
      }
      
      @keyframes incinerateEffect {
        0% { transform: scale(0); opacity: 0; }
        10% { transform: scale(0.5); opacity: 0.8; }
        50% { transform: scale(1.5); opacity: 1; }
        100% { transform: scale(3); opacity: 0; }
      }
      
      .incineration-effect {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: radial-gradient(circle, #ff9900, #ff3300);
        opacity: 0;
        transform: scale(0);
        animation: incinerateEffect 1.5s forwards;
      }
    `;
    document.head.appendChild(styleElem);
  }
  
  function showModernBossVictoryScreen() {
      const victoryOverlay = document.createElement('div');
      victoryOverlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          opacity: 0;
          transition: opacity 0.5s ease;
      `;
  
      const victoryContent = document.createElement('div');
      victoryContent.style.cssText = `
          background: linear-gradient(135deg, #00c6ff, #0072ff);
          padding: 2rem;
          border-radius: 20px;
          text-align: center;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      `;
  
      victoryContent.innerHTML = `
          <h2 style="color: white; font-size: 2.5rem; margin-bottom: 1rem;">🏆 Boss Defeated!</h2>
          <div class="victory-stats" style="display: flex; justify-content: space-around; margin: 1.5rem 0; color: white;">
              <div>
                  <div style="font-size: 1.2rem; opacity: 0.7;">Words Learned</div>
                  <div style="font-size: 2rem; font-weight: bold;">${currentGame.words.length}</div>
              </div>
              <div>
                  <div style="font-size: 1.2rem; opacity: 0.7;">Coins Earned</div>
                  <div style="font-size: 2rem; font-weight: bold;">100</div>
              </div>
          </div>
          <div style="display: flex; justify-content: center; gap: 1rem;">
              <button class="continue-btn" style="
                  background: #4CAF50; 
                  color: white; 
                  border: none; 
                  padding: 1rem 2rem; 
                  border-radius: 50px; 
                  font-size: 1rem; 
                  cursor: pointer;
                  transition: transform 0.3s ease;
              ">Continue to Next Set</button>
              <button class="home-btn" style="
                  background: rgba(255,255,255,0.2); 
                  color: white; 
                  border: 2px solid white; 
                  padding: 1rem 2rem; 
                  border-radius: 50px; 
                  font-size: 1rem; 
                  cursor: pointer;
                  transition: transform 0.3s ease;
              ">Return Home</button>
          </div>
      `;
  
      const continueBtn = victoryContent.querySelector('.continue-btn');
      const homeBtn = victoryContent.querySelector('.home-btn');
  
      [continueBtn, homeBtn].forEach(btn => {
          btn.addEventListener('mouseenter', () => {
              btn.style.transform = 'scale(1.05)';
          });
          btn.addEventListener('mouseleave', () => {
              btn.style.transform = 'scale(1)';
          });
      });
  
      continueBtn.addEventListener('click', () => {
          victoryOverlay.style.opacity = '0';
          setTimeout(() => {
              victoryOverlay.remove();
              unlockNextSet();
              const nextSet = gameState.currentSet + 1;
              gameState.currentSet = nextSet;
              gameState.currentLevel = 1;
              startLevel(1);
          }, 500);
      });
  
      homeBtn.addEventListener('click', () => {
          victoryOverlay.style.opacity = '0';
          setTimeout(() => {
              victoryOverlay.remove();
              unlockNextSet();
              showScreen('welcome-screen');
          }, 500);
      });
  
      victoryOverlay.appendChild(victoryContent);
      document.body.appendChild(victoryOverlay);
  
      // Trigger fade-in
      requestAnimationFrame(() => {
          victoryOverlay.style.opacity = '1';
      });
  }
  
  function showBossDefeatEffect() {
      console.log('Starting boss defeat effect sequence');
      
      if (currentGame.bossDefeatedEffectShown) {
          console.log('Boss defeat effect already shown, skipping');
          return;
      }
      
      // Set animation flag to block other coin updates
      window.bossVictoryAnimationInProgress = true;
      
      // Set flag to prevent multiple executions
      currentGame.bossDefeatedEffectShown = true;
      
      // Store current coin value for animation
      const originalCoins = gameState.coins;
      const targetCoins = originalCoins + 100;
      
      // Flag that we've acknowledged the boss reward
      currentGame.bossRewardApplied = true;
      
      // Background transition
      const questionScreen = document.querySelector('.question-screen');
      if (questionScreen) {
          console.log('Creating background transition overlay');
          
          const transitionOverlay = document.createElement('div');
          transitionOverlay.className = 'background-transition-overlay';
          transitionOverlay.style.cssText = `
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: linear-gradient(135deg, #800000, #3a0000); 
              z-index: -1;
              animation: fade-to-blue 5s ease-in-out forwards;
              pointer-events: none;
          `;
          
          questionScreen.insertBefore(transitionOverlay, questionScreen.firstChild);
          markBossLevelCompleted(false); // Pass true if boss was defeated perfectly
        }
      
      // Boss orb disappearing animation
      setTimeout(() => {
          const bossOrb = document.querySelector('.boss-orb-inner');
          
          if (bossOrb) {
              console.log('Disintegrating boss orb');
              
              const incinerationEffect = document.createElement('div');
              incinerationEffect.className = 'incineration-effect';
              bossOrb.appendChild(incinerationEffect);
              
              bossOrb.style.animation = 'boss-shrink 2.5s forwards';
              
              // After boss orb starts disappearing, show coin animation
              setTimeout(() => {
                  console.log('Applying coin reward animation');
                  
                  const coinsContainer = document.querySelector('.coins-container');
                  
                  if (coinsContainer && window.originalCoinsHTML) {
                      // Restore original coins HTML
                      coinsContainer.innerHTML = window.originalCoinsHTML;
                      
                      // Protect ALL coin displays from other updates during animation
                      document.querySelectorAll('.coin-count').forEach(el => {
                          el.dataset.protectedValue = 'true';
                          el.textContent = originalCoins;
                      });
                      
                      const coinIcon = coinsContainer.querySelector('.coin-icon');
                      const coinCount = coinsContainer.querySelector('.coin-count');
                      
                      if (coinCount) {
                          // Make it prominent
                          coinsContainer.style.transform = 'scale(1.2)';
                          coinsContainer.style.transition = 'transform 0.3s ease';
                          
                          // Visual animation for the 100 coins
                          const steps = 60;
                          const stepDelay = 2000 / steps;
                          let currentStep = 0;
                          
                          const animateCoins = () => {
                              if (currentStep <= steps) {
                                  const progress = currentStep / steps;
                                  const currentValue = Math.round(originalCoins + (targetCoins - originalCoins) * progress);
                                  
                                  // Update ALL coin displays
                                  document.querySelectorAll('.coin-count').forEach(el => {
                                      el.textContent = currentValue;
                                      el.style.color = 'var(--gold)';
                                      el.style.textShadow = '0 0 10px var(--gold)';
                                  });
                                  
                                  currentStep++;
                                  setTimeout(animateCoins, stepDelay);
                              } else {
                                  // Animation complete - update actual game state
                                  gameState.coins = targetCoins;
                                  saveProgress();
                                  
                                  // Ensure final value shown matches target on all displays
                                  document.querySelectorAll('.coin-count').forEach(el => {
                                      el.textContent = targetCoins;
                                      delete el.dataset.protectedValue;
                                  });
                                  
                                  // Maintain emphasis for a while
                                  setTimeout(() => {
                                      document.querySelectorAll('.coin-count').forEach(el => {
                                          el.style.color = '';
                                          el.style.textShadow = '';
                                      });
                                      coinsContainer.style.transform = 'scale(1)';
                                  }, 1000);
                              }
                          };
                          
                          // Start animation
                          animateCoins();
                          
                          // Pulse coin icon
                          if (coinIcon) {
                              coinIcon.classList.add('coin-pulse');
                              coinIcon.style.animation = 'coinPulse 0.5s ease-in-out 6';
                          }
                      }
                  }
              }, 500);
              
              // Show victory notification after animations
              setTimeout(() => {
                  console.log('Showing victory notification');
                  
                  // Victory notification does NOT need to add coins again
                  showBossVictoryNotification(false);
              }, 5000);
          } else {
              setTimeout(() => {
                  showBossVictoryNotification(false);
              }, 3000);
          }
      }, 1000);
  
      // Add animation styles if needed
      if (!document.getElementById('boss-transition-style')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'boss-transition-style';
          styleEl.textContent = `
              @keyframes fade-to-blue {
                  0% { background: linear-gradient(135deg, #800000, #3a0000); }
                  20% { background: linear-gradient(135deg, #800000, #3a0000); }
                  60% { background: linear-gradient(135deg, #4a1582, #0d47a1); }
                  100% { background: radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%); }
              }
              
              @keyframes boss-shrink {
                  0% { transform: scale(1); opacity: 1; }
                  30% { transform: scale(0.8); opacity: 0.8; }
                  100% { transform: scale(0); opacity: 0; }
              }
          `;
          document.head.appendChild(styleEl);
      }
  }
  
  // ADD a function to update coins after boss victory
  function updateCoinsAfterBossVictory() {
      const currentCoins = gameState.coins;
      const newCoins = currentCoins;
      
      // Update gameState.coins but don't use CoinsManager to avoid duplicate animations
      gameState.coins = newCoins;
      
      // Update all coin displays with animation
      document.querySelectorAll('.coin-count').forEach(el => {
          animateCoinsChange(el, currentCoins, newCoins);
      });
      
      // Pulse the coin icons
      document.querySelectorAll('.coin-icon').forEach(icon => {
          icon.classList.add('coin-pulse');
          setTimeout(() => {
              icon.classList.remove('coin-pulse');
          }, 1500);
      });
      
      // Save progress
      saveProgress();
  }
  
  function showBossVictoryNotification(coinRewardNeeded = false) {
      // Apply coins only if needed (should not be needed anymore as it's done earlier)
      if (coinRewardNeeded) {
          console.log("Adding 100 coin bonus in showBossVictoryNotification");
          saveProgress();
      }
      
      // Clear animation flag
      window.bossVictoryAnimationInProgress = false;
      
      const modal = document.createElement('div');
      modal.className = 'arcade-completion-modal';
      modal.innerHTML = `
      <div class="completion-modal-content">
        <h1 style="color: var(--gold); margin-bottom: 0.5rem; font-size: 2.5rem;">
          Boss Defeated!
        </h1>
        <p style="font-size: 1.2rem; margin: 1rem 0; color: var(--success);">
          Congratulations! You've conquered this challenge!
        </p>
        
        <div class="stats-container" style="display: flex; justify-content: space-between; margin-bottom: 2rem;">
          <div class="stat-item" style="text-align: center; flex: 1;">
            <i class="fas fa-skull" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
            <div style="opacity: 0.7;">Boss Defeated</div>
            <div style="font-size: 1.5rem; color: var(--success); margin-top: 0.5rem;">✓</div>
          </div>
          <div class="stat-item" style="text-align: center; flex: 1;">
            <i class="fas fa-coins" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
            <div style="opacity: 0.7;">Bonus Coins</div>
            <div style="font-size: 1.5rem; color: var(--gold); margin-top: 0.5rem;">100</div>
          </div>
          <div class="stat-item" style="text-align: center; flex: 1;">
            <i class="fas fa-unlock" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
            <div style="opacity: 0.7;">New Set</div>
            <div style="font-size: 1.5rem; color: var(--accent); margin-top: 0.5rem;">Unlocked</div>
          </div>
        </div>
        
        <div class="set-progress-container" style="width: 100%; margin: 2rem 0; padding: 0 1rem;">
          <div style="text-align: left; margin-bottom: 0.5rem; opacity: 0.7; font-size: 0.9rem;">
            Set Completed
          </div>
          <div class="set-progress-bar" style="
            width: 100%;
            height: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 5px;
            overflow: hidden;
            position: relative;
          ">
            <div class="set-progress-fill" style="
              position: absolute;
              top: 0;
              left: 0;
              height: 100%;
              width: 100%;
              background: linear-gradient(90deg, var(--accent), var(--gold));
              border-radius: 5px;
            "></div>
          </div>
        </div>
        
        <div class="button-container" style="display: flex; justify-content: center; gap: 1rem; margin-top: 2rem;">
          <button onclick="handleBossVictoryContinue()" class="start-button" style="
            background: var(--accent);
            color: var(--text);
            border: none;
            padding: 1rem 2.5rem;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 5px 15px rgba(30, 144, 255, 0.3);
          ">
            Next Set
          </button>
          <button onclick="handleBossVictoryHome()" class="start-button" style="
            background: transparent;
            color: var(--text);
            border: 2px solid var(--accent);
            padding: 1rem 2.5rem;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          ">
            Return Home
          </button>
        </div>
      </div>
    `;
      
      document.body.appendChild(modal);
      requestAnimationFrame(() => modal.classList.add('show'));
  }
  
  function handleBossVictoryContinue() {
    console.log("Boss victory continue button clicked");
    const modal = document.querySelector(".arcade-completion-modal");
    
    // Now that everything is complete, we can safely update all displays
    updateAllCoinDisplays();
    
    if (modal) {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.remove();
        
        const bgTransition = document.querySelector(".background-transition-overlay");
        
        if (bgTransition) {
          console.log("Using existing transition overlay for smooth transition");
          bgTransition.style.background = "radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%)";
          resetBossStyles(true);
        } else {
          resetBossStyles();
        }
        
        unlockNextSet();
        
        // Get current stage configuration
        const currentStage = gameState.currentStage;
        const currentSet = gameState.currentSet;
        const stageStructure = gameStructure.stages[currentStage-1];
        
        if (!stageStructure) {
          console.error(`Invalid stage: ${currentStage}`);
          showScreen("welcome-screen");
          return;
        }
        
        const userStatus = currentUser ? currentUser.status : "unregistered";
        
        // Check if this is the last set in the stage
        const isLastSetInStage = currentSet >= stageStructure.numSets;
        
        if (isLastSetInStage) {
          // This is the last set in the stage, should move to next stage
          if (currentStage < 5) {
            // Move to first set of next stage
            if (currentStage >= 2 && userStatus !== "premium") {
              // Non-premium users can't access beyond first set of stages 2-5
              console.log("Non-premium user attempted to access next stage, showing upgrade prompt");
              showScreen("welcome-screen");
              setTimeout(() => {
                showUpgradePrompt();
              }, 500);
              return;
            }
            
            // For premium users or stage 1 users, proceed to next stage
            gameState.currentStage += 1;
            gameState.currentSet = 1;
            gameState.currentLevel = 1;
            
            console.log(`Moving to Stage ${gameState.currentStage}, Set 1, Level 1`);
          } else {
            // This is the final stage (5), show stage selection screen
            console.log("Final stage completed, showing stage selection");
            showScreen("stage-screen");
            return;
          }
        } else {
          // Not the last set, move to next set in current stage
          const nextSet = currentSet + 1;
          
          // Premium check for stages 2-5
          if (currentStage >= 2 && nextSet > 1 && userStatus !== "premium") {
            console.log("Non-premium user attempted to access premium set, showing upgrade prompt");
            showScreen("welcome-screen");
            setTimeout(() => {
              showUpgradePrompt();
            }, 500);
            return;
          }
          
          gameState.currentSet = nextSet;
          gameState.currentLevel = 1;
          console.log(`Moving to Stage ${gameState.currentStage}, Set ${gameState.currentSet}, Level 1`);
        }
        
        // Save progress
        saveProgress();
        
        setTimeout(() => {
          console.log("Starting next level");
          if (bgTransition && bgTransition.parentNode) {
            bgTransition.parentNode.removeChild(bgTransition);
          }
          startLevel(1);
        }, 500);
      }, 300);
    }
    
    // Ensure animation flag is cleared
    window.bossVictoryAnimationInProgress = false;
  }
  
  function resetBossStyles(e = false) {
    console.log("Resetting boss styles", e ? "(preserving overlay)" : "");
  
    // Reset boss health bar styling
    const progressCircle = document.querySelector('.progress-circle');
    if (progressCircle) {
      const progress = progressCircle.querySelector('.progress');
      if (progress) {
        progress.classList.remove('warning', 'boss-health');
        progress.style.stroke = '';  // Reset to default color
        progress.style.animation = 'none';
        
        // Force reflow to make sure animation removal takes effect
        void progress.offsetWidth;
        progress.style.animation = '';
      }
    }
    
    const t = document.getElementById("question-screen");
    if (t) {
      const n = t.querySelector(".background-transition-overlay");
      e && n && n.remove();
      t.removeAttribute("style");
      e && n && t.insertBefore(n, t.firstChild);
      e || (t.querySelectorAll(".background-transition-overlay").forEach(e => e.remove()),
      setTimeout(() => {
        t.style.background = "radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%)";
      }, 10));
    }
    
    const n = document.getElementById("question-word");
    n && n.removeAttribute("style");
    
    "function" == typeof stopBossRainingLetters && stopBossRainingLetters();
    
    const r = e ? ".incineration-effect, .boss-orb" : ".incineration-effect, .boss-orb, .background-transition-overlay";
    document.querySelectorAll(r).forEach(e => {
      e.parentNode && e.parentNode.removeChild(e);
    });
  }
  

  
  const gameStructure = {
    stages: [
        { id: 1, numSets: 9, levelsPerSet: 21, bossLevel: 21 },
        { id: 2, numSets: 10, levelsPerSet: 21, bossLevel: 21 },
        { id: 3, numSets: 12, levelsPerSet: 21, bossLevel: 21 },
        { id: 4, numSets: 30, levelsPerSet: 21, bossLevel: 21 },
        { id: 5, numSets: 14, levelsPerSet: 21, bossLevel: 21 }
    ],
    levelTypes: {
        normal: 'normal',
        boss: 'boss'
    }
};

// ADD this debugging function to help diagnose issues
function debugBossCompletion() {
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (!stage || !stage.bossLevel) {
      console.error("Cannot find boss level for current stage");
      return;
    }
    
    const bossLevelKey = `${gameState.currentStage}_${gameState.currentSet}_${stage.bossLevel}`;
    console.log(`Boss level key: ${bossLevelKey}`);
    console.log(`Boss completed: ${gameState.completedLevels.has(bossLevelKey)}`);
    console.log(`Boss perfect: ${gameState.perfectLevels.has(bossLevelKey)}`);
    
    // Check if level is in gameState
    console.log("All completed levels:", Array.from(gameState.completedLevels));
  }
  
  // Call this function in the showBossDefeatEffect
  // After marking the boss level as completed
  debugBossCompletion();

  // ADD this debugging function at the root level of your script
function troubleshootCompletion() {
    console.group("Game State Troubleshooting");
    console.log("Current Stage:", gameState.currentStage);
    console.log("Current Set:", gameState.currentSet);
    console.log("Current Level:", gameState.currentLevel);
    
    // Check levels
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (stage) {
      console.log("Total levels in set:", stage.levelsPerSet);
      console.log("Boss level:", stage.bossLevel);
      
      // Check specific levels
      for (let i = 1; i <= stage.levelsPerSet; i++) {
        const levelKey = `${gameState.currentStage}_${gameState.currentSet}_${i}`;
        const completed = gameState.completedLevels.has(levelKey);
        const perfect = gameState.perfectLevels.has(levelKey);
        console.log(`Level ${i}: ${completed ? "Completed" : "Not completed"} ${perfect ? "(Perfect)" : ""}`);
      }
    }
    
    // Check if set is completed
    const isComplete = isSetCompleted(gameState.currentStage, gameState.currentSet);
    console.log(`Is current set completed? ${isComplete}`);
    
    // Log all completed levels
    console.log("All completed levels:", Array.from(gameState.completedLevels));
    console.groupEnd();
  }
  
  // Call this from the browser console after defeating a boss
  // Or add to showBossDefeatEffect
  setTimeout(troubleshootCompletion, 5000);

  function showLevelScreen(setId) {
    gameState.currentSet = setId;
    console.log(`Opening set ${setId} in stage ${gameState.currentStage}`);
    
    // Clear existing screen
    const container = document.getElementById('level-container');
    if (!container) {
        console.error("Level container not found");
        return;
    }
    container.innerHTML = '';
    
    // Add return arrow to go back to stage-cascade screen
    const returnArrow = document.createElement('div');
    returnArrow.className = 'return-arrow';
    returnArrow.innerHTML = '<i class="fas fa-arrow-left"></i>';
    returnArrow.style.cssText = `
        position: absolute;
        top: 15px;
        left: 15px;
        font-size: 24px;
        color: var(--text);
        cursor: pointer;
        z-index: 10;
    `;
    returnArrow.onclick = function() {
        showScreen('stage-cascade-screen');
        updateStageCompletionStats(); // Update stats when returning
    };
    container.appendChild(returnArrow);
    
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (!stage) {
        console.error(`Invalid stage: ${gameState.currentStage}`);
        return;
    }
    
    // Create level header
    const levelHeader = document.createElement('div');
    levelHeader.className = 'level-header';
    
    // Calculate level completion stats with improved logging
    const totalLevels = stage.levelsPerSet;
    let completedCount = 0;
    let perfectCount = 0;
    
    console.group(`Level completion for Stage ${gameState.currentStage} Set ${setId}`);
    for (let i = 1; i <= totalLevels; i++) {
        const levelKey = `${gameState.currentStage}_${setId}_${i}`;
        const isBossLevel = (i === stage.bossLevel);
        
        console.log(`Checking level ${levelKey}: ${isBossLevel ? "BOSS LEVEL" : ""}`);
        console.log(`  Completed: ${gameState.completedLevels.has(levelKey)}`);
        console.log(`  Perfect: ${gameState.perfectLevels.has(levelKey)}`);
        
        if (gameState.perfectLevels.has(levelKey)) {
            perfectCount++;
            completedCount++;
            console.log(`  Status: PERFECT`);
        } else if (gameState.completedLevels.has(levelKey)) {
            completedCount++;
            console.log(`  Status: COMPLETED`);
        } else {
            console.log(`  Status: NOT COMPLETED`);
        }
    }
    console.log(`Summary: ${completedCount}/${totalLevels} completed, ${perfectCount} perfect`);
    console.groupEnd();
    
    const progressPercentage = Math.round((completedCount / totalLevels) * 100);
    const setIcon = getSetIcon(gameState.currentStage, setId);
    const setDescription = getSetDescription(gameState.currentStage, setId);
    
    // Populate header with level completion counter
    levelHeader.innerHTML = `
        <div class="level-title-area">
            <div class="set-icon">
                <i class="${setIcon}"></i>
            </div>
            <div class="set-details">
                <div class="set-name">Stage ${gameState.currentStage} - Set ${setId}</div>
                <div class="set-desc">${setDescription}</div>
            </div>
        </div>
        <div class="set-progress" data-set-id="${setId}" data-stage-id="${gameState.currentStage}">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
            <div class="progress-text">${completedCount}/${totalLevels} levels</div>
        </div>
    `;
    
    container.appendChild(levelHeader);
    
    // Create level grid
    const levelGrid = document.createElement('div');
    levelGrid.className = 'level-grid';
    levelGrid.dataset.setId = setId;
    levelGrid.dataset.stageId = gameState.currentStage;
    
    const testLevels = [3, 6, 9, 10, 13, 16, 19, 20];
    const setKey = `${gameState.currentStage}_${setId}`;
    
    // Ensure unlockedLevels exists for this set
    if (!gameState.unlockedLevels[setKey]) {
        gameState.unlockedLevels[setKey] = new Set([1]); // At minimum, level 1 should be unlocked
    }
    
    console.log(`Rendering levels for ${setKey}. Unlocked levels:`, 
                Array.from(gameState.unlockedLevels[setKey] || []));
    
    for (let i = 1; i <= stage.levelsPerSet; i++) {
        const levelItem = document.createElement('div');
        const levelKey = `${gameState.currentStage}_${setId}_${i}`;
        
        // Add data attributes for easier selection
        levelItem.dataset.levelId = i;
        levelItem.dataset.levelKey = levelKey;
        
        // Check if level is unlocked - use more direct access with fallback
        const isUnlocked = gameState.unlockedLevels[setKey]?.has(i);
        console.log(`Level ${i} unlocked:`, isUnlocked);
        
        const isPerfect = gameState.perfectLevels.has(levelKey);
        const isCompleted = gameState.completedLevels.has(levelKey);
        const isBossLevel = i === stage.bossLevel;
        const isTestLevel = testLevels.includes(i);
        
        // Set appropriate classes
        levelItem.className = 'level-item';
        if (isUnlocked) levelItem.classList.add('unlocked');
        if (isPerfect) levelItem.classList.add('perfect');
        else if (isCompleted) levelItem.classList.add('completed');
        if (isBossLevel) levelItem.classList.add('boss');
        if (isTestLevel) levelItem.classList.add('test');
        if (!isUnlocked) levelItem.classList.add('locked');
        
        levelItem.textContent = i;
        
        if (isUnlocked) {
            levelItem.onclick = () => {
                console.log(`Starting level ${i} in set ${setId}`);
                startLevel(i);
            };
        }
        
        levelGrid.appendChild(levelItem);
    }
    
    container.appendChild(levelGrid);
    
    // Add legend
    const legend = document.createElement('div');
    legend.className = 'level-type-legend';
    legend.innerHTML = `
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--accent), rgba(30, 144, 255, 0.7));"></div>
            <span>Normal</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--success), #45b649);"></div>
            <span>Completed</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--gold), #FFA500);"></div>
            <span>Perfect</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(135deg, var(--gold), var(--accent));"></div>
            <span>Boss</span>
        </div>
    `;
    
    container.appendChild(legend);
    
    // Check if set is fully completed for debugging
    console.log(`Is set ${gameState.currentStage}-${setId} completed:`, 
                isSetCompleted(gameState.currentStage, setId));
    
    // Show the screen
    showScreen('level-screen');
    
    // Check if all levels are complete (including boss) and update completion status
    const isComplete = isSetCompleted(gameState.currentStage, setId);
    if (isComplete) {
        console.log(`Set ${gameState.currentStage}-${setId} is complete!`);
        
        // Check if all are perfect
        let allPerfect = true;
        for (let i = 1; i <= stage.levelsPerSet; i++) {
            const levelKey = `${gameState.currentStage}_${setId}_${i}`;
            if (!gameState.perfectLevels.has(levelKey)) {
                allPerfect = false;
                break;
            }
        }
        
        if (allPerfect) {
            console.log(`Set ${gameState.currentStage}-${setId} is ALL PERFECT!`);
        }
    }
}

function unlockNextSet() {
    const currentStage = gameState.currentStage;
    const currentSet = gameState.currentSet;
    const nextSet = currentSet + 1;
    
    console.log(`Unlocking next set ${currentStage}-${nextSet}`);
    
    // CRITICAL ADDITION: Mark the current boss level as completed
    const stage = gameStructure.stages[currentStage - 1];
    if (stage && stage.bossLevel) {
      const bossLevelKey = `${currentStage}_${currentSet}_${stage.bossLevel}`;
      
      console.log(`Ensuring boss level ${bossLevelKey} is marked as completed`);
      gameState.completedLevels.add(bossLevelKey);
      
      // Force counter updates
      updateStageCompletionStats();
      updateStageCompletionCounters();
    }
    
    // Get stage structure to check max sets
    const stageStructure = gameStructure.stages[currentStage-1];
    if (!stageStructure) {
      console.error(`Invalid stage: ${currentStage}`);
      return;
    }
    
    // Check if we're not already at the last set
    if (currentSet < stageStructure.numSets) {
      const nextSet = currentSet + 1;
      
      // Ensure the stage is in unlockedSets
      if (!gameState.unlockedSets[currentStage]) {
        gameState.unlockedSets[currentStage] = new Set();
      }
      
      // Add the next set
      gameState.unlockedSets[currentStage].add(nextSet);
      
      // Also unlock the first level of the next set
      const nextSetKey = `${currentStage}_${nextSet}`;
      if (!gameState.unlockedLevels[nextSetKey]) {
        gameState.unlockedLevels[nextSetKey] = new Set();
      }
      gameState.unlockedLevels[nextSetKey].add(1);
      
      console.log(`Unlocked set ${currentStage}-${nextSet} and its first level`);
      
      // Save the updated progress
      saveProgress();
    } else if (currentStage < 5) {
      // Unlock the first set of the next stage
      unlockNextStage();
    }
}
  
  function unlockNextStage() {
    const currentStage = gameState.currentStage;
    
    // Make sure we're not at the last stage
    if (currentStage < 5) {
      const nextStage = currentStage + 1;
      
      // Ensure the next stage exists in unlockedSets
      if (!gameState.unlockedSets[nextStage]) {
        gameState.unlockedSets[nextStage] = new Set();
      }
      
      // Unlock the first set of the next stage
      gameState.unlockedSets[nextStage].add(1);
      
      // Also unlock the first level of the first set
      const nextSetKey = `${nextStage}_1`;
      if (!gameState.unlockedLevels[nextSetKey]) {
        gameState.unlockedLevels[nextSetKey] = new Set();
      }
      gameState.unlockedLevels[nextSetKey].add(1);
      
      console.log(`Unlocked stage ${nextStage}, set 1, level 1`);
      
      // Save the updated progress
      saveProgress();
    }
  }

  // ADD this global function for emergency repair
window.fixBossCompletion = function(stageId = null, setId = null) {
    // If no stage/set provided, use current one
    const stage = stageId || gameState.currentStage;
    const set = setId || gameState.currentSet;
    
    const stageConfig = gameStructure.stages[stage - 1];
    if (!stageConfig || !stageConfig.bossLevel) {
        console.error(`Invalid stage ${stage} or no boss level defined`);
        return false;
    }
    
    // Mark boss level as completed
    const bossLevelKey = `${stage}_${set}_${stageConfig.bossLevel}`;
    console.log(`Marking boss level ${bossLevelKey} as completed via manual repair`);
    gameState.completedLevels.add(bossLevelKey);
    
    // Save changes
    saveProgress();
    
    // Force UI updates
    updateStageCompletionStats();
    updateStageCompletionCounters();
    
    return true;
};

// ADD this function to ensure gameState consistency during initialization
function ensureGameStateStructure() {
    // Ensure completedLevels is a Set
    if (!gameState.completedLevels || !(gameState.completedLevels instanceof Set)) {
        console.warn("completedLevels is not a Set, fixing...");
        gameState.completedLevels = new Set(Array.isArray(gameState.completedLevels) ? 
            gameState.completedLevels : []);
    }
    
    // Ensure perfectLevels is a Set
    if (!gameState.perfectLevels || !(gameState.perfectLevels instanceof Set)) {
        console.warn("perfectLevels is not a Set, fixing...");
        gameState.perfectLevels = new Set(Array.isArray(gameState.perfectLevels) ? 
            gameState.perfectLevels : []);
    }
    
    // Ensure unlockedSets structure
    if (!gameState.unlockedSets || typeof gameState.unlockedSets !== 'object') {
        console.warn("unlockedSets is not properly structured, fixing...");
        gameState.unlockedSets = { 1: new Set([1]) };
    } else {
        // Convert any array values to Sets
        Object.keys(gameState.unlockedSets).forEach(key => {
            if (!(gameState.unlockedSets[key] instanceof Set)) {
                gameState.unlockedSets[key] = new Set(Array.isArray(gameState.unlockedSets[key]) ? 
                    gameState.unlockedSets[key] : []);
            }
        });
    }
    
    // Ensure unlockedLevels structure
    if (!gameState.unlockedLevels || typeof gameState.unlockedLevels !== 'object') {
        console.warn("unlockedLevels is not properly structured, fixing...");
        gameState.unlockedLevels = { "1_1": new Set([1]) };
    } else {
        // Convert any array values to Sets
        Object.keys(gameState.unlockedLevels).forEach(key => {
            if (!(gameState.unlockedLevels[key] instanceof Set)) {
                gameState.unlockedLevels[key] = new Set(Array.isArray(gameState.unlockedLevels[key]) ? 
                    gameState.unlockedLevels[key] : []);
            }
        });
    }
    
    console.log("GameState structure verified and fixed if needed");
}

// ADD this to your initialization code
document.addEventListener('DOMContentLoaded', function() {
    // After loading user data but before using game state
    checkExistingSession().then(() => {
        // Load progress and then ensure structure
        loadUserGameProgress(currentUser?.id).then(() => {
            ensureGameStateStructure();
            initializeGame();
        });
    });
});

// MODIFY loadProgress function to fix Set conversion
function loadProgress() {
    const saved = localStorage.getItem('simploxProgress');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            
            // Create Sets from arrays for key game state properties
            gameState.unlockedSets = Object.fromEntries(
                Object.entries(data.unlockedSets || {}).map(([k, v]) => [k, new Set(v)])
            );
            
            gameState.unlockedLevels = Object.fromEntries(
                Object.entries(data.unlockedLevels || {}).map(([k, v]) => [k, new Set(v)])
            );
            
            // Important: Convert arrays to Sets
            gameState.perfectLevels = new Set(data.perfectLevels || []);
            gameState.completedLevels = new Set(data.completedLevels || []);
            
            gameState.coins = data.coins || 0;
            gameState.perks = data.perks || {timeFreeze: 0, skip: 0, clue: 0, reveal: 0};
            
            console.log("Progress loaded with proper Set conversion");
        } catch (e) {
            console.error("Error loading game progress:", e);
            // Initialize with defaults
            setupDefaultUnlocks();
        }
    }
    
    const savedCustomCoins = localStorage.getItem('simploxCustomCoins');
    if (savedCustomCoins) {
        gameState.coins = parseInt(savedCustomCoins);
    }
}

function addGoldShineStyles() {
    // Remove any existing styles first
    const existingStyle = document.getElementById('gold-set-styles');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    const styleEl = document.createElement('style');
    styleEl.id = 'gold-set-styles';
    styleEl.textContent = `
        /* STRONGER Gold Styling for Completed Sets - Overrides all other styles */
        .set-button.fully-completed {
            background: linear-gradient(135deg, var(--gold), #ffa500) !important;
            border: 2px solid var(--gold) !important;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.6) !important;
            position: relative !important;
            overflow: hidden !important;
            animation: pulseGoldSet 2s infinite alternate !important;
            transform: scale(1.05) !important;
            z-index: 5 !important; /* Higher z-index to ensure it's on top */
            color: black !important; /* Ensures text is visible on gold background */
        }
        
        /* Ensure the completed indicator remains visible against gold */
        .set-button.fully-completed .completed-indicator {
            color: #000 !important;
            background-color: rgba(255, 255, 255, 0.3) !important;
            border-radius: 50% !important;
            padding: 3px !important;
        }
        
        /* Ensure the span text is black for contrast */
        .set-button.fully-completed span {
            color: #000 !important;
            font-weight: bold !important;
            text-shadow: 0 0 3px rgba(255, 255, 255, 0.5) !important;
            position: relative !important;
            z-index: 10 !important;
        }
        
        /* Create a moving shine effect across the button */
        .set-button.fully-completed::before {
            content: '' !important;
            position: absolute !important;
            top: -50% !important;
            left: -50% !important;
            width: 200% !important;
            height: 200% !important;
            background: linear-gradient(45deg, 
                rgba(255, 255, 255, 0) 0%, 
                rgba(255, 255, 255, 0.7) 50%, 
                rgba(255, 255, 255, 0) 100%) !important;
            transform: rotate(25deg) !important;
            animation: shineEffect 3s infinite linear !important;
            z-index: 1 !important;
        }
        
        @keyframes pulseGoldSet {
            0% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.6); }
            100% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.9); }
        }
        
        @keyframes shineEffect {
            0% { transform: translate(-100%, -100%) rotate(25deg); }
            100% { transform: translate(100%, 100%) rotate(25deg); }
        }
    `;
    
    document.head.appendChild(styleEl);
    console.log("Enhanced gold styles added with stronger specificity");
}

// ADD this function to manually fix buttons after page loads
function forceRefreshGoldButtons() {
    console.log("Force-refreshing gold styling on set buttons");
    
    // First ensure our styles are loaded
    addGoldShineStyles();
    
    // Find all completed set buttons and check if they should be gold
    document.querySelectorAll('.set-button.completed').forEach(button => {
        const stageId = parseInt(button.dataset.stageId);
        const setId = parseInt(button.dataset.setId);
        
        if (!stageId || !setId) return;
        
        const stage = gameStructure.stages[stageId - 1];
        if (!stage || !stage.levelsPerSet) return;
        
        // Check if all levels are perfect
        let allPerfect = true;
        for (let levelId = 1; levelId <= stage.levelsPerSet; levelId++) {
            const levelKey = `${stageId}_${setId}_${levelId}`;
            if (!gameState.perfectLevels.has(levelKey)) {
                allPerfect = false;
                break;
            }
        }
        
        // Apply gold styling if perfect
        if (allPerfect) {
            console.log(`Force-applying gold styling to set ${stageId}-${setId}`);
            button.classList.add('fully-completed');
            
            // Force style refresh by temporarily removing and adding class
            setTimeout(() => {
                button.classList.remove('fully-completed');
                setTimeout(() => button.classList.add('fully-completed'), 50);
            }, 100);
        }
    });
}

// Call this function after page loads and when stages are shown
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(forceRefreshGoldButtons, 500);
});

// Also call it whenever the stage cascade screen is shown
document.addEventListener('screenChange', event => {
    if (event.detail && event.detail.screen === 'stage-cascade-screen') {
        setTimeout(forceRefreshGoldButtons, 200);
    }
});

// Call this on page load
document.addEventListener('DOMContentLoaded', addGoldShineStyles);

function populateSetsGrid(e) {
    const t = document.getElementById(`sets-grid-${e}`);
    if (!t) return;
    console.log(`Populating sets grid for stage ${e}`);
    console.log("Unlocked sets:", gameState.unlockedSets);
    const n = gameStructure.stages[e - 1],
        r = gameState.unlockedSets[e] || new Set,
        o = currentUser ? currentUser.status : "unregistered";
    console.log(`Stage ${e} unlocked sets:`, Array.from(r));
    
    // Clear existing content
    t.innerHTML = "";
    
    // Create set buttons for each set in the stage
    for (let s = 1; s <= n.numSets; s++) {
        const setButton = document.createElement("div"),
            a = r.has(s);
        let i = !1;
        e >= 2 && s > 1 && "premium" !== o && (i = !0);
        
        // Add data attributes for easier selection
        setButton.dataset.setId = s;
        setButton.dataset.stageId = e;
        
        setButton.className = "set-button";
        a && !i ? setButton.classList.add("active") : setButton.classList.add("locked");
        
        // Check if set is completed
        const isCompleted = isSetCompleted(e, s);
        
        // NEW: Check if all levels in the set are perfect
        let allLevelsPerfect = false;
        
        if (isCompleted && n.levelsPerSet) {
            allLevelsPerfect = true;
            
            // Check each level in the set
            for (let levelId = 1; levelId <= n.levelsPerSet; levelId++) {
                const levelKey = `${e}_${s}_${levelId}`;
                
                // If any level is not perfect, set allLevelsPerfect to false
                if (!gameState.perfectLevels.has(levelKey)) {
                    allLevelsPerfect = false;
                    break;
                }
            }
            
            console.log(`Set ${e}-${s} all perfect levels check:`, allLevelsPerfect);
        }
        
        // Apply completed class for tracking
        if (isCompleted) {
            setButton.classList.add("completed");
            
            // Apply fully-completed class for gold shine if all levels are perfect
            if (allLevelsPerfect) {
                setButton.classList.add("fully-completed");
                console.log(`Set ${e}-${s} marked as FULLY COMPLETED with gold styling`);
            }
        }
        
        setButton.innerHTML = `
      <span>Set ${s}</span>
      ${isCompleted ? '\n      <div class="completed-indicator">\n        <i class="fas fa-check-circle"></i>\n      </div>' : ""}
      ${!a || i ? `
      <div class="lock-icon">
        <i class="fas ${i ? "fa-crown crown-premium" : "fa-lock"}"></i>
      </div>` : ""}
    `;
        
        if (a && !i) {
            setButton.onclick = () => {
                gameState.currentStage = e;
                gameState.currentSet = s;
                showLevelScreen(s);
            };
        } else if (i) {
            // Make the whole button show upgrade prompt
            setButton.onclick = () => showUpgradePrompt();
            
            // Add specific handler for the crown icon
            setTimeout(() => {
                const crownIcon = setButton.querySelector(".fa-crown");
                if (crownIcon) {
                    crownIcon.addEventListener("click", (event) => {
                        event.stopPropagation();
                        showUpgradePrompt();
                    });
                }
            }, 0);
        }
        
        t.appendChild(setButton);
    }
    
    // Force apply the gold shine styles
    ensureGoldShineStyles();
}

// ADD this function to ensure gold shine styles are applied
function ensureGoldShineStyles() {
    // Check if style already exists
    if (!document.getElementById('gold-set-styles')) {
        // Create style element
        const styleEl = document.createElement('style');
        styleEl.id = 'gold-set-styles';
        styleEl.textContent = `
            /* Enhanced Gold Shine for Completed Sets */
            .set-button.fully-completed {
                background: linear-gradient(135deg, var(--gold), #ffa500) !important;
                border: 2px solid var(--gold) !important;
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.6) !important;
                position: relative;
                overflow: hidden;
                animation: pulseGoldSet 2s infinite alternate;
                color: #000 !important; /* Dark text for better contrast */
                transform: scale(1.05) !important;
                z-index: 1;
            }
            
            .set-button.fully-completed::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(45deg, 
                    rgba(255, 255, 255, 0) 0%, 
                    rgba(255, 255, 255, 0.8) 50%, 
                    rgba(255, 255, 255, 0) 100%);
                transform: rotate(25deg);
                animation: shineEffect 3s infinite linear;
                z-index: 0;
            }
            
            .set-button.fully-completed .completed-indicator {
                background-color: #FFD700 !important;
                box-shadow: 0 0 10px #FFD700 !important;
            }
            
            .set-button.fully-completed span {
                position: relative;
                z-index: 2;
                font-weight: bold;
            }
            
            @keyframes pulseGoldSet {
                0% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.6); }
                100% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.9); }
            }
            
            @keyframes shineEffect {
                0% { transform: translate(-100%, -100%) rotate(25deg); }
                100% { transform: translate(100%, 100%) rotate(25deg); }
            }
        `;
        
        // Add to document head
        document.head.appendChild(styleEl);
        console.log("Enhanced gold shine styles added to page");
    }
}

// Make sure styles are applied on page load
document.addEventListener('DOMContentLoaded', ensureGoldShineStyles);

function updateStageBackground() {
    const currentStage = gameState.currentStage;
    
    // Get the question screen element
    const questionScreen = document.getElementById('question-screen');
    if (!questionScreen) return;
    
    // Remove any existing stage background classes
    questionScreen.classList.remove('stage-3-bg', 'stage-4-bg', 'stage-5-bg');
    
    // Apply the appropriate background class based on stage
    if (currentStage >= 3 && currentStage <= 5) {
      questionScreen.classList.add(`stage-${currentStage}-bg`);
    }
  }

  

// Function to update premium button visibility
function updatePremiumButtonVisibility() {
    // Get the premium button from the static HTML menu
    const premiumMenuItemStatic = document.getElementById('premium-menu-item');
    
    // Check if user is premium
    const userStatus = currentUser ? currentUser.status : 'unregistered';
    const shouldShowPremium = userStatus !== 'premium'; // Show for unregistered, free, and pending
    
    // Update visibility of static premium button
    if (premiumMenuItemStatic) {
      premiumMenuItemStatic.style.display = shouldShowPremium ? 'flex' : 'none';
      console.log(`Premium button visibility: ${shouldShowPremium ? 'visible' : 'hidden'} for user status: ${userStatus}`);
    }
  }
  
  // Call this function when DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    updatePremiumButtonVisibility();
  });
  
  // Also call this when user status changes
  document.addEventListener('userStatusChanged', function(event) {
    updatePremiumButtonVisibility();
  });

  // Modify the createOptionsMenu function to remove profile and logout
  const originalCreateOptionsMenu = createOptionsMenu;
  createOptionsMenu = function() {
    // Remove existing menu if it exists
    const existingMenu = document.getElementById('options-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
  
    const optionsMenu = document.createElement('div');
    optionsMenu.id = 'options-menu';
    optionsMenu.className = 'floating-menu';
    
    // Define all possible menu items - remove profile and logout
    const menuItems = [
      {
        id: 'custom-practice-item',
        icon: 'fa-pen',
        text: 'Custom Practice',
        onClick: 'showScreen(\'custom-practice-screen\')',
        visibleTo: ['all']
      },
      {
        id: 'leaderboard-item',
        icon: 'fa-trophy',
        text: 'Leaderboard',
        onClick: 'showLeaderboard()',
        visibleTo: ['all']
      },
      {
        id: 'premium-item',
        icon: 'fa-crown premium-crown',
        text: 'Premium',
        onClick: 'showUpgradeScreen()',
        visibleTo: ['free', 'pending', 'unregistered'] // Only visible to non-premium users
      },
      {
        id: 'about-item',
        icon: 'fa-info-circle',
        text: 'About',
        onClick: 'showAboutScreen()',
        visibleTo: ['all']
      },
      {
        id: 'shop-item',
        icon: 'fa-store',
        text: 'Shop',
        onClick: 'showScreen(\'shop-screen\')',
        visibleTo: ['all']
      },
      {
        id: 'accessibility-item',
        icon: 'fa-universal-access',
        text: 'Accessibility',
        onClick: 'openAccessibilitySettings()',
        visibleTo: ['all']
      }
    ];
    
    // Add menu grid container
    const menuGrid = document.createElement('div');
    menuGrid.className = 'menu-grid';
    optionsMenu.appendChild(menuGrid);
    
    // Filter menu items based on user status
    const userStatus = currentUser ? (currentUser.status || 'free') : 'unregistered';
    console.log("Creating menu with user status:", userStatus);
    
    // Add filtered items to the menu
    menuItems.forEach(item => {
      // Check if this item should be visible to the current user
      const isVisible = item.visibleTo.includes('all') || 
                       (item.id === 'premium-item' && userStatus !== 'premium') ||
                       item.visibleTo.includes(userStatus);
      
      if (isVisible) {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.id = item.id;
        menuItem.setAttribute('onclick', item.onClick);
        
        menuItem.innerHTML = `
          <i class="fas ${item.icon}"></i>
          <span>${item.text}</span>
        `;
        
        if (item.id === 'premium-item') {
          console.log("Adding premium menu item, user status:", userStatus);
        }
        
        menuGrid.appendChild(menuItem);
      }
    });
    
    document.body.appendChild(optionsMenu);
    
    // Dispatch an event indicating the menu was refreshed
    document.dispatchEvent(new CustomEvent('menuRefreshed'));
    
    return optionsMenu;
  };

// Replace the entire createOptionsMenu function
window.createOptionsMenu = function() {
  console.log("Creating options menu with user status:", currentUser?.status || "unregistered");
  
  // Remove existing menu if it exists
  const existingMenu = document.getElementById('options-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  const optionsMenu = document.createElement('div');
  optionsMenu.id = 'options-menu';
  optionsMenu.className = 'floating-menu';
  
  // Add menu grid container
  const menuGrid = document.createElement('div');
  menuGrid.className = 'menu-grid';
  optionsMenu.appendChild(menuGrid);
  
  // Check user status directly
  const userStatus = currentUser ? currentUser.status : 'unregistered';
  const isPremiumUser = userStatus === 'premium';
  
  console.log(`User is premium: ${isPremiumUser}`);
  
  // Define menu items - Note: We'll skip Premium button for premium users
  const menuItems = [];
  
  // Always add these buttons
  menuItems.push(
    {
      icon: 'fa-expand',
      text: 'Fullscreen',
      onClick: 'toggleFullScreen()'
    },
    {
      icon: 'fa-undo',
      text: 'Reset',
      onClick: 'handleResetProgress()'
    }
  );
  
  // Add Premium button ONLY if user is NOT premium
  if (!isPremiumUser) {
    menuItems.push({
      icon: 'fa-crown',
      text: 'Premium',
      onClick: 'showScreen(\'upgrade-screen\')'
    });
  }
  
  // Continue with other buttons
  menuItems.push(
    {
      icon: 'fa-map-marked-alt',
      text: 'Stages',
      onClick: 'showStageCascadeScreen()'
    },
    {
      icon: 'fa-trophy',
      text: 'Rankings',
      onClick: 'showLeaderboard()'
    },
    {
      icon: 'fa-universal-access',
      text: 'Access',
      onClick: 'openAccessibilitySettings()'
    },
    {
      icon: 'fa-envelope',
      text: 'Email',
      onClick: 'window.location.href=\'mailto:danav.bred@gmail.com?subject=About%20Simplos\''
    },
    {
      icon: 'fa-whatsapp',
      text: 'WhatsApp',
      onClick: 'window.location.href=\'https://wa.me/972545996417\''
    },
    {
      icon: 'fa-info-circle',
      text: 'About',
      onClick: 'window.open(\'https://simplos.netlify.app/about.html\', \'_blank\')'
    },
    {
      icon: 'fa-times',
      text: 'Close',
      onClick: 'closeOptionsMenu()'
    }
  );
  
  // Create menu items
  menuItems.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    
    // For Premium button, add special ID
    if (item.text === 'Premium') {
      menuItem.id = 'premium-menu-item';
    }
    
    // Set onClick handler
    if (item.onClick) {
      menuItem.setAttribute('onclick', item.onClick);
    }
    
    // Add content
    menuItem.innerHTML = `
      <i class="fas ${item.icon}"></i>
      <span>${item.text}</span>
    `;
    
    menuGrid.appendChild(menuItem);
  });
  
  document.body.appendChild(optionsMenu);
  console.log("Options menu created, premium button included:", !isPremiumUser);
  
  return optionsMenu;
};

  /**
 * Updates the visibility of premium menu items based on user status
 * This function handles both static and dynamic menu elements
 */
function updatePremiumMenuItems() {
    // Get user status - default to 'unregistered' if no user
    const userStatus = currentUser ? currentUser.status : 'unregistered';
    const isPremium = userStatus === 'premium';
    
    console.log(`Updating premium button visibility - User status: ${userStatus}, Premium: ${isPremium}`);
    
    // 1. Update static premium button in HTML
    const staticPremiumButton = document.getElementById('premium-menu-item');
    if (staticPremiumButton) {
      staticPremiumButton.style.display = isPremium ? 'none' : 'flex';
    }
    
    // 2. Update dynamic premium items in the floating menu
    const optionsMenu = document.getElementById('options-menu');
    if (optionsMenu) {
      const premiumItems = optionsMenu.querySelectorAll('.menu-item[id="premium-item"], .menu-item i.fa-crown, .menu-item:has(i.fa-crown)');
      
      premiumItems.forEach(item => {
        item.style.display = isPremium ? 'none' : 'flex';
      });
    }
  }

  // Debug function to monitor cogwheel menu open behavior
function debugMenuOpen() {
    console.group("Cogwheel Menu Debug");
    
    // Log user status
    const userStatus = currentUser ? currentUser.status : 'unregistered';
    console.log("Current user status:", userStatus);
    console.log("Is premium user:", userStatus === 'premium');
    
    // Check if premium button exists in menu
    const premiumButton = document.querySelector('#options-menu #premium-menu-item');
    console.log("Premium button in menu:", premiumButton ? "YES" : "NO");
    
    if (premiumButton) {
      console.log("Premium button visibility:", window.getComputedStyle(premiumButton).display);
      console.log("Premium button click handler:", premiumButton.getAttribute('onclick'));
    }
    
    // Check all menu items and their visibility
    const menuItems = document.querySelectorAll('#options-menu .menu-item');
    console.log("Total menu items:", menuItems.length);
    console.log("Menu items:", Array.from(menuItems).map(item => {
      const text = item.querySelector('span')?.textContent;
      const visible = window.getComputedStyle(item).display !== 'none';
      return `${text}: ${visible ? 'visible' : 'hidden'}`;
    }));
    
    console.groupEnd();
  }
  
  // Debug function to monitor premium button click
  function debugPremiumButtonClick() {
    console.group("Premium Button Click Debug");
    
    // Log user status
    const userStatus = currentUser ? currentUser.status : 'unregistered';
    console.log("Current user status:", userStatus);
    console.log("Is premium user:", userStatus === 'premium');
    
    // Check if premium button exists
    const premiumButton = document.querySelector('#premium-menu-item');
    console.log("Premium button exists:", premiumButton ? "YES" : "NO");
    
    if (premiumButton) {
      console.log("Premium button visibility:", window.getComputedStyle(premiumButton).display);
      console.log("Premium button click handler:", premiumButton.getAttribute('onclick'));
      
      // Log which function will be called
      console.log("Will call:", premiumButton.getAttribute('onclick') || "No onclick attribute");
    } else {
      console.log("Premium button NOT FOUND - this is expected for premium users");
    }
    
    console.groupEnd();
  }
  
  // Enhanced createOptionsMenu with debug
  function createOptionsMenuWithDebug() {
    console.log("Creating options menu with debug");
    const menu = createOptionsMenu();
    
    // Run debug after menu is created
    setTimeout(debugMenuOpen, 100);
    
    // Add click tracking to premium button
    const premiumButton = document.querySelector('#premium-menu-item');
    if (premiumButton) {
      const originalClick = premiumButton.onclick;
      premiumButton.onclick = function(e) {
        console.log("Premium button clicked!");
        debugPremiumButtonClick();
        
        // Call original handler
        if (originalClick) {
          originalClick.call(this, e);
        } else {
          // Fallback to the attribute
          const onclickAttr = premiumButton.getAttribute('onclick');
          if (onclickAttr) {
            eval(onclickAttr);
          }
        }
      };
    }
    
    return menu;
  }
  
  // Override settings toggle to use debug version
  document.addEventListener('DOMContentLoaded', function() {
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function() {
        console.log("Settings toggle clicked!");
        createOptionsMenuWithDebug();
        
        // Show menu
        const optionsMenu = document.getElementById('options-menu');
        if (optionsMenu) {
          optionsMenu.classList.add('show');
        }
      });
    }
  });
  
  // Add direct debug commands for console use
  window.debugPremium = {
    checkMenuItems: function() {
      debugMenuOpen();
    },
    simulatePremiumButtonClick: function() {
      debugPremiumButtonClick();
      
      // Try to find and click premium button
      const premiumButton = document.querySelector('#premium-menu-item');
      if (premiumButton) {
        console.log("Simulating click on premium button");
        premiumButton.click();
      } else {
        console.log("Premium button not found - cannot simulate click");
      }
    },
    setUserStatus: function(status) {
      console.log(`Setting simulated user status to: ${status}`);
      
      // This is just for simulation/debugging - doesn't affect the real user
      const oldStatus = currentUser ? currentUser.status : 'unregistered';
      if (currentUser) {
        currentUser.status = status;
      } else {
        currentUser = { status: status };
      }
      
      // Update UI
      updatePremiumButtonVisibility();
      console.log(`User status changed from ${oldStatus} to ${status}`);
      
      // Refresh menu if open
      const menu = document.getElementById('options-menu');
      if (menu && menu.classList.contains('show')) {
        menu.classList.remove('show');
        setTimeout(() => {
          createOptionsMenuWithDebug();
          document.getElementById('options-menu').classList.add('show');
        }, 100);
      }
    }
  };
  
  // Add direct debug for premium button click
  document.addEventListener('DOMContentLoaded', function() {
    // Add direct click handler for the premium menu item to ensure it works for unregistered users
    function setupPremiumButton() {
      const premiumItem = document.querySelector('#premium-item');
      if (premiumItem) {
        // Remove the default onclick attribute and add direct listener
        const originalAction = premiumItem.getAttribute('onclick');
        premiumItem.removeAttribute('onclick');
        
        premiumItem.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Premium menu item clicked by', currentUser ? currentUser.status : 'unregistered user');
          debugPremiumButtonClick();
          
          // Always show the upgrade screen directly
          showScreen('upgrade-screen');
          
          // Close the options menu
          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu) {
            optionsMenu.classList.remove('show');
          }
        });
        
        console.log('Direct premium button handler set up');
      }
    }
    
    // Call setup initially
    setupPremiumButton();
    
    // Also set up after the menu is refreshed
    document.addEventListener('menuRefreshed', setupPremiumButton);
    
    // Re-check when menu is shown
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function() {
        setTimeout(setupPremiumButton, 100);
      });
    }
  });


  window.debugPremium.checkMenuItems();

  window.debugPremium.simulatePremiumButtonClick();

// Test as premium user
window.debugPremium.setUserStatus('premium');

// Test as free user
window.debugPremium.setUserStatus('free');

// Test as unregistered user
window.debugPremium.setUserStatus('unregistered');


// ADD: Function to ensure crown button in floating menu opens upgrade screen
function fixCrownButtonBehavior() {
    // Find the premium menu item in the floating menu
    const premiumMenuItem = document.querySelector('#options-menu .menu-item[id="premium-menu-item"], #options-menu .menu-item i.fa-crown').closest('.menu-item');
    
    if (premiumMenuItem) {
      console.log("Found premium menu item, fixing click behavior");
      
      // Remove any existing onclick attribute
      premiumMenuItem.removeAttribute('onclick');
      
      // Add direct event listener with highest priority
      premiumMenuItem.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Premium menu item clicked - showing upgrade screen");
        
        // Close the options menu first
        const optionsMenu = document.getElementById('options-menu');
        if (optionsMenu) {
          optionsMenu.classList.remove('show');
        }
        
        // Show upgrade screen directly
        showScreen('upgrade-screen');
      }, true); // Use capturing phase for highest priority
      
      // Also fix any crown icon inside the button
      const crownIcon = premiumMenuItem.querySelector('i.fa-crown');
      if (crownIcon) {
        crownIcon.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log("Crown icon clicked - showing upgrade screen");
          
          // Close the options menu
          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu) {
            optionsMenu.classList.remove('show');
          }
          
          // Show upgrade screen directly
          showScreen('upgrade-screen');
        }, true); // Use capturing phase for highest priority
      }
    } else {
      console.warn("Premium menu item not found in the floating menu");
    }
  }
  
  // Call this function after the menu is created and whenever it might be refreshed
  document.addEventListener('DOMContentLoaded', function() {
    // Fix initially after page load
    setTimeout(fixCrownButtonBehavior, 500);
    
    // Also fix after menu is refreshed
    document.addEventListener('menuRefreshed', fixCrownButtonBehavior);
    
    // Fix when the settings/options menu is opened
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function() {
        setTimeout(fixCrownButtonBehavior, 100);
      });
    }
  });
  
  
const customPracticeLists = {
    lists: [],
    currentList: null,
    maxLists: 5
};

function updateListsDisplay() {
    const container = document.getElementById("custom-lists-container");
    if (!container) return void console.error("Custom lists container not found");

    // Comprehensive logging
    console.log("Current user:", currentUser);
    console.log("User status:", currentUser?.status);
    console.log("User metadata:", currentUser?.user_metadata);
    console.log("App metadata:", currentUser?.app_metadata);
    
    // Log all properties of the user object for inspection
    if (currentUser) {
        console.log("All user properties:");
        for (const key in currentUser) {
            if (typeof currentUser[key] !== 'function') {
                console.log(`- ${key}:`, currentUser[key]);
            }
        }
        
        // Check user_metadata properties
        if (currentUser.user_metadata) {
            console.log("All user_metadata properties:");
            for (const key in currentUser.user_metadata) {
                console.log(`- ${key}:`, currentUser.user_metadata[key]);
            }
        }
        
        // Check app_metadata properties
        if (currentUser.app_metadata) {
            console.log("All app_metadata properties:");
            for (const key in currentUser.app_metadata) {
                console.log(`- ${key}:`, currentUser.app_metadata[key]);
            }
        }
    }
    
    const limits = CustomListsManager.getListLimits();
    const userStatus = currentUser?.status || "unregistered";
    
    // Debug message about premium status
    console.log("User premium status check:", userStatus === "premium");
    
    // Various checks for teacher status
    let isTeacherFound = false;
    let teacherPropertyFound = "";
    
    if (currentUser?.role === "teacher") {
        isTeacherFound = true;
        teacherPropertyFound = "currentUser.role";
    } else if (currentUser?.user_metadata?.role === "teacher") {
        isTeacherFound = true;
        teacherPropertyFound = "currentUser.user_metadata.role";
    } else if (currentUser?.app_metadata?.role === "teacher") {
        isTeacherFound = true;
        teacherPropertyFound = "currentUser.app_metadata.role";
    } else if (currentUser?.user_type === "teacher") {
        isTeacherFound = true;
        teacherPropertyFound = "currentUser.user_type";
    } else if (currentUser?.user_metadata?.user_type === "teacher") {
        isTeacherFound = true;
        teacherPropertyFound = "currentUser.user_metadata.user_type";
    } else if (currentUser?.is_teacher === true) {
        isTeacherFound = true;
        teacherPropertyFound = "currentUser.is_teacher";
    } else if (currentUser?.user_metadata?.is_teacher === true) {
        isTeacherFound = true;
        teacherPropertyFound = "currentUser.user_metadata.is_teacher";
    }
    
    console.log(`Is teacher found: ${isTeacherFound}, Property: ${teacherPropertyFound}`);
    
    // TEMPORARY: Until we find the correct teacher attribute
    const isPremiumUser = userStatus === "premium";
    const isAdminEmail = currentUser && currentUser.email && 
                        (currentUser.email.includes("admin") || 
                         currentUser.email.includes("teacher"));
    
    const canShare = isPremiumUser;
    console.log(`Can share: ${canShare}, Premium: ${isPremiumUser}, Admin email: ${isAdminEmail}`);
    
    container.innerHTML = "";
    
    if (CustomListsManager.lists && Array.isArray(CustomListsManager.lists) && CustomListsManager.lists.length !== 0) {
        CustomListsManager.lists.forEach(list => {
            if (!list || !list.id) return;
            
            const wordCount = list.words?.length || 0;
            const hasSufficientWords = wordCount >= 6;
            
            const playsAvailableHtml = userStatus === "premium" ? 
                "" : 
                `<span style="margin-left: 1rem;">${limits.playDisplay} plays available</span>`;
            
            const listItem = document.createElement("div");
            listItem.className = "custom-list-item collapsed " + (list.isShared ? "shared-list" : "");
            listItem.dataset.listId = list.id;
            
            // MODIFIED: Changed the word count display format
            listItem.innerHTML = `
                <div class="list-actions">
                    <button class="main-button practice-button" ${hasSufficientWords ? "" : "disabled"}>
    ${hasSufficientWords ? "Practice" : `${6 - wordCount} more`}
</button>
                    <button class="main-button edit-button">Edit</button>
                    <button class="main-button delete-button">Delete</button>
                    ${userStatus === "premium" ? `
                        <button class="main-button share-button">
                            <i class="fas fa-share-alt"></i> Share
                        </button>
                    ` : ""}
                </div>
                <div class="list-header">
                    <h3>${list.name || "Unnamed List"}</h3>
                    <div class="list-summary">
                        <span class="word-count ${hasSufficientWords ? "" : "insufficient"}">${wordCount}/${hasSufficientWords ? wordCount : 6}</span>
                        ${playsAvailableHtml}
                        <p class="word-preview">${Array.isArray(list.words) ? list.words.slice(0, 5).join(", ") : ""}${list.words && list.words.length > 5 ? "..." : ""}</p>
                    </div>
                </div>
            `;
            
            container.appendChild(listItem);
            
            // Double-check if share button exists after rendering
            const hasShareButton = !!listItem.querySelector('.share-button');
            console.log(`List ${list.id} - Share button exists: ${hasShareButton}, Premium user: ${userStatus === "premium"}`);
            
            // Set up the button event handlers
            const practiceButton = listItem.querySelector(".practice-button");
            if (practiceButton) {
                if (hasSufficientWords) {
                    practiceButton.onclick = function() {
                        startCustomListPractice(list.id);
                    };
                } else {
                    practiceButton.style.opacity = "0.6";
                    practiceButton.style.cursor = "not-allowed";
                }
            }
            
            const editButton = listItem.querySelector(".edit-button");
            if (editButton) {
                editButton.onclick = function() {
                    editCustomList(list.id);
                };
            }
            
            const deleteButton = listItem.querySelector(".delete-button");
            if (deleteButton) {
                deleteButton.onclick = function() {
                    deleteCustomList(list.id);
                };
            }
            
            // Make sure the share button has the proper click handler
            const shareButton = listItem.querySelector(".share-button");
            if (shareButton) {
                shareButton.onclick = function() {
                    console.log(`Share button clicked for list: ${list.id}`);
                    showShareModal(list.id);
                };
            }
            
            const listHeader = listItem.querySelector(".list-header");
            if (listHeader) {
                listHeader.onclick = function() {
                    toggleListCollapse(list.id);
                };
            }
        });
    } else {
        container.innerHTML = '<p style="color: white; text-align: center;">No custom lists created yet. Create your first list!</p>';
    }
}

// Function to add a new word list
function addCustomWordList(name = null) {
    // Check if we've reached the maximum number of lists
    if (customPracticeLists.lists.length >= customPracticeLists.maxLists) {
        alert(`You can only create up to ${customPracticeLists.maxLists} custom lists.`);
        return null;
    }

    // Generate a default name if not provided
    if (!name) {
        name = `List ${customPracticeLists.lists.length + 1}`;
    }

    const newList = {
        id: Date.now(),
        name: name,
        words: [],
        translations: []
    };

    customPracticeLists.lists.push(newList);
    saveCustomLists();
    return newList;
}


// Function to translate a single word using MyMemory Translation API
function translateWord(word) {
    const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|he`;
    
    return fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            // Extract translation, fallback to original word if translation fails
            return data.responseData.translatedText || word;
        })
        .catch(() => word);
}

function trackListPlay(listId) {
    const playCountKey = `listPlays_${listId}`;
    let plays = parseInt(localStorage.getItem(playCountKey) || '0');
    plays++;
    
    const limits = getUserListLimits();
    localStorage.setItem(playCountKey, plays);

    if (plays >= limits.maxPlays) {
        // Remove list if max plays reached
        deleteCustomList(listId);
        return false;
    }
    
    return limits.maxPlays - plays;
}








function updateLocalSharedLists(sharedList) {
    // Add the shared list to the recipient's local lists
    if (currentUser) {
        customPracticeLists.lists.push({
            id: sharedList.local_id,
            supabaseId: sharedList.id,
            name: sharedList.name,
            words: sharedList.words,
            translations: sharedList.translations,
            is_shared: true,
            shared_by: sharedList.shared_by
        });
        
        // Save to local storage or sync
        saveCustomLists();
    }
}

// ADD this fallback function to try alternative sharing approaches
async function debugShareList(listId, recipientId) {
    try {
        console.log("Debug share function called with:", { listId, recipientId });
        
        // Find the list
        const list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
        if (!list) {
            console.error("List not found for debug sharing");
            return false;
        }
        
        // Try direct table access with minimal fields
        const { data, error } = await supabaseClient
            .from('custom_lists')
            .insert({
                user_id: recipientId,
                name: "Shared list", 
                words: ["test"],
                translations: ["test"],
                is_shared: true
            });
            
        if (error) {
            console.error("Debug share error:", error);
            
            // Check what tables are available
            const { data: tables, error: tablesError } = await supabaseClient
                .from('information_schema.tables')
                .select('table_name')
                .eq('table_schema', 'public');
                
            if (tablesError) {
                console.error("Error fetching tables:", tablesError);
            } else {
                console.log("Available tables:", tables);
            }
            
            return false;
        }
        
        console.log("Debug share success:", data);
        return true;
    } catch (error) {
        console.error("Debug share exception:", error);
        return false;
    }
}

async function shareListWithUser(listId, recipientId) {
    try {
        console.log("Sharing list:", listId, "with user:", recipientId);
        
        if (!currentUser) {
            console.error("No current user - cannot share list");
            return false;
        }
        
        // Find the list in CustomListsManager
        const list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
        
        if (!list) {
            console.error("List not found for sharing:", listId);
            return false;
        }
        
        console.log("Found list to share:", list.name);
        
        // Direct insert into custom_lists table
        const { data, error } = await supabaseClient
            .from('custom_lists')
            .insert({
                user_id: recipientId,
                name: `${list.name} (Shared by ${currentUser.user_metadata?.username || "User"})`,
                words: list.words || [],
                translations: list.translations || [],
                is_shared: true,
                shared_with: [recipientId],
                shared_by: currentUser.id,
                created_at: new Date().toISOString(),
                status: 'active'
            });
        
        if (error) {
            console.error("Error sharing list:", error);
            return false;
        }
        
        console.log("List shared successfully");
        showNotification("List shared successfully!", "success");
        closeShareModal();
        return true;
    } catch (error) {
        console.error("Error in shareListWithUser:", error);
        showNotification("Error sharing list", "error");
        return false;
    }
}



async function loadSharedLists() {
    if (!currentUser) return [];

    const { data, error } = await supabaseClient
        .from('custom_lists')
        .select('*')
        .or(`shared_with.cs.{${currentUser.id}},is_shared.eq.true`);

    if (error) {
        console.error('Error loading shared lists:', error);
        return [];
    }

    return data.map(list => ({
        ...list,
        isShared: true
    }));
}

function showShareModal(listId) {
    console.log("Opening share modal for list:", listId);
    
    // Check if user can share
    const isPremiumUser = currentUser?.status === "premium";
    const isAdminEmail = currentUser && currentUser.email && 
                        (currentUser.email.includes("admin") || 
                         currentUser.email.includes("teacher"));
    
    const canShare = isPremiumUser && isAdminEmail;
    
    if (!canShare) {
        showNotification("Only teachers can share lists", "error");
        return;
    }
    
    if (!listId) {
        console.error("No list ID provided to share modal");
        showNotification("Error: List ID is missing", "error");
        return;
    }
    
    // Remove any existing modals
    document.querySelectorAll(".share-modal-wrapper").forEach(el => el.remove());
    
    // Create a completely new modal wrapper directly on the body
    const modalWrapper = document.createElement("div");
    modalWrapper.className = "share-modal-wrapper";
    modalWrapper.setAttribute('data-list-id', listId); // Store the list ID in the modal    
    // Apply fixed positioning to ensure it's centered
    modalWrapper.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 9999 !important;
        pointer-events: all !important;
    `;
    
    // Create the modal HTML with backdrop, search field, and content
    modalWrapper.innerHTML = `
        <div class="modal-backdrop" style="
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background-color: rgba(0,0,0,0.7) !important;
            z-index: 9999 !important;
        "></div>
        
        <div class="share-modal-content" style="
            position: relative !important;
            width: 90% !important;
            max-width: 500px !important;
            max-height: 80vh !important;
            background-color: rgba(30, 41, 59, 0.9) !important;
            backdrop-filter: blur(10px) !important;
            border-radius: 20px !important;
            padding: 25px !important;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
            z-index: 10000 !important;
            overflow-y: auto !important;
            transform: none !important;
            margin: 0 !important;
        ">
            <h3 style="
                text-align: center !important;
                margin-bottom: 20px !important;
                color: white !important;
                font-size: 1.5rem !important;
            ">Share List</h3>
            
            <div class="search-container" style="
                margin-bottom: 15px !important;
                position: relative !important;
            ">
                <input type="text" id="user-search" placeholder="Search users..." style="
                    width: 100% !important;
                    padding: 10px !important;
                    padding-left: 35px !important;
                    border-radius: 5px !important;
                    border: 1px solid rgba(255, 255, 255, 0.2) !important;
                    background-color: rgba(255, 255, 255, 0.1) !important;
                    color: white !important;
                    font-size: 1rem !important;
                    outline: none !important;
                ">
                <i class="fas fa-search" style="
                    position: absolute !important;
                    left: 12px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                    color: rgba(255, 255, 255, 0.5) !important;
                "></i>
                <div class="search-results-count" style="
                    position: absolute !important;
                    right: 10px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                    color: rgba(255, 255, 255, 0.5) !important;
                    font-size: 0.85rem !important;
                    display: none !important;
                "></div>
            </div>
            
            <div class="users-list" style="
                margin-bottom: 20px !important;
                max-height: 50vh !important;
                overflow-y: auto !important;
            ">
                <div style="
                    text-align: center !important;
                    color: white !important;
                    padding: 15px !important;
                ">
                    <i class="fas fa-spinner fa-spin" style="margin-right: 10px !important;"></i>
                    Loading users...
                </div>
            </div>
            
            <button class="cancel-share-btn" style="
                background-color: rgba(255, 255, 255, 0.2) !important;
                color: white !important;
                border: none !important;
                border-radius: 5px !important;
                padding: 10px 20px !important;
                font-size: 1rem !important;
                cursor: pointer !important;
                width: 100% !important;
                transition: background-color 0.3s !important;
            ">Cancel</button>
        </div>
    `;
    
    // Append to body
    document.body.appendChild(modalWrapper);
    
    // Add click handler for the cancel button
    modalWrapper.querySelector(".cancel-share-btn").addEventListener("click", () => {
        closeShareModal();
    });
    
    // Store users data for search functionality
    modalWrapper.userData = [];
    
    // Add search functionality
    const searchInput = modalWrapper.querySelector("#user-search");
    searchInput.addEventListener("input", () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        filterUsers(searchTerm, modalWrapper);
    });
    
    // Fetch and display users
    fetchUsersForSharing(listId, modalWrapper.querySelector(".users-list"), modalWrapper);
    
    // Add fade-in effect
    setTimeout(() => {
        modalWrapper.style.opacity = "0";
        modalWrapper.style.transition = "opacity 0.3s ease";
        
        // Force reflow
        modalWrapper.offsetHeight;
        
        // Fade in
        modalWrapper.style.opacity = "1";
    }, 10);
}

function closeShareModal() {
    const modal = document.querySelector(".share-modal-wrapper");
    if (modal) {
        // Fade out effect
        modal.style.opacity = "0";
        
        // Remove after animation
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

function fetchUsersForSharing(listId, container, modalWrapper) {
    if (!container) {
        container = document.querySelector('.users-list');
    }
    
    if (!container) return;
    
    if (!listId) {
        console.error("No list ID provided to fetchUsersForSharing");
        container.innerHTML = `
            <div style="
                padding: 15px !important;
                background-color: rgba(255, 0, 0, 0.1) !important;
                border-radius: 10px !important;
                color: white !important;
                text-align: center !important;
            ">
                <i class="fas fa-exclamation-triangle" style="margin-right: 8px !important;"></i>
                Error: Missing list ID
            </div>
        `;
        return;
    }
    
    // Store listId in modalWrapper if it exists
    if (modalWrapper && !modalWrapper.hasAttribute('data-list-id')) {
        modalWrapper.setAttribute('data-list-id', listId);
    }
    
    // Fetch users from supabase
    supabaseClient.from("user_profiles")
        .select("id, username")
        .neq("id", currentUser.id)
        .then(({ data, error }) => {
            if (error) {
                console.error("Error fetching users:", error);
                container.innerHTML = `
                    <div style="
                        padding: 15px !important;
                        background-color: rgba(255, 0, 0, 0.1) !important;
                        border-radius: 10px !important;
                        color: white !important;
                        text-align: center !important;
                    ">
                        <i class="fas fa-exclamation-triangle" style="margin-right: 8px !important;"></i>
                        Error loading users
                    </div>
                `;
                return;
            }
            
            if (!data || data.length === 0) {
                container.innerHTML = `
                    <div style="
                        padding: 15px !important;
                        background-color: rgba(255, 255, 255, 0.1) !important;
                        border-radius: 10px !important;
                        color: white !important;
                        text-align: center !important;
                    ">
                        No other users available
                    </div>
                `;
                return;
            }
            
            // Store user data for search functionality
            if (modalWrapper) {
                modalWrapper.userData = data;
            }
            
            // Update the counter
            const resultsCount = modalWrapper ? modalWrapper.querySelector('.search-results-count') : null;
            if (resultsCount) {
                resultsCount.textContent = `${data.length} users`;
                resultsCount.style.display = 'block !important';
            }
            
            // Render all users - make sure to pass the list ID
            renderUsersList(data, container, listId);
        });
}

function renderUsersList(users, container, listId) {
    // Create HTML for each user
    let userItemsHtml = '';
    
    users.forEach(user => {
        userItemsHtml += `
            <div class="user-item" style="
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                padding: 12px !important;
                background-color: rgba(255, 255, 255, 0.1) !important;
                border-radius: 10px !important;
                margin-bottom: 10px !important;
                color: white !important;
            ">
                <span style="overflow: hidden !important; text-overflow: ellipsis !important;">
                    ${user.username || "Unnamed User"}
                </span>
                <button class="share-user-btn" data-user-id="${user.id}" data-list-id="${listId}" style="
                    background-color: rgba(30, 144, 255, 0.7) !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 5px !important;
                    padding: 8px 12px !important;
                    cursor: pointer !important;
                    transition: background-color 0.3s !important;
                ">
                    <i class="fas fa-share-alt" style="margin-right: 5px !important;"></i>
                    Share
                </button>
            </div>
        `;
    });
    
    // If no users match the search
    if (userItemsHtml === '') {
        userItemsHtml = `
            <div style="
                padding: 15px !important;
                background-color: rgba(255, 255, 255, 0.1) !important;
                border-radius: 10px !important;
                color: white !important;
                text-align: center !important;
            ">
                No users match your search
            </div>
        `;
    }
    
    container.innerHTML = userItemsHtml;
    
    // Add event listeners to share buttons
    container.querySelectorAll('.share-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            const listIdToShare = btn.getAttribute('data-list-id'); // Get the listId from the button
            
            if (!listIdToShare) {
                console.error("Missing list ID for sharing");
                showNotification("Error: List ID is missing", "error");
                return;
            }
            
            // Disable button and show loading state
            btn.disabled = true;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sharing...';
            
            // Call sharing function with the correct listId
            console.log(`Attempting to share list ${listIdToShare} with user ${userId}`);
            const success = await shareListWithUser(listIdToShare, userId);
            
            if (success) {
                showNotification("List shared successfully!", "success");
                closeShareModal();
            } else {
                // Reset button on failure
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                showNotification("Failed to share list", "error");
            }
        });
    });
}

function filterUsers(searchTerm, modalWrapper) {
    if (!modalWrapper || !modalWrapper.userData) return;
    
    const usersList = modalWrapper.querySelector('.users-list');
    const resultsCount = modalWrapper.querySelector('.search-results-count');
    const listId = modalWrapper.getAttribute('data-list-id'); // Get the list ID from the modal
    
    if (!usersList) return;
    
    // If search term is empty, show all users
    if (!searchTerm) {
        renderUsersList(modalWrapper.userData, usersList, listId);
        
        if (resultsCount) {
            resultsCount.textContent = `${modalWrapper.userData.length} users`;
            resultsCount.style.display = 'block';
        }
        return;
    }
    
    // Filter users based on search term
    const filteredUsers = modalWrapper.userData.filter(user => {
        const username = (user.username || "").toLowerCase();
        return username.includes(searchTerm);
    });
    
    // Update results count
    if (resultsCount) {
        resultsCount.textContent = `${filteredUsers.length}/${modalWrapper.userData.length}`;
        resultsCount.style.display = 'block';
    }
    
    // Update the users list - pass the listId
    renderUsersList(filteredUsers, usersList, listId);
}

function handleProgressionAfterCompletion(isLevelCompleted) {
    if (!isLevelCompleted && currentGame.streakBonus) {
        // Award completion bonus
        gameState.coins += 5;
        pulseCoins(5);
        
        // Handle level unlocks and progression
        const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
        if (!gameState.unlockedLevels[setKey]) {
            gameState.unlockedLevels[setKey] = new Set();
        }
        gameState.unlockedLevels[setKey].add(gameState.currentLevel);

        const currentStageConfig = gameStructure.stages[gameState.currentStage - 1];
        const isLastLevelInSet = gameState.currentLevel === currentStageConfig.levelsPerSet;
        const isLastSetInStage = gameState.currentSet === currentStageConfig.numSets;

        if (!isLastLevelInSet) {
            startLevel(gameState.currentLevel + 1);
        } else if (!isLastSetInStage) {
            gameState.currentSet++;
            startLevel(1);
        } else {
            showScreen('stage-screen');
        }
        
        saveProgress();
    } else {
        startLevel(gameState.currentLevel);
    }
}

function createListItem(list) {
    return `
        <div class="list-item">
            <h3>${escapeHTML(list.name)}</h3>
            <p>${escapeHTML(list.description)}</p>
        </div>
    `;
}


// Function to change the current stage without starting the game
function changeCurrentStage(stageId) {
    stageId = parseInt(stageId);
    
    // Validate stage ID
    if (stageId < 1 || stageId > 5) {
      console.error("Invalid stage ID:", stageId);
      return;
    }
    
    // Update game state with the new stage
    gameState.currentStage = stageId;
    
    // Update stage description in the profile modal
    const stageDescription = document.getElementById('stage-description');
    if (stageDescription) {
      stageDescription.textContent = getStageDescription(stageId);
    }
    
    // Save the updated game state
    saveProgress();
    
    console.log(`Stage changed to ${stageId}: ${getStageHebrewName(stageId)}`);
    showNotification(`Stage changed to ${getStageHebrewName(stageId)}`, "success");
  }
  
  // Function to update the stage selector to show the current stage
  function updateStageSelector() {
    const stageSelector = document.getElementById('stage-selector');
    const stageDescription = document.getElementById('stage-description');
    
    if (stageSelector) {
      // Set the current value
      stageSelector.value = gameState.currentStage || "1";
      
      // Update the description
      if (stageDescription) {
        stageDescription.textContent = getStageDescription(gameState.currentStage || 1);
      }
    }
  }
  
  // Modify the openProfileModal function to update the stage selector
  function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) {
      console.error("Profile modal element not found");
      return;
    }
    
    // Update username
    const usernameEl = document.getElementById('modal-username');
    if (usernameEl) {
      usernameEl.textContent = currentUser?.user_metadata?.username || 
                              currentUser?.email?.split('@')[0] || 
                              'Guest';
    }
    
    // Update status badge
    const statusEl = document.getElementById('modal-status');
    if (statusEl) {
      const status = currentUser?.status || 'free';
      
      // Remove all status classes first
      statusEl.className = 'status-badge';
      
      // Add appropriate status class
      statusEl.classList.add(status);
      
      // Set appropriate text
      if (status === 'premium') {
        statusEl.textContent = 'PREMIUM';
      } else if (status === 'pending') {
        statusEl.textContent = 'PENDING';
      } else if (status === 'free') {
        statusEl.textContent = 'FREE';
      } else {
        statusEl.textContent = 'GUEST';
      }
    }
    
    // Update stats
    const wordCountEl = document.getElementById('modal-word-count');
    const coinCountEl = document.getElementById('modal-coin-count');
    
    if (wordCountEl) {
      wordCountEl.textContent = document.getElementById('totalWords')?.textContent || '0';
    }
    
    if (coinCountEl) {
      coinCountEl.textContent = document.getElementById('totalCoins')?.textContent || '0';
    }
    
    // Update stage selector to reflect current stage
    updateStageSelector();
    
    // Show the modal
    modal.classList.add('show');
    
    // Close options menu if open
    closeOptionsMenu();
    
    console.log("Profile modal opened");
  }
  
  // Add a start game function that respects the current stage
  function startGameFromStage() {
    // Find the furthest unlocked set in the current stage
    const currentStage = gameState.currentStage || 1;
    const unlockedSets = gameState.unlockedSets[currentStage] || new Set([1]);
    const furthestSet = Math.max(...Array.from(unlockedSets));
    
    // Find the furthest unlocked level in the furthest set
    const setKey = `${currentStage}_${furthestSet}`;
    const unlockedLevels = gameState.unlockedLevels[setKey] || new Set([1]);
    const furthestLevel = Math.max(...Array.from(unlockedLevels));
    
    console.log(`Starting game at Stage ${currentStage}, Set ${furthestSet}, Level ${furthestLevel}`);
    
    // Set the current set and level
    gameState.currentSet = furthestSet;
    gameState.currentLevel = furthestLevel;
    
    // Close the profile modal
    closeProfileModal();
    
    // Start the level
    showScreen('question-screen');
    startLevel(furthestLevel);
  }
  
  // Modify the profile modal to include a Play button
  document.addEventListener('DOMContentLoaded', function() {
    // Find the profile actions div
    const profileActions = document.querySelector('#profile-modal .profile-actions');
    
    if (profileActions) {
      // Add a Play button at the beginning of the actions
      const playButton = document.createElement('button');
      playButton.className = 'play-modal-btn';
      playButton.innerHTML = '<i class="fas fa-play"></i> Play Game';
      playButton.onclick = startGameFromStage;
      
      // Insert at the beginning
      profileActions.insertBefore(playButton, profileActions.firstChild);
      
      // Add CSS for the button
      const style = document.createElement('style');
      style.textContent = `
        .play-modal-btn {
          background-color: var(--accent);
          color: white;
          border: none;
          border-radius: 5px;
          padding: 10px 20px;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-right: 10px;
          transition: background-color 0.3s;
        }
        
        .play-modal-btn:hover {
          background-color: var(--accent-hover);
        }
        
        /* Adjust the layout of profile actions */
        .profile-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
        }
      `;
      document.head.appendChild(style);
    }
  });