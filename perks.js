async function saveProgress() {
    console.log("Saving game progress...");
    
    try {


        const safeGameProgress = {
            user_id: currentUser?.id,
            stage: gameState.currentStage,
            set_number: gameState.currentSet,
            level: gameState.currentLevel,
            coins: gameState.coins,
            perks: gameState.perks || {},
            unlocked_sets: serializeSetMap(gameState.unlockedSets),
            unlocked_levels: serializeSetMap(gameState.unlockedLevels),
            completed_levels: Array.from(gameState.completedLevels || []),
            perfect_levels: Array.from(gameState.perfectLevels || [])

        };
        

        const progressData = {
            currentStage: gameState.currentStage,
            currentSet: gameState.currentSet,
            currentLevel: gameState.currentLevel,
            coins: gameState.coins,
            perks: gameState.perks,
            unlockedSets: serializeSetMap(gameState.unlockedSets),
            unlockedLevels: serializeSetMap(gameState.unlockedLevels),
            perfectLevels: Array.from(gameState.perfectLevels || []),
            completedLevels: Array.from(gameState.completedLevels || [])
        };
        
        localStorage.setItem("simploxProgress", JSON.stringify(progressData));
        

        if (currentUser && currentUser.id) {
            try {

                const { data, error: checkError } = await supabaseClient
                    .from("game_progress")
                    .select("user_id")
                    .eq("user_id", currentUser.id)
                    .maybeSingle();
                
                if (checkError) {
                    console.error("Error checking if game progress exists:", checkError);
                    return;
                }
                
                if (data) {

                    const { error: updateError } = await supabaseClient
                        .from("game_progress")
                        .update(safeGameProgress)
                        .eq("user_id", currentUser.id);
                    
                    if (updateError) {
                        console.error("Error saving progress:", updateError);
                    } else {
                        console.log("Progress saved to Supabase");
                    }
                } else {

                    const { error: insertError } = await supabaseClient
                        .from("game_progress")
                        .insert([safeGameProgress]);
                    
                    if (insertError) {
                        console.error("Error creating game progress record:", insertError);
                    } else {
                        console.log("New progress record created in Supabase");
                    }
                }
            } catch (error) {
                console.error("Unexpected error saving to Supabase:", error);
            }
        }
        

        const event = new CustomEvent('progressSaved', { detail: progressData });
        document.dispatchEvent(event);
        
        return true;
    } catch (e) {
        console.error("Error in saveProgress:", e);
        return false;
    }
}

/**
 * Helper function to convert Set objects to arrays for storage
 */
function serializeSetMap(setMap) {
    if (!setMap) return {};
    
    const result = {};
    Object.keys(setMap).forEach(key => {
        if (setMap[key] instanceof Set) {
            result[key] = Array.from(setMap[key]);
        } else {
            result[key] = setMap[key];
        }
    });
    return result;
}

async function loadUserGameProgress() {
    console.log("Loading user game progress...");
    
    let progress = null;
    

    const existingUnlockedPerks = gameState.unlockedPerks ? new Set(Array.from(gameState.unlockedPerks)) : new Set();
    

    try {
        const localPerks = localStorage.getItem("simploxUnlockedPerks");
        if (localPerks) {
            const loadedPerks = new Set(JSON.parse(localPerks));
            

            if (!gameState.unlockedPerks) {
                gameState.unlockedPerks = new Set(loadedPerks);
            } else {

                loadedPerks.forEach(perk => gameState.unlockedPerks.add(perk));
            }
        } else {

            if (existingUnlockedPerks.size > 0) {
                gameState.unlockedPerks = existingUnlockedPerks;
            } else {

                gameState.unlockedPerks = new Set();
            }
        }
    } catch (e) {
        console.error("Error loading unlocked perks from localStorage:", e);
        gameState.unlockedPerks = existingUnlockedPerks.size > 0 ? existingUnlockedPerks : new Set();
    }
    

    const localProgress = localStorage.getItem("simploxProgress");
    if (localProgress) {
        try {
            progress = JSON.parse(localProgress);
        } catch (e) {
            console.error("Error parsing local progress:", e);
        }
    }
    

    if (currentUser && currentUser.id) {
        try {
            const { data, error } = await supabaseClient
                .from("game_progress")
                .select("*")
                .eq("user_id", currentUser.id)
                .single();
                
            if (!error && data) {

                progress = data;
            }
        } catch (e) {
            console.error("Error loading progress from server:", e);
        }
    }
    
    if (progress) {

        gameState.currentStage = progress.stage || 1;
        gameState.currentSet = progress.set_number || 1;
        gameState.currentLevel = progress.level || 1;
        gameState.coins = progress.coins || 0;
        gameState.perks = progress.perks || { timeFreeze: 0, skip: 0, clue: 0, reveal: 0 };
        

        gameState.perfectLevels = new Set(progress.perfect_levels || []);
        gameState.completedLevels = new Set(progress.completed_levels || []);
        

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
        

        updatePerkButtons();
        
        return true;
    }
    
    console.log("No saved progress found");
    return false;
}

