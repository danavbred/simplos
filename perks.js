function saveProgress() {
    console.log("Saving game progress...");
    
    // Create the main progress object for database
    const gameProgress = {
        stage: gameState.currentStage,
        set_number: gameState.currentSet,
        level: gameState.currentLevel,
        coins: gameState.coins,
        perks: gameState.perks || {},
        unlocked_sets: serializeSetMap(gameState.unlockedSets),
        unlocked_levels: serializeSetMap(gameState.unlockedLevels),
        perfect_levels: Array.from(gameState.perfectLevels || []),
        completed_levels: Array.from(gameState.completedLevels || []),
        words_learned: gameState.wordsLearned || 0
        // Note: unlocked_perks is still NOT included here (for database)
    };
    
    // CRITICAL FIX: Always save unlocked perks to localStorage
    if (gameState.unlockedPerks) {
        try {
            const perksArray = Array.from(gameState.unlockedPerks);
            localStorage.setItem("simploxUnlockedPerks", JSON.stringify(perksArray));
            console.log("Saved unlocked perks to localStorage:", perksArray);
        } catch (e) {
            console.error("Error saving unlocked perks to localStorage:", e);
        }
    }
    
    // Save regular progress to localStorage
    localStorage.setItem("simploxProgress", JSON.stringify(gameProgress));
    
    // Save to database (without unlocked_perks)
    if (currentUser && currentUser.id) {
        supabaseClient
            .from("game_progress")
            .update(gameProgress)  // This doesn't include unlocked_perks
            .eq("user_id", currentUser.id)
            .then(({ error }) => {
                if (error) console.error("Error saving progress:", error);
            });
    }
    
    return gameProgress;
}

async function loadUserGameProgress() {
    console.log("Loading user game progress...");
    
    let progress = null;
    
    // First, preserve any existing unlocked perks
    const existingUnlockedPerks = gameState.unlockedPerks ? new Set(Array.from(gameState.unlockedPerks)) : new Set();
    console.log("Existing unlocked perks before loading:", Array.from(existingUnlockedPerks));
    
    // Load unlocked perks from localStorage FIRST
    try {
        const localPerks = localStorage.getItem("simploxUnlockedPerks");
        if (localPerks) {
            const loadedPerks = new Set(JSON.parse(localPerks));
            console.log("Loaded perks from localStorage:", Array.from(loadedPerks));
            
            // Initialize or update gameState.unlockedPerks
            if (!gameState.unlockedPerks) {
                gameState.unlockedPerks = new Set(loadedPerks);
            } else {
                // Combine existing and loaded perks
                loadedPerks.forEach(perk => gameState.unlockedPerks.add(perk));
            }
            
            console.log("Combined unlocked perks after localStorage load:", 
                        Array.from(gameState.unlockedPerks));
        } else {
            console.log("No perks found in localStorage");
            
            // Keep existing perks if they exist
            if (existingUnlockedPerks.size > 0) {
                gameState.unlockedPerks = existingUnlockedPerks;
            } else {
                // Initialize new empty set if nothing exists
                gameState.unlockedPerks = new Set();
            }
        }
    } catch (e) {
        console.error("Error loading unlocked perks from localStorage:", e);
        gameState.unlockedPerks = existingUnlockedPerks.size > 0 ? existingUnlockedPerks : new Set();
    }
    
    // Next try to load progress from localStorage
    const localProgress = localStorage.getItem("simploxProgress");
    if (localProgress) {
        try {
            progress = JSON.parse(localProgress);
        } catch (e) {
            console.error("Error parsing local progress:", e);
        }
    }
    
    // If user is logged in, load from Supabase
    if (currentUser && currentUser.id) {
        try {
            const { data, error } = await supabaseClient
                .from("game_progress")
                .select("*")
                .eq("user_id", currentUser.id)
                .single();
                
            if (!error && data) {
                // Server data overrides local data
                progress = data;
            }
        } catch (e) {
            console.error("Error loading progress from server:", e);
        }
    }
    
    if (progress) {
        // Update game state with loaded progress
        gameState.currentStage = progress.stage || 1;
        gameState.currentSet = progress.set_number || 1;
        gameState.currentLevel = progress.level || 1;
        gameState.coins = progress.coins || 0;
        gameState.perks = progress.perks || { timeFreeze: 0, skip: 0, clue: 0, reveal: 0 };
        
        // Convert Arrays back to Sets
        gameState.perfectLevels = new Set(progress.perfect_levels || []);
        gameState.completedLevels = new Set(progress.completed_levels || []);
        
        // Convert unlocked_sets and unlocked_levels back to Maps of Sets
        gameState.unlockedSets = {};
        if (progress.unlocked_sets) {
            Object.keys(progress.unlocked_sets).forEach(stage => {
                gameState.unlockedSets[stage] = new Set(progress.unlocked_sets[stage] || []);
            });
        }
        
        gameState.unlockedLevels = {};
        if (progress.unlocked_levels) {
            Object.keys(progress.unlocked_levels).forEach(key => {
                gameState.unlockedLevels[key] = new Set(progress.unlocked_levels[key] || []);
            });
        }
        
        // NOTE: We already loaded unlockedPerks from localStorage above
        // so we DON'T need to overwrite it with anything from the database
        
        // IMPORTANT: Update UI immediately with the merged perks
        console.log("Final unlocked perks after loadUserGameProgress:", 
                   Array.from(gameState.unlockedPerks));
        updatePerkButtons();
        
        return true;
    }
    
    console.log("No saved progress found");
    return false;
}

function unlockPerk(perkType) {
    console.log(`Unlocking perk: ${perkType}`);
    
    // Make sure unlockedPerks is initialized as a Set
    if (!gameState.unlockedPerks) {
        gameState.unlockedPerks = new Set();
    }
    
    // Add the perk to the unlocked set
    gameState.unlockedPerks.add(perkType);
    console.log(`Added ${perkType} to unlockedPerks:`, Array.from(gameState.unlockedPerks));
    
    // Update UI
    const button = document.getElementById(`${perkType}Perk`);
    if (button) {
        button.classList.add('unlocked');
        button.classList.remove('locked');
        button.disabled = false;
        
        // Show the count
        const countElement = button.querySelector('.perk-count');
        if (countElement) {
            countElement.style.display = 'block';
        }
    }
    
    // Save to localStorage immediately
    try {
        localStorage.setItem("simploxUnlockedPerks", 
            JSON.stringify(Array.from(gameState.unlockedPerks)));
        console.log(`Perk ${perkType} saved to localStorage, all perks:`, 
                   Array.from(gameState.unlockedPerks));
    } catch (e) {
        console.error("Error saving unlocked perks to localStorage:", e);
    }
    
    // Save progress to ensure it persists
    if (typeof saveProgress === 'function') {
        saveProgress();
    }
    
    console.log(`Perk ${perkType} unlocked and saved`);
}

  const PERK_CONFIG = {
    timeFreeze: {
        name: "Time Freeze",
        description: "Pause the timer for 5 seconds",
        cost: 1,
        icon: "fa-clock",
        duration: 5000
    },
    skip: {
        name: "Skip Question",
        description: "Skip the current word without penalty",
        cost: 1,
        icon: "fa-forward"
    },
    clue: {
        name: "Eliminate Wrong Answer",
        description: "Mark one incorrect answer with an X",
        cost: 1,
        icon: "fa-lightbulb"
    },
    reveal: {
        name: "Reveal Correct Answer",
        description: "Show the correct translation",
        cost: 1,
        icon: "fa-eye"
    },
    doubleFreeze: {
        name: "Double Freeze",
        description: "Pause the timer for 10 seconds",
        cost: 1,
        icon: "fa-snowflake",
        duration: 10000,
        requiresPremium: true,
        requiresWordCount: 2
    },
    doubleCoins: {
        name: "Double Coins",
        description: "Next 5 correct answers earn double coins",
        cost: 1,
        icon: "fa-coins",
        effectDuration: 5,
        requiresPremium: true,
        requiresWordCount: 3
    },
    goldenEgg: {
        name: "Golden Egg",
        description: "Skip the entire level",
        cost: 1,
        icon: "fa-egg",
        requiresPremium: true,
        requiresWordCount: 45
    },
    randomPerk: {
        name: "Mystery Box",
        description: "Random perk or bonus coins",
        cost: 1,
        icon: "fa-question",
        requiresPremium: true,
        requiresWordCount: 5
    }
};

function buyPerk(perkId) {
    // Forward to the PerkManager
    PerkManager.buyPerk(perkId);
}

document.querySelector('.perks-container').innerHTML = `
    ${Object.entries(PERK_CONFIG).map(([type, config]) => `
        <button class="perk-button" id="${type}Perk" onclick="buyPerk('${type}')">
            <i class="fas ${config.icon} perk-icon"></i>
            <span class="perk-count">0</span>
        </button>
    `).join('')}
`;

