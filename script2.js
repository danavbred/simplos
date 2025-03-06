
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
        // Try to get existing record using RPC function instead of direct query
        const { data, error } = await supabaseClient.rpc(
          'get_word_history',
          {
            p_user_id: userId,
            p_word: trimmedWord
          }
        );
        
        const requestTime = performance.now() - startTime;
        if (requestTime > 1000) {
          console.warn(`Slow Supabase request (${requestTime.toFixed(0)}ms) for word: ${trimmedWord}`);
        }
        
        let isNewWord = false;
        let coinReward = 0;
        
        // Handle potential errors
        if (error) {
          console.error("Error fetching word history:", error);
          return { isNewWord: false, coinReward: 0, error };
        }
        
        // Check if we got a record back
        if (data && data.length > 0) {
          // Word exists, increment practice count
          const existingRecord = data[0];
          const newCount = (existingRecord.practice_count || 0) + 1;
          coinReward = newCount <= 5 ? 3 : 1;
          
          const { error } = await supabaseClient
            .from("word_practice_history")
            .update({
              practice_count: newCount,
              last_practiced_at: new Date().toISOString(),
              game_mode: gameMode,
              coins_earned: (existingRecord.coins_earned || 0) + coinReward
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
        
        // Award coins - BUT ONLY IN REGULAR MODE, NOT ARCADE
        if (coinReward > 0 && gameMode !== 'arcade') {
          // Use the central CoinsManager instead of direct updates
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

function handleArcadeAnswer(isCorrect) {
    const now = Date.now();
    if (now - (currentGame.lastAnswerTime || 0) < 1000) {
      return; // Prevent rapid consecutive answers
    }
    
    currentGame.lastAnswerTime = now;
    
    const playerName = currentArcadeSession.playerName || currentUser?.user_metadata?.username || getRandomSimploName();
    
    if (isCorrect) {
      // Increment word count and update streak
      currentGame.wordsCompleted = (currentGame.wordsCompleted || 0) + 1;
      currentGame.correctStreak = (currentGame.correctStreak || 0) + 1;
      currentGame.wrongStreak = 0;
      
      // For premium users, track the word encounter
      if (currentUser && currentUser.status === 'premium') {
        // Get the current word from the question
        const questionElement = document.getElementById('question-word');
        if (questionElement && questionElement.textContent) {
          const word = questionElement.textContent.trim();
          
          // Track word without adding coins (handled below)
          trackWordEncounterWithoutCoins(word, 'arcade')
            .then(() => {
              // ADDED: Explicitly broadcast the updated word count for premium users
              // This ensures word count updates are sent immediately after tracking
              broadcastCurrentParticipantData();
            })
            .catch(err => 
              console.error('Error tracking word in arcade:', err)
            );
        }
      }
      
      // Calculate coin reward
      let coinReward = 5;
      if (currentGame.correctStreak >= 3) {
        coinReward += 5;
      }
      
      // Premium users get extra coins in arcade mode
      if (currentUser && currentUser.status === 'premium') {
        coinReward += 2; // Add premium bonus directly here
      }
      
      // Use the enhanced CoinsManager for consistent updates
      CoinsManager.updateCoins(coinReward).then(() => {
        // Update arcade powerups
        updateArcadePowerups();
        
        // Update our rank display
        updatePlayerRankDisplay();
        
        // Update arcade progress display
        updateArcadeProgress();
        
        // ADDED: Always broadcast progress updates after coins are updated
        // This ensures moderators see consistent progress
        broadcastCurrentParticipantData();
        
        // Check if player has completed the word goal
        if (currentGame.wordsCompleted >= currentArcadeSession.wordGoal) {
          handlePlayerCompletedGoal(playerName);
          // Return early to prevent loading next question
          return;
        }
        
        // Load the next question
        loadNextArcadeQuestion();
      });
    } else {
      // Handle incorrect answer
      currentGame.correctStreak = 0;
      currentGame.wrongStreak = (currentGame.wrongStreak || 0) + 1;
      
      // ADDED: Also broadcast on wrong answers so moderator stays updated
      broadcastCurrentParticipantData();
      
      // Load the next question
      loadNextArcadeQuestion();
    }
}

function setupArcadeProgressPolling() {
    // Clear any existing interval
    if (window.arcadeStatsInterval) {
      clearInterval(window.arcadeStatsInterval);
    }
    
    // Set up a regular interval to broadcast participant data
    window.arcadeStatsInterval = setInterval(() => {
      if (currentArcadeSession && 
          currentArcadeSession.state === 'active' && 
          currentArcadeSession.playerName) {
        // Only broadcast if we have meaningful data to share
        if (currentGame && (currentGame.wordsCompleted > 0 || currentGame.coins > 0)) {
          broadcastCurrentParticipantData();
        }
      }
    }, 5000); // Every 5 seconds
    
    return window.arcadeStatsInterval;
  }

  function setupArcadeProgressPolling() {
    // Clear any existing interval
    if (window.arcadeStatsInterval) {
      clearInterval(window.arcadeStatsInterval);
    }
    
    // Set up a regular interval to broadcast participant data
    window.arcadeStatsInterval = setInterval(() => {
      if (currentArcadeSession && 
          currentArcadeSession.state === 'active' && 
          currentArcadeSession.playerName) {
        // Only broadcast if we have meaningful data to share
        if (currentGame && (currentGame.wordsCompleted > 0 || currentGame.coins > 0)) {
          broadcastCurrentParticipantData();
        }
      }
    }, 5000); // Every 5 seconds
    
    return window.arcadeStatsInterval;
  }


const currentArcadeSessionStructure = {
    eventId: null,
    otp: null,
    wordPool: [],
    participants: [], // Player data during game
    teacherId: null,
    wordGoal: 50,
    state: 'pre-start',  // 'pre-start', 'started', 'active', 'ended'
    completedPlayers: [], // Players who reached word goal, in order of completion
    startTime: null,     // When the session started
    endTime: null,       // When the session ended
    
    // Ranks determined by order of completion - only top 3 matter
    podiumRanks: {
        // username: { rank: 1-3, completionTime: timestamp }
    },
    
    // Local player properties
    playerName: null,    // Current player's username
    winnerScreenShown: false // Flag to prevent multiple winner screens
};

// Use event delegation instead of multiple listeners






// REPLACE the perk button initialization
Object.entries(perkButtons).forEach(([perkType, button]) => {
    if (button) {
        button.onclick = () => buyPerk(perkType);
    }
});

const GameTimer = {
    lastTick: 0,
    
    update(timestamp) {
        if (!this.lastTick) this.lastTick = timestamp;
        const delta = timestamp - this.lastTick;
        
        if (delta >= 1000) { // Update every second
            this.updateTimer();
            this.lastTick = timestamp;
        }
        
        requestAnimationFrame(this.update.bind(this));
    }
};

function cleanupLevel() {
    // Clear unused event listeners
    document.querySelectorAll('.buttons button').forEach(btn => {
        btn.onclick = null;
    });
    
    // Clear particle effects
    ParticleSystem.clear();
    
    // Clear timeouts
    clearTimeout(levelTimeout);
}




const GameCache = {
    words: new Map(),
    
    async getWords(setId) {
        if (this.words.has(setId)) {
            return this.words.get(setId);
        }
        
        const words = await loadWords(setId);
        this.words.set(setId, words);
        return words;
    }
};

const gameInit = {
    async init() {
        console.log("Game initialization starting");
        
        // First check for existing session
        await checkExistingSession();
        
        if (currentUser) {
            console.log("User is logged in, checking database schema");
            // Check and fix database schema
            const schemaOk = await ensureCorrectSchema();
            
            if (schemaOk) {
                // Load progress from database
                console.log("Schema is OK, loading progress from database");
                await loadUserGameProgress(currentUser.id);
            } else {
                console.log("Schema issues detected, loading from localStorage and initializing defaults");
                // Initialize from localStorage or defaults
                initializeGame();
            }
        } else {
            console.log("No user logged in, initializing local game state");
            // Initialize default game state
            initializeGame();
        }
        
        // Update UI elements
        updatePerkButtons();
        initializeParticles(document.getElementById("welcome-screen"));
        
        // Load custom lists
        await loadCustomLists();
        
        // Set up auto-save
        setupAutoSave();
        
        // Log the final game state
        console.log("Game initialization complete. Game state:", {
            currentStage: gameState.currentStage,
            currentSet: gameState.currentSet, 
            currentLevel: gameState.currentLevel,
            unlockedSets: Object.keys(gameState.unlockedSets || {}),
            unlockedLevels: Object.keys(gameState.unlockedLevels || {})
        });
    }
};
















async function initializeGameProgressForUser(userId) {
    const { error } = await supabaseClient
        .from('game_progress')
        .insert({
            user_id: userId,
            stage: 1,
            set_number: 1,
            level: 1,
            coins: 0,
            perks: {},
            unlocked_sets: { "1": [1] },
            unlocked_levels: { "1_1": [1] },
            perfect_levels: [],
            completed_levels: []
        });

    if (error) {
        console.error('Error initializing game progress:', error);
    }
}



function initializeGame() {
    console.log("Initializing game state");
    
    // Default initial values
    gameState.currentStage = 1;
    gameState.currentSet = 1;
    gameState.currentLevel = 1;
    gameState.coins = 0;
    gameState.perks = {};
    gameState.unlockedSets = {};
    gameState.unlockedLevels = {};
    gameState.perfectLevels = new Set();
    gameState.completedLevels = new Set();
    
    // Check localStorage for saved progress (for guest users or as backup)
    const savedProgress = localStorage.getItem("simploxProgress");
    if (savedProgress) {
        try {
            console.log("Found saved progress in localStorage");
            const progress = JSON.parse(savedProgress);
            
            // Load basic game state
            if (progress.stage) gameState.currentStage = progress.stage;
            if (progress.set_number) gameState.currentSet = progress.set_number;
            if (progress.level) gameState.currentLevel = progress.level;
            if (progress.coins) gameState.coins = progress.coins;
            if (progress.perks) gameState.perks = progress.perks;
            
            // Load unlocked sets
            if (progress.unlocked_sets) {
                Object.entries(progress.unlocked_sets).forEach(([stage, sets]) => {
                    gameState.unlockedSets[stage] = new Set(Array.isArray(sets) ? sets : []);
                });
            }
            
            // Load unlocked levels
            if (progress.unlocked_levels) {
                Object.entries(progress.unlocked_levels).forEach(([setKey, levels]) => {
                    gameState.unlockedLevels[setKey] = new Set(Array.isArray(levels) ? levels : []);
                });
            }
            
            // Load perfect and completed levels
            if (progress.perfect_levels) {
                gameState.perfectLevels = new Set(progress.perfect_levels);
            }
            
            if (progress.completed_levels) {
                gameState.completedLevels = new Set(progress.completed_levels);
            }
            
            console.log("Loaded progress from localStorage:", {
                currentStage: gameState.currentStage,
                currentSet: gameState.currentSet,
                currentLevel: gameState.currentLevel
            });
        } catch (e) {
            console.error("Error parsing saved progress:", e);
        }
    }
    
    // Check for game context which has precedence for the current level
    const savedContext = localStorage.getItem("gameContext");
    if (savedContext) {
        try {
            const context = JSON.parse(savedContext);
            const timeSinceContext = Date.now() - (context.timestamp || 0);
            
            // Only use context if it's less than 24 hours old
            if (timeSinceContext < 24 * 60 * 60 * 1000) {
                console.log("Found recent game context, updating current location:", context);
                if (context.stage) gameState.currentStage = context.stage;
                if (context.set) gameState.currentSet = context.set;
                if (context.level) gameState.currentLevel = context.level;
            }
        } catch (e) {
            console.error("Error parsing saved context:", e);
        }
    }
    
    // Ensure we have default unlocks regardless
    setupDefaultUnlocks();
    
    updateAllCoinDisplays();
    updatePerkButtons();
    
    console.log("Game initialized with state:", {
        currentStage: gameState.currentStage,
        currentSet: gameState.currentSet,
        currentLevel: gameState.currentLevel
    });
}






function debugUnlockState() {
    console.group('Current Game State');
    console.log('Current Stage:', gameState.currentStage);
    console.log('Current Set:', gameState.currentSet);
    console.log('Current Level:', gameState.currentLevel);
    
    // Log unlocked sets
    console.group('Unlocked Sets');
    Object.entries(gameState.unlockedSets).forEach(([stageId, sets]) => {
        console.log(`Stage ${stageId}:`, Array.from(sets).sort((a, b) => a - b));
    });
    console.groupEnd();
    
    // Log unlocked levels
    console.group('Unlocked Levels');
    Object.entries(gameState.unlockedLevels).forEach(([setKey, levels]) => {
        console.log(`Set ${setKey}:`, Array.from(levels).sort((a, b) => a - b));
    });
    console.groupEnd();
    
    // Log completed levels
    console.log('Completed Levels:', Array.from(gameState.completedLevels));
    console.log('Perfect Levels:', Array.from(gameState.perfectLevels));
    console.groupEnd();
}



function clearCustomPracticeUI() {
    // Clear list name input
    const listNameInput = document.getElementById('custom-list-name');
    if (listNameInput) {
        listNameInput.value = '';
    }

    // Clear word input
    const wordInput = document.getElementById('custom-word-input');
    if (wordInput) {
        wordInput.value = '';
    }

    // Clear translation results
    const translationResults = document.getElementById('translation-results');
    if (translationResults) {
        translationResults.style.display = 'none';
    }

    // Clear word translation list
    const wordList = document.getElementById('word-translation-list');
    if (wordList) {
        wordList.innerHTML = '';
    }

    // Reset current list
    customPracticeLists.currentList = null;
    customPracticeLists.lists = [];
}












// Game Constants & State Management
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

const gameState = {
    currentStage: null,
    currentSet: null,
    sessionStartTime: null,
    currentLevel: null,
    unlockedSets: {},
    unlockedLevels: {},
    levelScores: {},
    completedLevels: new Set(),
    perfectLevels: new Set(),
    coins: 0,
    
};

const PERK_CONFIG = {
    timeFreeze: {
        name: "Time Freeze",
        description: "Pause the timer for 5 seconds",
        cost: 15,
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
        description: "Remove one incorrect answer",
        cost: 35,
        icon: "fa-lightbulb"
    },
    reveal: {
        name: "Reveal Correct Answer",
        description: "Show the correct translation",
        cost: 50,
        icon: "fa-eye"
    },
    rewind: {
        name: "Double Freeze",
        description: "Pause the timer for 10 seconds",
        cost: 1,
        icon: "fa-snowflake",
        duration: 2000,
        requiresPremium: true,
        requiresWordCount: 10
    }
};

function buyPerk(perkType) {
    const perkConfig = PERK_CONFIG[perkType];
    if (!perkConfig) return;

    if (gameState.coins < perkConfig.cost) {
        showNotification(`Need ${perkConfig.cost} coins!`, 'error');
        return;
    }

    gameState.coins -= perkConfig.cost;
    updateAllCoinDisplays();

    switch(perkType) {
        case 'timeFreeze':
            isFrozen = true;
            setTimeout(() => {
                isFrozen = false;
            }, perkConfig.duration);
            break;

        case 'skip':
            handleAnswer(true, true);
            break;

        case 'clue':
            const buttons = document.querySelectorAll('.buttons button');
            const correctAnswer = currentGame.isHebrewToEnglish ? 
                currentGame.words[currentGame.currentIndex] : 
                currentGame.translations[currentGame.currentIndex];
            
            const wrongButtons = Array.from(buttons).filter(btn => 
                btn.textContent !== correctAnswer);
            
            if (wrongButtons.length > 0) {
                const buttonToDisable = wrongButtons[Math.floor(Math.random() * wrongButtons.length)];
                buttonToDisable.disabled = true;
                buttonToDisable.style.opacity = '0.5';
            }
            break;

        // REPLACE the reveal case in buyPerk function
case 'reveal':
    const correctAns = currentGame.isHebrewToEnglish ? 
        currentGame.words[currentGame.currentIndex] : 
        currentGame.translations[currentGame.currentIndex];
    
    document.querySelectorAll('.buttons button').forEach(btn => {
        if (btn.textContent === correctAns) {
            btn.classList.add('correct');
            // Store original background
            const originalBackground = btn.style.background;
            btn.style.background = 'var(--success)';
            
            // Reset after 5 seconds
            setTimeout(() => {
                btn.classList.remove('correct');
                btn.style.background = originalBackground;
            }, 5000);
        }
    });
    break;
    }

    saveProgress();
}


function updatePerkButtons() {
    Object.entries(PERK_CONFIG).forEach(([perkId, perkConfig]) => {
        const perkButton = document.getElementById(`${perkId}Perk`);
        if (!perkButton) return;
        
        // Handle special perks with requirements
        if (perkConfig.requiresWordCount) {
            // Check word count condition
            const wordCount = parseInt(document.getElementById("totalWords").textContent) || 0;
            
            // Show or hide the perk based on word count
            if (wordCount < perkConfig.requiresWordCount) {
                perkButton.style.display = "none";
                return;
            } else {
                perkButton.style.display = "flex";
            }
            
            // Handle premium requirement display
            if (perkConfig.requiresPremium) {
                const isPremium = currentUser && currentUser.status === "premium";
                
                // Update crown visibility
                let crownIcon = perkButton.querySelector(".premium-crown");
                
                if (!isPremium) {
                    // Add crown if not already present
                    // UPDATE CROWN STYLING IN updatePerkButtons FUNCTION
if (!crownIcon) {
    crownIcon = document.createElement("i");
    crownIcon.className = "fas fa-crown premium-crown";
    crownIcon.style.cssText = `
        position: absolute;
        top: -10px;
        right: -10px;
        color: var(--gold);
        font-size: 1.2rem;
        filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.7));
        animation: crownGlow 2s infinite alternate;
        background: rgba(0, 0, 0, 0.5);
        padding: 5px;
        border-radius: 50%;
        z-index: 10;
        border: 1px solid rgba(255, 215, 0, 0.5);
    `;
    perkButton.style.position = "relative";
    perkButton.appendChild(crownIcon);
    
    // Override click handler to show premium message
    const originalOnclick = perkButton.onclick;
    perkButton.onclick = function() {
        showNotification("Premium feature only!", "error");
    };
}

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
  

                    
                    // Disable button for non-premium users
                    perkButton.disabled = true;
                    perkButton.classList.add("disabled");
                    const perkCount = perkButton.querySelector(".perk-count");
                    if (perkCount) perkCount.textContent = "0";
                    return;
                } else {
                    // Remove crown if present (e.g., user upgraded)
                    if (crownIcon) {
                        perkButton.removeChild(crownIcon);
                    }
                    
                    // Reset click handler to default perk function
                    perkButton.onclick = function() { buyPerk(perkId); };
                }
            }
        }
        
        // Regular perk display logic
        const coinCount = Math.floor(gameState.coins / perkConfig.cost);
        const canAfford = coinCount > 0;
        perkButton.disabled = !canAfford;
        perkButton.classList.toggle("disabled", !canAfford);
        const perkCount = perkButton.querySelector(".perk-count");
        if (perkCount) {
            perkCount.textContent = canAfford ? coinCount.toString() : "0";
        }
    });
}

updatePerkButtons();

let currentGame = {
    words: [],
    translations: [],
    currentIndex: 0,
    correctAnswers: 0,
    firstAttempt: true,
    isHebrewToEnglish: false,
    mixed: false,
    speedChallenge: false,
    startTime: 0,
    levelStartTime: 0,
    timeBonus: 0,
    streakBonus: true,
    questionStartTime: 0,
    wrongStreak: 0,
    progressLost: 0
};

let timer = null;
let timeRemaining = 0;
let isFrozen = false;

let resetProgressTimeout = null;
let isFirstResetAttempt = true;











// Timer Functions
// Replace the startTimer function:
function startTimer(questionCount) {
    clearTimer();
    if (currentGame.currentIndex >= currentGame.words.length) return;
    
    // Set initial time only if not already set
    if (!currentGame.initialTimeRemaining) {
        currentGame.initialTimeRemaining = currentGame.words.length * 10;
        timeRemaining = currentGame.initialTimeRemaining;
        currentGame.totalTime = timeRemaining; // Store the initial total time
    } else {
        // Use the remaining time from the previous interval
        timeRemaining = currentGame.initialTimeRemaining;
    }
    
    console.log('Starting timer with:', timeRemaining, 'seconds');
    currentGame.questionStartTime = Date.now();
    updateTimerDisplay();
    updateTimerCircle(timeRemaining, currentGame.totalTime); // Use stored total time
    
    timer = setInterval(() => {
        if (!isFrozen) {
            timeRemaining = Math.max(0, timeRemaining - 1);
            updateTimerDisplay();
            updateTimerCircle(timeRemaining, currentGame.totalTime); // Use stored total time
            
            // Update the initialTimeRemaining to track remaining time
            currentGame.initialTimeRemaining = timeRemaining;
            
            if (timeRemaining <= 10) {
                document.querySelector('.timer-value').classList.add('warning');
            }
            
            if (timeRemaining <= 0) {
                handleTimeUp();
            }
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerElement = document.querySelector('.timer-value');
    timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    if (timeRemaining <= 10) {
        timerElement.classList.add('warning');
    } else {
        timerElement.classList.remove('warning');
    }
}

function clearTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    timeRemaining = 0;
    isFrozen = false;
    
    const timerProgress = document.querySelector('.timer-progress');
    if (timerProgress) {
        timerProgress.classList.remove('warning');
    }
    
    updateTimerCircle(0, 1); // This will empty the circle
}





const LEADERBOARD_UPDATE_INTERVAL = 7000; // 10 seconds

function updatePlayerProgress(e) {
    if (!e || !e.username) return false;
    
    const timestamp = Date.now();
    const lastUpdated = window.lastProgressUpdate || 0;
    
    // Throttle updates
    if (timestamp - lastUpdated < 20) {
      return false;
    }
    
    window.lastProgressUpdate = timestamp;
    
    // IMPROVED: Only ignore self-updates from untrusted sources
    // This allows our own broadcast updates to go through
    if (e.username === currentArcadeSession.playerName) {
      // Check for trusted sources - now handles all our known update sources
      const isTrustedSource = e.isTrusted === true || 
                             e.source === 'coinsManager' || 
                             e.source === 'coinController' ||
                             e.source === 'progressUpdate';
                             
      const isRecentUpdate = Math.abs(timestamp - (CoinsManager.lastUpdateTimestamp || 0)) < 1000;
      
      if (!isTrustedSource && isRecentUpdate) {
        console.log(`Ignoring untrusted update for ${e.username}`);
        return true;
      }
    }
    
    // Process updates for other players normally
    const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === e.username);
    
    if (playerIndex !== -1) {
      const player = currentArcadeSession.participants[playerIndex];
      const currentWordsCompleted = player.wordsCompleted || 0;
      const currentCoins = player.coins || 0;
      const newWordsCompleted = e.wordsCompleted !== undefined ? e.wordsCompleted : currentWordsCompleted;
      const newCoins = e.coins !== undefined ? e.coins : currentCoins;
      
      // Never allow progress to decrease
      if (newWordsCompleted < currentWordsCompleted) {
        console.warn(`Prevented progress downgrade for ${e.username}: ${currentWordsCompleted} → ${newWordsCompleted}`);
        e.wordsCompleted = currentWordsCompleted;
      }
      
      if (newCoins < currentCoins) {
        console.warn(`Prevented coin downgrade for ${e.username}: ${currentCoins} → ${newCoins}`);
        e.coins = currentCoins;
      }
      
      // Update participant data
      currentArcadeSession.participants[playerIndex] = {
        ...player,
        ...e,
        wordsCompleted: Math.max(currentWordsCompleted, newWordsCompleted),
        coins: Math.max(currentCoins, newCoins)
      };
    } else {
      // New player - add to participants list
      currentArcadeSession.participants.push({
        username: e.username,
        wordsCompleted: e.wordsCompleted || 0,
        coins: e.coins || 0,
        lateJoin: e.lateJoin || false
      });
    }
    
    // For our own player, sync with gameState
    if (e.username === currentArcadeSession.playerName && e.isTrusted) {
      gameState.coins = e.coins;
      currentGame.coins = e.coins;
    }
    
    // Update leaderboard UI
    const leaderboard = document.getElementById('arcade-leaderboard');
    if (leaderboard && leaderboard.offsetParent !== null) {
      const timeSinceLastLeaderboardUpdate = timestamp - (window.lastLeaderboardUpdate || 0);
      if (timeSinceLastLeaderboardUpdate > 300) {
        window.lastLeaderboardUpdate = timestamp;
        updateAllPlayersProgress();
      }
    }
    
    // Update rank display
    updatePlayerRankDisplay();
    
    return true;
}

// ADD: Simple function to reset coins to zero
function resetCoinsToZero() {
    console.log("Resetting all coins to zero");
    
    try {
        // Reset coins in gameState
        if (gameState) {
            gameState.coins = 0;
        }
        
        // Reset coins in currentGame
        if (currentGame) {
            currentGame.coins = 0;
        }
        
        // Reset in localStorage
        const savedProgress = localStorage.getItem("simploxProgress");
        if (savedProgress) {
            try {
                const progress = JSON.parse(savedProgress);
                progress.coins = 0;
                localStorage.setItem("simploxProgress", JSON.stringify(progress));
            } catch (e) {
                console.error("Error updating localStorage:", e);
            }
        }
        
        // Update all coin displays
        document.querySelectorAll('.coin-count').forEach(el => {
            el.textContent = '0';
        });
        
        console.log("Coins reset complete");
    } catch (error) {
        console.error("Error in resetCoinsToZero:", error);
    }
}

// MODIFY: Find the existing logout button event handler and add the coin reset
document.addEventListener('DOMContentLoaded', function() {
    // Find the logout button in the side panel
    const logoutButton = document.querySelector('.logout-button') || 
                          document.querySelector('#logoutButton') ||
                          document.querySelector('[data-action="logout"]');
    
    if (logoutButton) {
        // Store the original onclick handler if it exists
        const originalOnClick = logoutButton.onclick;
        
        // Replace with our enhanced handler
        logoutButton.onclick = function(event) {
            // First reset all coins
            resetCoinsToZero();
            
            console.log("Coins reset as part of logout process");
            
            // Then call the original handler if it exists
            if (typeof originalOnClick === 'function') {
                return originalOnClick.call(this, event);
            }
        };
        
        console.log("Enhanced logout button with coin reset functionality");
    } else {
        console.warn("Logout button not found during initialization");
    }
});

function broadcastCurrentParticipantData() {
    if (!currentArcadeSession || !currentArcadeSession.playerName || !window.arcadeChannel) {
      return false;
    }
    
    try {
      // Ensure we're broadcasting the most up-to-date coins and words
      const playerName = currentArcadeSession.playerName;
      const currentWords = currentGame.wordsCompleted || 0;
      const currentCoins = currentGame.coins || 0;
      
      console.log(`Broadcasting current participant data: ${playerName}, ${currentWords} words, ${currentCoins} coins`);
      
      window.arcadeChannel.send({
        type: 'broadcast',
        event: 'progress_update',
        payload: {
          username: playerName,
          wordsCompleted: currentWords,
          coins: currentCoins,
          timestamp: Date.now(),
          source: 'progressUpdate' // Add source to identify this broadcast
        }
      });
      
      return true;
    } catch (err) {
      console.error("Error broadcasting participant data:", err);
      return false;
    }
  }

  function animateCoinsChange(element, startValue, endValue) {
    if (!element) return;
    
    // Cancel any ongoing animation
    if (element.coinAnimationId) {
        cancelAnimationFrame(element.coinAnimationId);
        element.coinAnimationId = null;
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
    
    const animate = function() {
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
            
            // Store animation ID so it can be canceled
            element.coinAnimationId = requestAnimationFrame(animate);
        } else {
            // Ensure final value is exactly right
            element.textContent = endValue;
            element.coinAnimationId = null;
            
            setTimeout(() => {
                element.style.color = '';
                element.classList.remove('animating');
            }, 300);
        }
    };
    
    // Start animation and track ID
    element.coinAnimationId = requestAnimationFrame(animate);
}

function handleTimeUp() {
    if (currentGame.currentIndex >= currentGame.words.length) return; // Don't show if level is complete
    
    clearTimer();
    showReviveOverlay();
}






// Add full-screen event listener
document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        console.log('Exited full-screen');
    }
});


function showLevelScreen(setId) {
    gameState.currentSet = setId;
    debugUnlockState(); // Add debug call here
    
    // Clear existing screen
    const container = document.getElementById('level-container');
    if (!container) return;
    container.innerHTML = '';
    
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

function calculateWordsForLevel(level, vocabulary) {
    const totalWords = vocabulary.words.length;
    const wordSurplus = totalWords - 50;

    // If we haven't already created a randomized index mapping for this vocabulary set
    // then create one and store it in the vocabulary object
    if (!vocabulary.randomIndices) {
        // Create an array of indices and shuffle it
        vocabulary.randomIndices = Array.from({ length: totalWords }, (_, i) => i);
        // Fisher-Yates shuffle algorithm
        for (let i = vocabulary.randomIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [vocabulary.randomIndices[i], vocabulary.randomIndices[j]] = 
            [vocabulary.randomIndices[j], vocabulary.randomIndices[i]];
        }
        console.log('Created randomized word indices:', vocabulary.randomIndices);
    }

    // Boss Level (21) - all words from the set with special mechanics
    if (level === 21) {
        return {
            startIndex: 0,
            count: totalWords,
            isBossLevel: true,
            speedChallenge: true,
            mixed: true,                    // Mix Hebrew/English questions
            isTestLevel: true,              // Boss is always a test level
            isHebrewToEnglish: Math.random() < 0.5,
            testLevels: [],                 // Boss level doesn't need test levels
            randomIndices: vocabulary.randomIndices // Pass the entire randomized index array
        };
    }

    // Level 1-2: Choose 3 new words
    if (level === 1 || level === 2) {
        // Get 3 words starting from the randomized index position
        const startPos = (level - 1) * 3;
        return {
            startIndex: startPos,
            count: 3,
            testLevels: [3, 10, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 3)
        };
    }

    // Level 3: Test words from levels 1-2
    if (level === 3) {
        // Test all 6 words from levels 1-2 (randomized indices 0-5)
        return {
            startIndex: 0,
            count: 6,
            isTestLevel: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(0, 6)
        };
    }

    // Level 4-5: Choose 3 new words
    if (level === 4 || level === 5) {
        const startPos = 6 + (level - 4) * 3;
        return {
            startIndex: startPos,
            count: 3,
            testLevels: [6, 10, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 3)
        };
    }

    // Level 6: Test words from levels 4-5
    if (level === 6) {
        return {
            startIndex: 6,
            count: 6,
            isTestLevel: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(6, 12)
        };
    }

    // Level 7-8: Choose 4 new words
    if (level === 7 || level === 8) {
        const startPos = 12 + (level - 7) * 4;
        return {
            startIndex: startPos,
            count: 4,
            testLevels: [9, 10, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 4)
        };
    }

    // Level 9: Test words from levels 7-8
    if (level === 9) {
        return {
            startIndex: 12,
            count: 8,
            isTestLevel: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(12, 20)
        };
    }

    // Level 10: Test words from levels 1,2,4,5,7,8
    if (level === 10) {
        return {
            startIndex: 0,
            count: 20,
            isTestLevel: true,
            speedChallenge: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(0, 20)
        };
    }

    // Level 11-12: Choose 4 new words
    if (level === 11 || level === 12) {
        const startPos = 20 + (level - 11) * 4;
        return {
            startIndex: startPos,
            count: 4,
            testLevels: [13, 20, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 4)
        };
    }

    // Level 13: Test words from levels 11-12
    if (level === 13) {
        return {
            startIndex: 20,
            count: 8,
            isTestLevel: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(20, 28)
        };
    }

    // Level 14-15: Choose 5-6 new words
    if (level === 14 || level === 15) {
        const count = level === 14 ? 5 : 6;
        const startPos = 28 + (level === 14 ? 0 : 5);
        return {
            startIndex: startPos,
            count: count,
            testLevels: [16, 20, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + count)
        };
    }

    // Level 16: Test words from levels 14-15
    if (level === 16) {
        return {
            startIndex: 28,
            count: 11,
            isTestLevel: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(28, 39)
        };
    }

    // Level 17-18: Flexible word count based on total vocabulary
    if (level === 17 || level === 18) {
        const baseCount = level === 17 ? 5 : 6;
        const adjustedCount = baseCount + (wordSurplus > 0 ? wordSurplus : 0);
        const startPos = 39 + (level === 17 ? 0 : baseCount);
        return {
            startIndex: startPos,
            count: adjustedCount,
            testLevels: [19, 20, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + adjustedCount)
        };
    }

    // Level 19: Test words from levels 17-18
    if (level === 19) {
        return {
            startIndex: 39,
            count: 11,
            isTestLevel: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(39, 50)
        };
    }

    // Level 20: Test words from levels 11,12,14,15,17,18
    if (level === 20) {
        return {
            startIndex: 20,
            count: 30,
            isTestLevel: true,
            speedChallenge: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(20, 50)
        };
    }
}

function getUnusedWords(vocabulary) {
    // Track used words in gameState
    if (!gameState.usedWords) gameState.usedWords = new Set();
    
    return vocabulary.words.map((_, index) => index)
        .filter(i => !gameState.usedWords.has(i));
}

function selectRandomWords(availableIndices, count) {
    const selected = new Set();
    
    while (selected.size < count && availableIndices.length > selected.size) {
        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        selected.add(availableIndices[randomIndex]);
        gameState.usedWords.add(availableIndices[randomIndex]);
    }
    
    return Array.from(selected);
}

function generateAnswerChoices(correctAnswer, vocabulary) {
    const choices = new Set([correctAnswer]);
    const allChoices = vocabulary.translations;
    
    while (choices.size < 3) {
        const randomChoice = allChoices[Math.floor(Math.random() * allChoices.length)];
        choices.add(randomChoice);
    }
    
    return Array.from(choices).sort(() => Math.random() - 0.5);
}

function startLevel(level) {
  gameState.currentLevel = level;
  
  // Save game context
  const gameContext = {
    stage: gameState.currentStage,
    set: gameState.currentSet,
    level: level,
    timestamp: Date.now()
  };
  
  console.log("Setting game context at level start:", gameContext);
  localStorage.setItem("gameContext", JSON.stringify(gameContext));
  
  // Reset game state
  currentGame.wrongStreak = 0;
  currentGame.correctAnswers = 0;
  currentGame.levelStartTime = Date.now();
  currentGame.firstAttempt = true;
  currentGame.streakBonus = true;
  updatePerkButtons();
  
  console.log("Current unlocked levels:", gameState.unlockedLevels);
  
  const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
  console.log(`Current set key: ${setKey}, unlocked levels in set:`, 
    gameState.unlockedLevels[setKey] ? Array.from(gameState.unlockedLevels[setKey]) : "none");
  
  // Show/hide UI elements
  const perksContainer = document.querySelector('.perks-container');
  const powerupsContainer = document.querySelector('.powerups-container');
  
  if (perksContainer) perksContainer.style.display = 'flex';
  if (powerupsContainer) powerupsContainer.style.display = 'none';
  
  const coinCount = document.querySelector('.coin-count');
  if (coinCount) coinCount.textContent = gameState.coins || 0;
  
  const coinsContainer = document.querySelector('.coins-container');
  if (coinsContainer) coinsContainer.style.display = 'flex';
  
  gameState.currentStage = gameState.currentStage || 1;
  gameState.currentSet = gameState.currentSet || 1;
  gameState.currentLevel = level;
  
  console.log(`Starting level: Stage ${gameState.currentStage}, Set ${gameState.currentSet}, Level ${level}`);
  addAdminTestButton();
  
  // Check if premium is required
  const userStatus = currentUser ? currentUser.status : 'unregistered';
  if ([2, 5, 8, 11, 14, 18, 20].includes(level) && userStatus !== 'premium') {
    const currentLevel = level;
    
    if (!currentUser) {
      return showUnregisteredWarning(() => {
        proceedWithLevel(currentLevel);
      });
    }
    
    if (!localStorage.getItem(`upgradeRequested_${currentUser.id}`)) {
      return showUpgradePrompt(() => {
        proceedWithLevel(currentLevel);
      });
    }
  }
  
  // Determine if this is a boss level
  if (level === 21) {
    currentGame.isBossLevel = true;
    console.log("Boss level detected");
    setTimeout(applyBossLevelStyles, 100);
    setTimeout(applyBossLevelStyles, 500);
  } else {
    currentGame.isBossLevel = false;
  }
  
  // Determine if we need to show the full intro
  // Force full intro for boss levels or first level of a set
  const forceFullIntro = level === 21 || level === 1;
  
  proceedWithLevel(level, forceFullIntro);
}



function findFurthestProgression() {
    console.log("Finding furthest progression");
    
    // First check if there's a saved game context
    const savedContext = localStorage.getItem("gameContext");
    if (savedContext) {
        try {
            const context = JSON.parse(savedContext);
            if (context.stage && context.set && context.level) {
                console.log("Found saved game context:", context);
                return {
                    stage: context.stage,
                    set: context.set,
                    level: context.level
                };
            }
        } catch (e) {
            console.error("Error parsing saved game context:", e);
        }
    }
    
    console.log("Current game state:", {
        currentStage: gameState.currentStage,
        currentSet: gameState.currentSet,
        currentLevel: gameState.currentLevel,
        unlockedSets: Object.fromEntries(Object.entries(gameState.unlockedSets || {}).map(([k, v]) => [k, Array.from(v || [])])),
        unlockedLevels: Object.fromEntries(Object.entries(gameState.unlockedLevels || {}).map(([k, v]) => [k, Array.from(v || [])])),
        perfectLevels: Array.from(gameState.perfectLevels || []),
        completedLevels: Array.from(gameState.completedLevels || [])
    });
    
    // If we have current stage and level information, use that directly
    if (gameState.currentStage && gameState.currentSet && gameState.currentLevel) {
        console.log(`Using current game state: Stage ${gameState.currentStage}, Set ${gameState.currentSet}, Level ${gameState.currentLevel}`);
        return {
            stage: gameState.currentStage,
            set: gameState.currentSet,
            level: gameState.currentLevel
        };
    }
    
    // If that doesn't work, fall back to stage 1, set 1, level 1
    console.log("No progression found, defaulting to beginning");
    return {
        stage: 1,
        set: 1,
        level: 1
    };
}

function proceedWithLevel(level, forceFullIntro = false) {
  currentGame.restartsRemaining = currentGame.restartsRemaining || 2;
  gameState.currentLevel = level;
  
  const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
  const vocabularySet = vocabularySets[setKey];
  
  const coinCount = document.querySelector('.coin-count');
  if (coinCount) {
    coinCount.textContent = gameState.coins || 0;
    coinCount.style.display = 'block';
  }
  
  currentGame.startingCoins = gameState.coins;
  currentGame.startingPerks = { ...gameState.perks };
  currentGame.timeBonus = 0;
  currentGame.initialTimeRemaining = null;
  currentGame.streakBonus = true;
  currentGame.levelStartTime = Date.now();
  
  showLevelIntro(level, () => {
    setupGameState(calculateWordsForLevel(level, vocabularySet), vocabularySet);
    showScreen("question-screen");
    addAdminTestButton();
    
    if (level === 21) {
      console.log("Initializing boss level in proceedWithLevel");
      initializeBossLevel();
      setTimeout(applyBossLevelStyles, 200);
      loadNextBossQuestion();
    } else {
      updateProgressCircle();
      loadNextQuestion();
    }
    
    setTimeout(() => {
      startTimer(currentGame.words.length);
    }, 200);
  }, forceFullIntro);
}

document.querySelector('.perks-container').innerHTML = `
    ${Object.entries(PERK_CONFIG).map(([type, config]) => `
        <button class="perk-button" id="${type}Perk" onclick="buyPerk('${type}')">
            <i class="fas ${config.icon} perk-icon"></i>
            <span class="perk-count">0</span>
        </button>
    `).join('')}
`;

function proceedWithLevel(levelId) {
    if (!currentGame.restartsRemaining) {
        currentGame.restartsRemaining = 2;
    }
    
    gameState.currentLevel = levelId;
    const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
    const vocabulary = vocabularySets[setKey];

    // Ensure coin display remains visible
    const coinDisplay = document.querySelector('.coin-count');
    if (coinDisplay) {
        coinDisplay.textContent = gameState.coins || 0;
        coinDisplay.style.display = 'block';
    }

    // Prepare all game state first
    currentGame.startingCoins = gameState.coins;
    currentGame.startingPerks = { ...gameState.perks };
    currentGame.timeBonus = 0;
    currentGame.initialTimeRemaining = null;
    currentGame.streakBonus = true;
    currentGame.levelStartTime = Date.now();
    
    // Show intro, but prepare the level during the curtain-down moment
    showLevelIntro(levelId, () => {
        // Setup all game state while curtain is down
        const levelConfig = calculateWordsForLevel(levelId, vocabulary);
        setupGameState(levelConfig, vocabulary);
        
        // Prepare the question screen while curtain is still down
        showScreen('question-screen');
        updateProgressCircle();
        loadNextQuestion();
        
        // Only start the timer after curtain is fully up
        setTimeout(() => {
            startTimer(currentGame.words.length);
        }, 200);
    });
}

function setupGameState(levelConfig, vocabulary) {
    if (typeof levelConfig === 'object') {
        // Check if we have randomized indices
        if (levelConfig.randomIndices) {
            // Create new arrays with just the words we need based on random indices
            const randomWords = levelConfig.randomIndices.map(index => vocabulary.words[index]);
            const randomTranslations = levelConfig.randomIndices.map(index => vocabulary.translations[index]);
            
            Object.assign(currentGame, {
                words: randomWords,
                translations: randomTranslations,
                currentIndex: 0,
                correctAnswers: 0,
                firstAttempt: true,
                isHebrewToEnglish: levelConfig.isHebrewToEnglish || false,
                mixed: levelConfig.mixed || false,
                speedChallenge: levelConfig.speedChallenge || false,
                isBossLevel: levelConfig.isBossLevel || false
            });
        } else {
            // Fallback to original behavior if randomIndices not available
            const { startIndex, count, isHebrewToEnglish, mixed, speedChallenge, isBossLevel } = levelConfig;
            Object.assign(currentGame, {
                words: vocabulary.words.slice(startIndex, startIndex + count),
                translations: vocabulary.translations.slice(startIndex, startIndex + count),
                currentIndex: 0,
                correctAnswers: 0,
                firstAttempt: true,
                isHebrewToEnglish: isHebrewToEnglish || false,
                mixed: mixed || false,
                speedChallenge: speedChallenge || false,
                isBossLevel: isBossLevel || false
            });
        }
    } else {
        // Legacy behavior for backwards compatibility
        Object.assign(currentGame, {
            words: vocabulary.words.slice(0, levelConfig),
            translations: vocabulary.translations.slice(0, levelConfig),
            currentIndex: 0,
            correctAnswers: 0,
            firstAttempt: true,
            isHebrewToEnglish: false,
            mixed: false,
            speedChallenge: false,
            isBossLevel: false
        });
    }
}

function handleLevelProgression() {
  currentGame.isBossLevel && !currentGame.bossRewardApplied && (currentGame.bossRewardApplied = !0);
  
  const e = gameStructure.stages[gameState.currentStage - 1],
        t = gameState.currentLevel === e.levelsPerSet,
        n = gameState.currentSet === e.numSets,
        r = currentUser ? currentUser.status : "unregistered";
  
  if (t) {
    if (gameState.currentStage >= 2 && 1 === gameState.currentSet && "premium" !== r) {
      // Save completed stage info for future upgrade
      localStorage.setItem("completedTrialStage", gameState.currentStage);
      return showScreen("welcome-screen"), void setTimeout((()=>{
        showUpgradePrompt()
      }), 500);
    }
    
    n ? gameState.currentStage < 5 ? (gameState.currentStage++, gameState.currentSet = 1, startLevel(1)) : showScreen("stage-screen") : (gameState.currentSet++, startLevel(1))
  } else startLevel(gameState.currentLevel + 1)
}


function updateProgressCircle() {
  const progressElement = document.querySelector('.progress-circle .progress');
  const circumference = 2 * Math.PI * 54;
  const progress = currentGame.currentIndex / currentGame.words.length;

  progressElement.style.strokeDasharray = `${circumference} ${circumference}`;
  progressElement.style.strokeDashoffset = circumference * (1 - progress);

  // Create a smooth, logical color transition
  if (progress <= 0.25) {
    // Red to orange gradient (0-25%)
    const hue = Math.floor(progress * 4 * 30); // 0 to 30
    progressElement.style.stroke = `hsl(${hue}, 100%, 45%)`;
  } else if (progress <= 0.5) {
    // Orange to yellow-green gradient (25-50%)
    const hue = 30 + Math.floor((progress - 0.25) * 4 * 40); // 30 to 70
    progressElement.style.stroke = `hsl(${hue}, 100%, 45%)`;
  } else if (progress <= 0.75) {
    // Yellow-green to green gradient (50-75%)
    const hue = 70 + Math.floor((progress - 0.5) * 4 * 40); // 70 to 110
    progressElement.style.stroke = `hsl(${hue}, 100%, 40%)`;
  } else {
    // Green to bright green gradient (75-100%)
    const hue = 110 + Math.floor((progress - 0.75) * 4 * 30); // 110 to 140
    progressElement.style.stroke = `hsl(${hue}, 100%, 40%)`;
  }
}

function loadNextQuestion() {
  // Clear any previous button classes
  document.querySelectorAll('.buttons button').forEach(button => {
    button.classList.remove('correct', 'wrong');
  });

  // Check if there are any words left
  if (currentGame.currentIndex >= currentGame.words.length) return;

  const questionWordElement = document.getElementById('question-word');
  
  // Determine if we should show Hebrew or English based on level or random factor
  const isSpecialLevel = [3, 6, 9, 10, 13, 16, 19, 20, 21].includes(gameState.currentLevel);
  const isHebrewToEnglish = isSpecialLevel && Math.random() < 0.5;
  
  const index = currentGame.currentIndex;
  const wordToDisplay = isHebrewToEnglish ? currentGame.translations[index] : currentGame.words[index];
  const correctAnswer = isHebrewToEnglish ? currentGame.words[index] : currentGame.translations[index];
  
  // Get the pool of potential answers
  const answerPool = isHebrewToEnglish ? currentGame.words : currentGame.translations;
  
  // Create a set to avoid duplicates, starting with the correct answer
  const answerSet = new Set([correctAnswer]);
  
  // Add random incorrect answers until we have 3 options
  while (answerSet.size < 3) {
    const randomAnswer = answerPool[Math.floor(Math.random() * answerPool.length)];
    if (randomAnswer !== correctAnswer) {
      answerSet.add(randomAnswer);
    }
  }
  
  // Generate buttons with the answers
  const buttonsContainer = document.getElementById('buttons');
  buttonsContainer.innerHTML = '';
  
  // Convert set to array and shuffle
  const shuffledAnswers = Array.from(answerSet).sort(() => Math.random() - 0.5);
  
  // Create buttons for each answer
  shuffledAnswers.forEach(answer => {
    const button = document.createElement('button');
    button.textContent = answer;
    button.onclick = () => handleAnswer(answer === correctAnswer);
    buttonsContainer.appendChild(button);
  });
  
  // Apply 3D carousel animation
  if (currentGame.currentIndex > 0) {
    questionWordElement.classList.add('exiting');
    setTimeout(() => {
      questionWordElement.textContent = wordToDisplay;
      questionWordElement.classList.remove('exiting');
      questionWordElement.classList.add('entering');
      setTimeout(() => {
        questionWordElement.classList.remove('entering');
      }, 500); // Match the animation duration
    }, 500); // Match the animation duration
  } else {
    // First word just appears
    questionWordElement.textContent = wordToDisplay;
    questionWordElement.classList.add('entering');
    setTimeout(() => {
      questionWordElement.classList.remove('entering');
    }, 500);
  }
}

function showBossVictoryScreen() {
  console.log("Boss victory screen function called - redirecting to new implementation");
  showBossDefeatEffect();
}

function addAdminTestingButton() {
  // Only add for admin user
  if (!currentUser || currentUser.email !== 'admin123@gmail.com') return;
  
  const questionScreen = document.getElementById('question-screen');
  
  // Check if button already exists
  if (document.getElementById('admin-test-button')) return;
  
  const adminButton = document.createElement('button');
  adminButton.id = 'admin-test-button';
  adminButton.innerHTML = 'Jump to Level 20';
  adminButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #ff5722;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
  `;
  
  adminButton.onclick = function() {
    // Jump to level 20
    gameState.currentLevel = 20;
    startLevel(20);
  };
  
  questionScreen.appendChild(adminButton);
}

function awardTimeBonus() {
   const timeSpent = (Date.now() - currentGame.questionStartTime) / 1000;
   const maxTime = 10; // Maximum time allowed per question
   if (timeSpent < maxTime) {
       const bonusCoins = Math.floor(maxTime - timeSpent);
       currentGame.timeBonus += bonusCoins;
       return bonusCoins;
   }
   return 0;
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

// REPLACE the revealCorrectAnswer function with this improved version
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

function buyPerk(perkType) {
    const perkConfig = PERK_CONFIG[perkType];
    if (!perkConfig) return;

    if (gameState.coins < perkConfig.cost) {
        showNotification(`Need ${perkConfig.cost} coins!`, 'error');
        return;
    }

    // Use CoinsManager instead of direct modification
    CoinsManager.updateCoins(-perkConfig.cost).then(() => {
        switch(perkType) {
            case 'timeFreeze':
                isFrozen = true;
                setTimeout(() => {
                    isFrozen = false;
                }, perkConfig.duration);
                break;

            case 'skip':
                handleAnswer(true, true);
                break;

            case 'clue':
                const buttons = document.querySelectorAll('.buttons button');
                const correctAnswer = currentGame.isHebrewToEnglish ? 
                    currentGame.words[currentGame.currentIndex] : 
                    currentGame.translations[currentGame.currentIndex];
                
                const wrongButtons = Array.from(buttons).filter(btn => 
                    btn.textContent !== correctAnswer);
                
                if (wrongButtons.length > 0) {
                    const buttonToDisable = wrongButtons[Math.floor(Math.random() * wrongButtons.length)];
                    buttonToDisable.disabled = true;
                    buttonToDisable.style.opacity = '0.5';
                }
                break;

            case 'reveal':
                const correctAns = currentGame.isHebrewToEnglish ? 
                    currentGame.words[currentGame.currentIndex] : 
                    currentGame.translations[currentGame.currentIndex];
                
                document.querySelectorAll('.buttons button').forEach(btn => {
                    if (btn.textContent === correctAns) {
                        btn.classList.add('correct');
                        // Store original background
                        const originalBackground = btn.style.background;
                        btn.style.background = 'var(--success)';
                        
                        // Reset after 5 seconds
                        setTimeout(() => {
                            btn.classList.remove('correct');
                            btn.style.background = originalBackground;
                        }, 5000);
                    }
                });
                break;

            case 'rewind':
                // Add time to the timer
                timeRemaining = Math.min(currentGame.totalTime, timeRemaining + 5);
                
                // Update visuals immediately
                updateTimerDisplay();
                updateTimerCircle(timeRemaining, currentGame.totalTime);
                
                showNotification("Time rewind! +5 seconds", "success");
                break;
        }
    }).catch(error => {
        console.error("Error in buying perk:", error);
    });

    saveProgress();
}

function handleLevelCompletion() {
    clearTimer();
    
    if (currentGame.isBossLevel) {
        if (currentGame.bossRewardApplied) {
            // Boss reward already applied, just restore and show effect
            console.log("Boss already defeated and rewarded, just showing effects");
            restoreFromBossLevel();
            showBossDefeatEffect();
        } else {
            // This is the initial boss defeat
            console.log("First boss defeat, applying reward");
            restoreFromBossLevel();
            // Don't add coins here! Let showBossDefeatEffect handle it
            currentGame.bossRewardApplied = true;
            showBossDefeatEffect();
        }
        return;
    }

    // Non-boss level completion code follows...
    const levelKey = `${gameState.currentStage}_${gameState.currentSet}_${gameState.currentLevel}`;
    console.log(`Completing level: ${levelKey}`);
    
    const wasAlreadyCompleted = gameState.perfectLevels.has(levelKey) || gameState.completedLevels.has(levelKey);
    console.log(`Level was previously completed: ${wasAlreadyCompleted}`);
    
    const isPerfect = currentGame.streakBonus && currentGame.correctAnswers === currentGame.words.length;
    
    if (!wasAlreadyCompleted && isPerfect) {
        // Perfect completion of a new level
        const coinReward = 5;
        CoinsManager.updateCoins(coinReward).then(() => {
            updateLevelProgress(gameState.currentStage, gameState.currentSet, gameState.currentLevel, true, true);
            const questionScreen = document.getElementById('question-screen').getBoundingClientRect();
            createParticles(questionScreen.left + questionScreen.width/2, questionScreen.top + questionScreen.height/2);
        });
    } else if (!wasAlreadyCompleted) {
        // Non-perfect completion of a new level
        updateLevelProgress(gameState.currentStage, gameState.currentSet, gameState.currentLevel, true, false);
    }
    
    pulseCoins(5);
    updatePerkButtons();
  
  // Determine next steps
  const stageData = gameStructure.stages[gameState.currentStage - 1];
  const isLastLevelInSet = gameState.currentLevel === stageData.levelsPerSet;
  const isLastSetInStage = gameState.currentSet === stageData.numSets;
  const userStatus = currentUser ? currentUser.status : "unregistered";
  
  // Check if we completed a set
  if (isLastLevelInSet) {
    // Update game progression by checking set completion
    checkSetCompletion(gameState.currentStage, gameState.currentSet);
    
    if (isLastSetInStage) {
      // Completed the last set in the stage
      if (userStatus === "premium" && gameState.currentStage < 5) {
        // Premium user, not on last stage, go to next stage
        setTimeout(() => {
          gameState.currentStage++;
          gameState.currentSet = 1;
          gameState.currentLevel = 1;
          startLevel(1);
        }, 1500);
      } else {
        // Either not premium, or last stage reached
        setTimeout(() => showScreen("stage-cascade-screen"), 1500);
      }
    } else {
      // Last level in set but not last set in stage
      setTimeout(() => {
        gameState.currentSet++;
        gameState.currentLevel = 1;
        startLevel(1);
      }, 1500);
    }
  } else {
    // Not the last level in set, simply go to next level
    setTimeout(() => {
      gameState.currentLevel++;
      startLevel(gameState.currentLevel);
    }, 1500);
  }
}

function checkSetCompletion(stage, set) {
  // Get total number of levels in the set
  const totalLevels = gameStructure.stages[stage-1].levelsPerSet;
  
  // Check if all levels are completed
  let completedCount = 0;
  for (let i = 1; i <= totalLevels; i++) {
    const levelKey = `${stage}_${set}_${i}`;
    if (gameState.completedLevels.has(levelKey) || gameState.perfectLevels.has(levelKey)) {
      completedCount++;
    }
  }
  
  console.log(`Set ${stage}-${set} completion: ${completedCount}/${totalLevels}`);
  
  // If all levels are completed, unlock next set
  if (completedCount === totalLevels) {
    console.log(`Set ${stage}-${set} is complete. Unlocking next set.`);
    unlockNextSet();
  }
}

function handleProgression(levelKey) {
    const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
    if (!gameState.unlockedLevels[setKey]) {
        gameState.unlockedLevels[setKey] = new Set();
    }
    gameState.unlockedLevels[setKey].add(gameState.currentLevel);

    const currentStageConfig = gameStructure.stages[gameState.currentStage - 1];
    const isLastLevelInSet = gameState.currentLevel === currentStageConfig.levelsPerSet;
    const isLastSetInStage = gameState.currentSet === currentStageConfig.numSets;

    // Handle unlocks
    if (!isLastLevelInSet) {
        gameState.unlockedLevels[setKey].add(gameState.currentLevel + 1);
    } else if (!isLastSetInStage) {
        unlockNextSet();
    } else if (gameState.currentStage < 5) {
        unlockNextStage();
    }

    saveProgress();
    updateAllCoinDisplays();

    // Progress to next level
    setTimeout(() => {
        if (isLastLevelInSet) {
            if (!isLastSetInStage) {
                gameState.currentSet++;
                startLevel(1);
            } else if (gameState.currentStage < 5) {
                gameState.currentStage++;
                gameState.currentSet = 1;
                startLevel(1);
            } else {
                showScreen('stage-screen');
            }
        } else {
            startLevel(gameState.currentLevel + 1);
        }
    }, 1500);
}

function createCompletionParticles() {
    const questionScreen = document.getElementById('question-screen');
    const rect = questionScreen.getBoundingClientRect();
    const viewportX = rect.left + (rect.width / 2);
    const viewportY = rect.top + (rect.height / 2);
    
    for (let i = 0; i < 5; i++) {
        setTimeout(() => createParticles(viewportX, viewportY), i * 300);
    }
}


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
  

// Particle background initialization
function initializeParticles(container = document.body) {
    // Ensure container is a valid DOM element
    if (!(container instanceof HTMLElement)) {
        container = document.body;
    }
    
    // Find or create the particle container
    let particleContainer = container.querySelector('.particle-container');
    if (!particleContainer) {
        particleContainer = document.createElement('div');
        particleContainer.classList.add('particle-container');
        container.appendChild(particleContainer);
    }
    
    const characterSet = [
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        ...'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω',
        ...'אבגדהוזחטיכלמנסעפצקרשת'
    ];

    function createLetterParticle() {
        const particle = document.createElement('div');
        particle.classList.add('letter-particle');
        
        particle.textContent = characterSet[Math.floor(Math.random() * characterSet.length)];
        
        const startX = Math.random() * container.clientWidth;
        const startY = Math.random() * container.clientHeight;
        
        const moveX = -100 + Math.random() * 200;
        const moveY = -100 + Math.random() * 200;
        
        const size = 12 + Math.random() * 16;
        const opacity = 0.2 + Math.random() * 0.3;
        const rotate = Math.random() * 180;
        const duration = 8 + Math.random() * 10;
        
        particle.style.cssText = `
            position: absolute;
            left: ${startX}px;
            top: ${startY}px;
            font-size: ${size}px;
            animation: letterFloat ${duration}s ease-in-out forwards;
            --moveX: ${moveX}px;
            --moveY: ${moveY}px;
            --opacity: ${opacity};
            --rotate: ${rotate}deg;
            pointer-events: none;
        `;
        
        particleContainer.appendChild(particle);
        
        setTimeout(() => {
            particleContainer.removeChild(particle);
        }, duration * 1000);
    }
    
    // Initial particles
    for (let i = 0; i < 50; i++) {
        createLetterParticle();
    }
    
    // Continuous particle generation
    const particleInterval = setInterval(createLetterParticle, 1000);
    
    // Optional: store the interval to clear it if needed
    particleContainer.dataset.intervalId = particleInterval;
}

// Modify the existing window.onload
window.onload = async () => {
    await checkExistingSession();
    initializeGame();
    updatePerkButtons();
    
    // Ensure particles on welcome screen
    const welcomeScreen = document.getElementById('welcome-screen');
    initializeParticles(welcomeScreen);
    
    await loadCustomLists();
};

function stopLevelAndGoBack() {
  clearTimer();
  isFrozen = false;
  
  // Show a simple outro animation
  const outro = document.createElement('div');
  outro.className = 'simple-level-transition';
  outro.style.display = 'flex';
  outro.style.justifyContent = 'center';
  outro.style.alignItems = 'center';
  
  // Create light streaks for animation
  for (let i = 0; i < 3; i++) {
    const streak = document.createElement('div');
    streak.className = 'light-streak';
    streak.style.top = `${20 + (i * 25)}%`;
    streak.style.animationDelay = `${i * 0.2}s`;
    outro.appendChild(streak);
  }
  
  const announcement = document.createElement('div');
  announcement.className = 'level-announcement simple';
  announcement.style.position = 'relative'; // Ensure proper positioning
  
  announcement.innerHTML = `
    <div class="level-number">
      <i class="fas fa-check-circle" style="color: var(--gold); font-size: 2rem;"></i>
    </div>
    <div class="level-text">Session Complete</div>
  `;
  
  outro.appendChild(announcement);
  document.body.appendChild(outro);
  
  // Clear session
  gameState.sessionStartTime = null;
  
  currentGame = {
    words: [],
    translations: [],
    currentIndex: 0,
    correctAnswers: 0,
    firstAttempt: true,
    isHebrewToEnglish: false,
    mixed: false,
    speedChallenge: false,
    timeBonus: 0,
    initialTimeRemaining: null,
    streakBonus: true,
    restartsRemaining: null
  };
  
  setTimeout(() => {
    outro.classList.add('fade-out');
    setTimeout(() => {
      document.body.removeChild(outro);
      showScreen("welcome-screen");
    }, 300);
  }, 1200);
}




function handleResetProgress() {
    // Show confirmation dialog before resetting
    if (!confirm('Are you sure you want to reset your progress? This will clear all game progress, word count, and coins.')) {
        return;
    }
    
    try {
        // Reset game state
        gameState.currentStage = 1;
        gameState.currentSet = 1;
        gameState.currentLevel = 1;
        gameState.coins = 0;
        gameState.perks = {};
        gameState.unlockedSets = { "1": new Set([1]) };
        gameState.unlockedLevels = { "1_1": new Set([1]) };
        gameState.perfectLevels = new Set();
        gameState.completedLevels = new Set();
        
        // Update UI
        updateAllCoinDisplays();
        
        // Clear localStorage
        localStorage.removeItem("simploxProgress");
        localStorage.removeItem("simploxCustomCoins");
        
        // For registered users, update database
        if (currentUser) {
            // Reset game progress
            supabaseClient
                .from("game_progress")
                .update({
                    stage: 1,
                    set_number: 1,
                    level: 1,
                    coins: 0,
                    perks: {},
                    unlocked_sets: { "1": [1] },
                    unlocked_levels: { "1_1": [1] },
                    perfect_levels: [],
                    completed_levels: []
                })
                .eq("user_id", currentUser.id)
                .then(({ error }) => {
                    if (error) console.error("Error resetting progress:", error);
                });
            
            // Reset player stats including word count
            supabaseClient
                .from("player_stats")
                .update({
                    total_levels_completed: 0,
                    unique_words_practiced: 0
                })
                .eq("user_id", currentUser.id)
                .then(({ error }) => {
                    if (error) console.error("Error resetting stats:", error);
                    
                    // Update word count display
                    document.querySelectorAll("#totalWords").forEach(el => {
                        el.textContent = "0";
                    });
                });
        }
        
        // Show success message
        showNotification("Progress has been reset successfully", "success");
        
        // Refresh the screen
        setTimeout(() => {
            showScreen('welcome-screen', true);
        }, 1000);
        
    } catch (error) {
        console.error("Error in handleResetProgress:", error);
        showNotification("Failed to reset progress", "error");
    }
}


function handleRestartLevel() {
    // If no restarts remaining, ignore the click entirely
    if (currentGame.restartsRemaining <= 0) {
        return;
    }
    
    const restartButton = document.querySelector('.navigation-button.restart-level');
    
    // Update the restarts counter
    currentGame.restartsRemaining--;
    
    // Show visual feedback of remaining restarts
    if (currentGame.restartsRemaining === 1) {
        restartButton.style.opacity = '0.7';
    } else if (currentGame.restartsRemaining === 0) {
        restartButton.classList.add('disabled');
        
        // Remove the click handler when out of restarts
        restartButton.onclick = null;
        // Additional safety: explicitly disable the button
        restartButton.disabled = true;
    }
    
    // Restore initial state
    gameState.coins = currentGame.startingCoins;
    gameState.perks = { ...currentGame.startingPerks };
    
    // Update UI
    updatePerkButtons();
    updateAllCoinDisplays();
    
    // Save current state
    saveProgress();
    
    // Restart the level
    startLevel(gameState.currentLevel);
}



function findFurthestProgression() {
    // Check for saved game context first
    const savedContext = localStorage.getItem("gameContext");
    if (savedContext) {
        try {
            const context = JSON.parse(savedContext);
            if (context.stage && context.set && context.level) {
                console.log("Resuming from saved context:", context);
                return {
                    stage: context.stage,
                    set: context.set,
                    level: context.level
                };
            }
        } catch (e) {
            console.error("Error parsing saved context:", e);
        }
    }

    // Check for preferred stage
    const preferredStage = parseInt(localStorage.getItem("preferredStage"));
    
    // Debug logging
    console.log("Finding furthest progression");
    console.log("Current unlocked sets:", gameState.unlockedSets);
    console.log("Current unlocked levels:", gameState.unlockedLevels);
    console.log("Completed levels:", Array.from(gameState.completedLevels));
    console.log("Perfect levels:", Array.from(gameState.perfectLevels));

    // We'll track the furthest level found
    let furthestLevel = null;
    let highestRank = -1;

    // Helper to check if a level is unlocked but not completed
    const isUnlockedNotCompleted = (stage, set, level) => {
        const levelKey = `${stage}_${set}_${level}`;
        const setKey = `${stage}_${set}`;
        
        // Check if the level is unlocked
        const isUnlocked = gameState.unlockedLevels[setKey]?.has(level);
        
        // Check if the level is not yet completed
        const isNotCompleted = !gameState.completedLevels.has(levelKey) && 
                              !gameState.perfectLevels.has(levelKey);
                              
        return isUnlocked && isNotCompleted;
    };


    // First check preferred stage if set
    if (preferredStage && preferredStage >= 1 && preferredStage <= 5) {
        console.log(`Checking preferred stage: ${preferredStage}`);
        
        // Go through all possible sets in this stage
        for (let set = 1; set <= gameStructure.stages[preferredStage-1].numSets; set++) {
            const setKey = `${preferredStage}_${set}`;
            
            // Skip if no unlocked levels for this set
            if (!gameState.unlockedLevels[setKey]) continue;
            
            // Sort levels in descending order (highest first)
            const levels = Array.from(gameState.unlockedLevels[setKey]).sort((a, b) => b - a);
            
            console.log(`Checking set ${setKey}, unlocked levels:`, levels);
            
            // Check each level for this set
            for (let level of levels) {
                if (isUnlockedNotCompleted(preferredStage, set, level)) {
                    const rank = calculateRank(preferredStage, set, level);
                    if (rank > highestRank) {
                        highestRank = rank;
                        furthestLevel = {
                            stage: preferredStage,
                            set: set,
                            level: level
                        };
                        console.log(`Found candidate in preferred stage: ${preferredStage}-${set}-${level}`);
                    }
                }
            }
        }
    }

    // If we didn't find a level in the preferred stage, check all stages
    if (!furthestLevel) {
        // Check each stage
        for (let stage = 1; stage <= 5; stage++) {
            // Skip if no unlocked sets for this stage
            if (!gameState.unlockedSets[stage]) continue;
            
            // Get all unlocked sets for this stage, sorted in descending order
            const sets = Array.from(gameState.unlockedSets[stage]).sort((a, b) => b - a);
            
            for (let set of sets) {
                const setKey = `${stage}_${set}`;
                
                // Skip if no unlocked levels for this set
                if (!gameState.unlockedLevels[setKey]) continue;
                
                // Get all unlocked levels for this set, sorted in descending order
                const levels = Array.from(gameState.unlockedLevels[setKey]).sort((a, b) => b - a);
                
                for (let level of levels) {
                    if (isUnlockedNotCompleted(stage, set, level)) {
                        const rank = calculateRank(stage, set, level);
                        if (rank > highestRank) {
                            highestRank = rank;
                            furthestLevel = {
                                stage: stage,
                                set: set,
                                level: level
                            };
                            console.log(`Found candidate: ${stage}-${set}-${level}`);
                        }
                    }
                }
            }
        }
    }

    // If we found a furthest level, return it
    if (furthestLevel) {
        console.log("Found furthest progress:", furthestLevel);
        return furthestLevel;
    }

    // If no furthest level found but preferred stage is set, return that stage's first level
    if (preferredStage && preferredStage >= 1 && preferredStage <= 5) {
        return {
            stage: preferredStage,
            set: 1,
            level: 1
        };
    }

    // Default to the very beginning
    return {
        stage: 1,
        set: 1,
        level: 1
    };
}

function startGame() {
    console.log("Starting game");
    
    if (!hasExistingProgress()) {
        console.log("No existing progress found, showing grade selector");
        showGradeLevelSelector();
        return;
    }
    
    // Check for saved game context first
    const savedContext = localStorage.getItem("gameContext");
    if (savedContext) {
        try {
            const context = JSON.parse(savedContext);
            if (context.stage && context.set && context.level) {
                console.log("Found saved game context:", context);
                
                // Use context data for current level
                gameState.currentStage = context.stage;
                gameState.currentSet = context.set;
                gameState.currentLevel = context.level;
                
                startLevel(gameState.currentLevel);
                return;
            }
        } catch (e) {
            console.error("Error parsing game context:", e);
        }
    }
    
    // If no context, use current game state
    console.log("Using current game state:", {
        stage: gameState.currentStage,
        set: gameState.currentSet,
        level: gameState.currentLevel
    });
    
    startLevel(gameState.currentLevel);
}

function updateLevelProgress(stage, set, level, completed, perfect) {
    // Create a key to reference this specific level
    const levelKey = `${stage}_${set}_${level}`;
    
    // Update completion state
    if (perfect) {
        gameState.perfectLevels.add(levelKey);
        gameState.completedLevels.add(levelKey);  // Perfect levels are also completed
    } else if (completed) {
        gameState.completedLevels.add(levelKey);
    }
    
    // Ensure level is unlocked
    const setKey = `${stage}_${set}`;
    if (!gameState.unlockedLevels[setKey]) {
        gameState.unlockedLevels[setKey] = new Set();
    }
    gameState.unlockedLevels[setKey].add(level);
    
    // Unlock next level if not already unlocked
    const nextLevel = level + 1;
    const isLastLevelInSet = level === gameStructure.stages[stage-1].levelsPerSet;
    
    if (!isLastLevelInSet) {
        gameState.unlockedLevels[setKey].add(nextLevel);
        console.log(`Unlocked next level: ${nextLevel} in set ${setKey}`);
    }
    
    // Check if set is now complete
    if (isLastLevelInSet && completed) {
        checkSetCompletion(stage, set);
    }
    
    // Save progress
    saveProgress();
}

function checkSetCompletion(stage, set) {
    // Get total number of levels in the set
    const totalLevels = gameStructure.stages[stage-1].levelsPerSet;
    
    // Check if all levels are completed
    let completedCount = 0;
    for (let i = 1; i <= totalLevels; i++) {
        const levelKey = `${stage}_${set}_${i}`;
        if (gameState.completedLevels.has(levelKey) || gameState.perfectLevels.has(levelKey)) {
            completedCount++;
        }
    }
    
    console.log(`Set ${stage}-${set} completion: ${completedCount}/${totalLevels}`);
    
    // If all levels are completed, unlock next set
    if (completedCount === totalLevels) {
        console.log(`Set ${stage}-${set} is complete. Unlocking next set.`);
        unlockNextSet();
    }
}

function unlockNextSet() {
  const currentStage = gameState.currentStage;
  const currentSet = gameState.currentSet;
  
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

function showLevelIntro(level, callback, forceFull = false) {
  // Skip the animation if we're in a continuous session unless forced
  if (!(!gameState.sessionStartTime || (Date.now() - gameState.sessionStartTime > 1800000) || forceFull)) {
    // Simple transition for continuous play
    const transitionDiv = document.createElement('div');
    transitionDiv.className = 'simple-level-transition';
    transitionDiv.style.display = 'flex';
    transitionDiv.style.justifyContent = 'center';
    transitionDiv.style.alignItems = 'center';

    // Create light streaks for effect
    for (let i = 0; i < 3; i++) {
      const streak = document.createElement('div');
      streak.className = 'light-streak';
      streak.style.top = (20 + 25 * i) + '%';
      streak.style.animationDelay = (0.2 * i) + 's';
      transitionDiv.appendChild(streak);
    }

    const announcementDiv = document.createElement('div');
    announcementDiv.className = 'level-announcement simple';
    announcementDiv.style.position = 'relative';

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'transition-progress';

    // Check if this is a custom practice level
    if (currentGame && currentGame.isCustomPractice) {
      if (currentGame.mixed) {
        // Test level in custom practice
        announcementDiv.innerHTML = `
          <div class="level-number">Test</div>
          <div class="level-text">Review Challenge</div>
        `;
      } else {
        // Regular round in custom practice
        announcementDiv.innerHTML = `
          <div class="level-number">Round ${level}</div>
          <div class="level-text">Custom Practice</div>
        `;
      }
    } else {
      // Regular game level
      announcementDiv.innerHTML = `
        <div class="level-number">${level}</div>
        <div class="level-text">Stage ${gameState.currentStage} - Set ${gameState.currentSet}</div>
      `;
    }

    announcementDiv.appendChild(progressBar);
    transitionDiv.appendChild(announcementDiv);
    document.body.appendChild(transitionDiv);
    
    // Animate progress bar
    setTimeout(() => {
      progressBar.style.width = '100%';
    }, 50);

    // Remove after animation completes
    setTimeout(() => {
      transitionDiv.classList.add('fade-out');
      setTimeout(() => {
        callback();
        document.body.removeChild(transitionDiv);
      }, 300);
    }, 800);
    return;
  }

  // Full animation for new sessions or when forced
  const isTestLevel = [3, 6, 9, 10, 13, 16, 19, 20].includes(level);
  const isBossLevel = level === 21;
  
  let levelClass = 'normal-level';
  if (isTestLevel) levelClass = 'test-level';
  if (isBossLevel) levelClass = 'boss-level';

  const transitionDiv = document.createElement('div');
  transitionDiv.className = 'level-transition';

  // Custom practice level announcements
  if (currentGame && currentGame.isCustomPractice) {
    if (currentGame.mixed) {
      // Test level in custom practice
      transitionDiv.innerHTML = `
        <div class="level-announcement ${levelClass}">
          <h1>Test Challenge</h1>
          <h2>Combined Words Review</h2>
          <div class="test-badge">Review Challenge</div>
        </div>
      `;
    } else {
      // Regular round in custom practice
      transitionDiv.innerHTML = `
        <div class="level-announcement ${levelClass}">
          <h1>Round ${level}</h1>
          <h2>Custom Practice</h2>
          ${isTestLevel ? '<div class="test-badge">Review Challenge</div>' : ''}
        </div>
      `;
    }
  } else {
    // Regular game level announcement
    transitionDiv.innerHTML = `
      <div class="level-announcement ${levelClass}">
        <h1>${isBossLevel ? 'BOSS FIGHT!' : `Stage ${gameState.currentStage}`}</h1>
        <h2>${isBossLevel ? 'FINAL CHALLENGE' : `Level ${gameState.currentSet}-${level}`}</h2>
        ${isTestLevel ? '<div class="test-badge">Review Challenge</div>' : ''}
        ${isBossLevel ? '<div class="boss-badge">DANGER ZONE</div>' : ''}
      </div>
    `;
  }

  document.body.appendChild(transitionDiv);
  const announcementElement = transitionDiv.querySelector('.level-announcement');
  
  // Force reflow
  transitionDiv.offsetHeight;
  
  // Add animation classes
  transitionDiv.classList.add('show');
  announcementElement.classList.add('show');

  // Special styling for boss level
  if (isBossLevel) {
    const announcementEl = transitionDiv.querySelector('.level-announcement');
    if (announcementEl) {
      announcementEl.style.background = 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)';
      announcementEl.style.boxShadow = '0 0 30px rgba(255, 0, 0, 0.5)';
      
      const titleEl = announcementEl.querySelector('h1');
      if (titleEl) {
        titleEl.style.color = '#ffffff';
        titleEl.style.textShadow = '0 0 20px rgba(255, 0, 0, 0.8)';
      }
    }
  }

  // Remove after animation completes
  setTimeout(() => {
    callback();
    transitionDiv.classList.remove('show');
    announcementElement.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(transitionDiv);
    }, 400);
  }, 1500);
}

const customPracticeLists = {
    lists: [],
    currentList: null,
    maxLists: 5
};


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


function closeShareModal() {
    const modal = document.querySelector('.share-modal');
    const backdrop = document.querySelector('.modal-backdrop');
    
    if (modal) modal.remove();
    if (backdrop) backdrop.remove();
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

// REPLACE the showShareModal function
function showShareModal(listId) {
    console.log("Opening share modal for list:", listId);
    
    // Remove any existing modals
    const existingModal = document.querySelector('.share-modal');
    const existingBackdrop = document.querySelector('.modal-backdrop');
    if (existingModal) existingModal.remove();
    if (existingBackdrop) existingBackdrop.remove();
    
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.onclick = closeShareModal;
    document.body.appendChild(backdrop);
    
    // Create share modal
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
        <h3 class="share-modal-header">Share List</h3>
        <div class="users-list">Loading users...</div>
        <button class="start-button modal-close" onclick="closeShareModal()">Cancel</button>
    `;
    document.body.appendChild(modal);
    
    // Now we know the modal and users-list are in the DOM
    const usersList = modal.querySelector('.users-list');
    
    // Fetch users
    supabaseClient.from("user_profiles")
        .select("id, username")
        .neq("id", currentUser.id)
        .then(({ data, error }) => {
            if (error) {
                console.error("Error fetching users:", error);
                usersList.innerHTML = '<div class="user-item"><span>Error loading users</span></div>';
                return;
            }
            
            if (!data || data.length === 0) {
                usersList.innerHTML = '<div class="user-item"><span>No other users available</span></div>';
                return;
            }
            
            usersList.innerHTML = data.map(user => `
                <div class="user-item">
                    <span>${user.username || "Unnamed User"}</span>
                    <button class="main-button small-button share-with-user-btn" data-user-id="${user.id}">
    <i class="fas fa-share-alt"></i> Share
</button>
                </div>
            `).join("");
            
            // Add click handlers to share buttons
            modal.querySelectorAll('.share-with-user-btn').forEach(btn => {
                btn.onclick = async () => {
                    const userId = btn.getAttribute('data-user-id');
                    btn.disabled = true;
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sharing...';
                    
                    const success = await shareListWithUser(listId, userId);
                    
                    if (!success) {
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                    }
                };
            });
        });
}

// ADD this function to close the share modal
function closeShareModal() {
    const modal = document.querySelector('.share-modal');
    const backdrop = document.querySelector('.modal-backdrop');
    
    if (modal) modal.remove();
    if (backdrop) backdrop.remove();
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



async function checkExistingSession() {
    console.log("Checking for existing user session");
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            console.log("Found existing session for user:", session.user.id);
            currentUser = session.user;
            
            // Fetch user profile data
            const { data: profileData } = await supabaseClient
                .from("user_profiles")
                .select("status")
                .eq("id", currentUser.id)
                .single();
                
            if (profileData) {
                currentUser.status = profileData.status;
                updateUserStatusDisplay(profileData.status);
            }
            
            // Initialize status check
            initializeStatusCheck();
            
            // Update UI
            updateAuthUI();
            updateGuestPlayButton();
            
            return true;
        } else {
            console.log("No active session found");
            currentUser = null;
            updateAuthUI();
            updateUserStatusDisplay(null);
            updateGuestPlayButton();
            return false;
        }
    } catch (error) {
        console.error("Session check error:", error);
        currentUser = null;
        updateAuthUI();
        updateUserStatusDisplay(null);
        updateGuestPlayButton();
        return false;
    }
}

// Add at the document.addEventListener("DOMContentLoaded", ...) section
document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM fully loaded, initializing game");
    
    // Initialize game with explicit progression saving/loading
    gameInit.init().then(() => {
        console.log("Game initialization completed");
        
        // Check for saved context on startup
        const savedContext = localStorage.getItem("gameContext");
        if (savedContext && !window.location.hash) {
            try {
                const context = JSON.parse(savedContext);
                const timeSinceContext = Date.now() - (context.timestamp || 0);
                
                // Only use context if it's less than 24 hours old
                if (timeSinceContext < 24 * 60 * 60 * 1000) {
                    console.log("Found recent game context, updating game state:", context);
                    gameState.currentStage = context.stage || gameState.currentStage;
                    gameState.currentSet = context.set || gameState.currentSet;
                    gameState.currentLevel = context.level || gameState.currentLevel;
                }
            } catch (e) {
                console.error("Error parsing saved context:", e);
            }
        }
    });
});

function setupAutoSave() {
    // Auto-save progress every 30 seconds
    const autoSaveInterval = setInterval(() => {
        if (gameState.currentStage && gameState.currentSet && gameState.currentLevel) {
            console.log("Auto-saving game progress");
            saveProgress();
        }
    }, 30000);
    
    // Save progress when the window is about to unload
    window.addEventListener("beforeunload", () => {
        if (gameState.currentStage && gameState.currentSet && gameState.currentLevel) {
            console.log("Saving progress before page unload");
            saveProgress();
        }
    });
    
    return autoSaveInterval;
}

// Call this function at initialization
document.addEventListener("DOMContentLoaded", function() {
    setupAutoSave();
});

function initializeStatusCheck() {
  if (window.statusCheckInterval && clearInterval(window.statusCheckInterval), currentUser) {
    const e = setInterval((async()=>{
      try {
        if (!currentUser || !currentUser.id)
          return void clearInterval(window.statusCheckInterval);
          
        const {data: e, error: t} = await supabaseClient.from("user_profiles").select("status").eq("id", currentUser.id).single();
        
        if (t || !e)
          return clearInterval(window.statusCheckInterval), currentUser = null, void updateAuthUI();
        
        const previousStatus = currentUser.status;
        updateUserStatusDisplay(e.status);
        
        if ("premium" === e.status && "premium" !== previousStatus) {
          currentUser.status = "premium";
          // Check if user completed a trial stage before upgrading
          const completedStage = localStorage.getItem("completedTrialStage");
          if (completedStage) {
            // Set flag to unlock next set after celebration
            localStorage.setItem("unlockNextSetForStage", completedStage);
            // Clear the completed stage marker
            localStorage.removeItem("completedTrialStage");
          }
          showPremiumCelebration();
        }
      } catch(e) {
        console.error("Status check error:", e), clearInterval(window.statusCheckInterval), currentUser = null, updateAuthUI()
      }
    }), 3e3);
    
    window.statusCheckInterval = e
  }
}

// ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE ARCADE







let currentArcadeSession = {
    eventId: null,
    otp: null,
    wordPool: [],
    participants: [],
    teacherId: null,
    wordGoal: 50,
    state: 'pre-start',  // 'pre-start', 'started', 'active', 'ended'
    completedPlayers: [],  // To track players who already completed
    playerRank: null,      // Current player's rank if completed
    winnerScreenShown: false, // Flag to prevent multiple winner screens
    startTime: null,       // When the session started
    endTime: null          // When the session ended
};


async function showArcadeModal() {
    const modal = document.getElementById('arcade-modal');
    const teacherView = document.getElementById('teacher-view');
    const playerView = document.getElementById('player-view');
    const usernameInput = document.getElementById('arcadeUsername');
    const otpInput = document.getElementById('otpInput');
    const inputGroup = usernameInput ? usernameInput.closest('.input-group') : null;
    
    // Clear any previous OTP input values
    if (otpInput) {
        otpInput.value = "";
    }
    
    try {
        if (currentUser) {
            const { data } = await supabaseClient
                .from('user_profiles')
                .select('role')
                .eq('id', currentUser.id)
                .single();
                
            if (data?.role === 'teacher') {
                // Always create a new OTP for a new session
                const otp = Math.floor(1000 + Math.random() * 9000).toString();
                currentArcadeSession.otp = otp;
                currentArcadeSession.teacherId = currentUser.id;
                currentArcadeSession.participants = [];
                currentArcadeSession.isInitialized = false;
                currentArcadeSession.state = "pre-start";
                currentArcadeSession.celebrationTriggered = false;
                
                if (window.arcadeChannel) {
                    window.arcadeChannel.unsubscribe();
                }
                
                window.arcadeChannel = supabaseClient.channel(`arcade:${otp}`, {
                    config: { broadcast: { self: true } }
                });
                
                window.arcadeChannel.on('broadcast', { event: 'player_join' }, ({ payload: data }) => {
                    console.log('Player join event received:', data);
                    if (!currentArcadeSession.participants.find(p => p.username === data.username)) {
                        currentArcadeSession.participants.push({
                            username: data.username,
                            wordsCompleted: 0,
                            coins: 0
                        });
                        
                        document.getElementById('player-count').textContent = currentArcadeSession.participants.length;
                        
                        const leaderboard = document.getElementById('arcade-leaderboard');
                        if (leaderboard && leaderboard.offsetParent !== null) {
                            updateAllPlayersProgress();
                        }
                    }
                }).subscribe();
                
                const baseUrl = window.location.origin + window.location.pathname;
                generateQRCode(otp);
                
                document.getElementById('otp').textContent = otp;
                teacherView.style.display = 'block';
                playerView.style.display = 'none';
                
                // Reset stage checkboxes
                document.querySelectorAll('.stage-checkboxes input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = false;
                });
                
                // Reset word goal
                const wordGoalInput = document.getElementById('wordGoalInput');
                const wordGoalSlider = document.getElementById('wordGoalSlider');
                const wordGoalDisplay = document.getElementById('wordGoalDisplay');
                
                if (wordGoalInput) wordGoalInput.value = "50";
                if (wordGoalSlider) wordGoalSlider.value = "50";
                if (wordGoalDisplay) wordGoalDisplay.textContent = "50";
                
                initializeWordGoalSlider();
                
                // Make sure End Arcade button is not visible
                const endArcadeButton = document.querySelector('.end-arcade-button');
                if (endArcadeButton) {
                    endArcadeButton.classList.remove('visible');
                }
            } else {
                teacherView.style.display = 'none';
                playerView.style.display = 'block';
                
                if (usernameInput && inputGroup) {
                    const username = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
                    usernameInput.value = username;
                    usernameInput.readOnly = true;
                    usernameInput.style.display = 'none';
                    
                    // Remove any existing username display
                    const existingUsernameDisplay = inputGroup.querySelector('.username-display');
                    if (existingUsernameDisplay) {
                        existingUsernameDisplay.remove();
                    }
                    
                    const usernameDisplay = document.createElement('div');
                    usernameDisplay.className = 'username-display';
                    usernameDisplay.textContent = `Joining as: ${username}`;
                    inputGroup.insertBefore(usernameDisplay, usernameInput);
                }
            }
        } else {
            teacherView.style.display = 'none';
            playerView.style.display = 'block';
            
            if (usernameInput) {
                usernameInput.readOnly = false;
                usernameInput.style.display = 'block';
                usernameInput.value = ""; // Clear any previous username
                
                const usernameDisplay = inputGroup?.querySelector('.username-display');
                if (usernameDisplay) {
                    usernameDisplay.remove();
                }
            }
        }
        
        modal.style.display = 'block';
    } catch (error) {
        console.error('Arcade setup error:', error);
        alert('Failed to initialize arcade');
    }
}

function initializeWordGoalSlider() {
    const slider = document.getElementById('wordGoalSlider');
    const display = document.getElementById('wordGoalDisplay');
    const input = document.getElementById('wordGoalInput');
    const stops = document.querySelectorAll('.slider-stop');
    
    if (!slider || !display || !input) return;
    
    // Set the min attribute to 0 to match visual display
    slider.min = 0;
    slider.max = 200;
    slider.value = 50; // Default value
    display.textContent = 50;
    input.value = 50;
    
    // Update display and input when slider changes
    slider.addEventListener('input', function() {
        const value = parseInt(this.value);
        display.textContent = value;
        input.value = value;
    });
    
    // Update slider and display when input changes
    input.addEventListener('input', function() {
        let value = parseInt(this.value) || 0;
        
        // Enforce min/max constraints
        value = Math.max(0, Math.min(200, value));
        
        slider.value = value;
        display.textContent = value;
        this.value = value;
    });
    
    // Allow clicking on preset stops
    stops.forEach(stop => {
        stop.addEventListener('click', function() {
            const value = parseInt(this.dataset.value);
            slider.value = value;
            display.textContent = value;
            input.value = value;
        });
    });
}



function startPlayerCounting(teacherId) {
    if (window.countInterval) clearInterval(window.countInterval);
    
    async function updateCount() {
        try {
            const { data } = await supabaseClient
                .from('game_progress')
                .select('arcade_session')
                .eq('user_id', teacherId)
                .single();
                
            if (data?.arcade_session?.participants) {
                document.getElementById('player-count').textContent = 
                    data.arcade_session.participants.length;
            }
        } catch (error) {
            console.error('Count update error:', error);
        }
    }
    
    updateCount();
    window.countInterval = setInterval(updateCount, 2000);
}

async function joinArcade() {
  const otp = document.getElementById("otpInput").value.trim().toUpperCase();
  
  try {
    window.arcadeChannel = supabaseClient.channel(`arcade:${otp}`);
    const username = currentUser ? currentUser.user_metadata?.username : getRandomSimploName();
    let statusCheckInterval;
    
    currentArcadeSession.playerName = username;
    
    window.arcadeChannel
      .on("broadcast", { event: "game_end" }, ({ payload: event }) => {
        handleGameEnd(event);
        currentArcadeSession.state = event.state;
        if (event.state === "active") {
          currentArcadeSession.wordPool = event.wordPool;
          currentArcadeSession.wordGoal = event.wordGoal;
          startArcadeGame();
          if (statusCheckInterval) clearInterval(statusCheckInterval);
        }
      })
      .on("broadcast", { event: "game_playing" }, ({ payload: event }) => {
        if (event.state === "active") {
          currentArcadeSession.state = "active";
          currentArcadeSession.wordPool = event.wordPool;
          currentArcadeSession.wordGoal = event.wordGoal;
          startArcadeGame();
          if (statusCheckInterval) clearInterval(statusCheckInterval);
        }
      })
      .subscribe();
    
    // Send join event
    await window.arcadeChannel.send({
      type: "broadcast",
      event: "player_join",
      payload: {
        username: username,
        joinedAt: (new Date()).toISOString(),
        coins: 0 // Always start with 0 coins in a new session
      }
    });
    
    currentArcadeSession.joinEventSent = true;
    currentArcadeSession.otp = otp; // Store OTP for reference
    
    // Check game status
    await window.arcadeChannel.send({
      type: "broadcast",
      event: "check_game_status",
      payload: {
        username: username,
        requestType: "lateJoin",
        timestamp: Date.now()
      }
    });
    
    document.getElementById("arcade-modal").style.display = "none";
    
    setTimeout(() => {
      if (currentArcadeSession.state !== "active") {
        showWaitingScreen();
      }
    }, 500);
    
    // Periodically check game status
    statusCheckInterval = setInterval(async () => {
      await window.arcadeChannel.send({
        type: "broadcast",
        event: "check_game_status"
      });
    }, 2000);
    
    // Clean up the interval after 5 minutes
    setTimeout(() => {
      if (statusCheckInterval) clearInterval(statusCheckInterval);
    }, 300000);
  } catch (error) {
    console.error("Join error:", error);
    alert("Failed to join arcade");
  }
  setupCelebrationHandler();
}


function showJoinButton() {
    const joinButton = document.getElementById('joinGameButton');
    if (joinButton) {
        joinButton.style.display = 'block';
        joinButton.textContent = 'Join Active Game';
    }
}

async function getCurrentCoins() {
    if (!currentUser) return 0;
    
    const { data } = await supabaseClient
        .from('game_progress')
        .select('coins')
        .eq('user_id', currentUser.id)
        .single();
        
    return data?.coins || 0;
}

function getRandomSimploName() {
    const names = [
        'Simplosaurus', 'Simplodian', 'Simpleton', 'Simplonius', 'Simplomancer',
        'Simplonaut', 'Simplobot', 'Simplozilla', 'Simplopedia', 'Simplotron',
        'Simplodex', 'Simplomatic', 'Simplomobile', 'Simplocopter', 'Simplonium',
        'Simplotastic', 'Simplominator', 'Simploverse', 'Simplonado', 'Simplophant',
        'Simplowizard', 'Simplodragon', 'Simplosapien', 'Simploninja', 'Simplowarrior'
    ];
    return names[Math.floor(Math.random() * names.length)];
}

function showWaitingScreen() {
  if ("active" === currentArcadeSession.state) {
    return void startArcadeGame();
  }
  
  document.querySelectorAll(".screen").forEach((e) => {
    e.classList.remove("visible");
  });
  
  const waitingScreen = document.getElementById("waiting-screen");
  waitingScreen.classList.add("visible");
  
  const joinGameButton = document.getElementById("joinGameButton");
  if (joinGameButton) {
    joinGameButton.style.display = "active" === currentArcadeSession.state ? "block" : "none";
  }
  
  // Start the mini-game while waiting
  try {
    initializeWaitingGame();
  } catch (error) {
    console.error("Error initializing waiting game:", error);
  }
  
  const intervalId = setInterval(() => {
    if (window.arcadeChannel) {
      try {
        window.arcadeChannel.send({
          type: "broadcast",
          event: "check_game_status",
          payload: {
            username: currentArcadeSession.playerName,
            requestType: "waitingCheck"
          }
        });
      } catch (e) {
        console.error("Error checking game status:", e);
      }
    }
  }, 2000);
  
  const playerCountElement = document.getElementById("waiting-player-count");
  if (playerCountElement) {
    playerCountElement.parentElement.style.display = "none";
  }
  
  waitingScreen.dataset.pollInterval = intervalId;
  
  setTimeout(() => {
    if (intervalId) clearInterval(intervalId);
  }, 300000);
}

async function initializeArcade() {
    try {
        const initializeButton = document.querySelector('.initialize-button');
        const endArcadeButton = document.querySelector('.end-arcade-button');
        
        if (initializeButton) initializeButton.style.display = 'none';
        if (endArcadeButton) endArcadeButton.classList.add('visible');
        
        currentArcadeSession.state = 'active';
        currentArcadeSession.isInitialized = true;
        
        // Ensure participants list is properly initialized with zero values
        currentArcadeSession.participants = currentArcadeSession.participants.map(p => ({
            ...p,
            wordsCompleted: 0,
            coins: p.coins || 0
        }));
        
        updateAllPlayersProgress();
        initializeModeratorInactivityTimer();
        
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_playing',
            payload: {
                wordPool: currentArcadeSession.wordPool,
                wordGoal: currentArcadeSession.wordGoal,
                state: 'active',
                timestamp: Date.now()
            }
        });
    } catch (error) {
        console.error('Initialize error:', error);
        alert('Failed to start game');
    }
}

function showModeratorScreen() {
    // Hide all other screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    
    // Show moderator screen
    document.getElementById('moderator-screen').classList.add('visible');
    
    // Update OTP display
    const otpDisplay = document.getElementById('moderatorOtp');
    if (otpDisplay && currentArcadeSession.otp) {
        otpDisplay.textContent = currentArcadeSession.otp;
        
        // Generate QR code
        const qrUrl = `${window.location.origin + window.location.pathname}#join=${currentArcadeSession.otp}`;
        console.log('QR URL generated:', qrUrl);
        new QRious({
            element: document.getElementById('qrCode'),
            value: qrUrl,
            size: 200,
            backgroundAlpha: 1,
            foreground: "#16213e",
            background: "#ffffff",
            level: "H"
        });
        
        // Update session metadata
        const now = new Date();
        const sessionInfo = {
            sessionDate: now.toLocaleDateString(),
            sessionStartTime: now.toLocaleTimeString(),
            sessionWordGoal: currentArcadeSession.wordGoal,
            activeParticipantCount: currentArcadeSession.participants.length
        };
        
        Object.entries(sessionInfo).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }
    
    // Initialize leaderboard
    initializeLeaderboard();
    
    // Set up proper button visibility based on session state
    const initializeButton = document.querySelector('.initialize-button');
    const endArcadeButton = document.querySelector('.end-arcade-button');
    
    if (currentArcadeSession.isInitialized && currentArcadeSession.state === 'active') {
        // If session is already initialized and active, show end button and hide initialize button
        if (initializeButton) initializeButton.style.display = 'none';
        if (endArcadeButton) endArcadeButton.classList.add('visible');
    } else {
        // For new or reset sessions, show initialize button and hide end button
        if (initializeButton) initializeButton.style.display = 'block';
        if (endArcadeButton) endArcadeButton.classList.remove('visible');
    }
    
    // Set up inactivity timer
    initializeModeratorInactivityTimer();
    
    // Update player progress if needed
    setTimeout(() => {
        if (currentArcadeSession.participants && currentArcadeSession.participants.length > 0) {
            updateAllPlayersProgress();
        }
    }, 500);
}

function initializeLeaderboard() {
    const leaderboard = document.getElementById('arcade-leaderboard');
    
    // Add header
    leaderboard.innerHTML = `
        <div class="leaderboard-header">
            <div>Rank</div>
            <div>Player</div>
            <div>Words</div>
            <div>Coins</div>
        </div>
    `;
    
    // Show any existing participants
    if (currentArcadeSession.participants.length > 0) {
        updateAllPlayersProgress();
    }
}

function updateAllPlayersProgress() {
    // IMPORTANT: For moderators, make sure we request the latest data from premium players
    if (currentUser?.id === currentArcadeSession.teacherId && currentArcadeSession.state === 'active') {
      try {
        window.arcadeChannel.send({
          type: 'broadcast',
          event: 'request_latest_stats',
          payload: {
            requestedBy: currentUser.id,
            timestamp: Date.now()
          }
        });
      } catch (err) {
        console.error("Error requesting latest stats:", err);
      }
    }
  
    // Get current state from DOM for progress preservation
    const currentProgressMap = {};
    const currentCoinsMap = {}; // Add tracking for coins too
    document.querySelectorAll(".leaderboard-entry").forEach(entry => {
      const usernameEl = entry.querySelector("[data-username]");
      const wordsEl = entry.querySelector("[data-words]");
      const coinsEl = entry.querySelector("[data-coins]");
      
      if (usernameEl && wordsEl) {
        const username = usernameEl.dataset.username;
        const words = parseInt(wordsEl.textContent) || 0;
        const coins = coinsEl ? (parseInt(coinsEl.textContent) || 0) : 0;
        
        currentProgressMap[username] = words;
        currentCoinsMap[username] = coins;
      }
    });
    
    // Ensure participants maintain their highest progress values
    currentArcadeSession.participants.forEach(participant => {
      const username = participant.username;
      
      // Preserve highest word count
      if (currentProgressMap[username] && currentProgressMap[username] > participant.wordsCompleted) {
        participant.wordsCompleted = currentProgressMap[username];
        console.log(`Restored higher progress for ${username}: ${currentProgressMap[username]}`);
      }
      
      // Preserve highest coin count
      if (currentCoinsMap[username] && currentCoinsMap[username] > participant.coins) {
        participant.coins = currentCoinsMap[username];
        console.log(`Restored higher coins for ${username}: ${currentCoinsMap[username]}`);
      }
    });
    
    // Sort participants by progress (keep track of original indices for animation)
    const sortedParticipants = currentArcadeSession.participants.map((p, idx) => ({
      ...p, 
      originalIndex: idx
    })).sort((a, b) => {
      // Primary sort by words completed
      if (b.wordsCompleted !== a.wordsCompleted) {
        return b.wordsCompleted - a.wordsCompleted;
      }
      // Secondary sort by coins
      return b.coins - a.coins;
    });
    
    // Get active leaderboard element
    const leaderboardEl = document.getElementById("arcade-leaderboard");
    if (!leaderboardEl) return;
    
    // Preserve the header from the leaderboard
    const headerHTML = leaderboardEl.querySelector('.leaderboard-header')?.outerHTML || '';
    
    // Generate new entries markup with animation classes
    const entriesHTML = sortedParticipants.map((player, index) => {
      if (!player.username) return '';
      
      // Determine if this entry needs animation by comparing current and previous position
      const prevPosition = player.originalIndex;
      const newPosition = index;
      
      let animationClass = '';
      if (prevPosition !== undefined && prevPosition !== newPosition) {
        // Moving up
        if (prevPosition > newPosition) {
          animationClass = 'moving-up';
        } 
        // Moving down
        else if (prevPosition < newPosition) {
          animationClass = 'moving-down';
        }
      }
      
      return currentArcadeSession.state === "active" && player.username ? 
        `<div class="leaderboard-entry ${animationClass} ${index < 3 ? `rank-${index+1}` : ""}"
               data-rank="${index+1}" data-prev-rank="${prevPosition+1 || index+1}">
            <div class="rank">${index+1}</div>
            <div data-username="${player.username}" class="player-name">${player.username}</div>
            <div data-words="${player.wordsCompleted || 0}" class="words">${player.wordsCompleted || 0}</div>
            <div data-coins="${player.coins || 0}" class="coins">${player.coins || 0}</div>
            ${currentUser?.id === currentArcadeSession.teacherId ? 
              `<div class="actions">
                <button class="remove-player-btn" onclick="showRemovePlayerModal('${player.username}')">
                  <i class="fas fa-times"></i>
                </button>
              </div>` : ''}
        </div>` 
      : 
        `<div class="leaderboard-entry waiting ${animationClass} ${index < 3 ? `rank-${index+1}` : ""}"
               data-rank="${index+1}" data-prev-rank="${prevPosition+1 || index+1}">
            <div class="rank">${index+1}</div>
            <div data-username="${player.username}" class="player-name">${player.username}</div>
            <div class="player-status-waiting">
                <span class="status-text" style="color: ${shineColors ? shineColors[Math.floor(Math.random() * shineColors.length)] : '#ffffff'}">${readyPhrases ? readyPhrases[Math.floor(Math.random() * readyPhrases.length)] : 'Ready'}</span>
            </div>
            <div class="waiting-indicator">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </div>
        </div>`;
    }).join("");
    
    // Update the DOM with animation-ready entries
    leaderboardEl.innerHTML = headerHTML + entriesHTML;
    
    // Add animation styles if not already present
    if (!document.getElementById('leaderboard-animation-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'leaderboard-animation-styles';
      styleEl.textContent = `
        .leaderboard-entry {
          transition: transform 0.5s ease-out, opacity 0.5s ease-out, background-color 0.5s ease-out;
        }
        
        .leaderboard-entry.moving-up {
          animation: slide-up 0.5s ease-out forwards;
        }
        
        .leaderboard-entry.moving-down {
          animation: slide-down 0.5s ease-out forwards;
        }
        
        @keyframes slide-up {
          0% { transform: translateY(0); }
          20% { transform: translateY(-5px); }
          100% { transform: translateY(0); }
        }
        
        @keyframes slide-down {
          0% { transform: translateY(0); }
          20% { transform: translateY(5px); }
          100% { transform: translateY(0); }
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // Update other display elements
    const countEl = document.getElementById("activeParticipantCount");
    if (countEl) countEl.textContent = sortedParticipants.length;
    
    const dateEl = document.getElementById("sessionDate");
    if (dateEl) dateEl.textContent = (new Date).toLocaleDateString();
    
    const timeEl = document.getElementById("sessionStartTime");
    if (timeEl) timeEl.textContent = (new Date).toLocaleTimeString();
    
    const goalEl = document.getElementById("sessionWordGoal");
    if (goalEl) goalEl.textContent = currentArcadeSession.wordGoal;
    
    // Store the last update timestamp
    window.lastLeaderboardUpdate = Date.now();
  }

  

async function startArcade() {
    // Get selected stages
    const selectedStages = Array.from(document.querySelectorAll('.stage-checkboxes input:checked')).map(el => parseInt(el.value));
    const warningElement = document.querySelector('.stage-warning');
    
    if (selectedStages.length === 0) {
        if (warningElement) warningElement.style.display = 'block';
        console.error('No stages selected');
        return;
    }
    
    if (warningElement) warningElement.style.display = 'none';
    
    // Generate word pool from selected stages
    currentArcadeSession.wordPool = generateWordPool(selectedStages);
    
    // Get word goal from input
    const wordGoalInput = document.getElementById('wordGoal') || document.getElementById('wordGoalSlider');
    if (wordGoalInput) {
        const wordGoalValue = parseInt(wordGoalInput.value);
        currentArcadeSession.wordGoal = isNaN(wordGoalValue) ? 50 : wordGoalValue;
        console.log('Selected word goal:', currentArcadeSession.wordGoal);
    } else {
        console.error('Word goal slider element not found. Available elements:', document.querySelectorAll('select, input[type="range"]'));
        currentArcadeSession.wordGoal = 50;
        console.warn('Defaulting to word goal of 50');
    }
    
    // Initialize arcade session state with clear tracking properties
    currentArcadeSession.state = 'started';
    currentArcadeSession.participants = [];
    currentArcadeSession.completedPlayers = [];
    currentArcadeSession.podiumRanks = {};
    currentArcadeSession.isInitialized = false;
    currentArcadeSession.startTime = null;  // Will be set when game becomes active
    currentArcadeSession.endTime = null;
    currentArcadeSession.winnerScreenShown = false;
    
    // Set up event listeners for progress updates and status checks
    window.arcadeChannel.on('broadcast', { event: 'progress_update' }, ({ payload }) => {
        if (payload && payload.username) {
            // Safe update to prevent accidental progress resets
            const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === payload.username);
            
            if (playerIndex !== -1) {
                const player = currentArcadeSession.participants[playerIndex];
                const currentProgress = player.wordsCompleted || 0;
                
                // Only allow progress to increase, never decrease (prevents accidental resets)
                if (payload.wordsCompleted !== undefined && payload.wordsCompleted < currentProgress) {
                    console.warn(`Prevented progress reset for ${payload.username}: ${currentProgress} → ${payload.wordsCompleted}`);
                    payload.wordsCompleted = currentProgress; // Keep current progress
                }
                
                // Update player data
                currentArcadeSession.participants[playerIndex] = {
                    ...player,
                    ...payload
                };
            } else {
                // New player
                currentArcadeSession.participants.push({
                    username: payload.username,
                    wordsCompleted: payload.wordsCompleted || 0,
                    coins: payload.coins || 0
                });
            }
            updatePlayerRankDisplay();
            updatePlayerProgress(payload);
            checkGameEnd();
        }
    }).on('broadcast', { event: 'check_game_status' }, async ({ payload }) => {
        console.log('Received game status check:', payload);
        
        // Respond with current game state
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_state_response',
            payload: {
                state: currentArcadeSession.state,
                wordPool: currentArcadeSession.wordPool,
                wordGoal: currentArcadeSession.wordGoal,
                requestType: payload?.requestType || 'standard'
            }
        });
        
        // Handle late joining players
        if (payload?.requestType === 'lateJoin' && 
            currentArcadeSession.state === 'active' && 
            payload.username && 
            !currentArcadeSession.participants.find(p => p.username === payload.username)) {
            
            currentArcadeSession.participants.push({
                username: payload.username,
                wordsCompleted: 0,
                coins: 0,
                lateJoin: true
            });
            
            const participantCountElement = document.getElementById('activeParticipantCount');
            if (participantCountElement) {
                participantCountElement.textContent = currentArcadeSession.participants.length;
            }
            
            updateAllPlayersProgress();
        }
    }).on('broadcast', { event: 'player_completed' }, ({ payload }) => {
        console.log('Player completed event:', payload);
        
        // Only add to completed players if not already there
        if (payload.username && !currentArcadeSession.completedPlayers.includes(payload.username)) {
            currentArcadeSession.completedPlayers.push(payload.username);
            
            // Store rank information if provided
            if (payload.rank && payload.rank <= 3) {
                currentArcadeSession.podiumRanks[payload.username] = {
                    rank: payload.rank,
                    completionTime: payload.timestamp || Date.now()
                };
            }
            
            updatePlayerProgress(payload);
            
            // End game if 3 players have completed
            if (currentArcadeSession.completedPlayers.length >= 3) {
                endArcadeForAll();
            }
        }
    });
    
    // Hide modal and show moderator screen
    const arcadeModal = document.getElementById('arcade-modal');
    if (arcadeModal) arcadeModal.style.display = 'none';
    
    showModeratorScreen();
    
    // Special handling for teachers
    if (currentUser?.id === currentArcadeSession.teacherId) {
        const idleDetection = initializeModeratorIdleDetection();
        currentArcadeSession.idleDetection = idleDetection;
    }
}

function generateWordPool(stages) {
    let pool = [];
    
    stages.forEach(stage => {
        Object.keys(vocabularySets).forEach(key => {
            if (key.startsWith(`${stage}_`)) {
                const set = vocabularySets[key];
                set.words.forEach((word, index) => {
                    pool.push({
                        word: word,
                        translation: set.translations[index]
                    });
                });
            }
        });
    });
    
    return pool.sort(() => Math.random() - 0.5);
}

function cleanupModeratorScreen() {
    const moderatorScreen = document.getElementById('moderator-screen');
    if (moderatorScreen && moderatorScreen.dataset.channelSubscription) {
        supabaseClient.removeChannel(moderatorScreen.dataset.channelSubscription);
        delete moderatorScreen.dataset.channelSubscription;
    }
}

async function startArcadeGame() {
    const waitingScreen = document.getElementById('waiting-screen');
    if (waitingScreen && waitingScreen.dataset.pollInterval) {
      clearInterval(parseInt(waitingScreen.dataset.pollInterval));
      delete waitingScreen.dataset.pollInterval;
    }
    document.getElementById('question-screen').classList.add('visible');
    document.getElementById('waiting-screen').classList.remove('visible');
  
    if (window.arcadeStatsInterval) {
        clearInterval(window.arcadeStatsInterval);
        window.arcadeStatsInterval = null;
      }

    const playerName = currentArcadeSession.playerName || currentUser?.user_metadata?.username || getRandomSimploName();
    
    updatePlayerRankDisplay();
    
    document.querySelectorAll('.coin-count').forEach(el => {
      el.textContent = "0";
      el.style.display = "flex";
    });
    
    document.querySelectorAll('.coins-container').forEach(el => {
      el.style.display = "flex";
    });
    
    const perksContainer = document.querySelector('.perks-container');
    const powerupsContainer = document.querySelector('.powerups-container');
    perksContainer.style.display = 'none';
    powerupsContainer.style.display = 'flex';
    
    // Initialize coins based on user status - premium users get their actual coins
    let initialCoins = 0;
    
    // For premium users, get their current coin count
    if (currentUser && currentUser.status === 'premium') {
      initialCoins = await getCurrentCoinsForArcade();
    }
    
    currentGame.coins = initialCoins;
    currentArcadeSession.initialCoins = initialCoins;
    
    document.querySelectorAll('.coin-count').forEach(el => {
      el.textContent = initialCoins.toString();
    });
    
    // Check if this is a new player joining an active game
    const isNewPlayerJoining = currentArcadeSession.participants.some(p => 
      p.wordsCompleted > 0 && p.username !== playerName);
    
    console.log("Is late joiner:", isNewPlayerJoining);
    console.log("Current participants:", currentArcadeSession.participants);
    
    // Only send a progress_update with wordsCompleted: 0 if this is truly a new session
    // or we're the first player
    if (!isNewPlayerJoining) {
      try {
        window.arcadeChannel.send({
          type: "broadcast",
          event: "progress_update",
          payload: {
            username: playerName,
            wordsCompleted: 0,
            coins: initialCoins,
            timestamp: Date.now()
          }
        });
      } catch (err) {
        console.error("Failed to send initial progress update:", err);
      }
    }
    
    // Request state synchronization - for both regular and late joiners
    // but with different requestType to indicate status
    window.arcadeChannel.send({
      type: 'broadcast',
      event: 'sync_request',
      payload: {
        username: playerName,
        requestType: isNewPlayerJoining ? "lateJoin" : "initialJoin",
        timestamp: Date.now()
      }
    });
    
    updatePlayerRankDisplay();
    
    currentArcadeSession.startTime = Date.now();
    
    currentGame = {
      currentIndex: 0,
      correctStreak: 0,
      wrongStreak: 0,
      words: currentArcadeSession.wordPool || [],
      wordsCompleted: 0,
      coins: initialCoins,
      lastBroadcast: Date.now(),
      initialCoinsLoaded: true,
      playerUsername: playerName,
      isLateJoiner: isNewPlayerJoining
    };
    
    if (!currentGame.words || currentGame.words.length === 0) {
      if (!(currentArcadeSession.wordPool && currentArcadeSession.wordPool.length > 0)) {
        showErrorToast("Failed to join game: No words available");
        showScreen('welcome-screen');
        return;
      }
      currentGame.words = currentArcadeSession.wordPool;
    }
    
    // Initialize powerups
    initializePowerups();
    
    // Set up leaderboard channel and broadcast handlers
    const leaderboardChannel = supabaseClient.channel('arcade_leaderboard')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'arcade_participants'
      }, (payload) => {
        console.log('Direct DB Change:', payload);
        updateAllPlayersProgress();
      })
      .subscribe();
    
    currentArcadeSession.leaderboardChannel = leaderboardChannel;
    
    window.arcadeChannel.on('broadcast', {event: 'player_initialized'}, (({payload: data}) => {
      console.log('Player Initialization Received:', data);
      const index = currentArcadeSession.participants.findIndex(p => p.username === data.username);
      const participantData = {
        username: data.username,
        wordsCompleted: 0,
        coins: data.initialCoins || 0,
        lateJoin: data.lateJoin || false
      };
      
      if (index === -1) {
        currentArcadeSession.participants.push(participantData);
      } else {
        currentArcadeSession.participants[index] = participantData;
      }
      
      updateAllPlayersProgress();
      updateArcadeProgress();
    }));
    
    window.arcadeChannel.on("broadcast", {event: "progress_update"}, (({payload: e}) => {
        // Log the incoming update
        console.log("Progress update received:", e);
        
        // CRITICAL: Early exit when we receive our own updates
        // This prevents our own broadcast from affecting our display
        if (e.username === playerName) {
          console.log(`Ignoring self-update from ${playerName} to prevent visual glitches`);
          return; // Complete early exit - don't process anything for self-updates
        }
        
        // Process updates only for other players
        const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === e.username);
        
        if (playerIndex !== -1) {
          // Existing player - protect against progress decreases
          const existingPlayer = currentArcadeSession.participants[playerIndex];
          const currentWords = existingPlayer.wordsCompleted || 0;
          const currentCoins = existingPlayer.coins || 0;
          const newWords = e.wordsCompleted !== undefined ? e.wordsCompleted : currentWords;
          const newCoins = e.coins !== undefined ? e.coins : currentCoins;
          
          // Never allow progress to decrease
          if (newWords < currentWords) {
            console.warn(`Prevented progress reset for ${e.username}: ${currentWords} → ${newWords}`);
            e.wordsCompleted = currentWords;
          }
          
          // Same for coins - never decrease
          if (newCoins < currentCoins) {
            console.warn(`Prevented coin decrease for ${e.username}: ${currentCoins} → ${newCoins}`);
            e.coins = currentCoins;
          }
          
          // Update the participant data
          currentArcadeSession.participants[playerIndex] = {
            ...existingPlayer,
            ...e,
            // Explicit safety measures to ensure values never decrease
            wordsCompleted: Math.max(currentWords, newWords),
            coins: Math.max(currentCoins, newCoins)
          };
        } else {
          // New player - add to participants list
          currentArcadeSession.participants.push({
            username: e.username,
            wordsCompleted: e.wordsCompleted || 0,
            coins: e.coins || 0,
            lateJoin: e.lateJoin || false
          });
        }
        
        // Update UI for this player
        updatePlayerProgress(e);
        
        // Update rank display based on the new data
        updatePlayerRankDisplay();
      }));
    
    window.arcadeChannel.on('broadcast', {event: 'sync_request'}, (({payload: data}) => {
      // Only respond to sync requests if we already have some progress
      // This prevents new joiners from sending empty sync responses
      if (currentGame && currentGame.wordsCompleted > 0) {
        console.log("Responding to sync request from:", data.username, 
                   "Request type:", data.requestType || "standard");
        
        window.arcadeChannel.send({
          type: 'broadcast',
          event: 'sync_response',
          payload: {
            participants: currentArcadeSession.participants,
            respondingPlayer: playerName,
            requestingPlayer: data.username,
            requestType: data.requestType || "standard",
            timestamp: Date.now()
          }
        });
      }
    }));
    
    window.arcadeChannel.on('broadcast', {event: 'sync_response'}, (({payload: data}) => {
      // Only update if this response is for our request
      if (data.requestingPlayer === playerName) {
        console.log("Received sync response for our request:", data);
        
        // Merge participants data from response with our local data
        if (Array.isArray(data.participants)) {
          data.participants.forEach(participant => {
            const existingIndex = currentArcadeSession.participants.findIndex(
              p => p.username === participant.username
            );
            
            if (existingIndex === -1) {
              // Add participants we didn't know about
              currentArcadeSession.participants.push(participant);
            } else {
              // Update participants we already know about
              // Only accept higher values to prevent desyncs
              const existing = currentArcadeSession.participants[existingIndex];
              currentArcadeSession.participants[existingIndex] = {
                ...existing,
                wordsCompleted: Math.max(existing.wordsCompleted || 0, participant.wordsCompleted || 0),
                coins: Math.max(existing.coins || 0, participant.coins || 0)
              };
            }
          });
          
          // Update rank display with merged data
          updatePlayerRankDisplay();
        }
      }
    }));
    
    window.arcadeChannel.on('broadcast', {event: 'game_playing'}, (({payload: event}) => {
      if (event.state === 'active') {
        // Update session state
        currentArcadeSession.state = 'active';
        currentArcadeSession.wordPool = event.wordPool;
        currentArcadeSession.wordGoal = event.wordGoal;
        
        // We're already in the game, so don't restart it
        console.log("Received game_playing event, already in game with progress:", 
                    currentGame.wordsCompleted || 0);
      }
    }));
    
// Add this handler inside the startArcadeGame function
window.arcadeChannel.on('broadcast', {event: 'request_latest_stats'}, (({payload: data}) => {
    // When moderator requests updated stats, respond with our current data
    if (currentGame && currentArcadeSession.playerName) {
      // Create a short random delay (1-500ms) to prevent network congestion if multiple users respond
      const delay = Math.floor(Math.random() * 500) + 1;
      setTimeout(() => {
        window.arcadeChannel.send({
          type: 'broadcast',
          event: 'progress_update',
          payload: {
            username: currentArcadeSession.playerName,
            wordsCompleted: currentGame.wordsCompleted || 0,
            coins: currentGame.coins || 0,
            timestamp: Date.now()
          }
        });
      }, delay);
    }
  }));

    window.arcadeChannel.on('broadcast', {event: 'player_completed'}, (({payload: data}) => {
      console.log('Player completed event:', data);
      if (!currentArcadeSession.completedPlayers.includes(data.username)) {
        currentArcadeSession.completedPlayers.push(data.username);
      }
      updatePlayerProgress(data);
      if (currentArcadeSession.completedPlayers.length >= 3) {
        endArcadeForAll();
      }
    }));
    
    window.arcadeChannel.on('broadcast', {event: 'powerup_effect'}, (({payload: data}) => {
      if (data.targetUser === playerName) {
        const powerup = data.powerup;
        showNotification(`${data.fromUser} ${powerup.message} you!`, powerup.type);
        
        switch(powerup.name) {
          case 'High Five':
          case 'Fist Bump':
            const oldCoins = currentGame.coins;
            currentGame.coins += powerup.effect;
            document.querySelectorAll('.coin-count').forEach(el => {
              animateNumber(el, oldCoins, currentGame.coins);
            });
            break;
          case 'Energy Boost':
            currentGame.coinMultiplier = 2;
            currentGame.boostedAnswersLeft = 3;
            break;
          case 'Freeze':
            const buttons = document.querySelectorAll('.buttons button');
            buttons.forEach(btn => btn.disabled = true);
            setTimeout(() => {
              buttons.forEach(btn => btn.disabled = false);
            }, powerup.duration);
            break;
          case 'Coin Storm':
            currentGame.coinBlockedAnswers = 3;
            break;
          case 'Screen Shake':
            const questionScreen = document.getElementById('question-screen');
            questionScreen.classList.add('screen-shake');
            setTimeout(() => {
              questionScreen.classList.remove('screen-shake');
            }, powerup.duration);
            break;
        }
        
        updatePlayerProgress({
          username: playerName,
          coins: currentGame.coins,
          wordsCompleted: currentGame.wordsCompleted
        });
      }
    }));
    
    window.arcadeChannel.on('broadcast', {event: 'coin_effect'}, (({payload: data}) => {
        // Critical: Verify this is a legitimate coin effect
        // Ensure we don't accidentally process our own progress as a coin effect
        const isLegitimateEffect = data.effectSource === 'powerup' || data.effectSource === 'targeted';
        
        if (data.targetUser === playerName && isLegitimateEffect) {
          console.log(`Processing coin effect: ${data.amount} coins from ${data.fromUser || 'system'}`);
          
          // Get current coins directly from game state
          const oldCoins = currentGame.coins || 0;
          const newCoins = oldCoins + data.amount;
          
          // Use CoinController for consistent updates
          CoinController.updateLocalCoins(newCoins);
          
          // Show appropriate notification
          if (data.type === 'blessing') {
            showNotification(`${data.fromUser} high-fived you!`, 'blessing');
          } else if (data.type === 'curse') {
            showNotification(`${data.fromUser} poisoned you!`, 'curse');
          }
        } else if (data.targetUser === playerName) {
          console.log(`Ignoring possible duplicate coin effect: ${JSON.stringify(data)}`);
        }
      }));
    
    window.arcadeChannel.on('broadcast', {event: 'game_end'}, (({payload: data}) => {
      handleGameEnd(data);
    }));
    
    updateAllCoinDisplays();
    loadNextArcadeQuestion();
    
    // Store timeouts and intervals for cleanup
    window.arcadeTimeouts = [];
    window.arcadeIntervals = [];
  }

  async function getCurrentCoinsForArcade() {
    if (!currentUser) {
        // For guest users, use localStorage or default
        return parseInt(localStorage.getItem('simploxCustomCoins') || '0');
    }

    // For logged-in users, especially premium
    try {
        const { data, error } = await supabaseClient
            .from('game_progress')
            .select('coins')
            .eq('user_id', currentUser.id)
            .single();

        if (error) console.error('Coin retrieval error:', error);
        return data?.coins || 0;
    } catch (error) {
        console.error('Unexpected coin retrieval error:', error);
        return 0;
    }
}

async function updatePlayerStatsAfterArcade() {
    if (!currentUser || !currentUser.id) {
        // For unregistered users, clear localStorage coin data
        localStorage.removeItem('simploxCustomCoins');
        return;
    }
    
    // For premium users, update their stats
    if (currentUser.status === 'premium') {
        try {
            console.log('Updating premium user stats after arcade');
            const coinsEarned = currentGame.coins - currentArcadeSession.initialCoins;
            const wordsCompleted = currentGame.wordsCompleted || 0;
            
            if (coinsEarned <= 0 && wordsCompleted <= 0) {
                console.log('No stats to update (no progress made)');
                return;
            }
            
            // Update game_progress for coins
            if (coinsEarned > 0) {
                // First get current coins
                const { data: progressData, error: progressError } = await supabaseClient
                    .from('game_progress')
                    .select('coins, mode_coins')
                    .eq('user_id', currentUser.id)
                    .single();
                
                if (!progressError && progressData) {
                    const currentCoins = progressData.coins || 0;
                    const modeCoins = progressData.mode_coins || { arcade: 0, story: 0, custom: 0 };
                    
                    // Update coins with new total and increment arcade mode coins
                    const newTotal = currentCoins + coinsEarned;
                    modeCoins.arcade = (modeCoins.arcade || 0) + coinsEarned;
                    
                    console.log(`Updating coins: ${currentCoins} + ${coinsEarned} = ${newTotal}`);
                    
                    const { error: updateError } = await supabaseClient
                        .from('game_progress')
                        .update({
                            coins: newTotal,
                            mode_coins: modeCoins
                        })
                        .eq('user_id', currentUser.id);
                        
                    if (updateError) {
                        console.error('Failed to update coins:', updateError);
                    }
                }
            }
            
            // Update player_stats for word count
            if (wordsCompleted > 0) {
                const { data: statsData, error: statsError } = await supabaseClient
                    .from('player_stats')
                    .select('unique_words_practiced, total_levels_completed')
                    .eq('user_id', currentUser.id)
                    .single();
                
                if (!statsError && statsData) {
                    // Increment unique words by a portion of completed words (not all will be unique)
                    // Use a conservative estimate of 30% unique words
                    const uniqueWordsEstimate = Math.ceil(wordsCompleted * 0.3);
                    const newUniqueWords = (statsData.unique_words_practiced || 0) + uniqueWordsEstimate;
                    
                    console.log(`Updating unique words: +${uniqueWordsEstimate} = ${newUniqueWords}`);
                    
                    const { error: updateStatsError } = await supabaseClient
                        .from('player_stats')
                        .update({
                            unique_words_practiced: newUniqueWords,
                            last_updated: new Date().toISOString()
                        })
                        .eq('user_id', currentUser.id);
                        
                    if (updateStatsError) {
                        console.error('Failed to update word stats:', updateStatsError);
                    }
                }
            }
        } catch (error) {
            console.error('Error updating player stats after arcade:', error);
        }
    } else {
        // For non-premium users, also clear localStorage
        localStorage.removeItem('simploxCustomCoins');
    }
}

async function updateArcadeCoins(amount) {
    // Use the controller instead of direct modification
    const oldCoins = currentGame.coins;
    const newCoins = oldCoins + amount;
    
    // For registered users, update their game_progress
    if (currentUser) {
        try {
            const { error } = await supabaseClient
                .from('game_progress')
                .update({ coins: newCoins })
                .eq('user_id', currentUser.id);

            if (error) throw error;
        } catch (error) {
            console.error('Failed to update coins in database:', error);
            return false; // Don't proceed with incorrect values
        }
    }

    // Now update through the controller which handles UI update and broadcast
    return CoinController.updateLocalCoins(newCoins);
}

async function getCurrentCoinsForArcade() {
    if (!currentUser) {
        // For guest users, use localStorage or default
        return parseInt(localStorage.getItem('simploxCustomCoins') || '0');
    }

    // For logged-in users, especially premium
    try {
        const { data, error } = await supabaseClient
            .from('game_progress')
            .select('coins')
            .eq('user_id', currentUser.id)
            .single();

        if (error) console.error('Coin retrieval error:', error);
        return data?.coins || 0;
    } catch (error) {
        console.error('Unexpected coin retrieval error:', error);
        return 0;
    }
}

function safeUpdatePlayerProgress(data) {
    // IMPORTANT: Never update our own coin count based on broadcast events
    // This prevents the feedback loop of broadcasts changing our value
    if (data.username === currentArcadeSession.playerName) {
      return;
    }
    
    // Process updates for other players normally
    updatePlayerProgress(data);
  }

function loadNextArcadeQuestion() {
    // Check if the player has reached the word goal
    if (currentGame.wordsCompleted >= currentArcadeSession.wordGoal) {
        console.log("Word goal reached, stopping question loading");
        return;
    }
    
    if (!currentGame.words.length) return;
    
    const questionWord = document.getElementById('question-word');
    const buttonsDiv = document.getElementById('buttons');
    
    // Get random word from pool
    const currentIndex = Math.floor(Math.random() * currentGame.words.length);
    const currentWord = currentGame.words[currentIndex];
    
    // 50% chance for Hebrew to English
    const isHebrewToEnglish = Math.random() < 0.5;
    
    questionWord.textContent = isHebrewToEnglish ? 
        currentWord.translation : currentWord.word;
    
    // Generate options
    let options = [isHebrewToEnglish ? currentWord.word : currentWord.translation];
    while (options.length < 3) {
        const randomWord = currentGame.words[Math.floor(Math.random() * currentGame.words.length)];
        const option = isHebrewToEnglish ? randomWord.word : randomWord.translation;
        if (!options.includes(option)) {
            options.push(option);
        }
    }
    
    // Shuffle options
    options = options.sort(() => Math.random() - 0.5);
    
    // Create buttons
    buttonsDiv.innerHTML = '';
    options.forEach(option => {
        const button = document.createElement('button');
        button.textContent = option;
        button.onclick = () => handleArcadeAnswer(
            option === (isHebrewToEnglish ? currentWord.word : currentWord.translation)
        );
        buttonsDiv.appendChild(button);
    });
    
    // Remove used word from pool
    currentGame.words.splice(currentIndex, 1);
}

function updateArcadeProgress() {
    const circle = document.querySelector('.progress-circle .progress');
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    
    // Default to 0 for initial state
    const progress = currentGame.wordsCompleted 
        ? currentGame.wordsCompleted / currentArcadeSession.wordGoal 
        : 0;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference * (1 - progress);
}

function showArcadeCompletionScreen(playerData) {
    const overlay = document.createElement('div');
    overlay.className = 'arcade-completion-modal';
    overlay.innerHTML = `
        <div class="completion-modal-content">
            <h2>Arcade Complete!</h2>
            <div class="completion-stats">
                <div class="stat-item">
                    <i class="fas fa-book"></i>
                    <span>Words: ${playerData.wordsCompleted}</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-coins"></i>
                    <span>Coins: ${playerData.coins}</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-trophy"></i>
                    <span>Rank: ${playerData.rank}</span>
                </div>
            </div>
            <button onclick="exitArcade()" class="start-button">Exit</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
}

function exitArcadeCompletion() {
    const modal = document.querySelector('.arcade-completion-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.remove();
            showScreen('welcome-screen');
        }, 300);
    }
}

function exitArcade() {
    // Clean up
    cleanupArcadeMode();

    if (window.arcadeChannel) {
        window.arcadeChannel.unsubscribe();
    }
    
    // For premium users, update stats before exiting
    if (currentUser && currentUser.status === 'premium') {
        updatePlayerStatsAfterArcade().then(() => {
            // Continue with normal cleanup
            // Reset arcade session
            currentArcadeSession = {
                eventId: null,
                otp: null,
                wordPool: [],
                participants: [],
                teacherId: null,
                wordGoal: 50,
                state: 'pre-start',  // 'pre-start', 'started', 'active', 'ended'
                completedPlayers: [],  // To track players who already completed
                playerRank: null,      // Current player's rank if completed
                winnerScreenShown: false, // Flag to prevent multiple winner screens
                startTime: null,       // When the session started
                endTime: null          // When the session ended
            };
            
            // Return to welcome screen
            showScreen('welcome-screen');
        }).catch(err => {
            console.error("Error updating premium stats after arcade:", err);
            showScreen('welcome-screen');
        });
    } else {
        // For unregistered users, clear localStorage
        if (!currentUser || currentUser.status !== 'premium') {
            localStorage.removeItem('simploxCustomCoins');
        }
        
        // Reset arcade session
        currentArcadeSession = {
            eventId: null,
            otp: null,
            wordPool: [],
            participants: [],
            teacherId: null,
            wordGoal: 50,
            state: 'pre-start',  // 'pre-start', 'started', 'active', 'ended'
            completedPlayers: [],  // To track players who already completed
            playerRank: null,      // Current player's rank if completed
            winnerScreenShown: false, // Flag to prevent multiple winner screens
            startTime: null,       // When the session started
            endTime: null          // When the session ended
        };
        
        // Return to welcome screen
        showScreen('welcome-screen');
    }
}

function handleAnswer(isCorrect, skipMode = false) {
    const now = Date.now();
    if (now - (currentGame.lastAnswerTime || 0) < 1000) {
      console.warn("Answer too quickly. Please wait a moment.");
      return;
    }
    
    if (!currentGame || !currentGame.words || currentGame.words.length === 0 || currentGame.currentIndex >= currentGame.words.length) {
      console.error("Invalid game state or index");
      return;
    }
    
    currentGame.lastAnswerTime = now;
    
    try {
      if (isCorrect) {
        currentGame.currentIndex++;
        
        if (currentGame.isBossLevel) {
          const bossOrb = document.querySelector(".boss-orb-inner");
          if (bossOrb) {
            const colors = ["yellow", "purple", "turquoise", "darkgreen", "brown"];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            const originalBackground = bossOrb.style.background;
            bossOrb.style.background = `radial-gradient(circle at 30% 30%, ${randomColor}, #990000)`;
            bossOrb.style.transform = "scale(1.3)";
            bossOrb.style.filter = "brightness(1.5)";
            setTimeout(() => {
              bossOrb.style.transform = "";
              bossOrb.style.filter = "";
              bossOrb.style.background = originalBackground;
            }, 300);
          }
          
          // Check if this was the final boss hit
          if (currentGame.currentIndex >= currentGame.words.length) {
            console.log("Boss defeated - final hit!");
            currentGame.bossDefeated = true; // Mark boss as defeated
            clearTimer(); // Clear the timer
            
            // Force health bar to zero
            const progressCircle = document.querySelector('.progress-circle');
            if (progressCircle) {
              const progress = progressCircle.querySelector('.progress');
              if (progress) {
                const circumference = 2 * Math.PI * 54;
                progress.style.strokeDashoffset = circumference; // Set to full circumference (empty)
              }
            }
            
            // Direct call to defeat sequence with forced update
            showBossDefeatEffect();
            CoinsManager.updateCoins(100).then(() => {
              updateAllCoinDisplays(); // Update coin display explicitly
            });
            
            return; // Exit function early
          }
          
          // Otherwise just update the health bar
          updateBossHealthBar();
        } else {
          updateProgressCircle();
        }
        
        if (!skipMode) {
          let coinsEarned = 0;
          const timeBonus = awardTimeBonus();
          if (timeBonus > 0) {
            coinsEarned += timeBonus;
          }
          
          if (currentGame.firstAttempt) {
            coinsEarned += 3;
          } else {
            coinsEarned += 1;
          }
          
          if (coinsEarned > 0) {
            CoinsManager.updateCoins(coinsEarned).then(() => {
              updatePerkButtons();
              pulseCoins(coinsEarned > 3 ? 2 : 1); // Pulsate based on amount
            }).catch(err => {
              console.error("Error updating total coins:", err);
            });
          }
          
          currentGame.correctAnswers++;
          
          // Track word for any registered user without status check
          if (currentUser) {
            const wordIndex = currentGame.currentIndex - 1;
            const word = currentGame.isHebrewToEnglish ? 
              currentGame.words[wordIndex] : 
              currentGame.translations[wordIndex];
            
            const gameMode = currentGame.isCustomPractice ? 'custom' : 
                             currentGame.isArcadeMode ? 'arcade' : 'story';
            
            // Call trackWordEncounter without status check
            trackWordEncounter(word, gameMode);
          }
        }
      } else {
        currentGame.firstAttempt = false;
        currentGame.streakBonus = false;
        currentGame.wrongStreak++;
        
        CoinsManager.updateCoins(-3).then(() => {
          updatePerkButtons();
        }).catch(err => {
          console.error("Error updating coins:", err);
        });
        
        if (currentGame.currentIndex > 0) {
          currentGame.progressLost++;
          currentGame.currentIndex = Math.max(0, currentGame.currentIndex - 1);
          if (currentGame.isBossLevel) {
            updateBossHealthBar();
          }
        }
        
        if (currentGame.wrongStreak >= 3) {
          showGameOverOverlay();
          return;
        }
      }
      
      // Clear previous visual indicators from all buttons
      const allButtons = document.querySelectorAll(".buttons button");
      
      // Get current question's correct answer
      const currentCorrectAnswer = currentGame.isHebrewToEnglish
        ? currentGame.words[Math.max(0, currentGame.currentIndex - 1)]
        : currentGame.translations[Math.max(0, currentGame.currentIndex - 1)];
        
      // Highlight current answer status (right or wrong)
      allButtons.forEach((button) => {
        if (button.textContent === currentCorrectAnswer) {
          button.classList.add("correct");
        } else if (!isCorrect && event && event.target && button.textContent === event.target.textContent) {
          button.classList.add("wrong");
        }
      });
      
      saveProgress();
      
      // Use a promise to ensure proper timing and button state clearance
      const transitionDelay = 500; // ms
      
      setTimeout(() => {
        // Clear all button classes before loading next question
        allButtons.forEach(btn => {
          btn.classList.remove("correct", "wrong");
        });
        
        // Check if game is still valid (not a defeated boss)
        if (currentGame && (!currentGame.bossDefeated || !currentGame.isBossLevel)) {
          if (currentGame.currentIndex < currentGame.words.length) {
            startTimer(currentGame.words.length - currentGame.currentIndex);
            
            if (currentGame.isBossLevel) {
              loadNextBossQuestion();
            } else {
              loadNextQuestion();
            }
            
            updatePerkButtons();
          } else if (!currentGame.isBossLevel) {
            if (currentGame.isCustomPractice) {
              handleCustomLevelCompletion();
            } else {
              handleLevelCompletion();
            }
          }
        }
      }, transitionDelay);
      
    } catch (err) {
      console.error("Unexpected error in handleAnswer:", err);
      console.error("Error details:", err.stack);
      
      try {
        if (currentGame && currentGame.currentIndex < currentGame.words.length && !currentGame.bossDefeated) {
          loadNextQuestion();
        } else {
          showScreen("welcome-screen");
        }
      } catch (err) {
        console.error("Failed to recover from error:", err);
        showScreen("welcome-screen");
      }
    }
  }

// Helper function to track words without awarding coins
async function trackWordEncounterWithoutCoins(word, gameMode = 'arcade') {
    // Only track for logged-in users
    if (!currentUser || !currentUser.id) {
      console.log('No user logged in, skipping word tracking');
      return null;
    }
  
    try {
      const trimmedWord = String(word).trim();
      const userId = currentUser.id;
      
      // First ensure user initialization
      await ensureUserInitialization(userId);
      
      try {
        // Try to get existing record
        const { data, error } = await supabaseClient.rpc(
          'get_word_history',
          {
            p_user_id: userId,
            p_word: trimmedWord
          }
        );
        
        let isNewWord = false;
        
        // Handle potential errors
        if (error) {
          console.error("Error fetching word history:", error);
          return { isNewWord: false, error };
        }
        
        // Check if we got a record back
        if (data && data.length > 0) {
          // Word exists, increment practice count
          const existingRecord = data[0];
          const newCount = (existingRecord.practice_count || 0) + 1;
          
          const { error } = await supabaseClient
            .from("word_practice_history")
            .update({
              practice_count: newCount,
              last_practiced_at: new Date().toISOString(),
              game_mode: gameMode
              // No coins_earned update
            })
            .eq("user_id", userId)
            .eq("word", trimmedWord);
            
          if (error) {
            console.error("Error updating word history:", error);
          }
        } else {
          // New word, create record
          isNewWord = true;
          
          const { error } = await supabaseClient
            .from("word_practice_history")
            .insert([{
              user_id: userId,
              word: trimmedWord,
              practice_count: 1,
              game_mode: gameMode,
              coins_earned: 0, // No coins
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
                
              if (updateResult.error) {
                console.error("Error updating player stats:", updateResult.error);
              }
            }
          }
        }
        
        return { isNewWord };
      } catch (error) {
        console.error("Error in trackWordEncounterWithoutCoins:", error);
        return { isNewWord: false, error };
      }
    } catch (outerError) {
      console.error("Error in trackWordEncounterWithoutCoins outer try/catch:", outerError);
      return null;
    }
}

function checkGameEnd() {
    const completedPlayers = currentArcadeSession.participants
        .filter(p => p.wordsCompleted >= currentArcadeSession.wordGoal)
        .length;
        
    if (completedPlayers >= 3) {
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_end'
        });
    }
}

function handleGameEnd(payload) {
  console.log("Game End Payload:", payload);
  if (!payload) return;
  
  if (payload.forcedEnd) {
    exitArcade(); // Ensure we clean up
    showScreen("welcome-screen");
  } else if (currentUser?.id !== payload.teacherId) {
    showFinalResultsForPlayer(payload.podiumPlayers || []);
  } else {
    showModeratorVictoryScreen(payload.podiumPlayers || []);
  }
}



function showPodiumPlayerResults(players) {
    const playerUsername = currentArcadeSession.playerName;
    const playerRank = currentArcadeSession.podiumRanks[playerUsername].rank;
    
    // Calculate earned coins
    const startingCoins = currentArcadeSession.initialCoins || 0;
    const currentCoins = gameState.coins || currentGame.coins || 0;
    const coinsEarned = currentCoins - startingCoins;
    
    // Get player's words completed
    const wordsCompleted = currentGame.wordsCompleted || 0;
    
    // Create results modal for podium player
    const overlay = document.createElement('div');
    overlay.className = 'arcade-completion-modal';
    
    overlay.innerHTML = `
        <div class="completion-modal-content">
            <h2>Congratulations!</h2>
            <p class="personal-result">You finished in ${getOrdinal(playerRank)} place!</p>
            
            <div class="your-stats">
                <h3>Your Results</h3>
                <div class="completion-stats" style="display: flex; justify-content: space-around; margin: 1.5rem 0;">
                    <div class="stat-item" style="text-align: center;">
                        <i class="fas fa-language" style="font-size: 2rem; color: var(--gold); display: block; margin-bottom: 0.5rem;"></i>
                        <span style="display: block; margin-bottom: 0.25rem;">Words Learned</span>
                        <strong style="font-size: 1.5rem;">${wordsCompleted}</strong>
                    </div>
                    <div class="stat-item" style="text-align: center;">
                        <i class="fas fa-coins" style="font-size: 2rem; color: var(--gold); display: block; margin-bottom: 0.5rem;"></i>
                        <span style="display: block; margin-bottom: 0.25rem;">Coins Earned</span>
                        <strong style="font-size: 1.5rem;">${coinsEarned}</strong>
                    </div>
                    <div class="stat-item" style="text-align: center;">
                        <i class="fas fa-trophy" style="font-size: 2rem; color: var(--gold); display: block; margin-bottom: 0.5rem;"></i>
                        <span style="display: block; margin-bottom: 0.25rem;">Your Rank</span>
                        <strong style="font-size: 1.5rem;">${playerRank}</strong>
                    </div>
                </div>
            </div>
            
            <button onclick="exitArcadeCompletion()" class="start-button">
                Return to Welcome
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
}

function showConsolationScreen() {
    // Create a simple consolation modal
    const overlay = document.createElement('div');
    overlay.className = 'arcade-completion-modal';
    
    // Random encouraging emoji
    const emojis = ['🌟', '🎮', '🚀', '💪', '🏆', '🔥', '👏', '✨'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    overlay.innerHTML = `
        <div class="completion-modal-content">
            <h2 style="font-size: 3rem; margin-bottom: 1rem;">${randomEmoji}</h2>
            <h2>Game Complete!</h2>
            <p style="font-size: 1.2rem; margin: 1.5rem 0; line-height: 1.5;">
                Great effort! You did your best and gained valuable practice.
                <br><br>
                Keep playing to improve your skills and speed!
            </p>
            <button onclick="exitArcadeCompletion()" class="start-button" style="margin-top: 1.5rem;">
                Return to Welcome
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
}


function showFinalResultsForPlayer(podiumPlayers) {
    const playerName = currentArcadeSession.playerName;
    const playerPodiumInfo = podiumPlayers.find(p => p.username === playerName);
    
    // If player is already on podium and has seen victory screen, don't show again
    if (currentArcadeSession.winnerScreenShown && playerPodiumInfo && playerPodiumInfo.rank <= 3) {
        return;
    }
    
    // Find the player's rank (either from podium or calculate based on completion)
    let playerRank;
    if (playerPodiumInfo) {
        playerRank = playerPodiumInfo.rank;
    } else {
        // For non-podium players, find their position in participants list
        const sortedParticipants = [...currentArcadeSession.participants]
            .sort((a, b) => b.wordsCompleted - a.wordsCompleted);
        playerRank = sortedParticipants.findIndex(p => p.username === playerName) + 1;
    }
    
    if (playerRank <= 3) {
        showPersonalVictoryScreen(playerRank);
    } else {
        showConsolationScreen();
    }
}

function showPersonalVictoryScreen(rank) {
    // Don't show if already celebrating
    if (currentArcadeSession.winnerScreenShown) return;
    currentArcadeSession.winnerScreenShown = true;
    
    console.log(`Showing personal victory screen with rank: ${rank}`);
    
    // Create celebration screen
    const overlay = document.createElement('div');
    overlay.className = 'personal-victory-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 2000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.5s ease;
    `;
    
    // Define content based on rank
    const rankContent = {
        1: {
            title: "🏆 CHAMPION! 🏆",
            message: "Incredible! You've claimed the top spot!",
            emoji: "👑",
            color: "var(--gold)"
        },
        2: {
            title: "🥈 RUNNER UP! 🥈",
            message: "Amazing job! You've secured second place!",
            emoji: "⭐",
            color: "var(--silver)"
        },
        3: {
            title: "🥉 BRONZE MEDALIST! 🥉",
            message: "Well done! You've earned third place!",
            emoji: "🌟",
            color: "var(--bronze)"
        }
    };
    
    const content = rankContent[rank] || {
        title: "GREAT PERFORMANCE!",
        message: "You've completed the challenge!",
        emoji: "🎉",
        color: "var(--accent)"
    };
    
    overlay.innerHTML = `
        <div style="font-size: 8rem; margin-bottom: 1rem;">${content.emoji}</div>
        <h1 style="color: ${content.color}; font-size: 3rem; margin-bottom: 1rem;">${content.title}</h1>
        <p style="font-size: 1.5rem; margin-bottom: 2rem; text-align: center; max-width: 80%;">
            ${content.message}
        </p>
        <div style="margin: 2rem 0; display: flex; gap: 2rem;">
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; color: var(--text); opacity: 0.8;">YOUR RANK</div>
                <div style="font-size: 3rem; color: ${content.color};">${rank}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; color: var(--text); opacity: 0.8;">WORDS COMPLETED</div>
                <div style="font-size: 3rem; color: var(--text);">${currentGame.wordsCompleted || 0}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; color: var(--text); opacity: 0.8;">COINS EARNED</div>
                <div style="font-size: 3rem; color: var(--gold);">${currentGame.coins || 0}</div>
            </div>
        </div>
        <button class="start-button" style="margin-top: 2rem; padding: 1rem 2rem;" onclick="closePersonalVictory()">
            Continue
        </button>
    `;
    
    document.body.appendChild(overlay);
    
    // Fade in
    setTimeout(() => {
        overlay.style.opacity = '1';
        
        // Start player confetti
        startPlayerConfetti();
    }, 100);
}

function showModeratorVictoryScreen(players) {
    // Clean up any inactivity timers
    if (moderatorActivityTimer) clearTimeout(moderatorActivityTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    
    // Hide inactivity overlay if present
    const overlay = document.querySelector('.inactivity-overlay');
    if (overlay) overlay.remove();
    
    // Use the confetti celebration instead
    startLeaderboardCelebration(players);
}


function showPlayerFinalResults(players) {
    // Find current player's data and rank
    const playerUsername = currentArcadeSession.playerName;
    const currentPlayer = players.find(p => p.username === playerUsername);
    
    // Get player's rank - should be explicitly set in the players array
    const currentPlayerRank = currentPlayer?.rank || 
                            players.findIndex(p => p.username === playerUsername) + 1;
    
    // If we've already shown a victory screen for this player, don't show results
    if (currentArcadeSession.winnerScreenShown && currentPlayerRank <= 3) {
        return;
    }
    
    // Create final results overlay
    const overlay = document.createElement('div');
    overlay.className = 'arcade-completion-modal';
    
    // Get the top 3 players
    const top3 = players
        .filter(p => p.rank <= 3)
        .sort((a, b) => a.rank - b.rank);
    
    // Calculate coins earned during this arcade session
    const startingCoins = currentArcadeSession.initialCoins || 0;
    const currentCoins = gameState.coins || currentGame.coins || 0;
    const coinsEarned = currentCoins - startingCoins;
    
    overlay.innerHTML = `
        <div class="completion-modal-content">
            <h2>Arcade Game Complete!</h2>
            ${currentPlayerRank <= 3 ? 
                `<p class="personal-result">Congratulations! You finished in ${getOrdinal(currentPlayerRank)} place!</p>` : 
                `<p class="personal-result">You earned ${getOrdinal(currentPlayerRank)} place. Better luck next time!</p>`
            }
            <div class="leaderboard-preview">
                <h3>Top Players</h3>
                ${top3.map((player) => `
                    <div class="podium-player rank-${player.rank} ${player.username === playerUsername ? 'current-player' : ''}"
                         style="display: flex; justify-content: space-between; padding: 0.75rem 1rem; margin: 0.5rem 0; 
                                background: ${getPlayerBackground(player.rank, player.username === playerUsername)};
                                border-radius: 10px; color: ${player.rank === 1 ? '#000' : '#fff'};">
                        <div class="player-rank">${player.rank}</div>
                        <div class="player-name">${player.username}</div>
                        <div class="player-stats">
                            <span class="player-words">${player.wordsCompleted || 0} words</span>
                            <span class="player-coins">${player.coins || 0} coins</span>
                        </div>
                    </div>
                `).join('')}
                
                ${currentPlayerRank > 3 ? `
                    <div class="divider" style="border-top: 1px dashed rgba(255,255,255,0.2); margin: 1rem 0;"></div>
                    <div class="current-player-row podium-player"
                         style="display: flex; justify-content: space-between; padding: 0.75rem 1rem; margin: 0.5rem 0; 
                                background: rgba(255,255,255,0.1); border: 1px solid var(--accent);
                                border-radius: 10px; color: var(--text);">
                        <div class="player-rank">${currentPlayerRank}</div>
                        <div class="player-name">${playerUsername}</div>
                        <div class="player-stats">
                            <span class="player-words">${currentPlayer?.wordsCompleted || 0} words</span>
                            <span class="player-coins">${currentPlayer?.coins || 0} coins</span>
                        </div>
                    </div>
                ` : ''}
            </div>
            <div class="your-stats">
                <h3>Your Results</h3>
                <div class="completion-stats" style="display: flex; justify-content: space-around; margin: 1.5rem 0;">
                    <div class="stat-item" style="text-align: center;">
                        <i class="fas fa-language" style="font-size: 2rem; color: var(--gold); display: block; margin-bottom: 0.5rem;"></i>
                        <span style="display: block; margin-bottom: 0.25rem;">Words Learned</span>
                        <strong style="font-size: 1.5rem;">${currentPlayer?.wordsCompleted || 0}</strong>
                    </div>
                    <div class="stat-item" style="text-align: center;">
                        <i class="fas fa-coins" style="font-size: 2rem; color: var(--gold); display: block; margin-bottom: 0.5rem;"></i>
                        <span style="display: block; margin-bottom: 0.25rem;">Coins Earned</span>
                        <strong style="font-size: 1.5rem;">${coinsEarned}</strong>
                    </div>
                    <div class="stat-item" style="text-align: center;">
                        <i class="fas fa-trophy" style="font-size: 2rem; color: var(--gold); display: block; margin-bottom: 0.5rem;"></i>
                        <span style="display: block; margin-bottom: 0.25rem;">Your Rank</span>
                        <strong style="font-size: 1.5rem;">${currentPlayerRank}</strong>
                    </div>
                </div>
            </div>
            <button onclick="exitArcadeCompletion()" class="start-button">
                Return to Welcome
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    
    // Helper function for podium background colors
    function getPlayerBackground(rank, isCurrentPlayer) {
        const backgrounds = {
            1: 'linear-gradient(135deg, #FFD700 0%, #FFC800 100%)', // 1st place - gold
            2: 'linear-gradient(135deg, #C0C0C0 0%, #A9A9A9 100%)', // 2nd place - silver
            3: 'linear-gradient(135deg, #CD7F32 0%, #B87333 100%)'  // 3rd place - bronze
        };
        
        if (isCurrentPlayer) {
            return (backgrounds[rank] || 'rgba(255,255,255,0.1)') + 
                   '; border: 2px solid white; box-shadow: 0 0 15px rgba(255,255,255,0.5)';
        }
        
        return backgrounds[rank] || 'rgba(255,255,255,0.1)';
    }
}

function removePlayer(username) {
    // Remove player from current arcade session
    currentArcadeSession.participants = currentArcadeSession.participants.filter(
        player => player.username !== username
    );
    
    // Broadcast player removal
    if (window.arcadeChannel) {
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'player_removed',
            payload: { username }
        });
    }
    
    // Update leaderboard
    updateAllPlayersProgress();
}


async function joinArcadeWithUsername() {
    const usernameInput = document.getElementById('arcadeUsername');
    const otpInput = document.getElementById('otpInput');
    
    // Get username either from input or from current user
    let username;
    if (currentUser) {
        username = currentUser.user_metadata?.username || 
                  currentUser.email.split('@')[0];
    } else {
        username = usernameInput.value.trim();
        
        // Username validation for guest users
        if (!username || username.length < 2 || username.length > 15) {
            showErrorToast('Username must be between 2 and 15 characters');
            usernameInput.focus();
            return;
        }

        // Validate username characters
        const validUsernameRegex = /^[a-zA-Z0-9\u0590-\u05FF\s._-]+$/;
        if (!validUsernameRegex.test(username)) {
            showErrorToast('Username can contain letters, numbers, spaces, periods, underscores, and hyphens');
            usernameInput.focus();
            return;
        }
    }
    
    const otp = otpInput.value.trim();
    
    // OTP validation
    if (!otp || otp.length !== 4 || !/^\d+$/.test(otp)) {
        showErrorToast('Please enter a valid 4-digit game code');
        otpInput.focus();
        return;
    }

    try {
        // Always initialize with zero coins for arcade mode
        // No localStorage use for coins in arcade
        const initialCoins = 0;
        
        // Create Supabase channel for the specific arcade session
        window.arcadeChannel = supabaseClient.channel(`arcade:${otp}`);
        
        // Set player name and initial state
        currentArcadeSession.playerName = username;
        currentArcadeSession.initialCoins = initialCoins;
        currentArcadeSession.otp = otp;
        
        // First, subscribe to channel
        await window.arcadeChannel.subscribe();
        
        // Set up celebration handler after channel initialization
        setupCelebrationHandler();
        
        // Set up standard event listeners
        window.arcadeChannel
            .on('broadcast', { event: 'game_end' }, ({ payload }) => {
                handleGameEnd(payload);
                currentArcadeSession.state = 'ended';
            })
            .on('broadcast', { event: 'game_playing' }, ({ payload }) => {
                if (payload.state === 'active') {
                    currentArcadeSession.state = 'active';
                    currentArcadeSession.wordPool = payload.wordPool;
                    currentArcadeSession.wordGoal = payload.wordGoal;
                    startArcadeGame();
                }
            })
            .on('broadcast', { event: 'player_join' }, ({ payload }) => {
                console.log('Player join event received:', payload);
                if (!currentArcadeSession.participants.find(p => p.username === payload.username)) {
                    currentArcadeSession.participants.push({
                        username: payload.username,
                        wordsCompleted: 0,
                        coins: 0
                    });

                    // Update player count 
                    const playerCountElement = document.getElementById('player-count');
                    if (playerCountElement) {
                        playerCountElement.textContent = currentArcadeSession.participants.length;
                    }

                    // Update leaderboard if visible
                    const leaderboard = document.getElementById('arcade-leaderboard');
                    if (leaderboard && leaderboard.offsetParent !== null) {
                        updateAllPlayersProgress();
                    }
                }
            });
        
        // Set up game state check listener
        window.arcadeChannel.on('broadcast', { event: 'game_state_response' }, ({ payload }) => {
            console.log('Received game state response:', payload);
            if (payload && payload.state === 'active') {
                // Game is active, store state 
                currentArcadeSession.state = 'active';
                currentArcadeSession.wordPool = payload.wordPool;
                currentArcadeSession.wordGoal = payload.wordGoal;
                
                // If we've already sent the join event, go straight to game
                if (currentArcadeSession.joinEventSent) {
                    // Hide arcade modal first
                    document.getElementById('arcade-modal').style.display = 'none';
                    startArcadeGame();
                }
            }
        });

        // Broadcast initial join
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'player_join',
            payload: {
                username: username,
                type: 'initialJoin',
                coins: initialCoins,
                joinedAt: new Date().toISOString()
            }
        });
        currentArcadeSession.joinEventSent = true;
        
        // Now check if game is active
        await window.arcadeChannel.send({
            type: 'broadcast',
            event: 'check_game_status',
            payload: {
                username: username,
                requestType: 'lateJoin',
                timestamp: Date.now()
            }
        });
        
        // Hide arcade modal
        document.getElementById('arcade-modal').style.display = 'none';
        
        // Wait a moment to see if we get a response indicating the game is active
        setTimeout(() => {
            // If state has been updated to active by a response, startArcadeGame will have been called
            // Otherwise, show waiting screen
            if (currentArcadeSession.state !== 'active') {
                showWaitingScreen();
            }
        }, 500);

    } catch (error) {
        console.error('Join arcade error:', error);
        showErrorToast('Failed to join arcade. Please try again.');
    }
}

const powerupPool = {
    highFive: {
        id: 'highFiveCard',
        cost: 30,
        effect: 50,
        type: 'goodie',
        icon: 'fa-hand-paper',
        name: 'High Five',
        message: 'high-fived'
    },
    fistBump: {
        id: 'fistBumpCard',
        cost: 40,
        effect: 75,
        type: 'goodie',
        icon: 'fa-fist-raised',
        name: 'Fist Bump',
        message: 'fist-bumped'
    },
    energyBoost: {
        id: 'energyBoostCard',
        cost: 45,
        type: 'goodie',
        icon: 'fa-bolt',
        name: 'Energy Boost',
        message: 'boosted'
    },
    freeze: {
        id: 'freezeCard',
        cost: 150,
        duration: 10000,
        type: 'baddie',
        icon: 'fa-snowflake',
        name: 'Freeze',
        message: 'froze'
    },
    coinStorm: {
        id: 'coinStormCard',
        cost: 160,
        duration: 3,
        type: 'baddie',
        icon: 'fa-cloud-showers-heavy',
        name: 'Coin Storm',
        message: 'cast a coin storm on'
    },
    screenShake: {
        id: 'screenShakeCard',
        cost: 130,
        duration: 5000,
        type: 'baddie',
        icon: 'fa-shake',
        name: 'Screen Shake',
        message: 'shook'
    }
};

function initializePowerups() {
    // Powerup definitions
    const powerupDefinitions = {
        highFive: {
            id: "highFiveCard",
            cost: 30,
            effect: 50,
            type: "goodie",
            icon: "fa-hand-paper",
            name: "High Five",
            message: "high-fived"
        },
        fistBump: {
            id: "fistBumpCard",
            cost: 40,
            effect: 75,
            type: "goodie",
            icon: "fa-fist-raised",
            name: "Fist Bump",
            message: "fist-bumped"
        },
        energyBoost: {
            id: "energyBoostCard",
            cost: 45,
            type: "goodie",
            icon: "fa-bolt",
            name: "Energy Boost",
            message: "boosted"
        },
        freeze: {
            id: "freezeCard",
            cost: 150,
            duration: 10000,
            type: "baddie",
            icon: "fa-snowflake",
            name: "Freeze",
            message: "froze"
        },
        coinStorm: {
            id: "coinStormCard",
            cost: 160,
            type: "baddie",
            icon: "fa-cloud-showers-heavy",
            name: "Coin Storm",
            message: "cast a coin storm on"
        },
        screenShake: {
            id: "screenShakeCard",
            cost: 130,
            duration: 5000,
            type: "baddie",
            icon: "fa-shake",
            name: "Screen Shake", 
            message: "shook"
        }
    };

    // Function to check and update powerup availability
    function updateAvailability() {
        document.querySelectorAll('.powerup-card').forEach(card => {
            const costElement = card.querySelector('.powerup-cost');
            if (!costElement) return;
            
            const cost = parseInt(costElement.textContent);
            const isAffordable = currentGame.coins >= cost;
            
            card.classList.toggle('disabled', !isAffordable);
            card.style.cursor = isAffordable ? 'pointer' : 'not-allowed';
            card.style.opacity = isAffordable ? '1' : '0.5';
        });
    }

    // Create a random selection of powerups
    function getRandomPowerups(count = 3) {
        const powerupKeys = Object.keys(powerupDefinitions);
        const selectedKeys = [];
        
        while (selectedKeys.length < count && powerupKeys.length > 0) {
            const randomIndex = Math.floor(Math.random() * powerupKeys.length);
            selectedKeys.push(powerupKeys.splice(randomIndex, 1)[0]);
        }
        
        return selectedKeys;
    }
    
    // Set up the powerups container
    const container = document.querySelector('.powerups-container');
    if (!container) return;
    
    // Clear existing powerups
    container.innerHTML = '';
    
    // Add random powerups
    getRandomPowerups(3).forEach(key => {
        const powerup = powerupDefinitions[key];
        
        const powerupCard = document.createElement('div');
        powerupCard.className = `powerup-card ${powerup.type}`;
        powerupCard.id = powerup.id;
        
        powerupCard.innerHTML = `
            <i class="fas ${powerup.icon} powerup-icon"></i>
            <div class="powerup-name">${powerup.name}</div>
            <div class="powerup-cost">${powerup.cost}</div>
        `;
        
        // Add click handler
        powerupCard.onclick = async () => {
            console.log("Powerup clicked:", powerup.name);
            
            // Check if player has enough coins
            if (currentGame.coins < powerup.cost) {
                showNotification("Not enough coins!", "error");
                return;
            }
            
            // Find a random player to target (excluding self)
            const otherPlayers = currentArcadeSession.participants.filter(p => 
                p.username !== currentArcadeSession.playerName && 
                p.username !== undefined && 
                p.username !== null
            );
            
            if (otherPlayers.length === 0) {
                showNotification("Waiting for other players to join...", "info");
                return;
            }
            
            // Select random target and deduct coins
            const targetPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            const oldCoins = currentGame.coins;
            currentGame.coins -= powerup.cost;
            
            // Update displayed coins
            document.querySelectorAll('.coin-count').forEach(el => {
                el.textContent = currentGame.coins;
            });
            
            try {
                // Send powerup effect to target player
                await window.arcadeChannel.send({
                    type: 'broadcast',
                    event: 'powerup_effect',
                    payload: {
                        powerupKey: key,
                        targetUser: targetPlayer.username,
                        fromUser: currentArcadeSession.playerName,
                        powerup: powerup
                    }
                });
                
                // Show feedback notification
                showNotification(`Used ${powerup.name} on ${targetPlayer.username}!`, powerup.type);
                
                // Update participant list with new coin count
                await window.arcadeChannel.send({
                    type: 'broadcast',
                    event: 'progress_update',
                    payload: {
                        username: currentArcadeSession.playerName,
                        wordsCompleted: currentGame.wordsCompleted,
                        coins: currentGame.coins,
                        timestamp: Date.now()
                    }
                });
                
                // Refresh powerups with the new coin amount
                initializePowerups();
                
            } catch (error) {
                console.error("Powerup use error:", error);
                // Restore coins on error
                currentGame.coins = oldCoins;
                document.querySelectorAll('.coin-count').forEach(el => {
                    el.textContent = oldCoins;
                });
                showNotification("Failed to use powerup!", "error");
            }
            updatePlayerRankDisplay();
        };
        
        container.appendChild(powerupCard);
    });
    
    // Initial availability check
    updateAvailability();
    
    // Set up an observer to watch for coin count changes
    const coinDisplay = document.querySelector('.coin-count');
    if (coinDisplay) {
        const observer = new MutationObserver(() => {
            updateAvailability();
        });
        
        observer.observe(coinDisplay, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }
    
    // Return the updateAvailability function so it can be called externally
    return updateAvailability;
}

// Update powerup availability whenever coin count changes
function updatePowerupAvailability() {
  document.querySelectorAll('.powerup-card').forEach(card => {
    const costElement = card.querySelector('.powerup-cost');
    if (!costElement) return;
    
    const cost = parseInt(costElement.textContent);
    const isAffordable = currentGame.coins >= cost;
    
    card.classList.toggle('disabled', !isAffordable);
    card.style.cursor = isAffordable ? 'pointer' : 'not-allowed';
    card.style.opacity = isAffordable ? '1' : '0.5';
  });
}

function updateArcadePowerups() {
    // Get all powerup cards
    const powerupCards = document.querySelectorAll('.powerup-card');
    
    // Current coin amount
    const currentCoins = currentGame.coins || 0;
    
    // Update each powerup card's availability
    powerupCards.forEach(card => {
        const costElement = card.querySelector('.powerup-cost');
        if (!costElement) return;
        
        // Parse cost from the element
        const cost = parseInt(costElement.textContent);
        
        // Determine if player can afford this powerup
        const canAfford = currentCoins >= cost;
        
        // Update visual state
        card.classList.toggle('disabled', !canAfford);
        card.style.opacity = canAfford ? '1' : '0.5';
        card.style.cursor = canAfford ? 'pointer' : 'not-allowed';
    });
}

function updateArcadeCoinDisplay() {
    // Use the single source of truth from CoinController
    const currentCoins = CoinController.getCurrentCoins();
    
    // Update ALL coin displays to match this single source of truth
    document.querySelectorAll(".coin-count").forEach(element => {
      const displayedValue = parseInt(element.textContent) || 0;
      if (displayedValue !== currentCoins) {
        // Use the enhanced animation function
        animateCoinsChange(element, displayedValue, currentCoins);
      }
    });
    
    // Update powerup availability
    updatePowerupAvailability();
}


function addCoinAnimationStyles() {
    if (!document.getElementById("coin-animation-styles")) {
        const styleElement = document.createElement("style");
        styleElement.id = "coin-animation-styles";
        styleElement.textContent = `
            .coin-count.animating {
                transition: color 0.3s ease;
            }
            
            @keyframes coinPulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.2); }
                100% { transform: scale(1); }
            }
            
            .coin-pulse {
                animation: coinPulse 0.5s ease-in-out;
            }
        `;
        document.head.appendChild(styleElement);
    }
}

// Call this on initialization
document.addEventListener("DOMContentLoaded", function() {
    addCoinAnimationStyles();
});

function proceedToGame() {
    const qrLanding = document.getElementById('qr-landing');
    const otp = qrLanding.dataset.otp;
    
    // Hide landing page
    qrLanding.style.display = 'none';
    
    // Show join modal with OTP
    showJoinModal(otp);
}





function switchAuthForm(type) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (type === 'signup') {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    } else {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    }
}

async function combineCustomLists(listIds) {
    if (!currentUser?.role === 'teacher') return;
    
    const combinedList = {
        id: Date.now(),
        name: 'Combined List',
        words: [],
        translations: [],
        isTeacherList: true
    };
    
    // Merge selected lists
    for (const listId of listIds) {
        const list = customPracticeLists.lists.find(l => l.id === listId);
        if (list) {
            combinedList.words.push(...list.words);
            combinedList.translations.push(...list.translations);
        }
    }
    
    return combinedList;
}

async function convertListToArcade(listId) {
    if (!currentUser?.role === 'teacher') return;
    
    const list = customPracticeLists.lists.find(l => l.id === listId);
    if (!list) return;
    
    // Create arcade configuration
    const arcadeConfig = {
        wordPool: list.words.map((word, index) => ({
            word: word,
            translation: list.translations[index]
        })),
        isCustomArcade: true,
        teacherId: currentUser.id,
        listId: listId
    };
    
    return arcadeConfig;
}

function initializeBossLevel() {
    console.log("Initializing boss level");
    
    // Create boss timer
    const { container: timerContainer, display: timerDisplay } = createBossTimer();
    document.getElementById('question-screen').appendChild(timerContainer);
    
    currentGame.bossFirstHealthRestored = false;
    currentGame.bossSecondHealthRestored = false;
    
    applyBossLevelStyles();
    
    document.querySelectorAll(".perk-button").forEach((e) => {
        if (e) {
            e.disabled = true;
            e.style.opacity = "0.3";
            
            const disabledOverlay = document.createElement("div");
            disabledOverlay.className = "perk-disabled";
            disabledOverlay.innerHTML = "❌";
            disabledOverlay.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 1.5em;
                color: red;
                pointer-events: none;
            `;
            
            e.style.position = 'relative';
            e.appendChild(disabledOverlay);
        }
    });
    
    const progressCircle = document.querySelector(".progress-circle");
    if (progressCircle) {
        const progressElement = progressCircle.querySelector(".progress");
        if (progressElement) {
            progressElement.style.stroke = "#4CAF50";
        }
    }
    
    // Set timer update logic in startTimer
    currentGame.updateBossTimer = (timeRemaining) => {
        const timerDisplay = document.querySelector('#boss-timer div');
        updateBossTimer(timerDisplay, timeRemaining);
    };
    
    setTimeout(applyBossLevelStyles, 100);
    setTimeout(applyBossLevelStyles, 500);
    
    console.log("Boss level initialization complete");
}


function replaceCoinWithBossOrb() {
  const coinsContainer = document.querySelector('.coins-container');
  if (!coinsContainer) {
    console.error("Coins container not found");
    return;
  }
  
  // Create boss orb
  const bossOrb = document.createElement('div');
  bossOrb.className = 'boss-orb';
  bossOrb.innerHTML = `<div class="boss-orb-inner"></div>`;
  
  // Apply direct styles
  bossOrb.style.cssText = `
    position: absolute;
    width: 60px;
    height: 60px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  `;
  
  bossOrb.querySelector('.boss-orb-inner').style.cssText = `
    width: 50px;
    height: 50px;
    background: radial-gradient(circle at 30% 30%, #ff3333, #990000);
    border-radius: 50%;
    box-shadow: 0 0 20px #ff3333, inset 0 0 10px rgba(255,255,255,0.3);
    animation: pulseOrb 2s infinite;
  `;
  
  // Add animation for orb
  const orbStyle = document.createElement('style');
  orbStyle.innerHTML = `
    @keyframes pulseOrb {
      0%, 100% { transform: scale(1); filter: brightness(1); }
      50% { transform: scale(1.1); filter: brightness(1.2); }
    }
  `;
  document.head.appendChild(orbStyle);
  
  // Clear existing content and add boss orb
  coinsContainer.innerHTML = '';
  coinsContainer.appendChild(bossOrb);
}

function initializeBossHealthBar() {
  const progressCircle = document.querySelector('.progress-circle');
  if (!progressCircle) return;
  
  const progress = progressCircle.querySelector('.progress');
  if (!progress) return;
  
  // Start with full health - bright green
  progress.style.stroke = '#4CAF50';
  
  // Add health warning animation style
  const healthStyle = document.createElement('style');
  healthStyle.innerHTML = `
    .progress.warning {
      animation: healthWarning 0.8s infinite alternate;
    }
    @keyframes healthWarning {
      from { stroke: #ff3333; }
      to { stroke: #ffffff; }
    }
  `;
  document.head.appendChild(healthStyle);
}

function addBossLevelStyles() {
  // Remove existing styles first
  const existingStyle = document.getElementById('boss-level-style');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  const bossStyle = document.createElement('style');
  bossStyle.id = 'boss-level-style';
  bossStyle.innerHTML = `
    .boss-mode {
      background: linear-gradient(135deg, #800000, #3a0000) !important;
    }
    
    @keyframes pulseBg {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.2); }
    }
    
    .boss-orb {
      position: relative;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .boss-orb-inner {
      width: 50px;
      height: 50px;
      background: radial-gradient(circle at 30% 30%, #ff3333, #990000);
      border-radius: 50%;
      position: relative;
      box-shadow: 0 0 20px #ff3333, inset 0 0 10px rgba(255,255,255,0.3);
      animation: pulseOrb 2s infinite;
    }
    
    .boss-orb-glow {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), transparent 70%);
      animation: rotateGlow 3s linear infinite;
    }
    
    @keyframes pulseOrb {
      0%, 100% { transform: scale(1); filter: brightness(1); }
      50% { transform: scale(1.1); filter: brightness(1.2); }
    }
    
    @keyframes rotateGlow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .boss-health {
      transition: stroke 0.3s ease, stroke-dashoffset 0.5s ease;
    }
    
    .boss-health.warning {
      animation: healthWarning 0.8s infinite alternate;
    }
    
    @keyframes healthWarning {
      from { stroke: #ff3333; }
      to { stroke: #ffffff; }
    }
    
    .boss-word {
      color: #ff3333;
      text-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
      animation: pulseWord 2s infinite;
    }
    
    @keyframes pulseWord {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    .boss-hit {
      animation: bossHitEffect 0.3s;
    }
    
    @keyframes bossHitEffect {
      0% { transform: scale(1); }
      50% { transform: scale(1.02); filter: brightness(1.3); }
      100% { transform: scale(1); }
    }
    
    .boss-orb-hit {
      animation: bossOrbHit 0.3s;
    }
    
    @keyframes bossOrbHit {
      0% { transform: scale(1); }
      50% { transform: scale(1.3); filter: brightness(1.5); }
      100% { transform: scale(1); }
    }
    
    .boss-restore-health {
      animation: bossRestoreHealth 1s;
    }
    
    @keyframes bossRestoreHealth {
      0% { filter: brightness(1); }
      50% { filter: brightness(2); }
      100% { filter: brightness(1); }
    }
    
    .boss-defeated {
      animation: bossDefeated 2s forwards;
    }
    
    @keyframes bossDefeated {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.7; filter: brightness(2); }
      100% { transform: scale(0); opacity: 0; }
    }
    
    .raining-letter {
      position: absolute;
      color: rgba(255, 0, 0, 0.3);
      font-size: 16px;
      animation: letterRain linear forwards;
      z-index: 1;
    }
    
    @keyframes letterRain {
      0% { transform: translateY(-20px); opacity: 0; }
      10% { opacity: 0.7; }
      90% { opacity: 0.7; }
      100% { transform: translateY(100vh); opacity: 0; }
    }
    
    .boss-victory {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #00c6ff, #0072ff);
      padding: 2rem;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 0 30px rgba(0, 198, 255, 0.5);
      z-index: 1000;
      max-width: 500px;
      width: 90%;
    }
    
    .boss-victory h2 {
      font-size: 2rem;
      color: white;
      margin-bottom: 1rem;
    }
    
    .boss-victory p {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 2rem;
    }
    
    .victory-buttons {
      display: flex;
      justify-content: center;
      gap: 1rem;
    }
    
.victory-button {
    background: var(--accent);
    color: var(--text);
    border: none;
    padding: 1rem 2.5rem;
    border-radius: 50px;
    font-size: 1.2rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 5px 15px rgba(30, 144, 255, 0.3);
    margin-top: 1.5rem;
    min-width: 200px;
}

.victory-button:hover {
    transform: translateY(-3px);
    background: color-mix(in srgb, var(--accent) 80%, white);
    box-shadow: 0 8px 20px rgba(30, 144, 255, 0.5);
}

.victory-button:active {
    transform: translateY(1px);
    box-shadow: 0 3px 10px rgba(30, 144, 255, 0.3);
}
    
    .victory-button.continue {
      background: #4CAF50;
      color: white;
    }
    
    .victory-button.home {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 2px solid white;
    }
    
   
    
    .incineration-effect {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle, #ff9900, #ff3300);
      opacity: 0;
      transform: scale(0);
      animation: incinerateEffect 2s forwards;
    }
    
    @keyframes incinerateEffect {
      0% { transform: scale(0); opacity: 0; }
      10% { transform: scale(0.5); opacity: 0.8; }
      50% { transform: scale(1.5); opacity: 1; }
      100% { transform: scale(3); opacity: 0; }
    }
  `;
  
  document.head.appendChild(bossStyle);
}

function updateBossHealthBar() {
  // Only update if we're in boss level
  if (!currentGame.isBossLevel) return false;
  
  console.log("Updating boss health bar");

  const progressCircle = document.querySelector('.progress-circle');
  if (!progressCircle) {
    console.error("Progress circle not found");
    return false;
  }
  
  const progress = progressCircle.querySelector('.progress');
  if (!progress) {
    console.error("Progress element not found");
    return false;
  }
  
  // Calculate health values
  const totalWords = currentGame.words.length;
  const currentIndex = currentGame.currentIndex || 0;
  const remainingWords = Math.max(0, totalWords - currentIndex);
  const remainingPercentage = remainingWords / totalWords;
  
  console.log(`Boss health: ${(remainingPercentage * 100).toFixed(2)}% (${remainingWords}/${totalWords})`);
  
  // Calculate the circumference
  const circumference = 2 * Math.PI * 54;
  
  // Update the stroke dash offset (reverse of normal progress)
  progress.style.strokeDashoffset = circumference * (1 - remainingPercentage);
  
  // Update boss orb size
  const bossOrb = document.querySelector('.boss-orb-inner');
  if (bossOrb) {
    const minSize = 5;  // Minimum size of the orb
    const maxSize = 50; // Maximum size of the orb
    const currentSize = Math.max(minSize, maxSize * remainingPercentage);
    
    bossOrb.style.width = `${currentSize}px`;
    bossOrb.style.height = `${currentSize}px`;
    
    // Center the shrinking orb
    bossOrb.style.left = `${(50 - currentSize/2)}%`;
    bossOrb.style.top = `${(50 - currentSize/2)}%`;
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
      
      if (bossOrb) {
        // White flash
        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, white, #FFEB3B)';
        bossOrb.style.transform = 'scale(1.3)';
        bossOrb.style.filter = 'brightness(1.8)';
        
        setTimeout(() => {
          bossOrb.style.transform = '';
          bossOrb.style.filter = '';
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      
      // Restore health to 75%
      const restoredIndex = Math.floor(totalWords * 0.25); // 75% health
      currentGame.currentIndex = restoredIndex;
      
      // Re-update the health bar after restoration
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
      
      if (bossOrb) {
        // Green-white flash
        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, white, #4CAF50)';
        bossOrb.style.transform = 'scale(1.3)';
        bossOrb.style.filter = 'brightness(1.8)';
        
        setTimeout(() => {
          bossOrb.style.transform = '';
          bossOrb.style.filter = '';
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      
      // Restore health to 50%
      const restoredIndex = Math.floor(totalWords * 0.5); // 50% health
      currentGame.currentIndex = restoredIndex;
      
      // Re-update the health bar after restoration
      setTimeout(() => updateBossHealthBar(), 100);
    }
  }

  // Only trigger defeat effect here if not already marked as defeated
  if (remainingPercentage <= 0 && !currentGame.bossDefeated) {
    console.log("Boss defeated via health bar check!");
    currentGame.bossDefeated = true;
    return true;
  }
  
  return false;
}

function startBossLevel() {
    showLevelIntro(21, () => {
        initializeBossLevel();
        startTimer(currentGame.words.length * 8); // Less time per word
        loadNextBossQuestion();
    });
}

function loadNextBossQuestion() {
  console.log('Loading next boss question');
  setTimeout(applyBossLevelStyles, 100);
  createLightningEffect();
  createBossRainingLetters();
  
  const questionWordElement = document.getElementById('question-word');
  if (questionWordElement) {
    questionWordElement.style.setProperty('color', '#ff3333', 'important');
    questionWordElement.style.setProperty('text-shadow', '0 0 10px rgba(255, 0, 0, 0.5)', 'important');
    questionWordElement.style.setProperty('animation', 'pulseWord 2s infinite', 'important');
  }
  
  try {
    if (currentGame.currentIndex > 0 && questionWordElement) {
      questionWordElement.classList.add('exiting');
      setTimeout(() => {
        loadNextQuestion();
        questionWordElement.classList.remove('exiting');
        questionWordElement.classList.add('entering');
        setTimeout(() => {
          questionWordElement.classList.remove('entering');
        }, 500); // Match the animation duration
      }, 500); // Match the animation duration
    } else {
      loadNextQuestion();
    }
    
    setTimeout(() => {
      updateBossHealthBar();
    }, 50);
    
    // Occasionally shuffle buttons to increase difficulty
    const buttonsContainer = document.getElementById('buttons');
    if (buttonsContainer && Math.random() < 0.3) {
      const buttons = Array.from(buttonsContainer.children);
      buttons.sort(() => Math.random() - 0.5).forEach(button => {
        buttonsContainer.appendChild(button);
      });
    }
  } catch (error) {
    console.error('Error loading boss question:', error);
  }
}

function restoreFromBossLevel() {
  const questionScreen = document.getElementById("question-screen");
  if (questionScreen) {
    // First remove any inline styles
    questionScreen.removeAttribute("style");
    
    // Then apply default styles
    questionScreen.style.background = "radial-gradient(circle at center, var(--secondary) 0%, var(--primary-dark) 100%)";
  }

  const questionWord = document.getElementById("question-word");
  if (questionWord) {
    questionWord.removeAttribute("style");
  }

  if (window.originalCoinsHTML) {
    const coinsContainer = document.querySelector(".coins-container");
    if (coinsContainer) {
      coinsContainer.innerHTML = window.originalCoinsHTML;
    }
  }
  
  // Stop any boss-specific effects
  if (typeof stopBossRainingLetters === 'function') {
    stopBossRainingLetters();
  }
}

// Arcade Participation Management
function initializeArcadeParticipation() {
    // Set up activity tracking
    let lastActive = Date.now();
    const INACTIVE_THRESHOLD = 60000; // 1 minute

    // Heartbeat interval
    setInterval(() => {
        if (Date.now() - lastActive > INACTIVE_THRESHOLD) {
            removeInactivePlayer();
        }
    }, 10000); // Check every 10 seconds

    // Track user activity
    ['mousemove', 'keypress', 'click'].forEach(event => {
        document.addEventListener(event, () => {
            lastActive = Date.now();
        });
    });

    // Handle page refresh/close
    window.addEventListener('beforeunload', () => {
        if (window.arcadeChannel) {
            window.arcadeChannel.send({
                type: 'broadcast',
                event: 'player_left',
                payload: {
                    username: currentArcadeSession.playerName
                }
            });
        }
    });
}

function removeInactivePlayer() {
    window.arcadeChannel.send({
        type: 'broadcast',
        event: 'player_inactive',
        payload: {
            username: currentArcadeSession.playerName
        }
    });
}

// Arcade Completion Handling
function handleArcadeCompletion(playerData) {
    const completionRank = currentArcadeSession.participants
        .sort((a, b) => b.wordsCompleted - a.wordsCompleted)
        .findIndex(p => p.username === playerData.username) + 1;

    if (completionRank <= 3) {
        showPersonalizedCompletion(completionRank);
        
        if (completionRank === 3) {
            // End game for all players
            window.arcadeChannel.send({
                type: 'broadcast',
                event: 'game_complete',
                payload: {
                    topThree: currentArcadeSession.participants
                        .sort((a, b) => b.wordsCompleted - a.wordsCompleted)
                        .slice(0, 3)
                }
            });
        }
    }
}

async function handlePlayerCompletedGoal(username) {
    // Skip if player already completed
    if (currentArcadeSession.completedPlayers.includes(username)) return;
    
    // Record completion time
    const completionTime = Date.now();
    currentArcadeSession.completedPlayers.push(username);
    
    // Determine rank based on completion order (1st, 2nd, 3rd)
    let rank = 0;
    const completionIndex = currentArcadeSession.completedPlayers.indexOf(username);
    if (completionIndex < 3) {
        // 1st, 2nd, or 3rd place based strictly on completion order
        rank = completionIndex + 1;
        
        // Store the rank information
        if (!currentArcadeSession.podiumRanks) {
            currentArcadeSession.podiumRanks = {};
        }
        currentArcadeSession.podiumRanks[username] = {
            rank: rank,
            completionTime: completionTime
        };
        console.log(`Player ${username} earned podium rank ${rank} (first to finish)`);
    }
    
    // Update player data
    const playerData = currentArcadeSession.participants.find(p => p.username === username);
    if (playerData) {
        if (rank > 0) {
            playerData.rank = rank;
            playerData.completionTime = completionTime;
        }
        playerData.wordsCompleted = currentGame.wordsCompleted;
        playerData.coins = gameState.coins || currentGame.coins || 0;
        playerData.completed = true;
    }
    
    // Broadcast completion to all players
    await window.arcadeChannel.send({
        type: "broadcast",
        event: "player_completed",
        payload: {
            username: username,
            rank: rank,
            wordsCompleted: currentGame.wordsCompleted,
            coins: gameState.coins || currentGame.coins || 0,
            timestamp: completionTime,
            completed: true
        }
    });
    
    // Always show victory screen for this player if they placed in top 3
    if (username === currentArcadeSession.playerName && rank > 0) {
        // Force the victory screen to show for all ranks 1-3
        showPersonalVictoryScreen(rank);
    }
    
    // End game if all podium positions are filled
    if (currentArcadeSession.completedPlayers.length >= 3) {
        console.log("All podium positions filled, ending game for all players");
        await endArcadeForAll();
    }
}

function endArcade() {
    // Disable game activity monitoring
    moderatorInactivity.isGameActive = false;
    
    // Mark celebration as triggered to prevent duplicate celebrations
    currentArcadeSession.celebrationTriggered = true;
    
    // Update session state
    currentArcadeSession.state = "ended";
    currentArcadeSession.endTime = Date.now();
    
    // For sessions with enough participants, show celebration
    if (currentArcadeSession.participants.length >= 3) {
        const podiumPlayers = [...currentArcadeSession.participants]
            .sort((a, b) => b.wordsCompleted !== a.wordsCompleted ? 
                 b.wordsCompleted - a.wordsCompleted : b.coins - a.coins)
            .slice(0, 3)
            .map((player, index) => ({...player, rank: index + 1, completionTime: Date.now() - 1000 * index}));
            
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_end',
            payload: {
                state: 'ended',
                podiumPlayers: podiumPlayers,
                teacherId: currentArcadeSession.teacherId,
                forcedEnd: false,
                duration: currentArcadeSession.endTime - (currentArcadeSession.startTime || currentArcadeSession.endTime)
            }
        });
        
        startLeaderboardCelebration(podiumPlayers);
    } else {
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'game_end',
            payload: {
                state: 'ended',
                forcedEnd: true,
                teacherId: currentArcadeSession.teacherId
            }
        });
        
        showScreen('welcome-screen');
    }
    
    // Completely reset the arcade session
    resetArcadeSession();
    
    // Unsubscribe from the arcade channel
    if (window.arcadeChannel) {
        window.arcadeChannel.unsubscribe();
        window.arcadeChannel = null;
    }
}

function resetArcadeSession() {
    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Clear timeouts and intervals
    if (window.arcadeTimeouts) {
        window.arcadeTimeouts.forEach(timeout => clearTimeout(timeout));
    }
    if (window.arcadeIntervals) {
        window.arcadeIntervals.forEach(interval => clearInterval(interval));
    }
    if (window.celebrationConfettiInterval) {
        clearInterval(window.celebrationConfettiInterval);
    }
    if (window.playerConfettiInterval) {
        clearInterval(window.playerConfettiInterval);
    }
    
    // Reset session state completely
    currentArcadeSession = {
        eventId: null,
        otp: newOtp,
        wordPool: [],
        participants: [],
        teacherId: currentUser?.id || null,
        wordGoal: 50,
        state: "pre-start",
        completedPlayers: [],
        playerRank: null,
        winnerScreenShown: false,
        startTime: null,
        endTime: null,
        podiumRanks: {},
        isInitialized: false,
        initialCoins: 0,
        playerName: null,
        joinEventSent: false,
        celebrationTriggered: false
    };
    
    lastLeaderboardUpdate = Date.now();
    
    // Reset arcadeChannel subscription
    if (window.arcadeChannel) {
        window.arcadeChannel.unsubscribe();
        window.arcadeChannel = null;
    }
    
    // Reset UI elements
    const leaderboard = document.getElementById('arcade-leaderboard');
    if (leaderboard) {
        const header = leaderboard.querySelector('.leaderboard-header');
        leaderboard.innerHTML = header ? header.outerHTML : '';
    }
    
    // Update OTP display
    const otpDisplay = document.getElementById('moderatorOtp');
    if (otpDisplay) {
        otpDisplay.textContent = newOtp;
    }
    
    // Update QR code
    const qrCode = document.getElementById('qrCode');
    if (qrCode) {
        const url = `${window.location.origin + window.location.pathname}#join=${newOtp}`;
        new QRious({
            element: qrCode,
            value: url,
            size: 200,
            backgroundAlpha: 1,
            foreground: "#16213e",
            background: "#ffffff",
            level: "H"
        });
    }
    
    // Clean up any database state if needed
    if (currentArcadeSession.eventId) {
        supabaseClient.from('arcade_events')
            .update({ status: 'waiting', game_state: {}, otp: newOtp })
            .eq('id', currentArcadeSession.eventId)
            .then(({ error }) => {
                if (error) console.error('Failed to reset arcade event:', error);
            });
        
        supabaseClient.from('arcade_participants')
            .delete()
            .eq('event_id', currentArcadeSession.eventId)
            .then(({ error }) => {
                if (error) console.error('Failed to clear participants:', error);
            });
    }
    
    // Reset End Arcade button
    const endArcadeButton = document.querySelector('.end-arcade-button');
    if (endArcadeButton) {
        endArcadeButton.classList.remove('visible');
    }
    
    // Remove any remaining UI elements from celebrations
    document.querySelectorAll('.celebration-overlay, .home-button-container').forEach(el => el.remove());
    
    // Reset current game state
    currentGame = {
        currentIndex: 0,
        correctStreak: 0,
        wrongStreak: 0,
        words: [],
        wordsCompleted: 0,
        coins: 0,
        lastBroadcast: Date.now()
    };
    
    // Reset any stage checkboxes in the arcade modal
    document.querySelectorAll('.stage-checkboxes input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Reset word goal input
    const wordGoalInput = document.getElementById('wordGoalInput');
    const wordGoalSlider = document.getElementById('wordGoalSlider');
    const wordGoalDisplay = document.getElementById('wordGoalDisplay');
    
    if (wordGoalInput) wordGoalInput.value = "50";
    if (wordGoalSlider) wordGoalSlider.value = "50";
    if (wordGoalDisplay) wordGoalDisplay.textContent = "50";
    
    console.log('Arcade session completely reset with new OTP:', newOtp);
}

function finishCelebrationAndGoHome() {
    // Clean up UI elements
    document.querySelector(".celebration-overlay")?.remove();
    document.querySelector(".home-button-container")?.remove();
    
    if (window.celebrationConfettiInterval) {
      clearInterval(window.celebrationConfettiInterval);
    }
    
    document.querySelectorAll(".confetti, .celebration-emoji, .winner-entry.celebrating").forEach(
      element => element.remove()
    );
    
    // Update stats before returning home
    updatePlayerStatsAfterArcade().then(() => {
      // Clean up monitoring and reset session
      cleanupModeratorInactivityMonitoring();
      resetArcadeSession();
      
      // Return to welcome screen
      showScreen("welcome-screen");
    });
}

function handleGameEnd(payload) {
    console.log('Game End Payload:', payload);

    // If no payload, exit
    if (!payload) return;
    
    // If forcibly ended by moderator, just go back to welcome
    if (payload.forcedEnd) {
        showScreen('welcome-screen');
        return;
    }

    // If this is the moderator, show victory screen with podium players
    if (currentUser?.id === payload.teacherId) {
        const podiumPlayers = payload.podiumPlayers || [];
        showModeratorVictoryScreen(podiumPlayers);
        return;
    }

    // For players: show appropriate completion screen based on their status
    showFinalResultsForPlayer(payload.podiumPlayers || []);
}

function hidePersonalVictoryScreen() {
    const modal = document.querySelector('.arcade-completion-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(modal);
        }, 300);
    }
}

async function endArcadeForAll() {
    currentArcadeSession.state = "ended";
    currentArcadeSession.endTime = Date.now();
    
    // Create array of podium players based on completion order
    const podiumPlayers = [];
    
    // Use the original ranking from podiumRanks if available
    if (currentArcadeSession.podiumRanks) {
        Object.entries(currentArcadeSession.podiumRanks).forEach(([username, rankInfo]) => {
            const player = currentArcadeSession.participants.find(p => p.username === username);
            if (player) {
                podiumPlayers.push({
                    username: player.username, 
                    wordsCompleted: player.wordsCompleted || 0,
                    coins: player.coins || 0,
                    rank: rankInfo.rank,
                    completionTime: rankInfo.completionTime
                });
            }
        });
        
        // Sort by rank (not by words or coins)
        podiumPlayers.sort((a, b) => a.rank - b.rank);
    }
    
    // Fill up to 3 places if needed
    while (podiumPlayers.length < 3) {
        const rank = podiumPlayers.length + 1;
        podiumPlayers.push({
            username: "---",
            wordsCompleted: 0,
            coins: 0,
            rank: rank
        });
    }
    
    console.log("Final podium players:", podiumPlayers.map(p => ({
        username: p.username, 
        rank: p.rank, 
        wordsCompleted: p.wordsCompleted
    })));
    
    await window.arcadeChannel.send({
        type: "broadcast",
        event: "game_end",
        payload: {
            state: "ended",
            podiumPlayers: podiumPlayers,
            teacherId: currentArcadeSession.teacherId,
            duration: currentArcadeSession.endTime - (currentArcadeSession.startTime || currentArcadeSession.endTime)
        }
    });
    
    if (currentUser?.id === currentArcadeSession.teacherId) {
        showModeratorVictoryScreen(podiumPlayers);
    } else {
        showFinalResultsForPlayer(podiumPlayers);
    }
}

function showFinalResults(players) {
    // Different behavior for moderator vs player
    if (currentUser?.id === currentArcadeSession.teacherId) {
        showModeratorVictoryScreen(players);
    } else {
        showPlayerFinalResults(players);
    }
}

function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function initializeModeratorIdleDetection() {
    // Function intentionally disabled to prevent moderator from being removed from arcade session
    console.log("Moderator idle detection disabled - arcade will continue until manually ended");
    
    // Return empty handlers for cleanup
    return {
        clearIdleTimer: () => {},
        idleCheckInterval: null
    };
}

// Global variables for inactivity tracking
let moderatorActivityTimer = null;
let countdownTimer = null;
let lastLeaderboardUpdate = Date.now();
let isCountingDown = false;

function initializeModeratorInactivityTimer() {
    // Only proceed if we're on the moderator screen and game has been initialized
    if (!isModeratorScreenActive() || !currentArcadeSession.isInitialized) {
        return;
    }
    
    // Set game as active
    moderatorInactivity.isGameActive = true;
    
    // Clear any existing timers
    clearModeratorTimers();
    
    // Reset state
    moderatorInactivity.lastLeaderboardUpdate = Date.now();
    moderatorInactivity.isCountingDown = false;
    moderatorInactivity.isInitialized = true;
    
    // Create overlay if it doesn't exist
    createModeratorInactivityOverlay();
    
    // Start monitoring for inactivity
    startModeratorInactivityMonitoring();
    
    // Start leaderboard update tracking
    trackModeratorLeaderboardUpdates();
    
    console.log('Moderator inactivity timer initialized');
}

function createInactivityOverlay() {
    // Remove any existing overlay
    const existingOverlay = document.querySelector('.inactivity-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    // Create new overlay
    const overlay = document.createElement('div');
    overlay.className = 'inactivity-overlay';
    overlay.innerHTML = `
        <div class="countdown-timer">5</div>
        <div class="inactivity-message">No activity detected. Redirecting...</div>
        <div class="countdown-progress">
            <div class="countdown-bar"></div>
        </div>
        <button class="countdown-cancel">Cancel</button>
    `;
    
    // Add event handler for cancel button
    overlay.querySelector('.countdown-cancel').addEventListener('click', cancelCountdown);
    
    // Append to body
    document.body.appendChild(overlay);
}

function startInactivityMonitoring() {
    // Reset the timer whenever there's activity
    const moderatorScreen = document.getElementById('moderator-screen');
    
    // Activity events to monitor
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    
    // Add all event listeners
    events.forEach(event => {
        moderatorScreen.addEventListener(event, resetInactivityTimer);
    });
    
    // Start the initial timer
    resetInactivityTimer();
}

function resetInactivityTimer() {
    // If already counting down, don't reset
    if (isCountingDown) return;
    
    // Clear existing timer
    if (moderatorActivityTimer) clearTimeout(moderatorActivityTimer);
    
    // Set new timer - 3 seconds of inactivity
    moderatorActivityTimer = setTimeout(() => {
        // Check if leaderboard has been updated recently
        const timeSinceLastUpdate = Date.now() - lastLeaderboardUpdate;
        
        // If no updates for 5 seconds, start countdown
        if (timeSinceLastUpdate > 5000) {
            startCountdown();
        }
    }, 3000);
}

function trackLeaderboardUpdates() {
    // Get leaderboard element
    const leaderboard = document.getElementById('arcade-leaderboard');
    if (!leaderboard) return;
    
    // Create mutation observer to detect changes
    const observer = new MutationObserver(() => {
        lastLeaderboardUpdate = Date.now();
        
        // If countdown is active, cancel it since we have activity
        if (isCountingDown) {
            cancelCountdown();
        }
    });
    
    // Start observing
    observer.observe(leaderboard, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        characterData: true
    });
}

function startCountdown() {
    isCountingDown = true;
    
    // Show the overlay
    const overlay = document.querySelector('.inactivity-overlay');
    if (overlay) overlay.classList.add('visible');
    
    // Initialize countdown
    let secondsLeft = 5;
    const timerDisplay = overlay.querySelector('.countdown-timer');
    const progressBar = overlay.querySelector('.countdown-bar');
    
    // Update initial display
    timerDisplay.textContent = secondsLeft;
    progressBar.style.transform = 'scaleX(1)';
    
    // Start countdown
    countdownTimer = setInterval(() => {
        secondsLeft--;
        
        // Update display
        timerDisplay.textContent = secondsLeft;
        progressBar.style.transform = `scaleX(${secondsLeft / 5})`;
        
        // Check if countdown is complete
        if (secondsLeft <= 0) {
            clearInterval(countdownTimer);
            handleCountdownComplete();
        }
    }, 1000);
}

function cancelCountdown() {
    // Hide overlay
    const overlay = document.querySelector('.inactivity-overlay');
    if (overlay) overlay.classList.remove('visible');
    
    // Reset state
    isCountingDown = false;
    if (countdownTimer) clearInterval(countdownTimer);
    
    // Restart inactivity monitoring
    resetInactivityTimer();
}

function handleCountdownComplete() {
    // Check if we have podium winners
    const hasPodiumWinners = currentArcadeSession.completedPlayers && 
                             currentArcadeSession.completedPlayers.length >= 3;
    
    if (hasPodiumWinners) {
        // Extract podium players
        const podiumPlayers = [];
        
        if (currentArcadeSession.podiumRanks) {
            // Get players by ranks
            Object.entries(currentArcadeSession.podiumRanks).forEach(([username, data]) => {
                const playerData = currentArcadeSession.participants.find(p => p.username === username);
                if (playerData) {
                    podiumPlayers.push({
                        username: playerData.username,
                        wordsCompleted: playerData.wordsCompleted || 0,
                        coins: playerData.coins || 0,
                        rank: data.rank
                    });
                }
            });
            
            // Sort by rank
            podiumPlayers.sort((a, b) => a.rank - b.rank);
        } else {
            // No explicit ranks, sort by words completed
            const sortedPlayers = [...currentArcadeSession.participants]
                .sort((a, b) => b.wordsCompleted - a.wordsCompleted)
                .slice(0, 3);
                
            // Assign ranks
            sortedPlayers.forEach((player, index) => {
                podiumPlayers.push({
                    ...player,
                    rank: index + 1
                });
            });
        }
        
        // Show victory screen
        showModeratorVictoryScreen(podiumPlayers);
    } else {
        // No winners yet, just go back to welcome screen
        showScreen('welcome-screen');
    }
}

// Variables specific to moderator screen
const moderatorInactivity = {
    activityTimer: null,
    countdownTimer: null,
    lastLeaderboardUpdate: Date.now(),
    isCountingDown: false,
    isInitialized: false,
    isGameActive: false
};

function initializeModeratorInactivityTimer() {
    // Only proceed if we're on the moderator screen and game has been initialized
    if (!isModeratorScreenActive() || !currentArcadeSession.isInitialized) {
        return;
    }
    
    // Set game as active
    moderatorInactivity.isGameActive = true;
    
    // Clear any existing timers
    clearModeratorTimers();
    
    // Reset state
    moderatorInactivity.lastLeaderboardUpdate = Date.now();
    moderatorInactivity.isCountingDown = false;
    moderatorInactivity.isInitialized = true;
    
    // Create overlay if it doesn't exist
    createModeratorInactivityOverlay();
    
    // Start monitoring for inactivity
    startModeratorInactivityMonitoring();
    
    // Start leaderboard update tracking
    trackModeratorLeaderboardUpdates();
    
    console.log('Moderator inactivity timer initialized');
}

function isModeratorScreenActive() {
    const moderatorScreen = document.getElementById('moderator-screen');
    return moderatorScreen && moderatorScreen.classList.contains('visible');
}

function clearModeratorTimers() {
    if (moderatorInactivity.activityTimer) {
        clearTimeout(moderatorInactivity.activityTimer);
        moderatorInactivity.activityTimer = null;
    }
    if (moderatorInactivity.countdownTimer) {
        clearInterval(moderatorInactivity.countdownTimer);
        moderatorInactivity.countdownTimer = null;
    }
}

function createModeratorInactivityOverlay() {
    // Remove any existing overlay
    const existingOverlay = document.querySelector('.moderator-inactivity-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    // Create new overlay
    const overlay = document.createElement('div');
    overlay.className = 'moderator-inactivity-overlay';
    overlay.innerHTML = `
        <div class="moderator-countdown-timer">5</div>
        <div class="moderator-inactivity-message">No leaderboard activity detected. Redirecting...</div>
        <div class="moderator-countdown-progress">
            <div class="moderator-countdown-bar"></div>
        </div>
        <button class="moderator-countdown-cancel">Cancel</button>
    `;
    
    // Add event handler for cancel button
    overlay.querySelector('.moderator-countdown-cancel').addEventListener('click', cancelModeratorCountdown);
    
    // Append to moderator screen specifically
    const moderatorScreen = document.getElementById('moderator-screen');
    if (moderatorScreen) {
        moderatorScreen.appendChild(overlay);
    }
}

function startModeratorInactivityMonitoring() {
    const moderatorScreen = document.getElementById('moderator-screen');
    if (!moderatorScreen) return;
    
    // Activity events to monitor (only on moderator screen)
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    
    // Add all event listeners
    events.forEach(event => {
        moderatorScreen.addEventListener(event, resetModeratorInactivityTimer);
    });
    
    // Add screen change listener
    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !isModeratorScreenActive()) {
            // Stop monitoring when page is hidden or moderator screen is not active
            clearModeratorTimers();
        } else if (moderatorInactivity.isGameActive && isModeratorScreenActive()) {
            // Restart when returning to visible state and on moderator screen
            resetModeratorInactivityTimer();
        }
    });
    
    // Start the initial timer
    resetModeratorInactivityTimer();
}

function resetModeratorInactivityTimer() {
    // Only proceed if on moderator screen, game is active, and not already counting down
    if (!isModeratorScreenActive() || !moderatorInactivity.isGameActive || moderatorInactivity.isCountingDown) {
        return;
    }
    
    // Clear existing timer
    if (moderatorInactivity.activityTimer) {
        clearTimeout(moderatorInactivity.activityTimer);
    }
    
    // Set new timer - 3 seconds of inactivity
    moderatorInactivity.activityTimer = setTimeout(() => {
        // Check if leaderboard has been updated recently
        const timeSinceLastUpdate = Date.now() - moderatorInactivity.lastLeaderboardUpdate;
        
        // If no updates for 5 seconds, start countdown
        if (timeSinceLastUpdate > 5000 && isModeratorScreenActive()) {
            // ADDED: Check if we should allow the inactivity timer
            const playerCount = currentArcadeSession.participants.length;
            let allowTimer = true;
            
            if (playerCount <= 3) {
                // Check if all players have reached their word goals
                const allReachedGoal = currentArcadeSession.participants.every(player => 
                    player.wordsCompleted >= currentArcadeSession.wordGoal
                );
                
                // Only allow timer if all have reached goals
                allowTimer = allReachedGoal;
                
                if (!allowTimer) {
                    console.log("Inactivity timer prevented: some players still working toward word goal");
                    // Reset last update time to prevent immediate re-trigger
                    moderatorInactivity.lastLeaderboardUpdate = Date.now();
                }
            }
            
            if (allowTimer) {
                startModeratorCountdown();
            }
        }
    }, 3000);
}

function checkAllPlayersCompleted() {
    if (!currentArcadeSession || !currentArcadeSession.participants) {
        return false;
    }
    
    const playerCount = currentArcadeSession.participants.length;
    
    // If no players, consider it not completed
    if (playerCount === 0) {
        return false;
    }
    
    // Check if all players have reached their goals
    return currentArcadeSession.participants.every(player => 
        player.wordsCompleted >= currentArcadeSession.wordGoal
    );
}

function updateModeratorStatus() {
    // Only run on the moderator screen
    if (!isModeratorScreenActive()) {
        return;
    }
    
    const playerCount = currentArcadeSession.participants.length;
    const completedPlayers = currentArcadeSession.participants.filter(p => 
        p.wordsCompleted >= currentArcadeSession.wordGoal
    ).length;
    
    // Find or create status element
    let statusElement = document.getElementById('moderator-player-status');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'moderator-player-status';
        statusElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            padding: 10px;
            border-radius: 5px;
            color: white;
            font-size: 0.9rem;
            z-index: 100;
        `;
        document.getElementById('moderator-screen').appendChild(statusElement);
    }
    
    // Update content
    let statusText = '';
    
    if (playerCount <= 3) {
        // For small games, show detailed status
        statusText = `<strong>Player Progress:</strong> ${completedPlayers}/${playerCount} completed`;
        
        if (completedPlayers < playerCount) {
            statusText += ' <span style="color:#ff9966">(Waiting for all players to finish)</span>';
        } else {
            statusText += ' <span style="color:#66ff99">(All players finished!)</span>';
        }
    } else {
        // For larger games, show summary
        statusText = `<strong>Player Progress:</strong> ${completedPlayers}/${playerCount} completed`;
    }
    
    statusElement.innerHTML = statusText;
}

function trackModeratorLeaderboardUpdates() {
    // Get leaderboard element
    const leaderboard = document.getElementById('arcade-leaderboard');
    if (!leaderboard) return;
    
    // Create mutation observer to detect changes
    const observer = new MutationObserver(() => {
        // Only track updates if moderator screen is active and game is initialized
        if (isModeratorScreenActive() && moderatorInactivity.isGameActive) {
            moderatorInactivity.lastLeaderboardUpdate = Date.now();
            
            // If countdown is active, cancel it since we have activity
            if (moderatorInactivity.isCountingDown) {
                cancelModeratorCountdown();
            }
        }
    });
    
    // Start observing
    observer.observe(leaderboard, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        characterData: true
    });
}

function startModeratorCountdown() {
    // Only proceed if on moderator screen and game is active
    if (!isModeratorScreenActive() || !moderatorInactivity.isGameActive) {
        return;
    }
    
    // ADDED: Check if we need to prevent inactivity timer
    const playerCount = currentArcadeSession.participants.length;
    
    if (playerCount <= 3) {
        // For small games (1-3 players), check if all players have reached word goal
        const allReachedGoal = currentArcadeSession.participants.every(player => 
            player.wordsCompleted >= currentArcadeSession.wordGoal
        );
        
        // If not all players have reached their goals, don't start countdown
        if (!allReachedGoal) {
            console.log("Inactivity timer prevented: not all players have reached their word goals yet");
            // Reset the timer state to allow activity to continue
            moderatorInactivity.lastLeaderboardUpdate = Date.now();
            return;
        }
    }
    
    // Continue with normal countdown if we passed the check
    moderatorInactivity.isCountingDown = true;
    
    // Show the overlay
    const overlay = document.querySelector('.moderator-inactivity-overlay');
    if (overlay) overlay.classList.add('visible');
    
    // Initialize countdown
    let secondsLeft = 5;
    const timerDisplay = overlay.querySelector('.moderator-countdown-timer');
    const progressBar = overlay.querySelector('.moderator-countdown-bar');
    
    // Update initial display
    timerDisplay.textContent = secondsLeft;
    progressBar.style.transform = 'scaleX(1)';
    
    // Start countdown
    moderatorInactivity.countdownTimer = setInterval(() => {
        // Stop if we're no longer on the moderator screen
        if (!isModeratorScreenActive()) {
            cancelModeratorCountdown();
            return;
        }
        
        secondsLeft--;
        
        // Update display
        timerDisplay.textContent = secondsLeft;
        progressBar.style.transform = `scaleX(${secondsLeft / 5})`;
        
        // Check if countdown is complete
        if (secondsLeft <= 0) {
            clearInterval(moderatorInactivity.countdownTimer);
            handleModeratorCountdownComplete();
        }
    }, 1000);
}

function cancelModeratorCountdown() {
    // Hide overlay
    const overlay = document.querySelector('.moderator-inactivity-overlay');
    if (overlay) overlay.classList.remove('visible');
    
    // Reset state
    moderatorInactivity.isCountingDown = false;
    if (moderatorInactivity.countdownTimer) {
        clearInterval(moderatorInactivity.countdownTimer);
        moderatorInactivity.countdownTimer = null;
    }
    
    // Restart inactivity monitoring if still on moderator screen
    if (isModeratorScreenActive() && moderatorInactivity.isGameActive) {
        resetModeratorInactivityTimer();
    }
}

function handleModeratorCountdownComplete() {
   // Skip if celebration already triggered
   if (currentArcadeSession.celebrationTriggered) {
       return;
   }
   
   // Check if we have podium winners
   const completedPlayers = currentArcadeSession.participants.filter(
       p => p.wordsCompleted >= currentArcadeSession.wordGoal
   );
   
   const hasPodiumWinners = completedPlayers && 
                            completedPlayers.length >= 3;
   
   currentArcadeSession.celebrationTriggered = true;
   
   if (hasPodiumWinners) {
       // Extract podium players
       const podiumPlayers = [];
       
       if (currentArcadeSession.podiumRanks) {
           // Get players by ranks
           Object.entries(currentArcadeSession.podiumRanks).forEach(([username, data]) => {
               const playerData = currentArcadeSession.participants.find(p => p.username === username);
               if (playerData) {
                   podiumPlayers.push({
                       username: playerData.username,
                       wordsCompleted: playerData.wordsCompleted || 0,
                       coins: playerData.coins || 0,
                       rank: data.rank
                   });
               }
           });
           
           // Sort by rank
           podiumPlayers.sort((a, b) => a.rank - b.rank);
       } else {
           // No explicit ranks, sort by words completed
           const sortedPlayers = [...currentArcadeSession.participants]
               .sort((a, b) => b.wordsCompleted - a.wordsCompleted)
               .slice(0, 3);
               
           // Assign ranks
           sortedPlayers.forEach((player, index) => {
               podiumPlayers.push({
                   ...player,
                   rank: index + 1
               });
           });
       }
       
       // Show victory screen
       startLeaderboardCelebration(podiumPlayers);
   } else {
       // No winners yet, just go back to welcome screen
       showScreen('welcome-screen');
   }
}

function cleanupModeratorInactivityMonitoring() {
    // Clean up any references to inactivity monitoring
    // No actual timers to clean up since they're disabled
    console.log("Cleaning up moderator activity monitoring (disabled)");
    
    if (moderatorInactivity) {
        moderatorInactivity.isGameActive = false;
        moderatorInactivity.isInitialized = false;
    }
}

function startLeaderboardCelebration(podiumPlayers) {
    // First, remove any existing inactivity overlay
    const inactivityOverlay = document.querySelector('.moderator-inactivity-overlay');
    if (inactivityOverlay) {
        inactivityOverlay.classList.remove('visible');
    }
    
    // Create celebration overlay if it doesn't exist
    let celebrationOverlay = document.querySelector('.celebration-overlay');
    if (!celebrationOverlay) {
        celebrationOverlay = document.createElement('div');
        celebrationOverlay.className = 'celebration-overlay';
        document.body.appendChild(celebrationOverlay);
    }
    
    // Show the overlay with transition
    setTimeout(() => celebrationOverlay.classList.add('visible'), 10);
    
    // Ensure all podium players have valid ranks (1, 2, 3)
    podiumPlayers.forEach((player, index) => {
        if (!player.rank || player.rank < 1 || player.rank > 3) {
            console.warn(`Fixing invalid rank for player ${player.username}: ${player.rank}`);
            player.rank = index + 1;
        }
    });
    
    // IMPORTANT: Sort players by rank (1st, 2nd, 3rd) before displaying
    podiumPlayers.sort((a, b) => a.rank - b.rank);
    
    // Create winner elements for each player, in correct rank order
    // First place = position 0, Second place = position 1, Third place = position 2
    podiumPlayers.forEach((player, positionIndex) => {
        if (!player || !player.username) return;
        
        // Calculate vertical position based on rank (1st at top)
        const verticalPosition = positionIndex * 190 + 100; // Spacing between entries
        
        // Create winner entry directly without using leaderboard entries
        const winnerEntry = document.createElement('div');
        winnerEntry.className = 'winner-entry celebrating';
        
        // Add appropriate class and label based on rank
        let rankLabel = '';
        let bgColor = '';
        let emojis = [];
        
        if (player.rank === 1) {
            rankLabel = 'CHAMPION';
            bgColor = 'linear-gradient(90deg, rgba(255,215,0,0.8) 0%, rgba(255,215,0,0.9) 100%)';
            emojis = ['👑', '🏆', '🌟'];
            winnerEntry.classList.add('first-place');
        } else if (player.rank === 2) {
            rankLabel = 'RUNNER-UP';
            bgColor = 'linear-gradient(90deg, rgba(192,192,192,0.8) 0%, rgba(169,169,169,0.9) 100%)';
            emojis = ['🥈', '✨'];
            winnerEntry.classList.add('second-place');
        } else {
            rankLabel = 'BRONZE MEDAL';
            bgColor = 'linear-gradient(90deg, rgba(205,127,50,0.8) 0%, rgba(184,115,51,0.9) 100%)';
            emojis = ['🥉', '🎉'];
            winnerEntry.classList.add('third-place');
        }
        
        // Style the winner entry
        winnerEntry.style.cssText = `
            position: fixed;
            left: 50%;
            top: ${verticalPosition}px;
            transform: translateX(-50%);
            width: 80%;
            max-width: 800px;
            height: 80px;
            background: ${bgColor};
            border-radius: 40px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 30px;
            box-shadow: 0 0 20px rgba(255,255,255,0.3);
            z-index: ${103 - positionIndex};
            color: white;
            font-size: 1.5rem;
            text-align: center;
        `;
        
        // Create inner content container for better alignment
        const innerContainer = document.createElement('div');
        innerContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
        `;
        
        // Create rank display
        const rankDisplay = document.createElement('div');
        rankDisplay.style.cssText = `
            font-size: 2rem;
            font-weight: bold;
            color: white;
            min-width: 50px;
            text-align: center;
        `;
        rankDisplay.textContent = player.rank;
        innerContainer.appendChild(rankDisplay);
        
        // Create username display
        const usernameDisplay = document.createElement('div');
        usernameDisplay.style.cssText = `
            font-size: 2rem;
            font-weight: bold;
            flex-grow: 1;
            margin: 0 20px;
            text-align: center;
        `;
        usernameDisplay.textContent = player.username;
        innerContainer.appendChild(usernameDisplay);
        
        // Scores container for words and coins
        const scoresContainer = document.createElement('div');
        scoresContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: flex-end;
            min-width: 200px;
            gap: 20px;
        `;
        
        // Create words completed
        const wordsDisplay = document.createElement('div');
        wordsDisplay.style.cssText = `
            font-size: 2rem;
            font-weight: bold;
            color: #4FC3F7;
        `;
        wordsDisplay.textContent = player.wordsCompleted || 0;
        scoresContainer.appendChild(wordsDisplay);
        
        // Create coins display
        const coinsDisplay = document.createElement('div');
        coinsDisplay.style.cssText = `
            font-size: 2rem;
            font-weight: bold;
            color: #FFD700;
        `;
        coinsDisplay.textContent = player.coins || 0;
        scoresContainer.appendChild(coinsDisplay);
        
        innerContainer.appendChild(scoresContainer);
        winnerEntry.appendChild(innerContainer);
        
        // Add rank label
        const winnerLabel = document.createElement('div');
        winnerLabel.className = 'winner-label';
        winnerLabel.style.cssText = `
            position: absolute;
            top: -25px;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 1.5rem;
            font-weight: bold;
            color: white;
            text-shadow: 0 0 10px rgba(0,0,0,0.5);
        `;
        winnerLabel.textContent = rankLabel;
        winnerEntry.appendChild(winnerLabel);
        
        // Add to the document
        document.body.appendChild(winnerEntry);
        
        // Add emojis animation
        addWinnerEmojis(winnerEntry, emojis, player.rank);
    });
    
    // Start celebration effects
    setTimeout(() => {
        startConfettiShower();
        if (window.arcadeChannel) {
            window.arcadeChannel.send({
                type: 'broadcast',
                event: 'celebration',
                payload: {
                    winners: podiumPlayers.map(p => ({
                        username: p.username,
                        rank: p.rank,
                        wordsCompleted: p.wordsCompleted,
                        coins: p.coins
                    }))
                }
            });
        }
    }, 1500);
    
    // Add home button if it doesn't exist
    let homeButton = document.querySelector('.home-button-container');
    if (!homeButton) {
        homeButton = document.createElement('div');
        homeButton.className = 'home-button-container';
        homeButton.innerHTML = `
            <button class="start-button" onclick="finishCelebrationAndGoHome()">
                Return to Home
            </button>
        `;
        document.body.appendChild(homeButton);
        setTimeout(() => homeButton.classList.add('visible'), 2500);
    }
}

function safeUpdateWordsCompleted(newValue, username) {
  if (!username) return false;
  
  const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === username);
  if (playerIndex === -1) return false;
  
  const player = currentArcadeSession.participants[playerIndex];
  const currentValue = player.wordsCompleted || 0;
  
  // Only update if the new value is higher than current value
  if (newValue < currentValue) {
    console.warn(`Prevented progress reset for ${username}: ${currentValue} → ${newValue}`);
    return false;
  }
  
  player.wordsCompleted = newValue;
  return true;
}

function addWinnerEmojis(element, emojis, rank) {
    setTimeout(() => {
        // Create fixed emojis that don't overlap with winner entries
        emojis.forEach((emoji, index) => {
            const emojiElement = document.createElement('div');
            emojiElement.className = 'celebration-emoji';
            emojiElement.textContent = emoji;
            
            // Position in fixed locations around the screen edges
            let x, y, size;
            const baseSize = 2.5;
            
            // Calculate offset to avoid overlap
            if (rank === 1) {
                // First place: top area
                size = baseSize + 0.5;
                if (index % 2 === 0) {
                    // Left side
                    x = 5 + (index * 3) + '%';
                    y = 5 + (index * 2) + '%';
                } else {
                    // Right side
                    x = 95 - (index * 3) + '%';
                    y = 5 + (index * 2) + '%';
                }
            } else if (rank === 2) {
                // Second place: sides
                size = baseSize;
                if (index % 2 === 0) {
                    // Left side  
                    x = 5 + '%';
                    y = 40 + (index * 5) + '%';
                } else {
                    // Right side
                    x = 95 + '%';
                    y = 40 + (index * 5) + '%';
                }
            } else {
                // Third place: bottom
                size = baseSize - 0.5;
                if (index % 2 === 0) {
                    // Left bottom
                    x = 15 + (index * 5) + '%';
                    y = 90 + '%';
                } else {
                    // Right bottom
                    x = 85 - (index * 5) + '%';
                    y = 90 + '%';
                }
            }
            
            emojiElement.style.fontSize = `${size}rem`;
            emojiElement.style.left = x;
            emojiElement.style.top = y;
            emojiElement.style.zIndex = 300;
            emojiElement.style.animationDelay = `${1.8 + index * 0.3}s`;
            
            document.body.appendChild(emojiElement);
        });
    }, 1800);
}

function startConfettiShower() {
    // Colors for confetti
    const colors = [
        '#FFD700', '#FF1493', '#00BFFF', '#7CFC00', '#FF4500', 
        '#9400D3', '#FF8C00', '#1E90FF', '#32CD32', '#FF69B4'
    ];
    
    // Create initial confetti
    createConfettiBatch();
    
    // Continue creating confetti
    const confettiInterval = setInterval(createConfettiBatch, 800);
    
    // Store interval ID globally for cleanup
    window.celebrationConfettiInterval = confettiInterval;
    
    // Function to create a batch of confetti
    function createConfettiBatch() {
        for (let i = 0; i < 60; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            
            // Random properties
            const size = 5 + Math.random() * 15;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const left = Math.random() * 100;
            const delay = Math.random() * 3;
            const duration = 3 + Math.random() * 4;
            const isSquare = Math.random() > 0.5;
            
            confetti.style.width = `${size}px`;
            confetti.style.height = `${size}px`;
            confetti.style.backgroundColor = color;
            confetti.style.left = `${left}vw`;
            confetti.style.animationDuration = `${duration}s`;
            confetti.style.animationDelay = `${delay}s`;
            confetti.style.borderRadius = isSquare ? '0' : '50%';
            
            document.body.appendChild(confetti);
            
            // Remove after animation
            setTimeout(() => {
                confetti.remove();
            }, (duration + delay) * 1000);
        }
    }
}



function setupCelebrationHandler() {
    if (!window.arcadeChannel) return;
    
    window.arcadeChannel.on('broadcast', { event: 'celebration' }, ({ payload }) => {
        if (!payload.winners) return;
        
        // Check if current player is one of the winners
        if (currentArcadeSession.playerName) {
            const winnerEntry = payload.winners.find(w => w.username === currentArcadeSession.playerName);
            
            if (winnerEntry) {
                // Show personal victory celebration
                showPersonalVictoryCelebration(winnerEntry.rank);
            }
        }
    });
}

function showPersonalVictoryCelebration(rank) {
    // Don't show if already celebrating
    if (currentArcadeSession.winnerScreenShown) return;
    currentArcadeSession.winnerScreenShown = true;
    
    // Create celebration screen
    const overlay = document.createElement('div');
    overlay.className = 'personal-victory-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 2000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.5s ease;
    `;
    
    // Define content based on rank
    const rankContent = {
        1: {
            title: "🏆 CHAMPION! 🏆",
            message: "Incredible! You've claimed the top spot!",
            emoji: "👑",
            color: "var(--gold)"
        },
        2: {
            title: "🥈 RUNNER UP! 🥈",
            message: "Amazing job! You've secured second place!",
            emoji: "⭐",
            color: "var(--silver)"
        },
        3: {
            title: "🥉 BRONZE MEDALIST! 🥉",
            message: "Well done! You've earned third place!",
            emoji: "🌟",
            color: "var(--bronze)"
        }
    };
    
    const content = rankContent[rank] || {
        title: "GREAT PERFORMANCE!",
        message: "You've completed the challenge!",
        emoji: "🎉",
        color: "var(--accent)"
    };
    
    overlay.innerHTML = `
        <div style="font-size: 8rem; margin-bottom: 1rem;">${content.emoji}</div>
        <h1 style="color: ${content.color}; font-size: 3rem; margin-bottom: 1rem;">${content.title}</h1>
        <p style="font-size: 1.5rem; margin-bottom: 2rem; text-align: center; max-width: 80%;">
            ${content.message}
        </p>
        <div style="margin: 2rem 0; display: flex; gap: 2rem;">
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; color: var(--text); opacity: 0.8;">YOUR RANK</div>
                <div style="font-size: 3rem; color: ${content.color};">${rank}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; color: var(--text); opacity: 0.8;">WORDS COMPLETED</div>
                <div style="font-size: 3rem; color: var(--text);">${currentGame.wordsCompleted || 0}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; color: var(--text); opacity: 0.8;">COINS EARNED</div>
                <div style="font-size: 3rem; color: var(--gold);">${currentGame.coins || 0}</div>
            </div>
        </div>
        <button class="start-button" style="margin-top: 2rem; padding: 1rem 2rem;" onclick="closePersonalVictory()">
            Continue
        </button>
    `;
    
    document.body.appendChild(overlay);
    
    // Fade in
    setTimeout(() => {
        overlay.style.opacity = '1';
        
        // Start player confetti
        startPlayerConfetti();
    }, 100);
}

function startPlayerConfetti() {
    // Colors for player confetti
    const colors = [
        '#FFD700', '#FF1493', '#00BFFF', '#7CFC00', '#FF4500',
        '#9400D3', '#FF8C00', '#1E90FF', '#32CD32', '#FF69B4'
    ];
    
    function createPlayerConfettiBatch() {
        for (let i = 0; i < 40; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'player-confetti';
            confetti.style.cssText = `
                position: fixed;
                width: ${5 + Math.random() * 10}px;
                height: ${5 + Math.random() * 10}px;
                background-color: ${colors[Math.floor(Math.random() * colors.length)]};
                top: -20px;
                left: ${Math.random() * 100}vw;
                opacity: 1;
                z-index: 2001;
                border-radius: ${Math.random() > 0.5 ? '0' : '50%'};
                animation: confettiFall ${3 + Math.random() * 3}s linear ${Math.random() * 2}s forwards;
            `;
            
            document.body.appendChild(confetti);
            
            // Remove after animation
            setTimeout(() => {
                confetti.remove();
            }, 5000);
        }
    }
    
    // Initial batch
    createPlayerConfettiBatch();
    
    // Continue creating batches
    const interval = setInterval(createPlayerConfettiBatch, 1000);
    
    // Store for cleanup
    window.playerConfettiInterval = interval;
    
    // Stop after 10 seconds
    setTimeout(() => {
        clearInterval(interval);
    }, 10000);
}

function closePersonalVictory() {
    if (window.playerConfettiInterval) {
      clearInterval(window.playerConfettiInterval);
    }
    
    document.querySelectorAll(".player-confetti").forEach(el => el.remove());
    
    const overlay = document.querySelector(".personal-victory-overlay");
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        
        // Update stats before exiting
        updatePlayerStatsAfterArcade().then(() => {
          // Call exitArcade to properly clean up
          exitArcade();
        });
      }, 500);
    }
  }


// REPLACE: Just the handleCustomLevelCompletion function
function handleCustomLevelCompletion() {
    clearTimer();
    
    console.log("Custom level completion: Level " + customGameState.currentLevel);
    console.log("Words count in list: " + customGameState.words.length);
    
    const isPerfect = currentGame.streakBonus && currentGame.correctAnswers === currentGame.words.length;
    
    if (isPerfect) {
        const bonus = currentGame.firstAttempt ? 5 : 3;
        CoinsManager.updateCoins(bonus).then(() => {
            pulseCoins(bonus);
            customGameState.wordsCompleted += currentGame.words.length;
            customGameState.completedLevels.add(customGameState.currentLevel);
            
            // Calculate max level for this list size
            const wordCount = customGameState.words.length;
            const maxLevel = wordCount >= 12 ? 9 : 
                             wordCount >= 9 ? 6 : 3;
            
            console.log("Max level for this list: " + maxLevel);
            console.log("Current level: " + customGameState.currentLevel);
            
            // CRITICAL FIX: If this is level 3 and we have 6 or fewer words, show completion
            if (customGameState.currentLevel === 3 && wordCount <= 6) {
                console.log("Level 3 completed with 6 or fewer words - showing completion");
                setTimeout(() => showCustomCompletionScreen(), 1500);
                return;
            }
            
            // CRITICAL FIX: If this is level 6 and we have 7-9 words, show completion
            if (customGameState.currentLevel === 6 && wordCount <= 9) {
                console.log("Level 6 completed with 7-9 words - showing completion");
                setTimeout(() => showCustomCompletionScreen(), 1500);
                return;
            }
            
            // CRITICAL FIX: If this is level 9 and we have 10+ words, show completion
            if (customGameState.currentLevel === 9 && wordCount >= 10) {
                console.log("Level 9 completed with 10+ words - showing completion");
                setTimeout(() => showCustomCompletionScreen(), 1500);
                return;
            }
            
            // CRITICAL FIX: If this is the max level for any list size, show completion
            if (customGameState.currentLevel >= maxLevel) {
                console.log("Max level reached - showing completion");
                setTimeout(() => showCustomCompletionScreen(), 1500);
                return;
            }
            
            const nextLevel = customGameState.currentLevel + 1;
            const nextLevelData = customGameState.getWordsForLevel(nextLevel);
            
            const screenRect = document.getElementById('question-screen').getBoundingClientRect();
            createParticles(screenRect.left + screenRect.width / 2, screenRect.top + screenRect.height / 2);
            
            if (!nextLevelData || nextLevelData.words.length === 0) {
                console.log("No valid data for next level - showing completion");
                setTimeout(() => showCustomCompletionScreen(), 1500);
            } else {
                console.log("Moving to next level: " + nextLevel);
                customGameState.currentLevel = nextLevel;
                setTimeout(() => startCustomLevel(nextLevel), 1500);
            }
        });
    } else {
        // If not perfect, restart the same level
        console.log("Level not completed perfectly - restarting level " + customGameState.currentLevel);
        setTimeout(() => startCustomLevel(customGameState.currentLevel), 1500);
    }
    
    saveProgress();
}

function showCustomCompletionScreen() {
    const overlay = document.createElement('div');
    overlay.className = 'completion-overlay';
    
    const coinsEarned = gameState.coins - customGameState.startCoins;
    
    overlay.innerHTML = `
        <div class="completion-content">
            <h2>Practice Complete!</h2>
            <div class="completion-stats">
                <div class="stat-item">
                    <i class="fas fa-book"></i>
                    <span>Words Practiced: ${customGameState.wordsCompleted}</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-coins"></i>
                    <span>Coins Earned: ${coinsEarned}</span>
                </div>
            </div>
            <button onclick="exitCustomPractice()" class="victory-button">
                Continue
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}


async function handleCustomPracticeAnswer(e, t = false) {
  if (e) {
    // Increment index after correct answer
    currentGame.currentIndex++;
    
    if (!t) {
      let coinReward = 0;
      const timeBonus = awardTimeBonus();
      if (timeBonus > 0) {
        coinReward += timeBonus;
        pulseCoins(timeBonus);
      }
      
      if (currentGame.firstAttempt) {
        coinReward += 3;
        pulseCoins(3);
      } else {
        coinReward += 1;
        pulseCoins(1);
      }
      
      try {
        await CoinsManager.updateCoins(coinReward);
        updatePerkButtons();
      } catch (e) {
        console.error("Error updating total coins:", e);
      }
      
      currentGame.correctAnswers++;
      
      if (currentUser && currentUser.status === "premium") {
        const wordIndex = currentGame.currentIndex - 1; // Since we already incremented
        const word = currentGame.isHebrewToEnglish
          ? currentGame.words[wordIndex]
          : currentGame.translations[wordIndex];
        await trackWordEncounter(word, "custom");
      }
    }
  } else {
    currentGame.firstAttempt = false;
    currentGame.streakBonus = false;
    currentGame.wrongStreak++;
    
    try {
      await CoinsManager.updateCoins(-3);
      updatePerkButtons();
    } catch (e) {
      console.error("Error updating coins:", e);
    }
    
    if (currentGame.currentIndex > 0) {
      currentGame.progressLost++;
      currentGame.currentIndex = Math.max(0, currentGame.currentIndex - 1);
    }
    
    if (currentGame.wrongStreak >= 3) {
      showGameOverOverlay();
      document.querySelector(".restart-button").onclick = () => {
        document.querySelector(".failure-overlay").style.display = "none";
        startCustomLevel(currentGame.customLevel);
      }
      return;
    }
  }
  
  // Get current question's correct answer (before loading next)
  const currentCorrectAnswer = currentGame.isHebrewToEnglish
    ? currentGame.words[Math.max(0, currentGame.currentIndex - 1)]
    : currentGame.translations[Math.max(0, currentGame.currentIndex - 1)];
  
  // Highlight correct/wrong answer only for current question
  const allButtons = document.querySelectorAll(".buttons button");
  allButtons.forEach((button) => {
    if (button.textContent === currentCorrectAnswer) {
      button.classList.add("correct");
    } else if (!e && event && event.target && button.textContent === event.target.textContent) {
      button.classList.add("wrong");
    }
  });
  
  updateProgressCircle();
  saveProgress();
  
  // Wait for animation before loading next
  setTimeout(() => {
    // Clear all button classes before loading next question
    allButtons.forEach(btn => {
      btn.classList.remove("correct", "wrong");
    });
    
    if (currentGame.currentIndex < currentGame.words.length) {
      loadNextQuestion();
      updatePerkButtons();
    } else {
      handleCustomLevelCompletion();
    }
  }, 333);
}



function hasExistingProgress() {
    // Check if we have any completed levels or stage progress
    if (gameState.completedLevels.size > 0 || gameState.perfectLevels.size > 0) {
        return true;
    }
    
    // Check if we have unlocked any sets beyond the defaults
    for (let stage = 1; stage <= 5; stage++) {
        const unlockedSets = gameState.unlockedSets[stage];
        // For stage 1, having just the default 9 sets doesn't count as progress
        if (stage === 1 && unlockedSets && unlockedSets.size === 9) {
            continue;
        }
        // For other stages, having more than set 1 unlocked counts as progress
        if (unlockedSets && unlockedSets.size > 1) {
            return true;
        }
    }
    
    // Check localStorage for previously saved progress
    const savedProgress = localStorage.getItem('simploxProgress');
    if (savedProgress) {
        const parsed = JSON.parse(savedProgress);
        if (parsed.completedLevels && parsed.completedLevels.length > 0) {
            return true;
        }
        if (parsed.perfectLevels && parsed.perfectLevels.length > 0) {
            return true;
        }
    }
    
    return false;
}

function findFurthestLevelInStage(stage) {
    if (!gameState.unlockedSets[stage]) return null;
    
    const sets = Array.from(gameState.unlockedSets[stage]).sort((a, b) => b - a); // Sort descending
    
    for (const set of sets) {
        const setKey = `${stage}_${set}`;
        if (!gameState.unlockedLevels[setKey]) continue;
        
        const levels = Array.from(gameState.unlockedLevels[setKey]).sort((a, b) => b - a); // Sort descending
        
        for (const level of levels) {
            const levelKey = `${stage}_${set}_${level}`;
            // If level is not completed, this is the furthest progress
            if (!gameState.perfectLevels.has(levelKey) && !gameState.completedLevels.has(levelKey)) {
                return { stage, set, level };
            }
        }
    }
    
    // If all levels in all sets are completed, return the first level of the next set
    // or first level of next stage if this was the last set
    const stageConfig = gameStructure.stages[stage - 1];
    const currentSetIndex = sets[0];
    
    if (currentSetIndex < stageConfig.numSets) {
        // Next set in current stage
        return { stage, set: currentSetIndex + 1, level: 1 };
    } else if (stage < 5) {
        // First set of next stage
        return { stage: stage + 1, set: 1, level: 1 };
    }
    
    // Fallback: return last known position
    return { stage, set: sets[0], level: 1 };
}

function showGradeLevelSelector() {
    // Create overlay and modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(5px);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    const modal = document.createElement('div');
    modal.className = 'grade-level-modal';
    modal.style.cssText = `
        background: var(--glass);
        backdrop-filter: blur(10px);
        border-radius: 20px;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        text-align: center;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.1);
    `;
    
    modal.innerHTML = `
        <h2 style="color: var(--gold); margin-bottom: 1.5rem;">What grade level are you?</h2>
        <p style="margin-bottom: 2rem; opacity: 0.9;">Choose your education level for the best learning experience:</p>
        <div class="grade-options" style="display: flex; flex-direction: column; gap: 1rem;">
            <button class="grade-option" data-stage="2" style="padding: 1rem; border-radius: 10px; background: rgba(255,255,255,0.1); border: none; color: var(--text); cursor: pointer; transition: all 0.3s ease;">
                <i class="fas fa-school" style="margin-right: 0.5rem;"></i> Elementary School
            </button>
            <button class="grade-option" data-stage="3" style="padding: 1rem; border-radius: 10px; background: rgba(255,255,255,0.1); border: none; color: var(--text); cursor: pointer; transition: all 0.3s ease;">
                <i class="fas fa-graduation-cap" style="margin-right: 0.5rem;"></i> Junior High School
            </button>
            <button class="grade-option" data-stage="4" style="padding: 1rem; border-radius: 10px; background: rgba(255,255,255,0.1); border: none; color: var(--text); cursor: pointer; transition: all 0.3s ease;">
                <i class="fas fa-user-graduate" style="margin-right: 0.5rem;"></i> High School
            </button>
            <button class="grade-option" data-stage="5" style="padding: 1rem; border-radius: 10px; background: rgba(255,255,255,0.1); border: none; color: var(--text); cursor: pointer; transition: all 0.3s ease;">
                <i class="fas fa-university" style="margin-right: 0.5rem;"></i> University
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.appendChild(modal);
    
    // Add hover effect
    const buttons = modal.querySelectorAll('.grade-option');
    buttons.forEach(button => {
        button.addEventListener('mouseover', () => {
            button.style.background = 'rgba(255,255,255,0.2)';
            button.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.background = 'rgba(255,255,255,0.1)';
            button.style.transform = 'translateY(0)';
        });
        
        button.addEventListener('click', () => {
            const stage = parseInt(button.dataset.stage);
            localStorage.setItem('preferredStage', stage);
            overlay.remove();
            
            // Set current stage and start first level
            gameState.currentStage = stage;
            gameState.currentSet = 1;
            startLevel(1);
        });
    });
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

// REPLACE showBossDefeatEffect function
function showBossDefeatEffect() {
    console.log('Starting boss defeat effect sequence');
    
    if (currentGame.bossDefeatedEffectShown) {
        console.log('Boss defeat effect already shown, skipping');
        return;
    }
    
    // Set flag to prevent multiple executions
    currentGame.bossDefeatedEffectShown = true;
    
    // First determine if the coin reward needs to be applied
    let coinRewardNeeded = !currentGame.bossRewardApplied;
    currentGame.bossRewardApplied = true;
    
    // Get the original coin count
    const originalCoins = gameState.coins;
    let targetCoins = originalCoins;
    
    // Apply coin reward if needed
    if (coinRewardNeeded) {
        targetCoins = originalCoins;
        console.log(`Adding 100 coins: ${originalCoins} -> ${targetCoins}`);
        gameState.coins = targetCoins;
        saveProgress();
    } else {
        console.log('Coin reward already applied, skipping');
    }
    
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
                    
                    const coinIcon = coinsContainer.querySelector('.coin-icon');
                    const coinCount = coinsContainer.querySelector('.coin-count');
                    
                    if (coinCount) {
                        // Make it prominent
                        coinsContainer.style.transform = 'scale(1.2)';
                        coinsContainer.style.transition = 'transform 0.3s ease';
                        
                        // IMPORTANT: Start with original value 
                        coinCount.textContent = originalCoins;
                        coinCount.style.color = 'white';
                        
                        // Animate coin increase
                        setTimeout(() => {
                            // Custom animation
                            const steps = 60;
                            const stepDelay = 2000 / steps;
                            let currentStep = 0;
                            
                            const animateCoins = () => {
                                if (currentStep <= steps) {
                                    const progress = currentStep / steps;
                                    const currentValue = Math.round(originalCoins + (targetCoins - originalCoins) * progress);
                                    
                                    coinCount.textContent = currentValue;
                                    coinCount.style.color = 'var(--gold)';
                                    coinCount.style.textShadow = '0 0 10px var(--gold)';
                                    
                                    currentStep++;
                                    setTimeout(animateCoins, stepDelay);
                                } else {
                                    // Animation complete
                                    coinCount.textContent = targetCoins;
                                    
                                    // Maintain emphasis for a while
                                    setTimeout(() => {
                                        coinCount.style.color = 'white';
                                        coinCount.style.textShadow = 'none';
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
                        }, 100);
                    }
                }
            }, 500);
            
            // Show victory notification after animations
            setTimeout(() => {
                console.log('Showing victory notification');
                showBossVictoryNotification();
            }, 5000);
        } else {
            setTimeout(() => {
                showBossVictoryNotification();
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

function showBossVictoryNotification() {
    // Just update displays without adding coins
    updateAllCoinDisplays();
    
    const modal = document.createElement('div');
    modal.className = 'arcade-completion-modal';
    modal.innerHTML = `
    <div class="completion-modal-content">
      <h2 style="color: var(--gold)">Boss Defeated!</h2>
      <p style="font-size: 1.2rem; margin: 1rem 0;">Congratulations! You've conquered this challenge!</p>
      
      <div class="completion-stats">
        <div class="stat-item">
          <i class="fas fa-skull" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
          <span style="display: block; margin-bottom: 0.25rem;">Boss Defeated</span>
          <strong style="font-size: 1.5rem;">✓</strong>
        </div>
        <div class="stat-item">
          <i class="fas fa-coins" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
          <span style="display: block; margin-bottom: 0.25rem;">Bonus Coins</span>
          <strong style="font-size: 1.5rem;">100</strong>
        </div>
        <div class="stat-item">
          <i class="fas fa-unlock" style="font-size: 2rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
          <span style="display: block; margin-bottom: 0.25rem;">New Set</span>
          <strong style="font-size: 1.5rem;">Unlocked</strong>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-around; margin-top: 2rem; gap: 1rem;">
        <button onclick="handleBossVictoryContinue()" class="start-button" style="
          background: var(--accent);
          color: var(--text);
          border: none;
          padding: 1rem 2rem;
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
          padding: 1rem 2rem;
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
      
      // ADD PREMIUM CHECK HERE
      const nextSet = gameState.currentSet + 1;
      const userStatus = currentUser ? currentUser.status : "unregistered";
      
      // If we're moving beyond Set 1 in Stages 2-5 and user is not premium, show upgrade prompt
      if (gameState.currentStage >= 2 && nextSet > 1 && userStatus !== "premium") {
        console.log("Non-premium user attempted to access premium set, showing upgrade prompt");
        showScreen("welcome-screen");
        setTimeout(() => {
          showUpgradePrompt();
        }, 500);
        return;
      }
      
      // Continue with normal progression for premium users
      gameState.currentSet = nextSet;
      gameState.currentLevel = 1;
      updateAllCoinDisplays();
      
      setTimeout(() => {
        console.log("Starting next level");
        if (bgTransition && bgTransition.parentNode) {
          bgTransition.parentNode.removeChild(bgTransition);
        }
        startLevel(1);
      }, 500);
    }, 300);
  }
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
      
      unlockNextSet();
      
      // ADD PREMIUM CHECK HERE TOO
      const nextSet = gameState.currentSet + 1;
      const userStatus = currentUser ? currentUser.status : "unregistered";
      
      // Still update the gameState even when going to welcome screen, but show upgrade if needed
      if (gameState.currentStage >= 2 && nextSet > 1 && userStatus !== "premium") {
        showUpgradePrompt();
      } else {
        gameState.currentSet = nextSet;
        gameState.currentLevel = 1;
      }
      
      saveProgress();
      showScreen("welcome-screen");
    }, 300);
  }
}



createBossStyleSheet();

/**
 * CustomListsManager - Manages all custom word lists operations
 */
 const CustomListsManager = {
  lists: [],
  currentList: null,

  /**
   * Initialize the lists manager
   */
  async initialize() {
    try {
      if (currentUser) {
        await this.loadFromSupabase();
      } else {
        this.loadFromLocalStorage();
      }

      if (!this.lists || this.lists.length === 0) {
        console.log("No lists found, initializing empty array");
        this.lists = [];
      }
    } catch (error) {
      console.error("Custom Lists Initialization Error:", error);
      this.lists = [];
    }
  },

  /**
   * Load lists from Supabase database
   */
  async loadFromSupabase() {
    try {
      const { data, error } = await supabaseClient
        .from("custom_lists")
        .select("*")
        .or(`user_id.eq.${currentUser.id},shared_with.cs.{${currentUser.id}}`);

      if (error) throw error;

      this.lists = data.map(list => ({
        id: list.id,
        name: list.name,
        words: list.words || [],
        translations: list.translations || [],
        isShared: list.is_shared,
        sharedBy: list.shared_by,
        userId: list.user_id,
        createdAt: list.created_at
      }));
    } catch (error) {
      console.error("Error loading lists from Supabase:", error);
      this.lists = [];
    }
  },

  /**
   * Load lists from local storage
   */
  loadFromLocalStorage() {
    try {
      const storedLists = localStorage.getItem("simploxCustomLists");
      this.lists = storedLists ? JSON.parse(storedLists) : [];
      console.log("Loaded lists from localStorage:", this.lists.length);
    } catch (error) {
      console.error("Error loading lists from localStorage:", error);
      this.lists = [];
    }
  },

  /**
   * Save a list to storage
   * @param {Object} list - The list to save
   * @returns {Object|null} - The saved list or null if failed
   */
  async save(list) {
    if (!list) return null;

    return currentUser ? 
      await this.saveToSupabase(list) : 
      this.saveToLocalStorage(list);
  },

  /**
   * Save a list to Supabase
   * @param {Object} list - The list to save
   * @returns {Object|null} - The saved list or null if failed
   */
  async saveToSupabase(list) {
    try {
      const listData = {
        name: list.name,
        words: list.words || [],
        translations: list.translations || [],
        user_id: currentUser.id
      };

      // Update existing list
      if (list.id && typeof list.id === 'string' && list.id.length === 36) {
        const { data, error } = await supabaseClient
          .from("custom_lists")
          .update(listData)
          .eq("id", list.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } 
      // Create new list
      else {
        const { data, error } = await supabaseClient
          .from("custom_lists")
          .insert(listData)
          .select()
          .single();

        if (error) throw error;

        // Update lists array
        const index = this.lists.findIndex(item => 
          item.id === list.id || (item.tempId && item.tempId === list.tempId)
        );

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
      console.error("Error saving list to Supabase:", error);
      return null;
    }
  },

  /**
   * Save a list to local storage
   * @param {Object} list - The list to save
   * @returns {Object|null} - The saved list or null if failed
   */
  saveToLocalStorage(list) {
    try {
      const newList = {
        ...list,
        id: list.id || Date.now(),
        tempId: list.tempId || Date.now()
      };

      const index = this.lists.findIndex(item => 
        item.id === list.id || (item.tempId && item.tempId === list.tempId)
      );

      if (index !== -1) {
        this.lists[index] = newList;
      } else {
        this.lists.push(newList);
      }

      localStorage.setItem("simploxCustomLists", JSON.stringify(this.lists));
      return newList;
    } catch (error) {
      console.error("Error saving list to localStorage:", error);
      return null;
    }
  },

  /**
   * Delete a list
   * @param {string|number} id - The list ID to delete
   * @returns {boolean} - Success status
   */
  async delete(id) {
    if (!currentUser) {
      // For guest users, delete from local storage
      this.lists = this.lists.filter(list => list.id !== id);
      localStorage.setItem("simploxCustomLists", JSON.stringify(this.lists));
      return true;
    }

    try {
      // For logged in users, delete from Supabase
      if (typeof id === 'string' && id.length === 36) {
        const { error } = await supabaseClient
          .from("custom_lists")
          .delete()
          .eq("id", id);

        if (error) throw error;
      }

      this.lists = this.lists.filter(list => list.id !== id);
      return true;
    } catch (error) {
      console.error("Error deleting list from Supabase:", error);
      return false;
    }
  },

  /**
   * Share a list with another user
   * @param {string|number} listId - The list ID to share
   * @param {string} targetUserId - The user ID to share with
   * @returns {boolean} - Success status
   */
  async share(listId, targetUserId) {
    if (!currentUser) return false;

    try {
      const listIdStr = String(listId);
      const list = this.lists.find(list => String(list.id) === listIdStr);
      
      if (!list) {
        console.error("List not found for sharing:", listIdStr);
        return false;
      }

      console.log("Sharing list:", list.name);

      const { data, error } = await supabaseClient.rpc(
        "insert_shared_list",
        {
          p_user_id: targetUserId,
          p_name: `${list.name} (Shared by ${currentUser.user_metadata?.username || "User"})`,
          p_words: list.words || [],
          p_translations: list.translations || [],
          p_is_shared: true,
          p_local_id: Date.now(),
          p_shared_with: [targetUserId],
          p_shared_by: currentUser.id
        }
      );

      if (error) {
        console.error("Error sharing list via RPC:", error);
        return false;
      }

      console.log("List shared successfully:", data);
      return true;
    } catch (error) {
      console.error("Error in share method:", error);
      return false;
    }
  },

  /**
   * Get the limits for lists based on user status
   * @returns {Object} - Limits object
   */
  getListLimits() {
    if (!currentUser) {
      return {
        maxLists: 3,
        maxWords: 10,
        maxPlays: 5,
        canShare: false,
        playDisplay: "5"
      };
    }

    switch (currentUser.status || "free") {
      case "premium":
        return {
          maxLists: 30,
          maxWords: 50,
          maxPlays: Infinity,
          canShare: true,
          playDisplay: "∞"
        };
      case "pending":
        return {
          maxLists: 30,
          maxWords: 50,
          maxPlays: Infinity,
          canShare: false,
          playDisplay: "∞"
        };
      case "free":
        return {
          maxLists: 5,
          maxWords: 20,
          maxPlays: 10,
          canShare: false,
          playDisplay: "10"
        };
      default:
        return {
          maxLists: 3,
          maxWords: 10,
          maxPlays: 5,
          canShare: false,
          playDisplay: "5"
        };
    }
  },

  /**
   * Check if user can create more lists
   * @returns {boolean} - True if more lists can be created
   */
  canCreateMoreLists() {
    const limits = this.getListLimits();
    return this.lists.length < limits.maxLists;
  },

  /**
   * Validate if a list can be practiced
   * @param {Object} list - The list to validate
   * @returns {Object} - Validation result with valid flag and message
   */
  validateListForPractice: (list) => {
    if (!list || !list.words || !list.translations) {
      return { valid: false, message: "Invalid list format" };
    }
    
    if (list.words.length < 6) {
      return { valid: false, message: "Lists need at least 6 words to practice" };
    }
    
    return { valid: true };
  }
};

/**
 * Custom game state for practice mode
 */
const customGameState = {
  isCustomPractice: false,
  currentList: null,
  currentLevel: 1,
  levelData: null,
  words: [],
  translations: [],
  wordsCompleted: 0,
  correctStreak: 0,
  wrongStreak: 0,
  startCoins: 0,
  completedLevels: new Set(),

  /**
   * Reset the custom game state
   */
  reset() {
    this.isCustomPractice = false;
    this.currentList = null;
    this.currentLevel = 1;
    this.levelData = null;
    this.words = [];
    this.translations = [];
    this.wordsCompleted = 0;
    this.correctStreak = 0;
    this.wrongStreak = 0;
    this.startCoins = 0;
    this.completedLevels = new Set();
  },

  /**
   * Initialize custom game from a list
   * @param {Object} list - The list to initialize from
   * @returns {boolean} - Success status
   */
  initializeFromList(list) {
    if (!list || !list.words || !list.translations) {
      console.error("Invalid list provided to custom game:", list);
      return false;
    }

    this.reset();
    this.isCustomPractice = true;
    this.currentList = list;
    this.words = [...list.words];
    this.translations = [...list.translations];
    this.startCoins = gameState.coins;
    this.currentLevel = 1;
    return true;
  },

  /**
   * Get words for a specific level
   * @param {number} level - The level number
   * @returns {Object|null} - Level data or null if invalid
   */
  getWordsForLevel(level) {
    if (!this.words.length) return null;

    // Determine maximum level based on word count
    const maxLevels = this.words.length >= 12 ? 9 : 
                      this.words.length >= 9 ? 6 : 3;
    
    if (level > maxLevels) return null;

    // Define level structure based on word count and level number
    const levelConfig = {
      1: { start: 0, count: Math.min(3, this.words.length), isTest: false },
      2: { start: 3, count: Math.min(3, Math.max(0, this.words.length - 3)), isTest: false },
      3: { start: 0, count: Math.min(6, this.words.length), isTest: true },
      4: { start: 6, count: Math.min(3, Math.max(0, this.words.length - 6)), isTest: false },
      5: { start: 9, count: Math.min(3, Math.max(0, this.words.length - 9)), isTest: false },
      6: { start: 6, count: Math.min(6, Math.max(0, this.words.length - 6)), isTest: true },
      7: { start: 12, count: Math.min(4, Math.max(0, this.words.length - 12)), isTest: false },
      8: { start: 16, count: Math.min(4, Math.max(0, this.words.length - 16)), isTest: false },
      9: { start: 12, count: Math.min(8, Math.max(0, this.words.length - 12)), isTest: true }
    };

    const config = levelConfig[level] || levelConfig[1];
    
    // If no words available for this level, try the next one
    if (config.count <= 0) {
      return this.getWordsForLevel(level + 1);
    }

    this.levelData = {
      words: this.words.slice(config.start, config.start + config.count),
      translations: this.translations.slice(config.start, config.start + config.count),
      isTest: config.isTest,
      isFinal: level === maxLevels
    };

    return this.levelData;
  }
};

/**
 * Process custom words from input field
 */
function processCustomWords() {
  const inputField = document.getElementById("custom-word-input");
  const resultsDiv = document.getElementById("translation-results");
  const wordList = document.getElementById("word-translation-list");
  const limits = CustomListsManager.getListLimits();
  
  const inputText = inputField.value.trim();
  if (!inputText) {
    showNotification("Please enter at least one word.", "error");
    return;
  }
  
  // Split input by commas or newlines
  let words = inputText.includes(',') ? 
    inputText.split(',').map(word => word.trim()) : 
    inputText.split(/\s+/).filter(word => word.length > 0);
  
  // Handle phrases (words with spaces)
  words = words.map(word => word.includes(' ') ? [word] : word.split(/\s+/)).flat();
  
  // Apply word limit based on user status
  const maxWords = currentUser ? limits.maxWords : 10;
  if (words.length > maxWords) {
    showNotification(`Maximum ${maxWords} words allowed.`, "error");
    words = words.slice(0, maxWords);
  }
  
  // Clear previous word list
  wordList.innerHTML = "";
  resultsDiv.style.display = "block";
  
  // Create word items with translations
  words.forEach(word => {
    const wordItem = createWordItem(word, findTranslation(word));
    wordList.appendChild(wordItem);
    initializeDragAndDrop(wordItem);
  });
  
  makeWordListDraggable();
}

/**
 * Find a translation for a given word
 * @param {string} word - The word to translate
 * @returns {string} - The translation or empty string
 */
function findTranslation(word) {
  // Look through vocabulary sets for matching word
  for (const setKey in vocabularySets) {
    const index = vocabularySets[setKey].words.indexOf(word.toLowerCase());
    if (index !== -1) {
      return vocabularySets[setKey].translations[index];
    }
  }
  return "";
}

function createWordItem(word, translation) {
  const item = document.createElement("div");
  item.className = "word-translation-item";
  item.draggable = true;
  item.innerHTML = `
    <div class="drag-handle">
      <i class="fas fa-grip-vertical"></i>
    </div>
    <span class="source-word" contenteditable="true">${word}</span>
    <input type="text" class="target-word" value="${translation}" placeholder="Hebrew translation">
    <button class="delete-word-btn" onclick="deleteWord(this)">
      <i class="fas fa-times" style="font-size: 12px;"></i>
    </button>
  `;
  
  const deleteBtn = item.querySelector(".delete-word-btn");
  if (deleteBtn) {
    // Position the delete button at the right edge of the item
    deleteBtn.style.position = "absolute";
    deleteBtn.style.right = "10px";
    deleteBtn.style.top = "50%";
    deleteBtn.style.transform = "translateY(-50%)";
  }
  
  return item;
}

function addNewWord() {
  const wordList = document.getElementById("word-translation-list");
  if (!wordList) return;
  
  const wordItem = document.createElement("div");
  wordItem.className = "word-translation-item";
  wordItem.draggable = true;
  wordItem.innerHTML = `
    <div class="drag-handle">
      <i class="fas fa-grip-vertical"></i>
    </div>
    <span class="source-word" contenteditable="true"></span>
    <input type="text" class="target-word" placeholder="Hebrew translation">
    <button class="delete-word-btn" onclick="deleteWord(this)">❌</button>
  `;
  
  const newItem = wordList.appendChild(wordItem);
  initializeDragAndDrop(newItem);
  
  if (wordList.children.length === 1) {
    makeWordListDraggable();
  }
  
  // Focus on the new word field
  newItem.querySelector(".source-word").focus();
}

function deleteWord(button) {
    if (!button) return;
    
    const wordItem = button.closest(".word-translation-item");
    if (wordItem) {
        wordItem.remove();
    }
}

/**
 * Initialize drag and drop for a word item
 * @param {HTMLElement} element - The element to make draggable
 * @returns {HTMLElement} - The initialized element
 */
function initializeDragAndDrop(element) {
  if (!element) return;
  
  // Clone the element to remove any existing listeners
  const clone = element.cloneNode(true);
  if (element.parentNode) {
    element.parentNode.replaceChild(clone, element);
  }
  
  // The element is now the clone
  element = clone;
  
  element.setAttribute("draggable", "true");
  
  element.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    element.classList.add("dragging");
    event.dataTransfer.setData("text/plain", "");
  });
  
  element.addEventListener("dragend", (event) => {
    event.stopPropagation();
    element.classList.remove("dragging");
  });
  
  // Setup delete button
  const deleteBtn = element.querySelector(".delete-word-btn");
  if (deleteBtn) {
    deleteBtn.onclick = () => deleteWord(deleteBtn);
  }
  
  return element;
}

/**
 * Make the word list draggable
 */
function makeWordListDraggable() {
  const wordList = document.getElementById("word-translation-list");
  if (!wordList) return;
  
  wordList.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggingElement = wordList.querySelector(".dragging");
    if (!draggingElement) return;
    
    const afterElement = getDragAfterElement(wordList, event.clientY);
    if (afterElement) {
      wordList.insertBefore(draggingElement, afterElement);
    } else {
      wordList.appendChild(draggingElement);
    }
  });
  
  // Initialize all existing items
  wordList.querySelectorAll(".word-translation-item").forEach(item => 
    initializeDragAndDrop(item)
  );
}

/**
 * Get the element to insert after when dragging
 * @param {HTMLElement} container - The container element
 * @param {number} y - The Y coordinate
 * @returns {HTMLElement|null} - The element to insert after
 */
function getDragAfterElement(container, y) {
  if (!container) return null;
  
  const draggableElements = [...container.querySelectorAll(".word-translation-item:not(.dragging)")];
  
  if (!draggableElements.length) return null;
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/**
 * Setup keyboard navigation for word list
 */
function setupWordListKeyNavigation() {
  const wordList = document.getElementById("word-translation-list");
  if (!wordList) return;
  
  wordList.addEventListener("keydown", (event) => {
    const wordItem = document.activeElement.closest(".word-translation-item");
    if (!wordItem) return;
    
    let nextElement;
    
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        nextElement = wordItem.previousElementSibling?.querySelector(".source-word");
        break;
      case "ArrowDown":
        event.preventDefault();
        nextElement = wordItem.nextElementSibling?.querySelector(".source-word");
        break;
      case "ArrowRight":
        event.preventDefault();
        nextElement = wordItem.querySelector(".target-word");
        break;
      case "ArrowLeft":
        event.preventDefault();
        nextElement = wordItem.querySelector(".source-word");
        break;
    }
    
    if (nextElement) nextElement.focus();
  });
}

/**
 * Save the current list
 */
async function saveCurrentList() {
  const nameInput = document.getElementById("custom-list-name");
  const wordList = document.getElementById("word-translation-list");
  
  // Get list name (use default if empty)
  const name = nameInput.value.trim() || 
               (CustomListsManager.currentList ? 
                CustomListsManager.currentList.name : 
                `List ${CustomListsManager.lists.length + 1}`);
  
  // Collect words and translations
  const words = [];
  const translations = [];
  
  wordList.querySelectorAll(".word-translation-item").forEach(item => {
    const word = item.querySelector(".source-word").textContent.trim();
    const translation = item.querySelector(".target-word").value.trim();
    
    if (word && translation) {
      words.push(word);
      translations.push(translation);
    }
  });
  
  // Check word limit
  const limits = CustomListsManager.getListLimits();
  if (words.length > limits.maxWords) {
    showNotification(`You can only create lists with up to ${limits.maxWords} words`, "error");
    return;
  }
  
  // Handle list editing vs creation
  let listToSave;
  const isEditing = CustomListsManager.currentList !== null;
  
  if (!isEditing && !CustomListsManager.canCreateMoreLists()) {
    showNotification(`Maximum lists limit reached`, "error");
    return;
  }
  
  if (isEditing) {
    listToSave = {
      ...CustomListsManager.currentList,
      name: name,
      words: words,
      translations: translations
    };
  } else {
    listToSave = {
      tempId: Date.now(),
      name: name,
      words: words,
      translations: translations
    };
  }
  
  // Save the list
  const savedList = await CustomListsManager.save(listToSave);
  
  if (savedList) {
    // Reset form
    nameInput.value = "";
    wordList.innerHTML = "";
    document.getElementById("translation-results").style.display = "none";
    CustomListsManager.currentList = null;
    
    // Refresh lists
    if (currentUser) {
      await CustomListsManager.loadFromSupabase();
    } else {
      CustomListsManager.loadFromLocalStorage();
    }
    
    showNotification("List saved successfully", "success");
    showScreen("custom-practice-screen");
    updateListsDisplay();
  } else {
    showNotification("Failed to save list", "error");
  }
}

function editCustomList(listId) {
    const list = CustomListsManager.lists.find(list => list.id === listId);
    if (!list) return showNotification("List not found", "error");

    // First, show the custom practice screen
    showScreen("custom-practice-screen");
    
    // Set the list name in the input field
    const nameInput = document.getElementById("custom-list-name");
    if (nameInput) {
        nameInput.value = list.name || "";
    }
    
    // Clear and populate the word translation list
    const translationResults = document.getElementById("translation-results");
    const wordTranslationList = document.getElementById("word-translation-list");
    
    if (wordTranslationList) {
        wordTranslationList.innerHTML = "";
        
        // Add each word-translation pair
        if (Array.isArray(list.words)) {
            list.words.forEach((word, index) => {
                const translation = list.translations && index < list.translations.length 
                    ? list.translations[index] 
                    : "";
                
                const wordItem = document.createElement("div");
                wordItem.className = "word-translation-item";
                wordItem.draggable = true;
                wordItem.innerHTML = `
                    <div class="drag-handle">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    <span class="source-word" contenteditable="true">${word}</span>
                    <input type="text" class="target-word" value="${translation}" placeholder="Hebrew translation">
                    <button class="delete-word-btn" onclick="deleteWord(this)">
                        <i class="fas fa-times" style="font-size: 12px;"></i>
                    </button>
                `;
                
                wordTranslationList.appendChild(wordItem);
                initializeDragAndDrop(wordItem);
            });
        }
        
        // Make the list draggable
        makeWordListDraggable();
        
        // Show the translation results
        if (translationResults) {
            translationResults.style.display = "block";
        }
    }
    
    // Set the current list being edited
    CustomListsManager.currentList = list;
}

async function deleteCustomList(id) {
  const success = await CustomListsManager.delete(id);
  
  if (success) {
    showNotification("List deleted successfully", "success");
    updateListsDisplay();
  } else {
    showNotification("Failed to delete list", "error");
  }
}

/**
 * Show the modal to share a list
 * @param {string|number} id - The list ID
 */
function showShareModal(id) {
  console.log("Opening share modal for list:", id);
  
  // Remove existing modal if any
  const existingModal = document.querySelector(".share-modal");
  const existingBackdrop = document.querySelector(".modal-backdrop");
  if (existingModal) existingModal.remove();
  if (existingBackdrop) existingBackdrop.remove();
  
  // Create backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.onclick = closeShareModal;
  document.body.appendChild(backdrop);
  
  // Create modal
  const modal = document.createElement("div");
  modal.className = "share-modal";
  modal.innerHTML = `
    <h3 class="share-modal-header">Share List</h3>
    <div class="users-list">Loading users...</div>
    <button class="start-button modal-close" onclick="closeShareModal()">Cancel</button>
  `;
  document.body.appendChild(modal);
  
// Load users
const usersList = modal.querySelector(".users-list");

supabaseClient
  .from("user_profiles")
  .select("id, username")
  .neq("id", currentUser.id)
  .then(({ data, error }) => {
    if (error) {
      console.error("Error fetching users:", error);
      usersList.innerHTML = '<div class="user-item"><span>Error loading users</span></div>';
      return;
    }
    
    if (data && data.length > 0) {
      usersList.innerHTML = data.map(user => `
        <div class="user-item">
          <span>${user.username || "Unnamed User"}</span>
          <button class="main-button small-button share-with-user-btn" data-user-id="${user.id}">
            <i class="fas fa-share-alt"></i> Share
          </button>
        </div>
      `).join("");
      
      // Setup share buttons
      modal.querySelectorAll(".share-with-user-btn").forEach(button => {
        button.onclick = async () => {
          const userId = button.getAttribute("data-user-id");
          button.disabled = true;
          
          const originalHTML = button.innerHTML;
          button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sharing...';
          
          const success = await CustomListsManager.share(id, userId);
          if (!success) {
            button.disabled = false;
            button.innerHTML = originalHTML;
          } else {
            showNotification("List shared successfully!", "success");
            closeShareModal();
          }
        };
      });
    } else {
      usersList.innerHTML = '<div class="user-item"><span>No users found to share with</span></div>';
    }
  });

/**
 * Close the share modal
 */
 function closeShareModal() {
  const modal = document.querySelector(".share-modal");
  const backdrop = document.querySelector(".modal-backdrop");
  
  if (modal) modal.remove();
  if (backdrop) backdrop.remove();
}

function updateListsDisplay() {
  const container = document.getElementById('custom-lists-container');
  if (!container) return;
  
  const limits = CustomListsManager.getListLimits();
  const userStatus = currentUser?.status || 'unregistered';
  
  container.innerHTML = '';
  
  if (CustomListsManager.lists && Array.isArray(CustomListsManager.lists) && CustomListsManager.lists.length > 0) {
    CustomListsManager.lists.forEach(list => {
      if (!list || !list.id) return;
      
      const wordCount = list.words?.length || 0;
      const canPractice = wordCount >= 6;
      const playsAvailable = userStatus === 'premium' ? '' : `<span style="margin-left: 1rem;">${limits.playDisplay} plays available</span>`;
      
      const listItem = document.createElement('div');
      listItem.className = 'custom-list-item collapsed ' + (list.isShared ? 'shared-list' : '');
      listItem.dataset.listId = list.id;
      
      listItem.innerHTML = `
        <div class="list-actions">
          <button class="main-button practice-button" ${canPractice ? '' : 'disabled'}>
            ${canPractice ? 'Practice' : `Need ${6 - wordCount} more`}
          </button>
          <button class="main-button edit-button">Edit</button>
          <button class="main-button delete-button">Delete</button>
          ${userStatus === 'premium' ? `
            <button class="main-button share-button">
              <i class="fas fa-share-alt"></i> Share
            </button>
          ` : ''}
        </div>
        <div class="list-header">
          <h3>${list.name || 'Unnamed List'}</h3>
          <div class="list-summary">
            <span class="word-count ${canPractice ? '' : 'insufficient'}">${wordCount} words</span>
            ${canPractice ? '' : '<span class="warning-text">(Minimum 6 needed)</span>'}
            ${playsAvailable}
            <p class="word-preview">${Array.isArray(list.words) ? list.words.slice(0, 5).join(", ") : ""}${list.words && list.words.length > 5 ? "..." : ""}</p>
          </div>
        </div>
      `;
      
      container.appendChild(listItem);
      
      // Setup the buttons
      const practiceButton = listItem.querySelector('.practice-button');
      if (practiceButton) {
        if (canPractice) {
          practiceButton.onclick = function() { startCustomListPractice(list.id); };
        } else {
          practiceButton.style.opacity = '0.6';
          practiceButton.style.cursor = 'not-allowed';
        }
      }
      
      const editButton = listItem.querySelector('.edit-button');
      if (editButton) {
        editButton.onclick = function() { toggleInlineEdit(list.id); };
      }
      
      const deleteButton = listItem.querySelector('.delete-button');
      if (deleteButton) {
        deleteButton.onclick = function() { deleteCustomList(list.id); };
      }
      
      const shareButton = listItem.querySelector('.share-button');
      if (shareButton) {
        shareButton.onclick = function() { showShareModal(list.id); };
      }
      
      const header = listItem.querySelector('.list-header');
      if (header) {
        header.onclick = function() { toggleListCollapse(list.id); };
      }
    });
  } else {
    container.innerHTML = '<p style="color: white; text-align: center;">No custom lists created yet. Create your first list!</p>';
  }
}

function toggleListEditMode(listId) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${listId}"]`);
  if (!listItem) return;
  
  const list = CustomListsManager.lists.find(l => l.id === listId);
  if (!list) return;
  
  const editButton = listItem.querySelector(".edit-button");
  
  if (listItem.classList.contains("editing")) {
    // Save changes
    const nameInput = listItem.querySelector(".list-name-input");
    const wordItems = listItem.querySelectorAll(".word-translation-item");
    
    const newName = nameInput.value.trim() || list.name || "Unnamed List";
    const newWords = [];
    const newTranslations = [];
    
    wordItems.forEach(item => {
      const sourceWord = item.querySelector(".source-word").textContent.trim();
      const targetWord = item.querySelector(".target-word").value.trim();
      
      if (sourceWord && targetWord) {
        newWords.push(sourceWord);
        newTranslations.push(targetWord);
      }
    });
    
    // Update list in CustomListsManager
    list.name = newName;
    list.words = newWords;
    list.translations = newTranslations;
    
    CustomListsManager.save(list).then(() => {
      showNotification("List saved successfully", "success");
      
      // Update the visible list name and preview
      const listNameElement = listItem.querySelector(".list-header h3");
      if (listNameElement) listNameElement.textContent = newName;
      
      const wordCount = newWords.length;
      const wordCountElement = listItem.querySelector(".word-count");
      if (wordCountElement) {
        wordCountElement.textContent = `${wordCount} words`;
        wordCountElement.className = `word-count ${wordCount >= 6 ? "" : "insufficient"}`;
      }
      
      const warningElement = listItem.querySelector(".warning-text");
      if (warningElement) {
        if (wordCount >= 6) {
          warningElement.style.display = "none";
        } else {
          warningElement.style.display = "inline";
          warningElement.textContent = `(Minimum 6 needed)`;
        }
      }
      
      const previewElement = listItem.querySelector(".word-preview");
      if (previewElement) {
        previewElement.textContent = newWords.slice(0, 5).join(", ") + (newWords.length > 5 ? "..." : "");
      }
      
      // Update practice button state
      const practiceButton = listItem.querySelector(".practice-button");
      if (practiceButton) {
        if (wordCount >= 6) {
          practiceButton.textContent = "Practice";
          practiceButton.disabled = false;
          practiceButton.style.opacity = "1";
          practiceButton.style.cursor = "pointer";
          practiceButton.onclick = function() {
            startCustomListPractice(listId);
          };
        } else {
          practiceButton.textContent = `Need ${6 - wordCount} more`;
          practiceButton.disabled = true;
          practiceButton.style.opacity = "0.6";
          practiceButton.style.cursor = "not-allowed";
          practiceButton.onclick = null;
        }
      }
      
      // Exit edit mode
      listItem.classList.remove("editing");
      if (editButton) editButton.textContent = "Edit";
      
      // Collapse the list
      listItem.classList.add("collapsed");
    }).catch(error => {
      console.error("Error saving list:", error);
      showNotification("Failed to save list", "error");
    });
  } else {
    // Enter edit mode
    listItem.classList.remove("collapsed");
    listItem.classList.add("editing");
    if (editButton) editButton.textContent = "Save";
    
    // Populate word list
    const wordList = listItem.querySelector(".word-translation-list");
    if (wordList) {
      wordList.innerHTML = "";
      
      if (Array.isArray(list.words) && list.words.length > 0) {
        list.words.forEach((word, index) => {
          const translation = list.translations && index < list.translations.length 
            ? list.translations[index] 
            : "";
          
          const wordItem = createWordItemForList(word, translation);
          wordList.appendChild(wordItem);
        });
      }
      
      // Make the words draggable
      makeWordListDraggable(wordList);
    }
  }
}

function createWordItemForList(word, translation) {
  const item = document.createElement("div");
  item.className = "word-translation-item";
  item.draggable = true;
  item.innerHTML = `
    <div class="drag-handle">
      <i class="fas fa-grip-vertical"></i>
    </div>
    <span class="source-word" contenteditable="true">${word}</span>
    <input type="text" class="target-word" value="${translation}" placeholder="Hebrew translation">
    <button class="delete-word-btn" onclick="deleteWordFromList(this)">
      <i class="fas fa-times" style="font-size: 12px;"></i>
    </button>
  `;
  
  initializeDragAndDrop(item);
  return item;
}

function deleteWordFromList(button) {
  const wordItem = button.closest(".word-translation-item");
  if (wordItem) {
    wordItem.remove();
  }
}

function addWordToList(listId) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${listId}"]`);
  if (!listItem) return;
  
  const wordList = listItem.querySelector(".word-translation-list");
  if (!wordList) return;
  
  const wordItem = createWordItemForList("", "");
  wordList.appendChild(wordItem);
  
  // Focus the new word
  const sourceWord = wordItem.querySelector(".source-word");
  if (sourceWord) {
    sourceWord.focus();
  }
}

function makeWordListDraggable(container) {
  if (!container) return;
  
  container.addEventListener("dragover", e => {
    e.preventDefault();
    const draggingItem = container.querySelector(".dragging");
    if (!draggingItem) return;
    
    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement) {
      container.insertBefore(draggingItem, afterElement);
    } else {
      container.appendChild(draggingItem);
    }
  });
  
  // Initialize all items in this container
  container.querySelectorAll(".word-translation-item").forEach(item => {
    initializeDragAndDrop(item);
  });
}


function toggleListCollapse(id) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${id}"]`);
  listItem.classList.toggle("collapsed");
}

/**
 * Start practicing a custom list
 * @param {string|number} id - The list ID
 */
function startCustomListPractice(id) {
  const list = CustomListsManager.lists.find(list => list.id === id);
  if (!list) return;
  
  const validation = CustomListsManager.validateListForPractice(list);
  if (!validation.valid) {
    showNotification(validation.message, "error");
    return;
  }
  
  if (customGameState.initializeFromList(list)) {
    startCustomLevel(1);
  } else {
    showNotification("Failed to initialize practice", "error");
  }
}

/**
 * Start a level in custom practice mode
 * @param {number} level - The level number
 */
function startCustomLevel(level) {
  // Hide powerups in custom practice
  const powerupsContainer = document.querySelector(".powerups-container");
  if (powerupsContainer) {
    powerupsContainer.style.display = "none";
  }
  
  // Get words for this level
  const levelData = customGameState.getWordsForLevel(level);
  if (!levelData || !levelData.words.length) {
    showNotification("Practice completed!", "success");
    showScreen("custom-practice-screen");
    return;
  }
  
  // Set up the current level
  customGameState.currentLevel = level;
  
  // Initialize game state
  currentGame = {
    words: levelData.words,
    translations: levelData.translations,
    currentIndex: 0,
    correctAnswers: 0,
    firstAttempt: true,
    isHebrewToEnglish: levelData.isTest ? Math.random() < 0.5 : false,
    mixed: levelData.isTest,
    speedChallenge: false,
    isCustomPractice: true,
    startingCoins: gameState.coins,
    startingPerks: { ...gameState.perks },
    timeBonus: 0,
    initialTimeRemaining: null,
    streakBonus: true,
    levelStartTime: Date.now(),
    questionStartTime: 0,
    wrongStreak: 0,
    progressLost: 0,
    customList: customGameState.currentList,
    customLevel: level,
    isFinalLevel: levelData.isFinal
  };
  
  // Show level intro and start the level
  showLevelIntro(level, () => {
    showScreen("question-screen");
    updateProgressCircle();
    loadNextQuestion();
    startTimer(10 * currentGame.words.length);
  });
}

/**
 * Handle completion of a custom level
 */
function handleCustomLevelCompletion() {
  // Clear the timer
  clearTimer();
  
  // Check if level was completed successfully
  const isPerfect = currentGame.streakBonus && currentGame.correctAnswers === currentGame.words.length;
  
  if (isPerfect) {
    // Award bonus coins for perfect completion
    const coinsToAward = currentGame.firstAttempt ? 5 : 3;
    
    CoinsManager.updateCoins(coinsToAward).then(() => {
      pulseCoins(coinsToAward);
      
      // Mark level as completed
      customGameState.wordsCompleted += currentGame.words.length;
      customGameState.completedLevels.add(customGameState.currentLevel);
      
      // Create particle effect
      const rect = document.getElementById("question-screen").getBoundingClientRect();
      createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
      
      // Check if this was the final level or move to next level
      const nextLevel = customGameState.currentLevel + 1;
      const nextLevelData = customGameState.getWordsForLevel(nextLevel);
      
      if (!nextLevelData || nextLevelData.words.length === 0 || currentGame.isFinalLevel) {
        setTimeout(() => showCustomCompletionScreen(), 1500);
      } else {
        setTimeout(() => startCustomLevel(nextLevel), 1500);
      }
    });
  } else {
    // If not perfect, retry the level
    setTimeout(() => startCustomLevel(customGameState.currentLevel), 1500);
  }
  
  // Save progress
  saveProgress();
}

/**
 * Show the completion screen for custom practice
 */
function showCustomCompletionScreen() {
  const overlay = document.createElement("div");
  overlay.className = "completion-overlay";
  
  const coinsEarned = gameState.coins - customGameState.startCoins;
  
  overlay.innerHTML = `
    <div class="completion-content">
      <h2>Practice Complete!</h2>
      <div class="completion-stats">
        <div class="stat-item">
          <i class="fas fa-book"></i>
          <span>Words Practiced: ${customGameState.wordsCompleted}</span>
        </div>
        <div class="stat-item">
          <i class="fas fa-coins"></i>
          <span>Coins Earned: ${coinsEarned}</span>
        </div>
      </div>
      <button onclick="exitCustomPractice()" class="start-button">Continue</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

/**
 * Exit custom practice mode and return to lists screen
 */
function exitCustomPractice() {
  customGameState.reset();
  
  const overlay = document.querySelector(".completion-overlay");
  if (overlay) overlay.remove();
  
  showScreen("custom-practice-screen");
}

/**
 * Handle an answer in custom practice mode
 * @param {boolean} isCorrect - Whether the answer is correct
 * @param {boolean} isSkip - Whether this was a skip action
 */
async function handleCustomPracticeAnswer(isCorrect, isSkip = false) {
  if (isCorrect) {
    // Handle correct answer
    currentGame.currentIndex++;
    
    if (isCorrect && !isSkip) {
      let coinsToAward = 0;
      
      // Award time bonus
      const timeBonus = awardTimeBonus();
      if (timeBonus > 0) {
        coinsToAward += timeBonus;
        pulseCoins(timeBonus);
      }
      
      // Award correctness bonus
      if (currentGame.firstAttempt) {
        coinsToAward += 3;
        pulseCoins(3);
      } else {
        coinsToAward += 1;
        pulseCoins(1);
      }
      
      try {
        await CoinsManager.updateCoins(coinsToAward);
        updatePerkButtons();
      } catch (error) {
        console.error("Error updating total coins:", error);
      }
      
      currentGame.correctAnswers++;
      
      // Track word for any registered user, not just premium
      if (currentUser) {
        const index = currentGame.currentIndex - 1; // Fix index to get the word that was just answered
        const word = currentGame.isHebrewToEnglish ? 
                    currentGame.words[index] : 
                    currentGame.translations[index];
        
        await trackWordEncounter(word, "custom");
      }
    }
  } else {
    // Handle wrong answer
    currentGame.firstAttempt = false;
    currentGame.streakBonus = false;
    currentGame.wrongStreak++;
    
    try {
      await CoinsManager.updateCoins(-3);
      updatePerkButtons();
    } catch (error) {
      console.error("Error updating coins:", error);
    }
    
    // Move back if too many wrong answers
    if (currentGame.currentIndex > 0) {
      currentGame.progressLost++;
      currentGame.currentIndex = Math.max(0, currentGame.currentIndex - 1);
    }
    
    // Show game over screen if too many wrong answers in a row
    if (currentGame.wrongStreak >= 3) {
      showGameOverOverlay();
      
      // Set up restart button
      document.querySelector(".restart-button").onclick = () => {
        document.querySelector(".failure-overlay").style.display = "none";
        startCustomLevel(currentGame.customLevel);
      };
      
      return;
    }
  }
  
  // Highlight correct/incorrect answers
  const correctWord = currentGame.isHebrewToEnglish ? 
                     currentGame.words[Math.max(0, currentGame.currentIndex - 1)] : 
                     currentGame.translations[Math.max(0, currentGame.currentIndex - 1)];
  
  document.querySelectorAll(".buttons button").forEach(button => {
    if (button.textContent === correctWord) {
      button.classList.add("correct");
    } else if (!isCorrect && event && event.target && button.textContent === event.target.textContent) {
      button.classList.add("wrong");
    }
  });
  
  // Update UI and save progress
  updateProgressCircle();
  saveProgress();
  
  // Load next question or finish level
  setTimeout(() => {
    document.querySelectorAll(".buttons button").forEach(btn => {
      btn.classList.remove("correct", "wrong");
    });
    
    if (currentGame.currentIndex < currentGame.words.length) {
      loadNextQuestion();
      updatePerkButtons();
    } else {
      handleCustomLevelCompletion();
    }
  }, 333);
}

/**
 * Update schema for a custom list
 * @param {Object} list - The list to update
 * @returns {Object} - The updated list
 */
function updateCustomListSchema(list) {
  if (!list) return list;
  
  const wordCount = list.words?.length || 0;
  let maxLevels = 0;
  
  if (wordCount >= 6) {
    maxLevels = wordCount >= 12 ? 9 : 
               wordCount >= 9 ? 6 : 3;
  }
  
  return {
    ...list,
    min_words: 6,
    max_levels: maxLevels
  };
}

/**
 * Show the custom lists manager screen
 */
function showCustomListsManager() {
  showScreen("custom-practice-screen");
  
  Promise.resolve(CustomListsManager.initialize()).then(() => {
    const container = document.getElementById("custom-lists-container");
    if (!container) return;
    
    const limits = CustomListsManager.getListLimits();
    const userStatus = currentUser?.status || "unregistered";
    
    container.innerHTML = "";
    
    const lists = CustomListsManager.lists || [];
    
    if (lists.length === 0) {
      container.innerHTML = '<p style="color: white; text-align: center;">No custom lists created yet. Create your first list!</p>';
      return;
    }
    
    lists.forEach(list => {
      const listPlaysKey = `listPlays_${list.id}`;
      const playsUsed = parseInt(localStorage.getItem(listPlaysKey) || "0");
      const playsLeft = limits.maxPlays - playsUsed;
      
      if (playsLeft <= 0) return;
      
      const listItem = document.createElement("div");
      listItem.className = "custom-list-item collapsed " + (list.is_shared ? "shared-list" : "");
      listItem.dataset.listId = list.id;
      
      listItem.innerHTML = `
        <div class="list-actions">
          <button class="start-button practice-button">Practice</button>
          <button class="edit-button" data-list-id="${list.id}">Edit</button>
          <button class="start-button delete-button">Delete</button>
          ${userStatus === "premium" ? `
            <button class="share-button" onclick="showShareModal(${list.id})">
              <i class="fas fa-share-alt"></i> Share
            </button>
          ` : ""}
        </div>
        <div class="list-header">
          <h3>${list.name}</h3>
          <div class="list-summary">
            <span>${list.words?.length || 0} words</span>
            <span style="color: ${playsLeft <= 2 ? '#ff4444' : '#ffffff'}; margin-left: 1rem;">
              ${limits.playDisplay}
            </span>
            <p class="word-preview">${(list.words || []).slice(0, 5).join(", ")}${list.words?.length > 5 ? "..." : ""}</p>
          </div>
        </div>
      `;
      
      listItem.querySelector(".practice-button").addEventListener("click", () => 
        startCustomListPractice(list.id)
      );
      
      listItem.querySelector(".edit-button").addEventListener("click", () => {
        console.log("Edit button clicked for list:", list.id);
        editCustomList(list.id);
      });
      
      listItem.querySelector(".delete-button").addEventListener("click", () => {
        console.log("Delete button clicked for list:", list.id);
        deleteCustomList(list.id);
      });
      
      listItem.querySelector(".list-header").addEventListener("click", () => 
        toggleListCollapse(list.id)
      );
      
      container.appendChild(listItem);
    });
  }).catch(error => {
    console.error("Failed to initialize custom lists:", error);
    showNotification("Error loading lists", "error");
  });
}

/**
 * Get the user limits based on status
 * @returns {Object} - The limits object
 */
function getUserListLimits() {
  if (!currentUser) {
    return {
      maxLists: 3,
      maxWords: 10,
      maxPlays: 5,
      canShare: false
    };
  }
  
  switch (currentUser.status || "unregistered") {
    case "free":
      return {
        maxLists: 5,
        maxWords: 20,
        maxPlays: 10,
        canShare: false
      };
    case "pending":
      return {
        maxLists: 30,
        maxWords: 50,
        maxPlays: Infinity,
        canShare: false,
        playDisplay: "∞"
      };
    case "premium":
      return {
        maxLists: 30,
        maxWords: 50,
        maxPlays: Infinity,
        canShare: true,
        playDisplay: "∞"
      };
    default:
      return {
        maxLists: 3,
        maxWords: 10,
        maxPlays: 5,
        canShare: false
      };
  }
}

/**
 * Validate if a list can be practiced
 * @param {Object} list - The list to validate
 * @returns {Object} - Validation result with valid flag and message
 */
function validateListForPractice(list) {
  if (!list || !list.words || !list.translations) {
    return { valid: false, message: "Invalid list format" };
  }
  
  if (list.words.length < 6) {
    return { valid: false, message: "Lists need at least 6 words to practice" };
  }
  
  return { valid: true };
}

/**
 * Track a list play and handle play limits
 * @param {string|number} id - The list ID
 * @returns {number|boolean} - Plays left or false if limit reached
 */
function trackListPlay(id) {
  const key = `listPlays_${id}`;
  let plays = parseInt(localStorage.getItem(key) || "0");
  plays++;
  
  const limits = getUserListLimits();
  
  localStorage.setItem(key, plays);
  
  if (plays >= limits.maxPlays) {
    deleteCustomList(id);
    return false;
  }
  
  return limits.maxPlays - plays;
}

/**
 * Save a custom list to Supabase
 * @param {Object} list - The list to save
 */
async function saveCustomListToSupabase(list) {
  if (!currentUser || !list) return;
  
  try {
    const { data, error } = await supabaseClient
      .from("custom_lists")
      .upsert(
        {
          user_id: currentUser.id,
          name: list.name,
          words: list.words,
          translations: list.translations,
          status: list.status || currentUser.status
        },
        { onConflict: "id" }
      );
    
    if (error) throw error;
  } catch (error) {
    console.error("Error saving list to Supabase:", error);
    showNotification("Failed to save list", "error");
  }
}

async function loadCustomLists() {
  try {
    await CustomListsManager.initialize();
    updateListsDisplay();
  } catch (error) {
    console.error("Error loading custom lists:", error);
  }
}
}

/**
 * Show the custom lists manager screen
 */
 function showCustomListsManager() {
  // Show the custom practice screen first
  showScreen("custom-practice-screen");
  
  // Initialize the CustomListsManager and update display
  Promise.resolve(CustomListsManager.initialize()).then(() => {
    updateListsDisplay();
  }).catch(error => {
    console.error("Error initializing custom lists:", error);
    showNotification("Failed to load custom lists", "error");
  });
}

function updateListsDisplay() {
    const container = document.getElementById("custom-lists-container");
    if (!container) return void console.error("Custom lists container not found");

    const limits = CustomListsManager.getListLimits();
    const userStatus = currentUser?.status || "unregistered";
    
    container.innerHTML = "";
    
    if (CustomListsManager.lists && Array.isArray(CustomListsManager.lists) && CustomListsManager.lists.length !== 0) {
        CustomListsManager.lists.forEach(list => {
            if (!list || !list.id) return;
            
            const wordCount = list.words?.length || 0;
            const hasSufficientWords = wordCount >= 6;
            
            // Here's the key change - only include plays available text for non-premium users
            const playsAvailableHtml = userStatus === "premium" ? 
                "" : 
                `<span style="margin-left: 1rem;">${limits.playDisplay} plays available</span>`;
            
            const listItem = document.createElement("div");
            listItem.className = "custom-list-item collapsed " + (list.isShared ? "shared-list" : "");
            listItem.dataset.listId = list.id;
            
            listItem.innerHTML = `
                <div class="list-actions">
                    <button class="main-button practice-button" ${hasSufficientWords ? "" : "disabled"}>
                        ${hasSufficientWords ? "Practice" : `Need ${6 - wordCount} more`}
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
                        <span class="word-count ${hasSufficientWords ? "" : "insufficient"}">${wordCount} words</span>
                        ${hasSufficientWords ? "" : '<span class="warning-text">(Minimum 6 needed)</span>'}
                        ${playsAvailableHtml}
                        <p class="word-preview">${Array.isArray(list.words) ? list.words.slice(0, 5).join(", ") : ""}${list.words && list.words.length > 5 ? "..." : ""}</p>
                    </div>
                </div>
            `;
            
            container.appendChild(listItem);
            
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
            
            const shareButton = listItem.querySelector(".share-button");
            if (shareButton) {
                shareButton.onclick = function() {
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


function toggleListCollapse(id) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${id}"]`);
  if (listItem) {
    listItem.classList.toggle("collapsed");
  }
}

/**
 * Start practicing a custom list
 * @param {string|number} id - The list ID
 */
 function startCustomListPractice(id) {
  // Find the list by ID
  const list = CustomListsManager.lists.find(list => list.id === id);
  if (!list) {
    showNotification("List not found", "error");
    return;
  }
  
  // Validate the list for practice
  const validation = CustomListsManager.validateListForPractice(list);
  if (!validation.valid) {
    showNotification(validation.message, "error");
    return;
  }
  
  // Track list play if necessary
  const limits = CustomListsManager.getListLimits();
  if (limits.maxPlays !== Infinity) {
    const listPlaysKey = `listPlays_${id}`;
    let playsUsed = parseInt(localStorage.getItem(listPlaysKey) || "0");
    playsUsed++;
    
    if (playsUsed > limits.maxPlays) {
      showNotification("You've reached the maximum plays for this list", "error");
      return;
    }
    
    localStorage.setItem(listPlaysKey, playsUsed);
  }
  
  // Initialize the custom game state with this list
  if (customGameState.initializeFromList(list)) {
    // Start at level 1
    startCustomLevel(1);
  } else {
    showNotification("Failed to initialize practice", "error");
  }
}

/**
 * Start a level in custom practice mode
 * @param {number} level - The level number
 */
function startCustomLevel(level) {
  // Hide powerups in custom practice
  const powerupsContainer = document.querySelector(".powerups-container");
  if (powerupsContainer) {
    powerupsContainer.style.display = "none";
  }
  
  // Reset admin skip button if it exists
  if (typeof addAdminSkipButton === "function") {
    addAdminSkipButton();
  }
  
  // Get words for this level
  const levelData = customGameState.getWordsForLevel(level);
  if (!levelData || !levelData.words.length) {
    showNotification("Practice completed!", "success");
    showScreen("custom-practice-screen");
    return;
  }
  
  // Set up the current level
  customGameState.currentLevel = level;
  
  // Initialize game state
  currentGame = {
    words: levelData.words,
    translations: levelData.translations,
    currentIndex: 0,
    correctAnswers: 0,
    firstAttempt: true,
    isHebrewToEnglish: levelData.isTest ? Math.random() < 0.5 : false,
    mixed: levelData.isTest,
    speedChallenge: false,
    isCustomPractice: true,
    customGameState: true,
    startingCoins: gameState.coins,
    startingPerks: { ...gameState.perks },
    timeBonus: 0,
    initialTimeRemaining: null,
    streakBonus: true,
    levelStartTime: Date.now(),
    questionStartTime: 0,
    wrongStreak: 0,
    progressLost: 0,
    customList: customGameState.currentList,
    customLevel: level,
    isFinalLevel: levelData.isFinal
  };
  
  // Show level intro and start the level
  showLevelIntro(level, () => {
    showScreen("question-screen");
    updateProgressCircle();
    loadNextQuestion();
    startTimer(10 * currentGame.words.length);
  });
}

/**
 * Load custom lists and update the UI
 * @returns {Promise} - Promise that resolves when lists are loaded
 */
async function loadCustomLists() {
  try {
    console.log("Loading custom lists...");
    
    // Initialize the CustomListsManager
    await CustomListsManager.initialize();
    
    // Check if we're on the custom practice screen
    const customPracticeScreen = document.getElementById("custom-practice-screen");
    if (customPracticeScreen && 
        (customPracticeScreen.style.display === "block" || 
         document.querySelector(".screen.active")?.id === "custom-practice-screen")) {
      // Only update the display if we're on the custom lists screen
      updateListsDisplay();
    }
    
    console.log("Custom lists loaded successfully");
    return CustomListsManager.lists;
  } catch (error) {
    console.error("Error loading custom lists:", error);
    showNotification("Failed to load custom lists", "error", 3000);
    return [];
  }
}

/**
 * Share a custom list with another user
 * @param {string|number} listId - The ID of the list to share
 * @param {string} targetUserId - The ID of the user to share with
 * @returns {Promise<boolean>} - Whether the share was successful
 */
 async function shareCustomList(listId, targetUserId) {
  console.log(`Starting share process for list ${listId} with user ${targetUserId}`);
  
  if (!currentUser?.id) {
    showNotification("You must be logged in to share lists", "error");
    return false;
  }
  
  try {
    // Get the list data from local storage or directly from DB
    let list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
    
    // If list not found locally, try fetching from DB
    if (!list) {
      const { data, error } = await supabaseClient
        .from("custom_lists")
        .select("*")
        .eq("id", listId)
        .single();
        
      if (error || !data) {
        console.error("Error fetching list:", error);
        return false;
      }
      
      list = data;
    }
    
    console.log("Found list to share:", list.name);
    
    // Format the shared list name
    const displayName = currentUser.user_metadata?.name || 
                       currentUser.user_metadata?.username || 
                       currentUser.email || 
                       "User";
    const sharedListName = `${list.name} (Shared by ${displayName})`;
    
    // Ensure data is valid
    const words = Array.isArray(list.words) ? list.words : [];
    const translations = Array.isArray(list.translations) ? list.translations : [];
    
    // Insert the shared list directly
    const { error } = await supabaseClient
      .from("custom_lists")
      .insert({
        name: sharedListName,
        words: words,
        translations: translations,
        user_id: targetUserId,
        is_shared: true,
        shared_by: currentUser.id
      });
      
    if (error) {
      console.error("Error sharing list:", error);
      return false;
    }
    
    console.log("List shared successfully");
    showNotification("List shared successfully!", "success");
    return true;
  } catch (error) {
    console.error("Unexpected error in shareCustomList:", error);
    showNotification("Failed to share list", "error");
    return false;
  }
}

/**
 * Show modal to share a list with other users
 * @param {string|number} listId - The ID of the list to share
 */
function showShareModal(listId) {
  console.log("Opening share modal for list:", listId);
  
  // Remove any existing modals
  const existingModal = document.querySelector(".share-modal-container");
  if (existingModal) existingModal.remove();
  
  // Create modal container with backdrop
  const modalContainer = document.createElement("div");
  modalContainer.className = "share-modal-container";
  modalContainer.style.position = "fixed";
  modalContainer.style.top = "0";
  modalContainer.style.left = "0";
  modalContainer.style.width = "100%";
  modalContainer.style.height = "100%";
  modalContainer.style.backgroundColor = "rgba(0,0,0,0.7)";
  modalContainer.style.display = "flex";
  modalContainer.style.justifyContent = "center";
  modalContainer.style.alignItems = "center";
  modalContainer.style.zIndex = "1000";
  
  // Create actual modal content
  const modal = document.createElement("div");
  modal.className = "share-modal";
  modal.style.backgroundColor = "#1e1e2e";
  modal.style.borderRadius = "10px";
  modal.style.padding = "20px";
  modal.style.maxWidth = "400px";
  modal.style.width = "90%";
  modal.style.maxHeight = "80vh";
  modal.style.overflowY = "auto";
  
  modal.innerHTML = `
    <h3 style="text-align: center; margin-bottom: 20px; color: white;">Share List</h3>
    <div id="share-users-list" style="margin-bottom: 15px;">Loading users...</div>
    <button id="close-share-modal" style="width: 100%; padding: 10px; background-color: #7e3ab3; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 10px;">Close</button>
  `;
  
  modalContainer.appendChild(modal);
  document.body.appendChild(modalContainer);
  
  // Close button functionality
  document.getElementById("close-share-modal").onclick = function() {
    modalContainer.remove();
  };
  
  // Also close when clicking backdrop, but not when clicking the modal itself
  modalContainer.addEventListener("click", function(event) {
    if (event.target === modalContainer) {
      modalContainer.remove();
    }
  });
  
  // Show users
  const usersList = document.getElementById("share-users-list");
  
  if (!currentUser) {
    usersList.innerHTML = '<div style="padding: 10px; color: white;">You must be logged in to share lists</div>';
    return;
  }
  
  // Fetch users to share with
  supabaseClient
    .from("user_profiles")
    .select("id, username, email")
    .neq("id", currentUser.id)
    .then(({ data, error }) => {
      if (error) {
        console.error("Error fetching users:", error);
        usersList.innerHTML = '<div style="padding: 10px; color: white;">Error loading users</div>';
        return;
      }
      
      if (!data || data.length === 0) {
        usersList.innerHTML = '<div style="padding: 10px; color: white;">No other users found</div>';
        return;
      }
      
      // Render users
      let html = '';
      data.forEach(user => {
        const displayName = user.username || user.email || user.id.substring(0, 8);
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); color: white;">
            <span>${displayName}</span>
            <button 
              class="share-with-user-btn" 
              data-user-id="${user.id}" 
              style="padding: 5px 10px; background-color: #7e3ab3; color: white; border: none; border-radius: 5px; cursor: pointer;">
              Share
            </button>
          </div>
        `;
      });
      
      usersList.innerHTML = html;
      
      // Add click handlers
      document.querySelectorAll(".share-with-user-btn").forEach(button => {
        button.onclick = async function() {
          const userId = this.getAttribute("data-user-id");
          const originalText = this.innerText;
          
          this.innerText = "Sharing...";
          this.disabled = true;
          
          const success = await shareCustomList(listId, userId);
          
          if (success) {
            this.innerText = "Shared ✓";
            this.style.backgroundColor = "#28a745";
          } else {
            this.innerText = originalText;
            this.disabled = false;
          }
        };
      });
    });
}

/**
 * Exit the custom practice mode and return to the list screen
 * Called when the user clicks "Continue" on the completion screen
 */
 function exitCustomPractice() {
  console.log("Exiting custom practice mode");
  
  // Remove the completion overlay if it exists
  const overlay = document.querySelector(".completion-overlay");
  if (overlay) {
    overlay.remove();
  }
  
  // Reset custom game state
  if (customGameState) {
    customGameState.reset();
  }
  
  // Reset current game
  currentGame = null;
  
  // Return to the custom practice screen
  showScreen("custom-practice-screen");
  
  // If needed, refresh the lists display
  if (typeof refreshCustomLists === 'function') {
    refreshCustomLists();
  }
}

function generateAnswerOptions(correctAnswer) {
  const buttonsContainer = document.querySelector(".buttons");
  if (!buttonsContainer) return;
  
  buttonsContainer.innerHTML = "";
  
  // Create a set of options including the correct answer
  let options = [correctAnswer];
  const isHebrewAnswer = isHebrewWord(correctAnswer);
  
  // Get additional options based on whether we need Hebrew or English words
  const additionalOptions = getRandomAnswerOptions(correctAnswer, isHebrewAnswer, 3);
  options = options.concat(additionalOptions);
  
  // Shuffle the options
  options = shuffleArray(options);
  
  // Create buttons for each option
  options.forEach(option => {
    const button = document.createElement("button");
    button.textContent = option;
    button.className = isHebrewAnswer ? "hebrew-text" : "";
    button.onclick = function(event) {
      handleAnswer(event);
    };
    buttonsContainer.appendChild(button);
  });
}

async function ensureUserInitialization(userId) {
  try {
    console.log("Ensuring proper user initialization for:", userId);
    
    // Check if player_stats exists
    const { data: statsData, error: statsError } = await supabaseClient
      .from("player_stats")
      .select("user_id")
      .eq("user_id", userId)
      .single();
    
    // If player_stats doesn't exist, create it
    if (statsError && statsError.code === "PGRST116") {
      console.log("Creating player_stats record for user");
      const { error: createStatsError } = await supabaseClient
        .from("player_stats")
        .insert([{
          user_id: userId,
          total_levels_completed: 0,
          unique_words_practiced: 0
        }]);
      
      if (createStatsError) {
        console.error("Error creating player_stats:", createStatsError);
      }
    }
    
    // Check if game_progress exists
    const { data: progressData, error: progressError } = await supabaseClient
      .from("game_progress")
      .select("user_id")
      .eq("user_id", userId)
      .single();
    
    // If game_progress doesn't exist, create it
    if (progressError && progressError.code === "PGRST116") {
      console.log("Creating game_progress record for user");
      const { error: createProgressError } = await supabaseClient
        .from("game_progress")
        .insert([{
          user_id: userId,
          stage: 1,
          set_number: 1,
          level: 1,
          coins: 0,
          perks: {},
          unlocked_sets: {1: [1]},
          unlocked_levels: {"1_1": [1]},
          perfect_levels: [],
          completed_levels: []
        }]);
      
      if (createProgressError) {
        console.error("Error creating game_progress:", createProgressError);
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error in ensureUserInitialization:", error);
    return false;
  }
}

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

function updatePlayerRankDisplay() {
  if (!currentArcadeSession || !currentArcadeSession.playerName) return;
  
  // Make sure our own player data is always in the participants array
  let foundSelf = false;
  let playerIndex = -1;
  
  for (let i = 0; i < currentArcadeSession.participants.length; i++) {
    if (currentArcadeSession.participants[i].username === currentArcadeSession.playerName) {
      foundSelf = true;
      playerIndex = i;
      break;
    }
  }
  
  // If player not found, add them
  if (!foundSelf && currentGame) {
    currentArcadeSession.participants.push({
      username: currentArcadeSession.playerName,
      wordsCompleted: currentGame.wordsCompleted || 0,
      coins: currentGame.coins || 0
    });
  } else if (foundSelf && currentGame) {
    // Make sure our own data is always up-to-date
    currentArcadeSession.participants[playerIndex].wordsCompleted = currentGame.wordsCompleted || 0;
    currentArcadeSession.participants[playerIndex].coins = currentGame.coins || 0;
  }
  
  // Sort players by words completed first, then by coins
  const sortedParticipants = [...currentArcadeSession.participants]
    .sort((a, b) => {
      if (b.wordsCompleted !== a.wordsCompleted) {
        return b.wordsCompleted - a.wordsCompleted;
      }
      return b.coins - a.coins;
    });
    
  // Find our rank in the sorted array
  let playerRank = 0;
  let prevWords = -1;
  let prevCoins = -1;
  let currentRank = 0;
  
  for (let i = 0; i < sortedParticipants.length; i++) {
    const p = sortedParticipants[i];
    
    // Only increment rank if this participant has different stats
    if (p.wordsCompleted !== prevWords || p.coins !== prevCoins) {
      currentRank = i + 1;
      prevWords = p.wordsCompleted;
      prevCoins = p.coins;
    }
    
    // If this is us, record our rank
    if (p.username === currentArcadeSession.playerName) {
      playerRank = currentRank;
      break;
    }
  }
  
  // Default to 1 if something went wrong
  if (playerRank === 0) playerRank = 1;
  
  // Get ordinal suffix
  const getSuffix = (num) => {
    if (num >= 11 && num <= 13) return 'th';
    
    const lastDigit = num % 10;
    switch (lastDigit) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  
  const suffix = getSuffix(playerRank);
  
  // Update or create the rank display
  let rankDisplay = document.querySelector('.player-rank-display');
  
  if (!rankDisplay) {
    // First time creation
    rankDisplay = document.createElement('div');
    rankDisplay.className = 'player-rank-display';
    rankDisplay.dataset.currentRank = playerRank;
    rankDisplay.innerHTML = `
      <div class="rank-number entering">${playerRank}<span class="rank-suffix">${suffix}</span></div>
    `;
    
    const questionScreen = document.getElementById('question-screen');
    if (questionScreen) {
      questionScreen.appendChild(rankDisplay);
    }
  } else {
    const currentRankElement = rankDisplay.querySelector('.rank-number');
    const oldRank = parseInt(rankDisplay.dataset.currentRank || "1");
    
    // Only animate if rank actually changed
    if (oldRank !== playerRank) {
      // Store animation in progress
      rankDisplay.dataset.animating = "true";
      
      // Start exit animation
      currentRankElement.classList.add('exiting');
      
      // After exit animation completes, show new rank with enter animation
      setTimeout(() => {
        if (rankDisplay) {
          const newRankElement = document.createElement('div');
          newRankElement.className = 'rank-number entering';
          newRankElement.innerHTML = `${playerRank}<span class="rank-suffix">${suffix}</span>`;
          
          rankDisplay.innerHTML = '';
          rankDisplay.appendChild(newRankElement);
          rankDisplay.dataset.currentRank = playerRank;
          
          // Clear animation flag after animation completes
          setTimeout(() => {
            if (rankDisplay) {
              rankDisplay.dataset.animating = "false";
              const el = rankDisplay.querySelector('.rank-number');
              if (el) el.classList.remove('entering');
            }
          }, 300);
        }
      }, 300);
    }
  }
  
  // Update rank styling
  rankDisplay.classList.remove('rank-1', 'rank-2', 'rank-3');
  if (playerRank >= 1 && playerRank <= 3) {
    rankDisplay.classList.add(`rank-${playerRank}`);
  }
}

function toggleInlineEdit(listId) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${listId}"]`);
  if (!listItem) return;
  
  // Check if already in edit mode
  const isEditing = listItem.classList.contains('editing');
  
  if (isEditing) {
    // Save the list
    saveInlineEdit(listId);
  } else {
    // Enter edit mode
    enterInlineEditMode(listId, listItem);
  }
}

function enterInlineEditMode(listId, listItem) {
  const list = CustomListsManager.lists.find(list => list.id === listId);
  if (!list) return;
  
  listItem.classList.add('editing');
  
  // Change Edit button to Save
  const editButton = listItem.querySelector('.edit-button');
  if (editButton) {
    editButton.textContent = 'Save';
  }
  
  // Make list name editable
  const listHeader = listItem.querySelector('.list-header h3');
  const originalName = listHeader.textContent;
  
  // Replace with input field
  listHeader.innerHTML = `<input type="text" class="list-name-edit" value="${originalName}" placeholder="List Name">`;
  
  // Create or show the inline edit container
  let editContainer = listItem.querySelector('.inline-edit-container');
  
  if (!editContainer) {
    editContainer = document.createElement('div');
    editContainer.className = 'inline-edit-container';
    
    // Create word list table
    const wordTable = document.createElement('div');
    wordTable.className = 'inline-word-translation-list';
    editContainer.appendChild(wordTable);
    
    // Add word button
    const addButton = document.createElement('button');
    addButton.className = 'main-button add-word-button';
    addButton.innerHTML = '<i class="fas fa-plus"></i> Add Word';
    addButton.onclick = function() { addInlineWord(listId); };
    editContainer.appendChild(addButton);
    
    // Add after the list header
    listItem.appendChild(editContainer);
  }
  
  // Populate the word list
  populateInlineWordList(listId, editContainer.querySelector('.inline-word-translation-list'));
  
  // Unfold the list item if it's collapsed
  if (listItem.classList.contains('collapsed')) {
    listItem.classList.remove('collapsed');
  }
}

function populateInlineWordList(listId, container) {
  const list = CustomListsManager.lists.find(list => list.id === listId);
  if (!list || !container) return;
  
  container.innerHTML = '';
  
  if (Array.isArray(list.words)) {
    list.words.forEach((word, index) => {
      const translation = list.translations && index < list.translations.length ? list.translations[index] : '';
      
      const wordItem = document.createElement('div');
      wordItem.className = 'inline-word-translation-item';
      wordItem.draggable = true;
      wordItem.innerHTML = `
        <div class="drag-handle">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <span class="source-word" contenteditable="true">${word}</span>
        <input type="text" class="target-word" value="${translation}" placeholder="Hebrew translation">
        <button class="delete-word-btn" onclick="deleteInlineWord(this)">
          <i class="fas fa-times" style="font-size: 12px;"></i>
        </button>
      `;
      
      container.appendChild(wordItem);
      initializeInlineDragAndDrop(wordItem);
    });
  }
  
  makeInlineWordListDraggable(container);
}

function initializeInlineDragAndDrop(element) {
  if (!element) return;
  
  const clone = element.cloneNode(true);
  if (element.parentNode) {
    element.parentNode.replaceChild(clone, element);
  }
  
  element = clone;
  element.setAttribute('draggable', 'true');
  
  element.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    element.classList.add('dragging');
    e.dataTransfer.setData('text/plain', '');
  });
  
  element.addEventListener('dragend', (e) => {
    e.stopPropagation();
    element.classList.remove('dragging');
  });
  
  const deleteBtn = element.querySelector('.delete-word-btn');
  if (deleteBtn) {
    deleteBtn.onclick = () => deleteInlineWord(deleteBtn);
  }
  
  return element;
}

function makeInlineWordListDraggable(container) {
  if (!container) return;
  
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingElement = container.querySelector('.dragging');
    if (!draggingElement) return;
    
    const afterElement = getInlineDragAfterElement(container, e.clientY);
    if (afterElement) {
      container.insertBefore(draggingElement, afterElement);
    } else {
      container.appendChild(draggingElement);
    }
  });
  
  container.querySelectorAll('.inline-word-translation-item').forEach(item => {
    initializeInlineDragAndDrop(item);
  });
}

function getInlineDragAfterElement(container, y) {
  if (!container) return null;
  
  const draggableElements = [...container.querySelectorAll('.inline-word-translation-item:not(.dragging)')];
  
  return draggableElements.length ? draggableElements.reduce((closest, element) => {
    const box = element.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: element };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element : null;
}

function addInlineWord(listId) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${listId}"]`);
  if (!listItem) return;
  
  const container = listItem.querySelector('.inline-word-translation-list');
  if (!container) return;
  
  const wordItem = document.createElement('div');
  wordItem.className = 'inline-word-translation-item';
  wordItem.draggable = true;
  wordItem.innerHTML = `
    <div class="drag-handle">
      <i class="fas fa-grip-vertical"></i>
    </div>
    <span class="source-word" contenteditable="true"></span>
    <input type="text" class="target-word" placeholder="Hebrew translation">
    <button class="delete-word-btn" onclick="deleteInlineWord(this)">
      <i class="fas fa-times" style="font-size: 12px;"></i>
    </button>
  `;
  
  const newItem = container.appendChild(wordItem);
  initializeInlineDragAndDrop(newItem);
  
  if (container.children.length === 1) {
    makeInlineWordListDraggable(container);
  }
  
  newItem.querySelector('.source-word').focus();
}

function deleteInlineWord(button) {
  if (!button) return;
  const wordItem = button.closest('.inline-word-translation-item');
  if (wordItem) {
    wordItem.remove();
  }
}

function saveInlineEdit(listId) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${listId}"]`);
  if (!listItem) return;
  
  const list = CustomListsManager.lists.find(list => list.id === listId);
  if (!list) return;
  
  // Get the updated list name
  const nameInput = listItem.querySelector('.list-name-edit');
  const newName = nameInput ? nameInput.value.trim() : list.name;
  
  // Get all words and translations
  const words = [];
  const translations = [];
  
  listItem.querySelectorAll('.inline-word-translation-item').forEach(item => {
    const word = item.querySelector('.source-word').textContent.trim();
    const translation = item.querySelector('.target-word').value.trim();
    
    if (word && translation) {
      words.push(word);
      translations.push(translation);
    }
  });
  
  // Update the list object
  const updatedList = {
    ...list,
    name: newName,
    words: words,
    translations: translations
  };
  
  // Save changes
  CustomListsManager.save(updatedList).then(savedList => {
    if (savedList) {
      // Exit edit mode
      listItem.classList.remove('editing');
      
      // Update the edit button back to "Edit"
      const editButton = listItem.querySelector('.edit-button');
      if (editButton) {
        editButton.textContent = 'Edit';
      }
      
      // Update the list header
      const listHeader = listItem.querySelector('.list-header h3');
      if (listHeader) {
        listHeader.textContent = newName;
      }
      
      // Update the list preview
      const wordPreview = listItem.querySelector('.word-preview');
      if (wordPreview) {
        wordPreview.textContent = words.slice(0, 5).join(", ") + (words.length > 5 ? "..." : "");
      }
      
      // Update word count
      const wordCount = listItem.querySelector('.word-count');
      if (wordCount) {
        wordCount.textContent = words.length + " words";
        wordCount.classList.toggle('insufficient', words.length < 6);
      }
      
      // Hide the warning text if there are enough words
      const warningText = listItem.querySelector('.warning-text');
      if (warningText) {
        warningText.style.display = words.length < 6 ? '' : 'none';
      }
      
      // Enable/disable practice button
      const practiceButton = listItem.querySelector('.practice-button');
      if (practiceButton) {
        const canPractice = words.length >= 6;
        practiceButton.disabled = !canPractice;
        practiceButton.textContent = canPractice ? 'Practice' : `Need ${6 - words.length} more`;
        practiceButton.style.opacity = canPractice ? '1' : '0.6';
        practiceButton.style.cursor = canPractice ? 'pointer' : 'not-allowed';
        
        if (canPractice) {
          practiceButton.onclick = function() {
            startCustomListPractice(listId);
          };
        } else {
          practiceButton.onclick = null;
        }
      }
      
      showNotification('List saved successfully', 'success');
    } else {
      showNotification('Failed to save list', 'error');
    }
  });
}

// Add input event handlers to clear error styling when user starts typing



// Add this to help diagnose issues
window.debugUpgrade = function() {
  checkPopupStatus();
  console.log('Upgrade screen visible:', document.getElementById('upgrade-screen').classList.contains('visible'));
  console.log('Upgrade form:', document.getElementById('upgradeForm'));
  console.log('Current user:', currentUser);
};







// Add a debug function to check popup status
window.debugUpgrade = function() {
  const popups = document.querySelectorAll('.confirmation-popup');
  
  if (popups.length === 0) {
    console.log("No confirmation popups found in the DOM");
  } else {
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
  
  console.log("Upgrade screen visible:", document.getElementById('upgrade-screen').classList.contains('visible'));
  console.log("Upgrade form:", document.getElementById('upgradeForm'));
  
}

document.addEventListener('fullscreenchange', function() {
    const fullscreenIcon = document.querySelector('#nav-fullscreen-btn i');
    if (fullscreenIcon) {
        if (document.fullscreenElement) {
            fullscreenIcon.className = 'fas fa-compress';
        } else {
            fullscreenIcon.className = 'fas fa-expand';
        }
    }
});

const CoinController = {
    // Lock to prevent race conditions
    updateLock: false,
    pendingUpdates: [],
    activeAnimations: new Map(), // Track ongoing animations by element
    lastUpdateTimestamp: 0,
    
    // Single source of truth for updating coins
    // Inside CoinController object, replace the updateLocalCoins method
updateLocalCoins: function(newCoins, animate = true) {
    if (this.updateLock) {
        // Queue the update to be processed later
        this.pendingUpdates.push({newCoins, animate});
        return false;
    }
    
    try {
        this.updateLock = true;
        this.lastUpdateTimestamp = Date.now();
        
        // Store current value for animation
        const oldCoins = currentGame?.coins || 0;
        
        // Update to new value
        if (currentGame) {
            currentGame.coins = newCoins;
        }
        
        // Update all coin displays
        document.querySelectorAll('.coin-count').forEach(el => {
            if (animate) {
                this.animateCoinDisplay(el, oldCoins, newCoins);
            } else {
                el.textContent = newCoins;
            }
        });
        
        // Update participant data for arcade mode
        if (currentArcadeSession?.playerName) {
            const index = currentArcadeSession.participants.findIndex(
                p => p.username === currentArcadeSession.playerName
            );
            
            if (index !== -1) {
                currentArcadeSession.participants[index].coins = newCoins;
            }
        }
        
        // ALWAYS broadcast updates in arcade mode
        if (window.arcadeChannel && 
            currentArcadeSession?.playerName && 
            currentArcadeSession.state === 'active' &&
            window.arcadeChannel.subscription?.state === "SUBSCRIBED") {
            
            window.arcadeChannel.send({
                type: 'broadcast',
                event: 'progress_update',
                payload: {
                    username: currentArcadeSession.playerName,
                    wordsCompleted: currentGame?.wordsCompleted || 0,
                    coins: newCoins,
                    timestamp: Date.now(),
                    source: 'coinController'
                }
            });
        }
        
        // Always update powerups when coins change
        if (typeof updateArcadePowerups === 'function') {
            updateArcadePowerups();
        }
        
        return true;
    } finally {
        // Always unlock after a delay, even if there's an error
        setTimeout(() => {
            this.updateLock = false;
            
            // Process any pending updates
            if (this.pendingUpdates.length > 0) {
                const nextUpdate = this.pendingUpdates.shift();
                this.updateLocalCoins(nextUpdate.newCoins, nextUpdate.animate);
            }
        }, 300);
    }
},
    
    // Enhanced animation with proper cancellation
    animateCoinDisplay: function(element, startValue, endValue) {
        if (!element) return;
        
        // Cancel any ongoing animation for this element
        if (this.activeAnimations.has(element)) {
            cancelAnimationFrame(this.activeAnimations.get(element));
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
        const totalFrames = Math.ceil(duration / frameRate);
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
                
                // Save animation ID so it can be canceled
                const animId = requestAnimationFrame(animate);
                this.activeAnimations.set(element, animId);
            } else {
                // Ensure final value is exactly right
                element.textContent = endValue;
                this.activeAnimations.delete(element);
                
                setTimeout(() => {
                    element.style.color = '';
                    element.classList.remove('animating');
                }, 300);
            }
        };
        
        // Start animation and track ID
        const animId = requestAnimationFrame(animate);
        this.activeAnimations.set(element, animId);
    },
    
    // Add coins safely
    addCoins: function(amount) {
        if (!currentGame) return false;
        
        const newTotal = (currentGame.coins || 0) + amount;
        return this.updateLocalCoins(newTotal);
    },
    
    // Safe way to get current coins
    getCurrentCoins: function() {
        return currentGame?.coins || 0;
    }
};

function cleanupArcadeMode() {
    // Clear any arcade intervals
    if (window.arcadeStatsInterval) {
      clearInterval(window.arcadeStatsInterval);
      window.arcadeStatsInterval = null;
    }
    
    // Clear any timeout
    if (window.arcadeTimeouts) {
      window.arcadeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      window.arcadeTimeouts = [];
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