function unlockPerk(perkType) {
    console.log(`Unlocking perk: ${perkType}`);
    

    if (!gameState.unlockedPerks) {
        gameState.unlockedPerks = new Set();
    }
    

    gameState.unlockedPerks.add(perkType);
    

    const button = document.getElementById(`${perkType}Perk`);
    if (button) {
        button.classList.add('unlocked');
        button.classList.remove('locked');
        button.disabled = false;
        

        const countElement = button.querySelector('.perk-count');
        if (countElement) {
            countElement.style.display = 'block';
        }
    }
    

    try {
        localStorage.setItem("simploxUnlockedPerks", 
            JSON.stringify(Array.from(gameState.unlockedPerks)));
    } catch (e) {
        console.error("Error saving unlocked perks to localStorage:", e);
    }
    

    if (typeof saveProgress === 'function') {
        saveProgress();
    }
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


const PerkManager = {

    activePerks: {},
    

    lastNotification: {
        message: '',
        timestamp: 0,
        activeNotifications: new Set()
    },
    
    init() {

        this.addPerkStyles();
        

        const userId = currentUser && currentUser.id ? currentUser.id : 'guest';
        

        gameState.unlockedPerks = new Set();
        

        const basicPerks = ['timeFreeze', 'skip', 'clue', 'reveal'];
        basicPerks.forEach(perkId => {
            gameState.unlockedPerks.add(perkId);
        });
        

        let isPremium = false;
        if (currentUser && currentUser.status === 'premium') {
            isPremium = true;
        }
        


        if (isPremium) {

            let wordCount = 0;
            

            if (window.userStats && typeof window.userStats.uniqueWords === 'number') {
                wordCount = window.userStats.uniqueWords;
            } else if (gameState && typeof gameState.wordsLearned === 'number') {
                wordCount = gameState.wordsLearned;
            } else if (currentGame && typeof currentGame.wordsLearned === 'number') {
                wordCount = currentGame.wordsLearned;
            }
            

            Object.keys(PERK_CONFIG).forEach(perkId => {
                const perkConfig = PERK_CONFIG[perkId];
                if (!perkConfig || basicPerks.includes(perkId)) return;
                
                if (perkConfig.requiresPremium) {

                    if (perkConfig.requiresWordCount && wordCount >= perkConfig.requiresWordCount) {
                        gameState.unlockedPerks.add(perkId);
                    } else if (!perkConfig.requiresWordCount) {

                        gameState.unlockedPerks.add(perkId);
                    }
                }
            });
        }
        

        this.updateAllPerkButtons();
        

        this.attachToGameEvents();
    },

    resetForUserChange() {

        try {
            localStorage.removeItem("simploxUnlockedPerks");
        } catch (e) {
            console.error("Error removing perks from localStorage:", e);
        }
        

        gameState.unlockedPerks = new Set(['timeFreeze', 'skip', 'clue', 'reveal']);
        

        this.init();
    },


    attachToGameEvents() {

        document.querySelectorAll('.home-button').forEach(button => {
            button.addEventListener('click', () => {
                if (gameState && gameState.unlockedPerks) {

                    localStorage.setItem("simploxUnlockedPerks", 
                        JSON.stringify(Array.from(gameState.unlockedPerks)));
                }
            });
        });
        

        document.addEventListener('wordLearned', () => {
            this.refreshPerks();
        });
        
        document.addEventListener('levelCompleted', () => {
            this.refreshPerks();
        });
        

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
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
                    }
                } catch (e) {
                    console.error('Error reloading perks from localStorage:', e);
                }
                

                this.updateAllPerkButtons();
            }
        });
    },
    
    refreshPerks() {

        this.loadUserWordStats().then(() => {

            const currentUnlocked = {};
            

            if (!gameState.unlockedPerks) {
                gameState.unlockedPerks = new Set();
            }
            

            Object.keys(PERK_CONFIG).forEach(perkId => {
                currentUnlocked[perkId] = this.checkPerkConditionsMet(perkId);
                

                if (currentUnlocked[perkId] && !gameState.unlockedPerks.has(perkId)) {
                    gameState.unlockedPerks.add(perkId);
                    this.announcePerkUnlocked(perkId);
                }
            });
            

            this.updateAllPerkButtons();
        });
    },
    

    async loadUserWordStats() {

        if (!window.userStats) {
            window.userStats = { uniqueWords: 0 };
        }
        

        if (!currentUser || !currentUser.id) {

            if (gameState && typeof gameState.wordsLearned === 'number') {
                window.userStats.uniqueWords = gameState.wordsLearned;
            } else if (currentGame && typeof currentGame.wordsLearned === 'number') {
                window.userStats.uniqueWords = currentGame.wordsLearned;
            }
            
            return;
        }
        

        try {
            const { data, error } = await supabaseClient
                .from('player_stats')
                .select('unique_words_practiced')
                .eq('user_id', currentUser.id)
                .single();
                
            if (error) throw error;
            

            if (data && typeof data.unique_words_practiced === 'number') {
                window.userStats.uniqueWords = data.unique_words_practiced;
            }
        } catch (error) {
            console.error('Error loading user word stats:', error);
            

            if (gameState && typeof gameState.wordsLearned === 'number') {
                window.userStats.uniqueWords = gameState.wordsLearned;
            }
        }
    },
    

    checkPerkConditionsMet(perkId) {
        const perkConfig = PERK_CONFIG[perkId];
        if (!perkConfig) return false;
        

        if (gameState.unlockedPerks && gameState.unlockedPerks.has(perkId)) {
            return true;
        }
        

        if (!perkConfig.requiresPremium && !perkConfig.requiresWordCount) {
            return true;
        }
        
        let meetsRequirements = true;
        

        if (perkConfig.requiresPremium) {
            const isPremium = currentUser && currentUser.status === 'premium';
            if (!isPremium) {
                meetsRequirements = false;
            }
        }
        

        if (meetsRequirements && perkConfig.requiresWordCount) {

            let userWordCount = 0;
            

            if (window.userStats && typeof window.userStats.uniqueWords === 'number') {
                userWordCount = window.userStats.uniqueWords;
            } 

            else if (currentUser && gameState && gameState.wordsLearned) {
                userWordCount = gameState.wordsLearned;
            }

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
        

        if (!this.checkPerkConditionsMet(perkId)) {
            console.warn(`Attempted to announce unlock for ${perkId} but conditions are not met`);
            return;
        }
        

        if (!gameState.unlockedPerks) {
            gameState.unlockedPerks = new Set();
        }
        gameState.unlockedPerks.add(perkId);
        

        try {
            localStorage.setItem("simploxUnlockedPerks", 
                JSON.stringify(Array.from(gameState.unlockedPerks)));
        } catch (e) {
            console.error("Error saving unlocked perks to localStorage:", e);
        }
        

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
        }
        

        if (perkConfig.requiresPremium) {
            this.showPerkUnlockNotification(perkId, perkConfig);
        } else {

            this.showNotification(`New Perk Unlocked: ${perkConfig.name || perkId}!`, 'success');
        }
        

        const perkButton = document.getElementById(`${perkId}Perk`);
        if (perkButton) {
            perkButton.classList.add('perk-unlocked-pulse');
            

            setTimeout(() => {
                perkButton.classList.remove('perk-unlocked-pulse');
            }, 3000);
        }
        

        if (typeof saveProgress === 'function') {
            saveProgress();
        }
        

        this.updatePerkButton(perkId);
    },
    

    showPerkUnlockNotification(perkId, perkConfig) {

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
        

        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
            

            const perkButton = document.getElementById(`${perkId}Perk`);
            if (perkButton) {
                perkButton.classList.add('perk-unlocked-pulse');
                

                setTimeout(() => {
                    perkButton.classList.remove('perk-unlocked-pulse');
                }, 6000);
            }
            

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
        

        this.showNotification(`New Perk: ${perkConfig.name}!`, 'success', 3000);
    },
    
    updateAllPerkButtons() {

        if (!gameState.unlockedPerks) {
            gameState.unlockedPerks = new Set();
            

            const basicPerks = ['timeFreeze', 'skip', 'clue', 'reveal'];
            basicPerks.forEach(perkId => {
                gameState.unlockedPerks.add(perkId);
            });
        }
        

        Object.keys(PERK_CONFIG).forEach(perkId => {
            this.updatePerkButton(perkId);
        });
        

        const isPremium = currentUser && currentUser.status === 'premium';
        

        if (isPremium) {
            document.querySelectorAll('.premium-lock').forEach(lock => {
                if (lock.parentNode) {
                    lock.remove();
                }
            });
        }
        

        const basicPerks = ['timeFreeze', 'skip', 'clue', 'reveal'];
        basicPerks.forEach(perkId => {
            const button = document.getElementById(`${perkId}Perk`);
            if (button) {
                button.classList.add('unlocked');
                button.classList.remove('locked');

                const canAfford = (gameState.coins || 0) >= (PERK_CONFIG[perkId].cost || 1);
                button.disabled = !canAfford;
            }
        });
    },

    updatePerkButton(perkId) {
        const perkButton = document.getElementById(`${perkId}Perk`);
        if (!perkButton) {
            return;
        }
        
        const perkConfig = PERK_CONFIG[perkId];
        if (!perkConfig) {
            return;
        }
        

        perkButton.style.display = 'flex';
        

        const isPremium = currentUser && currentUser.status === 'premium';
        

        const isPerkUnlocked = gameState.unlockedPerks && gameState.unlockedPerks.has(perkId);
        

        if (perkConfig.requiresPremium && !isPremium) {

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
                

                perkButton.style.position = 'relative';
                perkButton.appendChild(lockIndicator);
            }
            

            perkButton.disabled = true;
            perkButton.classList.add("disabled");
            perkButton.classList.add("locked");
            perkButton.classList.remove("unlocked");
            perkButton.style.opacity = "0.6";
            

            const perkCount = perkButton.querySelector(".perk-count");
            if (perkCount) {
                perkCount.textContent = "PRO";
                perkCount.style.fontSize = "8px";
            }
            
            return;
        }
        

        if (isPerkUnlocked) {

            const lockIndicator = perkButton.querySelector('.premium-lock, .word-lock');
            if (lockIndicator) {
                lockIndicator.remove();
            }
            

            perkButton.classList.remove("locked");
            perkButton.classList.add("unlocked");
            

            const coins = gameState.coins || 0;
            const purchaseCount = Math.floor(coins / perkConfig.cost);
            const canAfford = purchaseCount > 0;
            

            perkButton.disabled = !canAfford;
            perkButton.classList.toggle("disabled", !canAfford);
            

            perkButton.style.opacity = canAfford ? "1" : "0.5";
            

            const perkCount = perkButton.querySelector(".perk-count");
            if (perkCount) {
                perkCount.textContent = canAfford ? purchaseCount.toString() : "0";
                perkCount.style.fontSize = "";
                perkCount.style.display = "block";
            }
            
            return;
        }
        

        const meetsWordCount = !perkConfig.requiresWordCount || 
                    (window.userStats && window.userStats.uniqueWords >= perkConfig.requiresWordCount);


        if (perkConfig.requiresWordCount && !meetsWordCount) {

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
                

                perkButton.style.position = 'relative';
                perkButton.appendChild(lockIndicator);
            }
            

            perkButton.disabled = true;
            perkButton.classList.add("disabled");
            perkButton.classList.add("locked");
            perkButton.classList.remove("unlocked");
            perkButton.style.opacity = "0.6";
            

            const perkCount = perkButton.querySelector(".perk-count");
            if (perkCount) {
                perkCount.textContent = "🔒";
                perkCount.style.fontSize = "";
            }
            
            return;
        }
        

        perkButton.classList.add("locked");
        perkButton.classList.remove("unlocked");
        

        const lockIndicator = perkButton.querySelector('.premium-lock, .word-lock');
        if (lockIndicator) {
            lockIndicator.remove();
        }
        

        const coins = gameState.coins || 0;
        const purchaseCount = Math.floor(coins / perkConfig.cost);
        const canAfford = purchaseCount > 0;
        

        perkButton.disabled = !canAfford;
        perkButton.classList.toggle("disabled", !canAfford);
        

        perkButton.style.opacity = canAfford ? "1" : "0.5";
        

        const perkCount = perkButton.querySelector(".perk-count");
        if (perkCount) {
            perkCount.textContent = canAfford ? purchaseCount.toString() : "0";
            perkCount.style.fontSize = "";
        }
    },
    

    buyPerk(perkId) {
        const perkConfig = PERK_CONFIG[perkId];
        if (!perkConfig) {
            console.error(`Perk not found: ${perkId}`);
            return;
        }
        

        if (gameState.coins < perkConfig.cost) {
            this.showNotification(`Need ${perkConfig.cost} coins!`, 'error');
            return;
        }
        

        CoinsManager.updateCoins(-perkConfig.cost).then(() => {

            this.activatePerk(perkId);
            

            this.updateAllPerkButtons();
            saveProgress();
        }).catch(err => {
            console.error("Error updating coins:", err);
        });
    },
    

    activatePerk(perkId) {
        const perkConfig = PERK_CONFIG[perkId];
        if (!perkConfig) return;
        

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
        

        this.showNotification(`Used ${perkConfig.name}!`, 'success');
    },
    

    showNotification(message, type, duration = 3000) {
        const now = Date.now();
        

        if (message === this.lastNotification.message && 
            now - this.lastNotification.timestamp < 1000) {
            return;
        }
        

        if (this.lastNotification.activeNotifications.has(message)) {
            return;
        }
        

        this.lastNotification.message = message;
        this.lastNotification.timestamp = now;
        this.lastNotification.activeNotifications.add(message);
        

        showNotification(message, type, duration);
        

        setTimeout(() => {
            this.lastNotification.activeNotifications.delete(message);
        }, duration + 100);
    },
    

    handleTimeFreezeEffect(perkConfig) {
        isFrozen = true;
        

        const timerElement = document.querySelector('.timer-value');
        if (timerElement) {
            timerElement.classList.add('frozen');
        }
        

        this.showFreezeEffect();
        

        setTimeout(() => {
            isFrozen = false;
            if (timerElement) {
                timerElement.classList.remove('frozen');
            }
        }, perkConfig.duration);
    },
    
    handleDoubleFreezeEffect(perkConfig) {
        isFrozen = true;
        

        const timerElement = document.querySelector('.timer-value');
        if (timerElement) {
            timerElement.classList.add('frozen');
            timerElement.classList.add('double-frozen');
        }
        

        this.showFreezeEffect(true);
        

        setTimeout(() => {
            isFrozen = false;
            if (timerElement) {
                timerElement.classList.remove('frozen');
                timerElement.classList.remove('double-frozen');
            }
        }, perkConfig.duration);
    },
    
    handleSkipEffect(perkConfig) {

        this.showSkipEffect(false);
        

        setTimeout(() => {

            if (currentGame.currentIndex < currentGame.words.length) {
                if (currentGame.isArcadeMode) {
                    handleArcadeAnswer(true, true);
                } else if (currentGame.isCustomPractice) {
                    handleCustomPracticeAnswer(true, true);
                } else {
                    handleAnswer(true, true);
                }
            }
        }, 300);
    },
    
    handleDoubleCoinsEffect(perkConfig) {

        currentGame.doubleCoinsRemaining = perkConfig.effectDuration || 5;
        

        this.showDoubleCoinsEffect();
        
        this.showNotification(`Double coins activated for next ${currentGame.doubleCoinsRemaining} correct answers!`, 'success');
    },
    
    handleClueEffect(perkConfig) {
        const buttons = document.querySelectorAll('.buttons button');
        const correctAnswer = currentGame.isHebrewToEnglish ? 
            currentGame.words[currentGame.currentIndex] : 
            currentGame.translations[currentGame.currentIndex];
        

        const wrongButtons = Array.from(buttons).filter(btn => 
            btn.textContent !== correctAnswer
        );
        
        if (wrongButtons.length > 0) {

            const unmarkedButtons = wrongButtons.filter(btn => 
                !btn.querySelector('.wrong-answer-x')
            );
            

            if (unmarkedButtons.length > 0) {
                const buttonToMark = unmarkedButtons[Math.floor(Math.random() * unmarkedButtons.length)];
                

                buttonToMark.style.position = 'relative';
                

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
                

                buttonToMark.appendChild(xOverlay);
                

                buttonToMark.disabled = true;
                

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

                btn.classList.remove('wrong');
                

                btn.classList.add('reveal-highlight');
                

                setTimeout(() => {

                    btn.classList.remove('reveal-highlight');
                    

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

        this.showGoldenEggEffect();
        

        setTimeout(() => {

            if (currentGame.isBossLevel) {
                currentGame.bossDefeated = true;
                showBossDefeatEffect();
            } else if (currentGame.isCustomPractice) {

                customGameState.wordsCompleted += currentGame.words.length;
                customGameState.completedLevels.add(customGameState.currentLevel);
                handleCustomLevelCompletion();
            } else {

                currentGame.currentIndex = currentGame.words.length;
                handleLevelCompletion();
            }
        }, 2000);
    },
    
    handleRandomPerkEffect(perkConfig) {

        this.showMysteryEffect();
        

        setTimeout(() => {

            const eligiblePerks = Object.keys(PERK_CONFIG).filter(id => 
                id !== 'goldenEgg' && id !== 'randomPerk'
            );
            

            const coinOptions = [30, 70, 100, 150, 300];
            

            if (Math.random() < 0.5 && eligiblePerks.length > 0) {

                const randomPerkId = eligiblePerks[Math.floor(Math.random() * eligiblePerks.length)];
                const randomPerkConfig = PERK_CONFIG[randomPerkId];
                

                this.showNotification(`Mystery Box: ${randomPerkConfig.name}!`, 'success');
                

                setTimeout(() => {
                    this.activatePerk(randomPerkId);
                }, 500);
            } else {

                const randomCoins = coinOptions[Math.floor(Math.random() * coinOptions.length)];
                
                CoinsManager.updateCoins(randomCoins).then(() => {
                    this.showNotification(`Mystery Box: ${randomCoins} coins!`, 'success');
                    pulseCoins(randomCoins);
                });
            }
        }, 1500);
    },
    

    showFreezeEffect(isDouble = false) {

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
        

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, isDouble ? 2000 : 1000);
    },
    
    showSkipEffect(isDouble = false) {

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
        

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 800);
    },
    
    showDoubleCoinsEffect() {

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
        

        coins.innerHTML = `
            <div style="position: absolute; top: 0; left: -30px; transform: scale(0); filter: drop-shadow(0 0 15px gold); animation: coinGrow 1s 0.2s forwards;">💰</div>
            <div style="position: absolute; top: -20px; left: 0px; transform: scale(0); filter: drop-shadow(0 0 15px gold); animation: coinGrow 1s 0.4s forwards;">💰</div>
            <div style="position: absolute; top: 0; left: 30px; transform: scale(0); filter: drop-shadow(0 0 15px gold); animation: coinGrow 1s 0.6s forwards;">💰</div>
        `;
        
        overlay.appendChild(coins);
        document.body.appendChild(overlay);
        

        const coinCounters = document.querySelectorAll('.coin-count');
        coinCounters.forEach(counter => {

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
            

            if (getComputedStyle(counter).position === 'static') {
                counter.style.position = 'relative';
            }
            
            counter.appendChild(marker);
            

            setTimeout(() => {
                if (marker.parentNode) {
                    marker.remove();
                }
            }, 30000);
        });
        

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 2000);
    },
    
    showClueEffect() {

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
        

        const lightBulb = document.createElement('div');
        lightBulb.className = 'clue-light-bulb';
        lightBulb.innerHTML = '💡';
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
        

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 2000);
    },
    
    showRevealEffect() {

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
        

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 1500);
    },
    
    showGoldenEggEffect() {

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
        

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 2000);
    },
    
    showMysteryEffect() {

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
        

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 1500);
    },
    

    addPerkStyles() {
        if (!document.getElementById('perk-effect-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'perk-effect-styles';
            styleElement.textContent = `
                
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
                
                
                @keyframes skipSymbolGrow {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    40% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    70% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
                    100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
                }
                
                
                @keyframes clueFlash {
                    0% { opacity: 0.5; }
                    100% { opacity: 0; }
                }
                
                @keyframes popIn {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.3); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                
                
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
                
                
                .perk-button.disabled {
                    cursor: not-allowed;
                    filter: grayscale(50%);
                }
            `;
            document.head.appendChild(styleElement);
        }
    }
};