// PerkManager - centralized perk system
const PerkManager = {
    // Track active perks and their states
    activePerks: {},
    
    // Track last notification to prevent duplicates
    lastNotification: {
        message: '',
        timestamp: 0,
        activeNotifications: new Set()
    },
    
    init() {
        console.group("PerkManager Initialization");
        console.log('Initializing PerkManager...');
        
        // Add necessary styles for perk effects
        this.addPerkStyles();
        
        // Get current user ID (or 'guest' if not logged in)
        const userId = currentUser && currentUser.id ? currentUser.id : 'guest';
        console.log(`Initializing perks for user: ${userId}`);
        
        // CRITICAL: ALWAYS start with a fresh unlockedPerks Set
        gameState.unlockedPerks = new Set();
        console.log("Created fresh unlockedPerks Set");
        
        // Basic perks are always unlocked
        const basicPerks = ['timeFreeze', 'skip', 'clue', 'reveal'];
        basicPerks.forEach(perkId => {
            gameState.unlockedPerks.add(perkId);
        });
        console.log("Added basic perks:", Array.from(gameState.unlockedPerks));
        
        // Check premium status
        let isPremium = false;
        if (currentUser && currentUser.status === 'premium') {
            isPremium = true;
            console.log("User detected as premium");
        }
        
        // If user is premium, check if they should have premium perks unlocked
        // based on their progress metrics (not localStorage)
        if (isPremium) {
            console.log("Premium user - checking unlock conditions for premium perks");
            
            // Use either database stats or game state to check conditions
            let wordCount = 0;
            
            // Try to get word count from various sources
            if (window.userStats && typeof window.userStats.uniqueWords === 'number') {
                wordCount = window.userStats.uniqueWords;
                console.log("Using userStats.uniqueWords:", wordCount);
            } else if (gameState && typeof gameState.wordsLearned === 'number') {
                wordCount = gameState.wordsLearned;
                console.log("Using gameState.wordsLearned:", wordCount);
            } else if (currentGame && typeof currentGame.wordsLearned === 'number') {
                wordCount = currentGame.wordsLearned;
                console.log("Using currentGame.wordsLearned:", wordCount);
            }
            
            // Check each premium perk's conditions
            Object.keys(PERK_CONFIG).forEach(perkId => {
                const perkConfig = PERK_CONFIG[perkId];
                if (!perkConfig || basicPerks.includes(perkId)) return;
                
                if (perkConfig.requiresPremium) {
                    // Check word count requirement if it exists
                    if (perkConfig.requiresWordCount && wordCount >= perkConfig.requiresWordCount) {
                        console.log(`Unlocking premium perk ${perkId} based on word count ${wordCount}`);
                        gameState.unlockedPerks.add(perkId);
                    } else if (!perkConfig.requiresWordCount) {
                        // Premium perk with no word count requirement
                        console.log(`Unlocking premium perk ${perkId} (no word count required)`);
                        gameState.unlockedPerks.add(perkId);
                    }
                }
            });
        }
        
        console.log("Final unlocked perks after initialization:", Array.from(gameState.unlockedPerks));
        
        // Update UI
        this.updateAllPerkButtons();
        
        // Attach to game events
        this.attachToGameEvents();
        console.groupEnd();
    },

    
// Add this to the PerkManager object
resetForUserChange() {
    console.log("Resetting perks for user change");
    
    // Clear any localStorage for perks to prevent cross-user contamination
    try {
        localStorage.removeItem("simploxUnlockedPerks");
    } catch (e) {
        console.error("Error removing perks from localStorage:", e);
    }
    
    // Create fresh unlockedPerks with only basic perks
    gameState.unlockedPerks = new Set(['timeFreeze', 'skip', 'clue', 'reveal']);
    
    // Re-initialize the PerkManager to set up perks for the current user
    this.init();
    
    console.log("Perks reset completed for user change");
},

    // Attach to game events to refresh perks when progress changes
    attachToGameEvents() {
        // If you have custom events, use them
        document.addEventListener('wordLearned', () => {
            console.log('Word learned event detected');
            this.refreshPerks();
        });
        
        document.addEventListener('levelCompleted', () => {
            console.log('Level completed event detected');
            this.refreshPerks();
        });
        
        // If no custom events, manually call refreshPerks() after:
        // - Answering correctly
        // - Completing levels
        // - Any place where gameState.wordsLearned changes
    },
    
    refreshPerks() {
        console.log('Refreshing perks availability...');
        
        // Reload user stats if possible
        this.loadUserWordStats().then(() => {
            // Define the current unlocked state of all perks
            const currentUnlocked = {};
            
            // Initialize unlockedPerks set if needed
            if (!gameState.unlockedPerks) {
                gameState.unlockedPerks = new Set();
            }
            
            // Check each perk's current unlock state
            Object.keys(PERK_CONFIG).forEach(perkId => {
                currentUnlocked[perkId] = this.checkPerkConditionsMet(perkId);
                
                // If newly unlocked, announce it
                if (currentUnlocked[perkId] && !gameState.unlockedPerks.has(perkId)) {
                    console.log(`Perk ${perkId} newly unlocked during refresh!`);
                    gameState.unlockedPerks.add(perkId);
                    this.announcePerkUnlocked(perkId);
                }
            });
            
            // Force a refresh of all perk buttons
            this.updateAllPerkButtons();
            
            // Log the current state for debugging
            console.log('Current user stats:', window.userStats);
            console.log('Game state:', gameState);
        });
    },
    
    // Load user word stats for conditional perks
    async loadUserWordStats() {
        // Initialize default stats
        if (!window.userStats) {
            window.userStats = { uniqueWords: 0 };
        }
        
        // If no logged in user, use local game state
        if (!currentUser || !currentUser.id) {
            console.log('No user logged in, using local game state');
            
            // Try to get word count from game state
            if (gameState && typeof gameState.wordsLearned === 'number') {
                window.userStats.uniqueWords = gameState.wordsLearned;
                console.log(`Using local game state word count: ${window.userStats.uniqueWords}`);
            } else if (currentGame && typeof currentGame.wordsLearned === 'number') {
                window.userStats.uniqueWords = currentGame.wordsLearned;
                console.log(`Using current game word count: ${window.userStats.uniqueWords}`);
            }
            
            return;
        }
        
        // Try to get stats from database for logged in users
        try {
            const { data, error } = await supabaseClient
                .from('player_stats')
                .select('unique_words_practiced')
                .eq('user_id', currentUser.id)
                .single();
                
            if (error) throw error;
            
            // Update stats from database
            if (data && typeof data.unique_words_practiced === 'number') {
                window.userStats.uniqueWords = data.unique_words_practiced;
            }
            
            console.log('Loaded user word stats from DB:', window.userStats);
        } catch (error) {
            console.error('Error loading user word stats:', error);
            
            // If DB fetch fails, still try local game state
            if (gameState && typeof gameState.wordsLearned === 'number') {
                window.userStats.uniqueWords = gameState.wordsLearned;
                console.log(`Fallback to local game state: ${window.userStats.uniqueWords} words`);
            }
        }
    },
    
    // Helper to check if perk conditions are met
    // REPLACE - Update the checkPerkConditionsMet method

checkPerkConditionsMet(perkId) {
    const perkConfig = PERK_CONFIG[perkId];
    if (!perkConfig) return false;
    
    // If this perk is already in gameState.unlockedPerks, consider it unlocked
    if (gameState.unlockedPerks && gameState.unlockedPerks.has(perkId)) {
        return true;
    }
    
    // For basic perks (no special requirements), always return true
    if (!perkConfig.requiresPremium && !perkConfig.requiresWordCount) {
        return true;
    }
    
    let meetsRequirements = true;
    
    // Check premium status if required
    if (perkConfig.requiresPremium) {
        const isPremium = currentUser && currentUser.status === 'premium';
        if (!isPremium) {
            meetsRequirements = false;
        }
    }
    
    // Check word count if required and if still meeting other requirements
    if (meetsRequirements && perkConfig.requiresWordCount) {
        // Get word count from various possible sources
        let userWordCount = 0;
        
        // First check window.userStats (set from database)
        if (window.userStats && typeof window.userStats.uniqueWords === 'number') {
            userWordCount = window.userStats.uniqueWords;
        } 
        // Then check player progress
        else if (currentUser && gameState && gameState.wordsLearned) {
            userWordCount = gameState.wordsLearned;
        }
        // Lastly check currentGame progress
        else if (currentGame && currentGame.wordsLearned) {
            userWordCount = currentGame.wordsLearned;
        }
        
        if (userWordCount < perkConfig.requiresWordCount) {
            meetsRequirements = false;
        }
    }
    
    return meetsRequirements;
},

announcePerkUnlocked(perkId) {
    const perkConfig = PERK_CONFIG[perkId];
    if (!perkConfig) return;
    
    // Double-check that perk is actually unlocked before announcing
    if (!this.checkPerkConditionsMet(perkId)) {
        console.warn(`Attempted to announce unlock for ${perkId} but conditions are not met`);
        return;
    }
    
    console.log(`Announcing unlock for perk: ${perkId}`);
    
    // CRITICAL ADDITION: Actually unlock the perk in gameState
    if (!gameState.unlockedPerks) {
        gameState.unlockedPerks = new Set();
    }
    gameState.unlockedPerks.add(perkId);
    
    // Save to localStorage immediately
    try {
        localStorage.setItem("simploxUnlockedPerks", 
            JSON.stringify(Array.from(gameState.unlockedPerks)));
        console.log(`Saved unlocked perk ${perkId} to localStorage, all unlocked perks:`, 
            Array.from(gameState.unlockedPerks));
    } catch (e) {
        console.error("Error saving unlocked perks to localStorage:", e);
    }
    
    // Show the visual effect based on perk type
    switch(perkId) {
        case 'timeFreeze':
            this.showFreezeEffect(false);
            break;
        case 'skip':
            this.showSkipEffect(false);
            break;
        case 'clue':
            this.showClueEffect();
            break;
        case 'reveal':
            this.showRevealEffect();
            break;
        case 'doubleFreeze':
            this.showFreezeEffect(true);
            break;
        case 'doubleCoins':
            this.showDoubleCoinsEffect();
            break;
        case 'goldenEgg':
            this.showGoldenEggEffect();
            break;
        case 'randomPerk':
            this.showMysteryEffect();
            break;
        default:
            // No specific effect for this perk
            break;
    }
    
    // Show full unlock notification for premium perks
    if (perkConfig.requiresPremium) {
        this.showPerkUnlockNotification(perkId, perkConfig);
    } else {
        // Simple notification for non-premium perks
        this.showNotification(`New Perk Unlocked: ${perkConfig.name || perkId}!`, 'success');
    }
    
    // Highlight the perk button
    const perkButton = document.getElementById(`${perkId}Perk`);
    if (perkButton) {
        perkButton.classList.add('perk-unlocked-pulse');
        
        // Remove the class after a while
        setTimeout(() => {
            perkButton.classList.remove('perk-unlocked-pulse');
        }, 3000);
    }
    
    // Also call saveProgress to save to database if needed
    if (typeof saveProgress === 'function') {
        saveProgress();
    }
    
    // Immediately update the UI to reflect the unlocked state
    this.updatePerkButton(perkId);
},

// ADD - Add this after the announcePerkUnlocked method
attachToGameEvents() {
    // Add a direct listener for clicks on the home button
    document.querySelectorAll('.home-button').forEach(button => {
        button.addEventListener('click', () => {
            console.log('Home button clicked, forcing save of unlocked perks');
            if (gameState && gameState.unlockedPerks) {
                // Force immediate save to localStorage
                localStorage.setItem("simploxUnlockedPerks", 
                    JSON.stringify(Array.from(gameState.unlockedPerks)));
                console.log("Saved perks before home navigation:", 
                    Array.from(gameState.unlockedPerks));
            }
        });
    });
    
    // Listen for existing game events
    document.addEventListener('wordLearned', () => {
        console.log('Word learned event detected');
        this.refreshPerks();
    });
    
    document.addEventListener('levelCompleted', () => {
        console.log('Level completed event detected');
        this.refreshPerks();
    });
    
    // Force reload unlocked perks when returning to visible state
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('Page visibility changed to visible, reloading perks');
            try {
                const localPerks = localStorage.getItem("simploxUnlockedPerks");
                if (localPerks) {
                    const parsedPerks = JSON.parse(localPerks);
                    if (gameState && !gameState.unlockedPerks) {
                        gameState.unlockedPerks = new Set();
                    }
                    
                    parsedPerks.forEach(perkId => {
                        if (gameState && gameState.unlockedPerks) {
                            gameState.unlockedPerks.add(perkId);
                        }
                    });
                    
                    console.log('Reloaded perks from localStorage:', 
                        gameState.unlockedPerks ? Array.from(gameState.unlockedPerks) : 'no gameState.unlockedPerks');
                }
            } catch (e) {
                console.error('Error reloading perks from localStorage:', e);
            }
            
            // Update UI
            this.updateAllPerkButtons();
        }
    });
},
    
    // Show an animated perk unlock notification
    showPerkUnlockNotification(perkId, perkConfig) {
        // Create a toast notification instead of a full-screen overlay
        const toast = document.createElement('div');
        toast.className = 'perk-unlock-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 280px;
            background: linear-gradient(135deg, #4a2b7a, #203a69);
            border-radius: 12px;
            padding: 15px;
            box-shadow: 0 6px 16px rgba(0,0,0,0.3), 0 0 10px rgba(80, 100, 255, 0.3);
            color: white;
            z-index: 9999;
            transform: translateX(120%);
            transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            overflow: hidden;
        `;
        
        // Create shining background effect
        const shine = document.createElement('div');
        shine.style.cssText = `
            position: absolute;
            top: -100%;
            left: -100%;
            width: 300%;
            height: 300%;
            background: linear-gradient(135deg, 
                rgba(255,255,255,0) 0%, 
                rgba(255,255,255,0.1) 40%, 
                rgba(255,255,255,0.2) 50%, 
                rgba(255,255,255,0.1) 60%, 
                rgba(255,255,255,0) 100%);
            transform: rotate(45deg);
            animation: shineEffect 3s ease-in-out infinite;
            z-index: 0;
        `;
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            background: transparent;
            border: none;
            color: rgba(255,255,255,0.7);
            font-size: 18px;
            cursor: pointer;
            z-index: 2;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
        `;
        closeBtn.addEventListener('mouseover', () => {
            closeBtn.style.color = 'white';
            closeBtn.style.background = 'rgba(255,255,255,0.1)';
        });
        closeBtn.addEventListener('mouseout', () => {
            closeBtn.style.color = 'rgba(255,255,255,0.7)';
            closeBtn.style.background = 'transparent';
        });
        closeBtn.addEventListener('click', () => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 500);
        });
        
        // Content container
        const content = document.createElement('div');
        content.style.cssText = `position: relative; z-index: 1;`;
        content.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <div class="perk-icon-wrapper" style="
                    width: 40px;
                    height: 40px;
                    background: radial-gradient(circle, rgba(255,215,0,0.2) 0%, rgba(255,215,0,0) 70%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 12px;
                    animation: pulseGlow 2s infinite ease-in-out;
                ">
                    <i class="fas ${perkConfig.icon}" style="
                        font-size: 20px;
                        color: #FFD700;
                        filter: drop-shadow(0 0 5px rgba(255,215,0,0.7));
                    "></i>
                </div>
                <div>
                    <h3 style="color: #FFD700; margin: 0; font-size: 16px; font-weight: bold;">
                        New Perk Unlocked!
                    </h3>
                    <h4 style="color: white; margin: 4px 0 0 0; font-size: 14px;">
                        ${perkConfig.name}
                    </h4>
                </div>
            </div>
            <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 13px; line-height: 1.4;">
                ${perkConfig.description}
            </p>
            <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 8px; text-align: right;">
                Cost: ${perkConfig.cost} coins
            </div>
            <div class="progress-bar" style="
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2px;
                width: 100%;
                background: rgba(255,255,255,0.2);
            ">
                <div class="progress" style="
                    height: 100%;
                    width: 100%;
                    background: #FFD700;
                    transform-origin: left;
                    animation: shrinkProgress 5s linear forwards;
                "></div>
            </div>
        `;
        
        toast.appendChild(shine);
        toast.appendChild(closeBtn);
        toast.appendChild(content);
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
            
            // Add pulse effect to the matching perk button
            const perkButton = document.getElementById(`${perkId}Perk`);
            if (perkButton) {
                perkButton.classList.add('perk-unlocked-pulse');
                
                // Remove perk button highlight after animation
                setTimeout(() => {
                    perkButton.classList.remove('perk-unlocked-pulse');
                }, 6000);
            }
            
            // Auto-remove after 5 seconds if not closed manually
            setTimeout(() => {
                if (toast.parentNode && toast.style.transform !== 'translateX(120%)') {
                    toast.style.transform = 'translateX(120%)';
                    setTimeout(() => {
                        if (toast.parentNode) {
                            toast.parentNode.removeChild(toast);
                        }
                    }, 500);
                }
            }, 5000);
        }, 100);
        
        // Show a smaller notification as well
        this.showNotification(`New Perk: ${perkConfig.name}!`, 'success', 3000);
    },
    
    updateAllPerkButtons() {
        console.log("Updating all perk buttons, current unlocked perks:", 
                    gameState.unlockedPerks ? Array.from(gameState.unlockedPerks) : "none");
        
        // Ensure unlockedPerks exists
        if (!gameState.unlockedPerks) {
            gameState.unlockedPerks = new Set();
            
            // Basic perks are always unlocked
            const basicPerks = ['timeFreeze', 'skip', 'clue', 'reveal'];
            basicPerks.forEach(perkId => {
                gameState.unlockedPerks.add(perkId);
            });
        }
        
        // First pass - update all buttons
        Object.keys(PERK_CONFIG).forEach(perkId => {
            this.updatePerkButton(perkId);
        });
        
        // Second pass - check for any premium locks that need to be updated
        const isPremium = currentUser && currentUser.status === 'premium';
        
        // If premium, ensure all premium-lock indicators are removed
        if (isPremium) {
            document.querySelectorAll('.premium-lock').forEach(lock => {
                if (lock.parentNode) {
                    lock.remove();
                }
            });
        }
        
        // Final check - make sure all basic perks are always unlocked
        const basicPerks = ['timeFreeze', 'skip', 'clue', 'reveal'];
        basicPerks.forEach(perkId => {
            const button = document.getElementById(`${perkId}Perk`);
            if (button) {
                button.classList.add('unlocked');
                button.classList.remove('locked');
                // Only enable if player can afford it
                const canAfford = (gameState.coins || 0) >= (PERK_CONFIG[perkId].cost || 1);
                button.disabled = !canAfford;
            }
        });
    },

updatePerkButton(perkId) {
    const perkButton = document.getElementById(`${perkId}Perk`);
    if (!perkButton) {
        console.log(`Button for perk ${perkId} not found in DOM`);
        return;
    }
    
    const perkConfig = PERK_CONFIG[perkId];
    if (!perkConfig) {
        console.log(`Config for perk ${perkId} not found`);
        return;
    }
    
    // First, ensure all perk buttons are visible
    perkButton.style.display = 'flex';
    
    // Check if player is premium
    const isPremium = currentUser && currentUser.status === 'premium';
    
    // First check if the perk is actually unlocked in gameState.unlockedPerks
    const isPerkUnlocked = gameState.unlockedPerks && gameState.unlockedPerks.has(perkId);
    
    // If this perk requires premium and player isn't premium, show locked state
    if (perkConfig.requiresPremium && !isPremium) {
        // Add or ensure premium lock indicator exists
        let lockIndicator = perkButton.querySelector('.premium-lock');
        if (!lockIndicator) {
            lockIndicator = document.createElement('div');
            lockIndicator.className = 'premium-lock';
            lockIndicator.innerHTML = '👑';
            lockIndicator.style.cssText = `
                position: absolute;
                top: -5px;
                right: -5px;
                font-size: 12px;
                background: gold;
                color: #333;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                z-index: 2;
            `;
            
            // Make sure button has position relative
            perkButton.style.position = 'relative';
            perkButton.appendChild(lockIndicator);
        }
        
        // Disable the button
        perkButton.disabled = true;
        perkButton.classList.add("disabled");
        perkButton.classList.add("locked");
        perkButton.classList.remove("unlocked");
        perkButton.style.opacity = "0.6";
        
        // Set count to PRO instead of a number
        const perkCount = perkButton.querySelector(".perk-count");
        if (perkCount) {
            perkCount.textContent = "PRO";
            perkCount.style.fontSize = "8px";
        }
        
        return;
    }
    
    // If the perk is unlocked in gameState, update its visual state accordingly
    if (isPerkUnlocked) {
        // Remove any lock indicators
        const lockIndicator = perkButton.querySelector('.premium-lock, .word-lock');
        if (lockIndicator) {
            lockIndicator.remove();
        }
        
        // Update visual classes
        perkButton.classList.remove("locked");
        perkButton.classList.add("unlocked");
        
        // Check if player can afford it (for quantity display)
        const coins = gameState.coins || 0;
        const purchaseCount = Math.floor(coins / perkConfig.cost);
        const canAfford = purchaseCount > 0;
        
        // Update button state based on affordability
        perkButton.disabled = !canAfford;
        perkButton.classList.toggle("disabled", !canAfford);
        
        // Restore normal opacity
        perkButton.style.opacity = canAfford ? "1" : "0.5";
        
        // Update counter display
        const perkCount = perkButton.querySelector(".perk-count");
        if (perkCount) {
            perkCount.textContent = canAfford ? purchaseCount.toString() : "0";
            perkCount.style.fontSize = ""; // Reset font size
            perkCount.style.display = "block"; // Make sure it's visible
        }
        
        return;
    }
    
    // Check if player meets word count requirement
    const meetsWordCount = !perkConfig.requiresWordCount || 
                  (window.userStats && window.userStats.uniqueWords >= perkConfig.requiresWordCount);

    // If this perk requires specific word count and player doesn't meet it, show locked state
    if (perkConfig.requiresWordCount && !meetsWordCount) {
        // Add or ensure word count lock indicator
        let lockIndicator = perkButton.querySelector('.word-lock');
        if (!lockIndicator) {
            lockIndicator = document.createElement('div');
            lockIndicator.className = 'word-lock';
            lockIndicator.innerHTML = perkConfig.requiresWordCount;
            lockIndicator.style.cssText = `
                position: absolute;
                top: -5px;
                right: -5px;
                font-size: 10px;
                background: #4caf50;
                color: white;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                z-index: 2;
            `;
            
            // Make sure button has position relative
            perkButton.style.position = 'relative';
            perkButton.appendChild(lockIndicator);
        }
        
        // Disable the button and update visual state
        perkButton.disabled = true;
        perkButton.classList.add("disabled");
        perkButton.classList.add("locked");
        perkButton.classList.remove("unlocked");
        perkButton.style.opacity = "0.6";
        
        // Set counter to lock icon instead of a number
        const perkCount = perkButton.querySelector(".perk-count");
        if (perkCount) {
            perkCount.textContent = "🔒";
            perkCount.style.fontSize = ""; // Reset font size
        }
        
        return;
    }
    
    // By default, if not explicitly handled above, show as locked
    perkButton.classList.add("locked");
    perkButton.classList.remove("unlocked");
    
    // Remove any lock indicators if the perk is now available
    const lockIndicator = perkButton.querySelector('.premium-lock, .word-lock');
    if (lockIndicator) {
        lockIndicator.remove();
    }
    
    // Now check if player can afford it
    const coins = gameState.coins || 0;
    const purchaseCount = Math.floor(coins / perkConfig.cost);
    const canAfford = purchaseCount > 0;
    
    // Update button state based on affordability
    perkButton.disabled = !canAfford;
    perkButton.classList.toggle("disabled", !canAfford);
    
    // Restore normal opacity
    perkButton.style.opacity = canAfford ? "1" : "0.5";
    
    // Update counter display
    const perkCount = perkButton.querySelector(".perk-count");
    if (perkCount) {
        perkCount.textContent = canAfford ? purchaseCount.toString() : "0";
        perkCount.style.fontSize = ""; // Reset font size
    }
},
    
    // Buy and activate a perk
    buyPerk(perkId) {
        const perkConfig = PERK_CONFIG[perkId];
        if (!perkConfig) {
            console.error(`Perk not found: ${perkId}`);
            return;
        }
        
        // Check if player can afford the perk
        if (gameState.coins < perkConfig.cost) {
            this.showNotification(`Need ${perkConfig.cost} coins!`, 'error');
            return;
        }
        
        // Use CoinsManager to handle coin deduction
        CoinsManager.updateCoins(-perkConfig.cost).then(() => {
            // Activate the perk
            this.activatePerk(perkId);
            
            // Update the UI
            this.updateAllPerkButtons();
            saveProgress();
        }).catch(err => {
            console.error("Error updating coins:", err);
        });
    },
    
    // Activate a specific perk
    activatePerk(perkId) {
        const perkConfig = PERK_CONFIG[perkId];
        if (!perkConfig) return;
        
        console.log(`Activating perk: ${perkConfig.name}`);
        
        // Call the appropriate handler based on perk type
        switch(perkId) {
            case 'timeFreeze':
                this.handleTimeFreezeEffect(perkConfig);
                break;
            case 'skip':
                this.handleSkipEffect(perkConfig);
                break;
            case 'clue':
                this.handleClueEffect(perkConfig);
                break;
            case 'reveal':
                this.handleRevealEffect(perkConfig);
                this.showRevealEffect();
                break;
            case 'doubleFreeze':
                this.handleDoubleFreezeEffect(perkConfig);
                break;
            case 'doubleCoins':
                this.handleDoubleCoinsEffect(perkConfig);
                break;
            case 'goldenEgg':
                this.handleGoldenEggEffect(perkConfig);
                break;
            case 'randomPerk':
                this.handleRandomPerkEffect(perkConfig);
                break;
            default:
                console.warn(`No handler found for perk: ${perkId}`);
        }
        
        // Show notification with debounce
        this.showNotification(`Used ${perkConfig.name}!`, 'success');
    },
    
    // Show notification with debounce to prevent duplicates
    showNotification(message, type, duration = 3000) {
        const now = Date.now();
        
        // Prevent duplicate notifications within 1 second
        if (message === this.lastNotification.message && 
            now - this.lastNotification.timestamp < 1000) {
            console.log('Preventing duplicate notification:', message);
            return;
        }
        
        // Check if this notification is already active
        if (this.lastNotification.activeNotifications.has(message)) {
            console.log('Notification already active:', message);
            return;
        }
        
        // Update tracking data
        this.lastNotification.message = message;
        this.lastNotification.timestamp = now;
        this.lastNotification.activeNotifications.add(message);
        
        // Call the original notification function
        showNotification(message, type, duration);
        
        // Remove from active set after it expires
        setTimeout(() => {
            this.lastNotification.activeNotifications.delete(message);
        }, duration + 100);
    },
    
    // Individual perk effect handlers
    handleTimeFreezeEffect(perkConfig) {
        isFrozen = true;
        
        // Add visual feedback
        const timerElement = document.querySelector('.timer-value');
        if (timerElement) {
            timerElement.classList.add('frozen');
        }
        
        // Show freezing effect
        this.showFreezeEffect();
        
        // Unfreeze after duration
        setTimeout(() => {
            isFrozen = false;
            if (timerElement) {
                timerElement.classList.remove('frozen');
            }
        }, perkConfig.duration);
    },
    
    handleDoubleFreezeEffect(perkConfig) {
        isFrozen = true;
        
        // Add visual feedback
        const timerElement = document.querySelector('.timer-value');
        if (timerElement) {
            timerElement.classList.add('frozen');
            timerElement.classList.add('double-frozen');
        }
        
        // Show stronger freezing effect
        this.showFreezeEffect(true);
        
        // Unfreeze after duration
        setTimeout(() => {
            isFrozen = false;
            if (timerElement) {
                timerElement.classList.remove('frozen');
                timerElement.classList.remove('double-frozen');
            }
        }, perkConfig.duration);
    },
    
    handleSkipEffect(perkConfig) {
        // Add visual effect
        this.showSkipEffect(false);
        
        // Wait a moment for the effect to be visible
        setTimeout(() => {
            // Process the skip based on game mode
            if (currentGame.currentIndex < currentGame.words.length) {
                if (currentGame.isArcadeMode) {
                    handleArcadeAnswer(true, true); // true=correct, true=perkMode
                } else if (currentGame.isCustomPractice) {
                    handleCustomPracticeAnswer(true, true); // true=correct, true=skipAnimation
                } else {
                    handleAnswer(true, true); // true=correct, true=skipMode
                }
            }
        }, 300);
    },
    
    handleDoubleCoinsEffect(perkConfig) {
        // Initialize counter for double coins
        currentGame.doubleCoinsRemaining = perkConfig.effectDuration || 5;
        
        // Create double coins effect
        this.showDoubleCoinsEffect();
        
        this.showNotification(`Double coins activated for next ${currentGame.doubleCoinsRemaining} correct answers!`, 'success');
    },
    
    handleClueEffect(perkConfig) {
        const buttons = document.querySelectorAll('.buttons button');
        const correctAnswer = currentGame.isHebrewToEnglish ? 
            currentGame.words[currentGame.currentIndex] : 
            currentGame.translations[currentGame.currentIndex];
        
        // Find buttons with wrong answers
        const wrongButtons = Array.from(buttons).filter(btn => 
            btn.textContent !== correctAnswer
        );
        
        if (wrongButtons.length > 0) {
            // Find which wrong answers already have an X
            const unmarkedButtons = wrongButtons.filter(btn => 
                !btn.querySelector('.wrong-answer-x')
            );
            
            // If there are unmarked wrong buttons, mark one
            if (unmarkedButtons.length > 0) {
                const buttonToMark = unmarkedButtons[Math.floor(Math.random() * unmarkedButtons.length)];
                
                // Make sure button has position relative
                buttonToMark.style.position = 'relative';
                
                // Create X overlay
                const xOverlay = document.createElement('div');
                xOverlay.className = 'wrong-answer-x';
                xOverlay.innerHTML = '❌';
                xOverlay.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2rem;
                    color: red;
                    pointer-events: none;
                    z-index: 5;
                    animation: popIn 0.3s forwards;
                `;
                
                // Add X to button
                buttonToMark.appendChild(xOverlay);
                
                // Disable the button
                buttonToMark.disabled = true;
                
                // Add flash effect
                this.showClueEffect();
            }
        }
    },
    
    handleRevealEffect(perkConfig) {
        const correctAnswer = currentGame.isHebrewToEnglish ? 
            currentGame.words[currentGame.currentIndex] : 
            currentGame.translations[currentGame.currentIndex];
        
        document.querySelectorAll('.buttons button').forEach(btn => {
            if (btn.textContent === correctAnswer) {
                // Remove any existing classes that might interfere
                btn.classList.remove('wrong');
                
                // Add reveal highlight
                btn.classList.add('reveal-highlight');
                
                // Auto-click the correct answer after a delay
                setTimeout(() => {
                    // Clean up highlight first
                    btn.classList.remove('reveal-highlight');
                    
                    // Then simulate click
                    if (currentGame.isArcadeMode) {
                        handleArcadeAnswer(true, true);
                    } else if (currentGame.isCustomPractice) {
                        handleCustomPracticeAnswer(true, true);
                    } else {
                        handleAnswer(true, true);
                    }
                }, 2000);
            }
        });
    },
    
    handleGoldenEggEffect(perkConfig) {
        // Show dramatic egg effect
        this.showGoldenEggEffect();
        
        // Skip entire level after the effect
        setTimeout(() => {
            // Handle level completion based on current game mode
            if (currentGame.isBossLevel) {
                currentGame.bossDefeated = true;
                showBossDefeatEffect();
            } else if (currentGame.isCustomPractice) {
                // Mark level as completed
                customGameState.wordsCompleted += currentGame.words.length;
                customGameState.completedLevels.add(customGameState.currentLevel);
                handleCustomLevelCompletion();
            } else {
                // Complete normal level
                currentGame.currentIndex = currentGame.words.length;
                handleLevelCompletion();
            }
        }, 2000);
    },
    
    handleRandomPerkEffect(perkConfig) {
        // Show mystery box effect
        this.showMysteryEffect();
        
        // Wait for effect then determine reward
        setTimeout(() => {
            // Get all perk IDs except goldenEgg and randomPerk itself
            const eligiblePerks = Object.keys(PERK_CONFIG).filter(id => 
                id !== 'goldenEgg' && id !== 'randomPerk'
            );
            
            // Random coin amounts
            const coinOptions = [30, 70, 100, 150, 300];
            
            // 50% chance for perk, 50% for coins
            if (Math.random() < 0.5 && eligiblePerks.length > 0) {
                // Get random perk
                const randomPerkId = eligiblePerks[Math.floor(Math.random() * eligiblePerks.length)];
                const randomPerkConfig = PERK_CONFIG[randomPerkId];
                
                // Show what was selected
                this.showNotification(`Mystery Box: ${randomPerkConfig.name}!`, 'success');
                
                // Activate the random perk with a small delay
                setTimeout(() => {
                    this.activatePerk(randomPerkId);
                }, 500);
            } else {
                // Award random coins
                const randomCoins = coinOptions[Math.floor(Math.random() * coinOptions.length)];
                
                CoinsManager.updateCoins(randomCoins).then(() => {
                    this.showNotification(`Mystery Box: ${randomCoins} coins!`, 'success');
                    pulseCoins(randomCoins);
                });
            }
        }, 1500);
    },
    
    // Visual effects for perks
    showFreezeEffect(isDouble = false) {
        // Create freeze overlay
        const overlay = document.createElement('div');
        overlay.className = 'freeze-effect-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(135, 206, 250, 0.2) 0%, rgba(0, 0, 0, 0) 70%);
            pointer-events: none;
            z-index: 9999;
            animation: freezePulse ${isDouble ? '2s' : '1s'} forwards;
        `;
        
        // Add snowflake to center of screen
        const snowflake = document.createElement('div');
        snowflake.className = 'freezing-snowflake';
        snowflake.innerHTML = '❄️';
        snowflake.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: ${isDouble ? '8rem' : '6rem'};
            filter: drop-shadow(0 0 10px #87CEFA);
            animation: snowflakeGrow ${isDouble ? '2s' : '1s'} forwards;
        `;
        
        overlay.appendChild(snowflake);
        document.body.appendChild(overlay);
        
        // Remove after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, isDouble ? 2000 : 1000);
    },
    
    showSkipEffect(isDouble = false) {
        // Create skip effect overlay
        const overlay = document.createElement('div');
        overlay.className = 'skip-effect-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.1);
            pointer-events: none;
            z-index: 9999;
        `;
        
        // Add fast-forward symbol
        const symbol = document.createElement('div');
        symbol.className = 'skip-symbol';
        symbol.innerHTML = isDouble ? '⏭️' : '⏩';
        symbol.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: ${isDouble ? '8rem' : '6rem'};
            filter: drop-shadow(0 0 10px rgba(255,255,255,0.7));
            animation: skipSymbolGrow 0.8s forwards;
        `;
        
        overlay.appendChild(symbol);
        document.body.appendChild(overlay);
        
        // Remove after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 800);
    },
    
    showDoubleCoinsEffect() {
        // Create double coins effect overlay
        const overlay = document.createElement('div');
        overlay.className = 'double-coins-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(255, 215, 0, 0.2) 0%, rgba(0, 0, 0, 0) 70%);
            pointer-events: none;
            z-index: 9999;
            animation: doubleCoinsGlow 1.5s forwards;
        `;
        
        // Add double coin symbols
        const coins = document.createElement('div');
        coins.className = 'double-coins-symbols';
        coins.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 6rem;
            animation: coinsAppear 1.5s forwards;
        `;
        
        // Create overlapping coins
        coins.innerHTML = `
            <div style="position: absolute; top: 0; left: -30px; transform: scale(0); filter: drop-shadow(0 0 15px gold); animation: coinGrow 1s 0.2s forwards;">💰</div>
            <div style="position: absolute; top: -20px; left: 0px; transform: scale(0); filter: drop-shadow(0 0 15px gold); animation: coinGrow 1s 0.4s forwards;">💰</div>
            <div style="position: absolute; top: 0; left: 30px; transform: scale(0); filter: drop-shadow(0 0 15px gold); animation: coinGrow 1s 0.6s forwards;">💰</div>
        `;
        
        overlay.appendChild(coins);
        document.body.appendChild(overlay);
        
        // Add marker to coin counter
        const coinCounters = document.querySelectorAll('.coin-count');
        coinCounters.forEach(counter => {
            // Create a marker to show double coins is active
            const marker = document.createElement('div');
            marker.className = 'double-coins-marker';
            marker.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                background: gold;
                color: black;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                font-size: 12px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                animation: pulseBadge 2s infinite;
            `;
            marker.textContent = '2x';
            
            // Make counter position relative if it's not already
            if (getComputedStyle(counter).position === 'static') {
                counter.style.position = 'relative';
            }
            
            counter.appendChild(marker);
            
            // Remove marker when effect expires
            setTimeout(() => {
                if (marker.parentNode) {
                    marker.remove();
                }
            }, 30000); // Remove after 30 seconds (safety backup)
        });
        
        // Remove overlay after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 2000);
    },
    
    showClueEffect() {
    // Create clue effect overlay
    const overlay = document.createElement('div');
    overlay.className = 'clue-effect-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle, rgba(255, 255, 0, 0.2) 0%, rgba(0, 0, 0, 0) 70%);
        pointer-events: none;
        z-index: 9999;
        animation: clueFlash 2s forwards;
    `;
    
    // Add light bulb to center of screen
    const lightBulb = document.createElement('div');
    lightBulb.className = 'clue-light-bulb';
    lightBulb.innerHTML = '💡'; // Light bulb emoji
    lightBulb.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        font-size: 9rem;
        filter: drop-shadow(0 0 10px rgba(255, 255, 1, 1));
        animation: lightBulbGrow 3s forwards;
    `;
    
    overlay.appendChild(lightBulb);
    document.body.appendChild(overlay);
    
    // Remove after animation - increased from 1000 to 2000
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }, 2000);
},
    
    showRevealEffect() {
        // Create reveal effect overlay
        const overlay = document.createElement('div');
        overlay.className = 'reveal-effect-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(50, 205, 50, 0.2) 0%, rgba(0, 0, 0, 0) 70%);
            pointer-events: none;
            z-index: 9999;
            animation: revealPulse 1.5s forwards;
        `;
        
        // Add eye symbol to center of screen
        const eye = document.createElement('div');
        eye.className = 'reveal-eye';
        eye.innerHTML = '👁️';
        eye.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: 6rem;
            filter: drop-shadow(0 0 15px lime);
            animation: eyeGrow 1.5s forwards;
        `;
        
        overlay.appendChild(eye);
        document.body.appendChild(overlay);
        
        // Remove after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 1500);
    },
    
    showGoldenEggEffect() {
        // Create golden egg overlay
        const overlay = document.createElement('div');
        overlay.className = 'golden-egg-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, rgba(0, 0, 0, 0) 70%);
            pointer-events: none;
            z-index: 9999;
            animation: goldenEggPulse 2s forwards;
        `;
        
        // Add egg emoji to center of screen
        const egg = document.createElement('div');
        egg.className = 'golden-egg';
        egg.innerHTML = '🥚';
        egg.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: 10rem;
            filter: drop-shadow(0 0 20px gold);
            animation: eggGrow 2s forwards;
        `;
        
        overlay.appendChild(egg);
        document.body.appendChild(overlay);
        
        // Remove after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 2000);
    },
    
    showMysteryEffect() {
        // Create mystery box overlay
        const overlay = document.createElement('div');
        overlay.className = 'mystery-box-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(128, 0, 128, 0.2) 0%, rgba(0, 0, 0, 0) 70%);
            pointer-events: none;
            z-index: 9999;
            animation: mysteryPulse 1.5s forwards;
        `;
        
        // Add question mark to center of screen
        const questionMark = document.createElement('div');
        questionMark.className = 'question-mark';
        questionMark.innerHTML = '❓';
        questionMark.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: 8rem;
            filter: drop-shadow(0 0 15px purple);
            animation: questionMarkGrow 1.5s forwards;
        `;
        
        overlay.appendChild(questionMark);
        document.body.appendChild(overlay);
        
        // Remove after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 1500);
    },
    
    // Add all necessary styles for perk effects
    addPerkStyles() {
        if (!document.getElementById('perk-effect-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'perk-effect-styles';
            styleElement.textContent = `
                /* Freeze Effect */
                @keyframes freezePulse {
                    0% { opacity: 0; }
                    50% { opacity: 1; }
                    100% { opacity: 0; }
                }
                
                @keyframes snowflakeGrow {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    40% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    70% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
                    100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
                }
                
                .timer-value.frozen {
                    color: #87CEFA !important;
                    text-shadow: 0 0 5px #87CEFA !important;
                }
                
                .timer-value.double-frozen {
                    color: #00BFFF !important;
                    text-shadow: 0 0 10px #00BFFF !important;
                    animation: doubleFreezeGlow 2s infinite alternate !important;
                }
                
                @keyframes doubleFreezeGlow {
                    0% { color: #87CEFA; text-shadow: 0 0 5px #87CEFA; }
                    100% { color: #00BFFF; text-shadow: 0 0 15px #00BFFF; }
                }
                
                /* Skip Effect */
                @keyframes skipSymbolGrow {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    40% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    70% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
                    100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
                }
                
                /* Clue Effect */
                @keyframes clueFlash {
                    0% { opacity: 0.5; }
                    100% { opacity: 0; }
                }
                
                @keyframes popIn {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.3); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                
                /* Reveal Effect */
                @keyframes revealFlicker {
                    0% { box-shadow: 0 0 5px 2px rgba(255, 215, 0, 0.7), 0 0 10px 4px rgba(50, 205, 50, 0.5); }
                    50% { box-shadow: 0 0 15px 5px rgba(255, 215, 0, 0.9), 0 0 20px 10px rgba(50, 205, 50, 0.7); }
                    100% { box-shadow: 0 0 5px 2px rgba(255, 215, 0, 0.7), 0 0 10px 4px rgba(50, 205, 50, 0.5); }
                }
                
                .reveal-highlight {
                    animation: revealFlicker 1s infinite ease-in-out !important;
                    border: 3px solid gold !important;
                    position: relative !important;
                    z-index: 5 !important;
                    transform: scale(1.05) !important;
                    transition: all 0.3s ease !important;
                    background: linear-gradient(135deg, #4CAF50, #2E7D32) !important;
                    color: white !important;
                    font-weight: bold !important;
                }
                
                /* Reveal Effect Animations */
                @keyframes revealPulse {
                    0% { opacity: 0; }
                    30% { opacity: 1; }
                    70% { opacity: 1; }
                    100% { opacity: 0; }
                }
                
                @keyframes eyeGrow {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    40% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    60% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                    80% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                }
                
                /* Golden Egg Effect */
                @keyframes goldenEggPulse {
                    0% { opacity: 0; }
                    30% { opacity: 1; }
                    70% { opacity: 1; }
                    100% { opacity: 0; }
                }
                
                @keyframes eggGrow {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    40% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    60% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                    70% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                }
                
                /* Mystery Effect */
                @keyframes mysteryPulse {
                    0% { opacity: 0; }
                    30% { opacity: 1; }
                    70% { opacity: 1; }
                    100% { opacity: 0; }
                }
                
                @keyframes questionMarkGrow {
                    0% { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 0; }
                    40% { transform: translate(-50%, -50%) scale(1.2) rotate(20deg); opacity: 1; }
                    60% { transform: translate(-50%, -50%) scale(1) rotate(-10deg); opacity: 1; }
                    80% { transform: translate(-50%, -50%) scale(1.1) rotate(5deg); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 0; }
                }
                
                /* Double Coins Effect */
                @keyframes doubleCoinsGlow {
                    0% { opacity: 0; }
                    30% { opacity: 1; }
                    70% { opacity: 1; }
                    100% { opacity: 0; }
                }
                
                @keyframes coinsAppear {
                    0% { opacity: 0; }
                    30% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { opacity: 0; }
                }
                
                @keyframes coinGrow {
                    0% { transform: scale(0); }
                    60% { transform: scale(1.2); }
                    100% { transform: scale(1); }
                }
                
                @keyframes pulseBadge {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.2); box-shadow: 0 0 10px gold; }
                    100% { transform: scale(1); }
                }
                
                /* Perk Unlock Effect */
                @keyframes shineEffect {
                    0% { transform: translateX(-100%) rotate(45deg); }
                    100% { transform: translateX(100%) rotate(45deg); }
                }
                
                @keyframes pulseGlow {
                    0% { box-shadow: 0 0 10px rgba(255,215,0,0.5); }
                    50% { box-shadow: 0 0 30px rgba(255,215,0,0.8); }
                    100% { box-shadow: 0 0 10px rgba(255,215,0,0.5); }
                }
                
                .perk-unlocked-pulse {
                    animation: perkUnlockPulse 2s ease-in-out 3;
                    position: relative;
                    z-index: 10;
                }
                
                @keyframes perkUnlockPulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 rgba(255,215,0,0); }
                    50% { transform: scale(1.2); box-shadow: 0 0 20px rgba(255,215,0,0.8); }
                    100% { transform: scale(1); box-shadow: 0 0 0 rgba(255,215,0,0); }
                }
                
                /* Perk Lock Indicators */
                .premium-lock {
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    font-size: 12px;
                    background: gold;
                    color: #333;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    z-index: 2;
                    animation: lockPulse 2s infinite alternate;
                }
                
                .word-lock {
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    font-size: 10px;
                    background: #4caf50;
                    color: white;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    z-index: 2;
                }
                
                @keyframes lockPulse {
                    0% { transform: scale(1); }
                    100% { transform: scale(1.1); box-shadow: 0 0 8px gold; }
                }
                
                /* Disabled perk styling */
                .perk-button.disabled {
                    cursor: not-allowed;
                    filter: grayscale(50%);
                }
            `;
            document.head.appendChild(styleElement);
        }
    }
};

// ADD to perks.js
// Perk button initialization
Object.entries(perkButtons).forEach(([perkType, button]) => {
    if (button) {
        button.onclick = () => buyPerk(perkType);
    }
});

// DOM ready initialization logic
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the PerkManager after the DOM is ready
    PerkManager.init();
    
    // Update all perk buttons initially
    PerkManager.updateAllPerkButtons();
    
    console.log("PerkManager initialized");
});

// ADD to perks.js
function addFadeInStyles() {
    if (!document.getElementById("perk-fade-styles")) {
      const styleElement = document.createElement("style");
      styleElement.id = "perk-fade-styles";
      styleElement.textContent = `
        @keyframes perkFadeIn {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        
        .fade-in-perk {
          animation: perkFadeIn 0.6s ease-out forwards;
        }
      `;
      document.head.appendChild(styleElement);
    }
}

// ADD to perks.js
function updatePerkButtons() {
    PerkManager.updateAllPerkButtons();
}

// ADD to perks.js
function activatePerk(perkType, cost) {
    const powerupCooldown = powerupCooldowns.get(perkType) || 0;
    const now = Date.now();
    
    if (now - powerupCooldown < 5000) { // 5-second cooldown
        showNotification('Perk is on cooldown', 'warning');
        return;
    }

    CoinsManager.updateCoins(-cost).then(success => {
        if (success) {
            gameState.perks[perkType]++;
            saveProgress();
            updatePerkButtons();
            
            // Use perk immediately
            usePerk(perkType);
            
            // Set cooldown
            powerupCooldowns.set(perkType, now);
            
            // Show feedback
            showNotification(`${perkType} activated!`, 'success');
        } else {
            showNotification('Not enough coins', 'error');
        }
    }).catch(error => {
        console.error('Perk activation failed:', error);
        showNotification('Failed to activate perk', 'error');
    });
}

// ADD to perks.js
function eliminateWrongAnswer() {
    const buttons = document.querySelectorAll('.buttons button');
    const correctAnswer = currentGame.isHebrewToEnglish ? 
        currentGame.words[currentGame.currentIndex] : 
        currentGame.translations[currentGame.currentIndex];
    
    const wrongButtons = Array.from(buttons).filter(btn => 
        btn.textContent !== correctAnswer
    );
    
    if (wrongButtons.length > 0) {
        const buttonToDisable = wrongButtons[Math.floor(Math.random() * wrongButtons.length)];
        buttonToDisable.disabled = true;
        buttonToDisable.style.opacity = '0.5';
    }
 }
 
 function revealCorrectAnswer() {
     const correctAnswer = currentGame.isHebrewToEnglish ? 
         currentGame.words[currentGame.currentIndex] : 
         currentGame.translations[currentGame.currentIndex];
     
     document.querySelectorAll('.buttons button').forEach(button => {
         if (button.textContent === correctAnswer) {
             button.classList.add('correct');
             // Simulate a click on the correct button after a short delay
             setTimeout(() => {
                 if (currentGame.isCustomPractice) {
                     handleCustomPracticeAnswer(true);
                 } else {
                     handleAnswer(true);
                 }
             }, 1000);
         } else {
             button.disabled = true;
             button.style.opacity = '0.5';
         }
     });
 }

// ADD to perks.js
function verifyPerkButtonsInDOM() {
    // Verify all perk buttons exist in the DOM
    Object.keys(PERK_CONFIG).forEach(perkId => {
      const buttonId = `${perkId}Perk`;
      const button = document.getElementById(buttonId);
      if (!button) {
        console.error(`Missing perk button in DOM: ${buttonId}`);
        
        // Create the button if it doesn't exist
        const perksContainer = document.querySelector('.perks-container');
        if (perksContainer) {
          const newButton = document.createElement('button');
          newButton.id = buttonId;
          newButton.className = 'perk-button';
          newButton.onclick = () => buyPerk(perkId);
          
          const config = PERK_CONFIG[perkId];
          newButton.innerHTML = `
            <i class="fas ${config.icon} perk-icon"></i>
            <span class="perk-count">0</span>
          `;
          
          perksContainer.appendChild(newButton);
          console.log(`Created missing perk button: ${buttonId}`);
        }
      }
    });
}

// Call on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    verifyPerkButtonsInDOM();
    
    // Initialize the PerkManager
    if (PerkManager && typeof PerkManager.init === 'function') {
      PerkManager.init();
      console.log('PerkManager initialized');
    }
});

// ADD to perks.js
function handleDoubleCoinsEffect(isCorrect, skipMode) {
    // Check for double coins perk activation
    if (currentGame.doubleCoinsRemaining > 0 && isCorrect && !skipMode) {
        // Award additional coins equal to the base award (doubling the total)
        const additionalCoins = 10; // Same as the base award
        
        CoinsManager.updateCoins(additionalCoins).then(() => {
            // Visual feedback
            pulseCoins(1);
            
            // Decrement remaining uses
            currentGame.doubleCoinsRemaining--;
            
            // Show notification with remaining uses
            if (currentGame.doubleCoinsRemaining > 0) {
                showNotification(`Double coins! ${currentGame.doubleCoinsRemaining} left`, 'success');
            } else {
                // Remove the double coins marker when effect expires
                document.querySelectorAll('.double-coins-marker').forEach(marker => {
                    if (marker.parentNode) {
                        marker.parentNode.removeChild(marker);
                    }
                });
                
                showNotification('Double coins effect ended', 'info');
            }
        });
    }
}

function debugPerkState() {
    console.group("=== PERK DEBUGGING ===");
    
    // Check if gameState and unlockedPerks exist
    console.log("gameState exists:", !!gameState);
    console.log("unlockedPerks exists:", !!(gameState && gameState.unlockedPerks));
    
    // Log what perks are unlocked according to gameState
    if (gameState && gameState.unlockedPerks) {
        console.log("Unlocked perks in gameState:", Array.from(gameState.unlockedPerks));
    }
    
    // Check localStorage values
    try {
        const localPerks = localStorage.getItem("simploxUnlockedPerks");
        console.log("Perks in localStorage:", localPerks ? JSON.parse(localPerks) : "none");
    } catch (e) {
        console.error("Error reading perks from localStorage:", e);
    }
    
    // Check UI state for each perk
    console.log("UI State of Perk Buttons:");
    Object.keys(PERK_CONFIG).forEach(perkId => {
        const button = document.getElementById(`${perkId}Perk`);
        if (button) {
            console.log(`${perkId}: isUnlocked=${button.classList.contains('unlocked')}, isLocked=${button.classList.contains('locked')}, isDisabled=${button.disabled}`);
        } else {
            console.log(`${perkId}: Button not found in DOM`);
        }
    });
    
    // Check if PerkManager exists and is functioning
    console.log("PerkManager exists:", !!PerkManager);
    if (PerkManager) {
        if (typeof PerkManager.updateAllPerkButtons === 'function') {
            console.log("updateAllPerkButtons is a function");
        } else {
            console.error("updateAllPerkButtons is not a function");
        }
    }
    
    console.groupEnd();
    
    // Return instructions to be printed
    return "Debug data printed to console. Please check browser console and share the results.";
}

// ADD - Add this debugging function to check unlocked perks state
function checkUnlockedPerksState() {
    console.group("Unlocked Perks State Check");
    
    // Check gameState
    console.log("gameState.unlockedPerks:", 
      gameState.unlockedPerks ? Array.from(gameState.unlockedPerks) : "undefined");
    
    // Check localStorage
    try {
      const storedPerks = localStorage.getItem("simploxUnlockedPerks");
      console.log("localStorage perks:", storedPerks ? JSON.parse(storedPerks) : "none");
    } catch (e) {
      console.error("Error reading localStorage perks:", e);
    }
    
    // Check visible state of buttons
    Object.keys(PERK_CONFIG).forEach(perkId => {
      const button = document.getElementById(`${perkId}Perk`);
      if (button) {
        console.log(`${perkId} button: unlocked=${button.classList.contains('unlocked')}, locked=${button.classList.contains('locked')}`);
      }
    });
    
    console.groupEnd();
  }

// ADD - Add this event listener at the end of perks.js to monitor navigation and restore perks

// Listen for page transitions and restore perks state
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        console.log("Page became visible again, restoring perks state");
        // Force reload perks from localStorage
        try {
            const localPerks = localStorage.getItem("simploxUnlockedPerks");
            if (localPerks) {
                if (!gameState.unlockedPerks) {
                    gameState.unlockedPerks = new Set();
                }
                const parsedPerks = JSON.parse(localPerks);
                parsedPerks.forEach(perkId => {
                    gameState.unlockedPerks.add(perkId);
                });
                console.log("Restored perks from localStorage:", Array.from(gameState.unlockedPerks));
            }
        } catch (e) {
            console.error("Error restoring perks from localStorage:", e);
        }
        
        // Update UI
        if (PerkManager && typeof PerkManager.updateAllPerkButtons === 'function') {
            PerkManager.updateAllPerkButtons();
        }
    }
});

// Make sure home button clicks preserve perks
document.addEventListener('click', function(e) {
    // Check if the clicked element is a home button (adjust selector as needed)
    if (e.target.closest('.home-button') || e.target.matches('.home-button')) {
        console.log("Home button clicked, ensuring perks are saved");
        try {
            if (gameState && gameState.unlockedPerks) {
                localStorage.setItem("simploxUnlockedPerks", 
                    JSON.stringify(Array.from(gameState.unlockedPerks)));
                console.log("Saved perks before navigation:", Array.from(gameState.unlockedPerks));
            }
        } catch (e) {
            console.error("Error saving perks before navigation:", e);
        }
    }
});

// When DOM is ready, ensure perks are properly loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, ensuring perks are properly initialized");
    
    // Give a small delay to ensure everything is loaded
    setTimeout(function() {
        if (PerkManager && typeof PerkManager.updateAllPerkButtons === 'function') {
            // Force reload perks from localStorage first
            try {
                const localPerks = localStorage.getItem("simploxUnlockedPerks");
                if (localPerks) {
                    if (!gameState.unlockedPerks) {
                        gameState.unlockedPerks = new Set();
                    }
                    const parsedPerks = JSON.parse(localPerks);
                    parsedPerks.forEach(perkId => {
                        gameState.unlockedPerks.add(perkId);
                    });
                    console.log("DOMContentLoaded: Restored perks from localStorage:", Array.from(gameState.unlockedPerks));
                }
            } catch (e) {
                console.error("DOMContentLoaded: Error restoring perks from localStorage:", e);
            }
            
            // Update UI
            PerkManager.updateAllPerkButtons();
        }
    }, 500);
});

// Before page unload, ensure perks are saved
window.addEventListener('beforeunload', function() {
    console.log("Page unloading, ensuring perks are saved");
    try {
        if (gameState && gameState.unlockedPerks) {
            localStorage.setItem("simploxUnlockedPerks", 
                JSON.stringify(Array.from(gameState.unlockedPerks)));
        }
    } catch (e) {
        console.error("Error saving perks before page unload:", e);
    }
});

// ADD - Add this small debugging function to the end of perks.js
function checkPerksConsistency() {
    console.group("=== PERK STATE CHECK ===");
    
    // 1. Check what's in localStorage
    try {
        const storedPerks = localStorage.getItem("simploxUnlockedPerks");
        console.log("1. localStorage perks:", storedPerks ? JSON.parse(storedPerks) : "none");
    } catch (e) {
        console.error("Error reading localStorage perks:", e);
    }
    
    // 2. Check what's in gameState
    console.log("2. gameState.unlockedPerks:", 
                gameState.unlockedPerks ? Array.from(gameState.unlockedPerks) : "undefined");
    
    // 3. Check UI state of buttons
    console.log("3. UI buttons state:");
    Object.keys(PERK_CONFIG).forEach(perkId => {
        const button = document.getElementById(`${perkId}Perk`);
        if (button) {
            console.log(`  ${perkId}: isUnlocked=${button.classList.contains('unlocked')}, ` +
                        `isLocked=${button.classList.contains('locked')}, ` +
                        `isDisabled=${button.disabled}`);
        } else {
            console.log(`  ${perkId}: Button not found in DOM`);
        }
    });
    
    console.groupEnd();
    
    // Make this function available in the global scope
    window.checkPerks = checkPerksConsistency;
    return "Debug info printed to console. Check the browser console for results.";
}

// Make the function available globally
window.checkPerks = checkPerksConsistency;

// ADD - Add this to the end of perks.js

// Add direct home button click handler with immediate effects
document.addEventListener('DOMContentLoaded', function() {
    // Look for home buttons once DOM is ready
    setTimeout(function() {
        const homeButtons = document.querySelectorAll('.home-button');
        console.log(`Found ${homeButtons.length} home button(s)`);
        
        homeButtons.forEach(button => {
            // Add a clear highlight to make sure our handler is attached
            button.addEventListener('mouseenter', function() {
                console.log('Home button hover detected');
            });
            
            // Add direct click handler
            button.addEventListener('click', function(e) {
                console.log('HOME BUTTON CLICKED - FORCING PERK SAVE');
                
                // Force immediate save to localStorage
                if (gameState && gameState.unlockedPerks) {
                    try {
                        const perksArray = Array.from(gameState.unlockedPerks);
                        localStorage.setItem("simploxUnlockedPerks", JSON.stringify(perksArray));
                        console.log("HOME SAVED PERKS:", perksArray);
                        
                        // Call checkPerksConsistency if it exists
                        if (typeof checkPerksConsistency === 'function') {
                            checkPerksConsistency();
                        }
                    } catch (e) {
                        console.error("Error saving perks on home click:", e);
                    }
                }
            });
        });
    }, 1000); // slight delay to ensure DOM is fully loaded
});

// Call this when user logs out
function handleLogout() {
    // First reset perks to prevent cross-user contamination 
    if (PerkManager && typeof PerkManager.resetForUserChange === 'function') {
        PerkManager.resetForUserChange();
    }
    
    // Clear all game-related localStorage to avoid data leakage
    localStorage.removeItem("simploxProgress");
    localStorage.removeItem("simploxUnlockedPerks");
    
    // Reset the gameState to default values
    gameState = {
        currentStage: 1,
        currentSet: 1,
        currentLevel: 1,
        coins: 0,
        perks: { timeFreeze: 0, skip: 0, clue: 0, reveal: 0 },
        unlockedSets: {},
        unlockedLevels: {},
        perfectLevels: new Set(),
        completedLevels: new Set(),
        unlockedPerks: new Set(['timeFreeze', 'skip', 'clue', 'reveal']),
        wordsLearned: 0
    };
    
    // Then proceed with your existing logout logic
    // ...
}

// Call this when a different user logs in
function handleLogin(user) {
    // First reset perks to prevent cross-user contamination
    if (PerkManager && typeof PerkManager.resetForUserChange === 'function') {
        PerkManager.resetForUserChange();
    }
    
    // Set current user
    currentUser = user;
    
    // Load user's game progress from database
    loadUserGameProgress();
    
    // Then proceed with your existing login success logic
    // ...
}