Object.entries(PERK_CONFIG).forEach(([perkType, config]) => {
    const button = document.getElementById(`${perkType}Perk`);
    if (button) {
        button.onclick = () => buyPerk(perkType);
    }
});


document.addEventListener('DOMContentLoaded', function() {

    PerkManager.init();
    

    PerkManager.updateAllPerkButtons();
});

function updatePerkButtons() {
    PerkManager.updateAllPerkButtons();
}

function activatePerk(perkType, cost) {
    const powerupCooldown = powerupCooldowns.get(perkType) || 0;
    const now = Date.now();
    
    if (now - powerupCooldown < 5000) {
        showNotification('Perk is on cooldown', 'warning');
        return;
    }

    CoinsManager.updateCoins(-cost).then(success => {
        if (success) {
            gameState.perks[perkType]++;
            saveProgress();
            updatePerkButtons();
            

            usePerk(perkType);
            

            powerupCooldowns.set(perkType, now);
            

            showNotification(`${perkType} activated!`, 'success');
        } else {
            showNotification('Not enough coins', 'error');
        }
    }).catch(error => {
        console.error('Perk activation failed:', error);
        showNotification('Failed to activate perk', 'error');
    });
}

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

function handleDoubleCoinsEffect(isCorrect, skipMode) {

    if (currentGame.doubleCoinsRemaining > 0 && isCorrect && !skipMode) {

        const additionalCoins = 10;
        
        CoinsManager.updateCoins(additionalCoins).then(() => {

            pulseCoins(1);
            

            currentGame.doubleCoinsRemaining--;
            

            if (currentGame.doubleCoinsRemaining > 0) {
                showNotification(`Double coins! ${currentGame.doubleCoinsRemaining} left`, 'success');
            } else {

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


window.handleLogout = function() {
    console.log("Global handleLogout called from HTML");
    

    window.preventAutoResume = true;
    

    localStorage.removeItem("simploxProgress");
    localStorage.removeItem("simploxUnlockedPerks");
    localStorage.removeItem("simploxCustomLists");
    localStorage.removeItem("gameContext");
    localStorage.removeItem("arcadeSessionData");
    

    if (typeof PerkManager !== 'undefined' && PerkManager && 
        typeof PerkManager.resetForUserChange === 'function') {
        try {
            PerkManager.resetForUserChange();
        } catch (e) {
            console.error("Error resetting PerkManager:", e);
        }
    }
    

    (async function() {
        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {
                const { error } = await supabaseClient.auth.signOut();
                if (error) {
                    console.error('Supabase logout error:', error.message);
                }
            }
        } catch (e) {
            console.error("Error during Supabase logout:", e);
        }
        

        if (typeof gameState !== 'undefined' && gameState) {
            try {

                gameState.currentStage = 1;
                gameState.currentSet = 1;
                gameState.currentLevel = 1;
                gameState.coins = 0;
                

                if (gameState.perks) {
                    Object.keys(gameState.perks).forEach(key => {
                        gameState.perks[key] = 0;
                    });
                }
                

                if (gameState.unlockedSets) {
                    for (const key in gameState.unlockedSets) {
                        if (Object.prototype.hasOwnProperty.call(gameState.unlockedSets, key)) {
                            delete gameState.unlockedSets[key];
                        }
                    }
                }
                
                if (gameState.unlockedLevels) {
                    for (const key in gameState.unlockedLevels) {
                        if (Object.prototype.hasOwnProperty.call(gameState.unlockedLevels, key)) {
                            delete gameState.unlockedLevels[key];
                        }
                    }
                }
                

                if (gameState.perfectLevels && typeof gameState.perfectLevels.clear === 'function') {
                    gameState.perfectLevels.clear();
                }
                
                if (gameState.completedLevels && typeof gameState.completedLevels.clear === 'function') {
                    gameState.completedLevels.clear();
                }
                

                if (gameState.unlockedPerks && typeof gameState.unlockedPerks.clear === 'function') {
                    gameState.unlockedPerks.clear();
                    

                    ['timeFreeze', 'skip', 'clue', 'reveal'].forEach(perk => {
                        if (typeof gameState.unlockedPerks.add === 'function') {
                            gameState.unlockedPerks.add(perk);
                        }
                    });
                }
            } catch (error) {
                console.error("Error safely resetting gameState:", error);
            }
        }
        

        if (typeof currentUser !== 'undefined') {
            currentUser = null;
        }
        

        if (typeof currentGame !== 'undefined' && currentGame) {
            currentGame.active = false;
        }
        

        if (typeof updateAuthUI === 'function') {
            updateAuthUI();
        }
        
        if (typeof updateUserStatusDisplay === 'function') {
            updateUserStatusDisplay(null);
        }
        
        if (typeof updateGuestPlayButton === 'function') {
            updateGuestPlayButton();
        }
        

        if (typeof closeOptionsMenu === 'function') {
            closeOptionsMenu();
        }
        

        if (typeof showScreen === 'function') {
            showScreen('welcome-screen', true);
        } else {

            window.location.href = window.location.pathname;
        }
        
        console.log("Global handleLogout completed successfully");
    })();
    

    return false;
};

/**
 * Also provide the closeOptionsMenu function if it doesn't exist
 */
if (typeof closeOptionsMenu !== 'function') {
    window.closeOptionsMenu = function() {
        const optionsMenu = document.getElementById('options-menu');
        if (optionsMenu && optionsMenu.classList.contains('show')) {
            optionsMenu.classList.remove('show');
        }
    };
}


(function() {

    console.log("Initializing safe handleLogout function");
    

    if (typeof closeOptionsMenu !== 'function') {
        window.closeOptionsMenu = function() {
            const optionsMenu = document.getElementById('options-menu');
            if (optionsMenu && optionsMenu.classList.contains('show')) {
                optionsMenu.classList.remove('show');
            }
        };
    }
})();
/**
 * Updates all logout buttons to use the safe logout function
 */
function fixLogoutButtons() {
    console.log("Fixing logout buttons");
    
    try {

        document.querySelectorAll('.logout-button').forEach(button => {

            if (button.hasAttribute('onclick')) {
                console.log(`Removing onclick="${button.getAttribute('onclick')}" from logout button`);
                button.removeAttribute('onclick');
            }
            

            const newButton = button.cloneNode(true);
            if (button.parentNode) {
                button.parentNode.replaceChild(newButton, button);
            }
            

            newButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log("Logout button clicked with safe handler");
                safeLogout();
                return false;
            });
        });
        


        const problematicButton = document.querySelector('button.logout-button');
        if (problematicButton) {
            console.log("Found problematic logout button, applying direct fix");
            problematicButton.onclick = function(e) {
                e.preventDefault();
                console.log("Problematic logout button clicked, using safe handler");
                safeLogout();
                return false;
            };
        }
    } catch (error) {
        console.error("Error fixing logout buttons:", error);
    }
}


document.addEventListener('DOMContentLoaded', function() {

    fixLogoutButtons();
    

    setTimeout(fixLogoutButtons, 1000);
});

/**
 * Closes the options menu if it's open
 */
function closeOptionsMenu() {
    const optionsMenu = document.getElementById('options-menu');
    if (optionsMenu && optionsMenu.classList.contains('show')) {
        optionsMenu.classList.remove('show');
    }
}

