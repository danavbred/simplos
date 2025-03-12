
const DOMCache = {

    questionScreen: null,
    questionWord: null,
    buttonsContainer: null,
    progressCircle: null,
    timerValue: null,
    coinCount: null,
  

    init() {
      this.questionScreen = document.getElementById('question-screen');
      this.questionWord = document.getElementById('question-word');
      this.buttonsContainer = document.getElementById('buttons');
      this.progressCircle = document.querySelector('.progress-circle .progress');
      this.timerValue = document.querySelector('.timer-value');
      this.coinCount = document.querySelectorAll('.coin-count');
      

    }
  };

  

  document.addEventListener('DOMContentLoaded', () => {
    DOMCache.init();
  });


async function trackWordEncounter(word, gameMode = 'standard') {

    if (!currentUser || !currentUser.id) {
      console.log('No user logged in, skipping word tracking');
      return null;
    }
  
    try {

      const trimmedWord = String(word).trim();
      const userId = currentUser.id;
      

      await ensureUserInitialization(userId);
      

      const startTime = performance.now();
      
      try {

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
        

        if (error) {
          console.error("Error fetching word history:", error);
          return { isNewWord: false, coinReward: 0, error };
        }
        

        if (data && data.length > 0) {

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
        

        if (coinReward > 0 && gameMode !== 'arcade') {

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
    console.warn("Answer too quickly. Please wait a moment.");
    return;
  }
  

  if (currentGame.isProcessingAnswer) {
      console.warn("Already processing an answer, please wait");
      return;
  }
  
  try {

      currentGame.isProcessingAnswer = true;
      currentGame.lastAnswerTime = now;
      
      const playerName = currentArcadeSession.playerName || 
                        currentUser?.user_metadata?.username || 
                        getRandomSimploName();
      
      if (isCorrect) {

          currentGame.wordsCompleted = (currentGame.wordsCompleted || 0) + 1;
          currentGame.correctStreak = (currentGame.correctStreak || 0) + 1;
          currentGame.wrongStreak = 0;
          

          if (currentGame.currentWordIndex !== undefined && 
              currentGame.currentWordIndex >= 0 &&
              currentGame.words && 
              currentGame.words.length > currentGame.currentWordIndex) {
              

              currentGame.words.splice(currentGame.currentWordIndex, 1);
              console.log(`Word removed from pool. Pool size: ${currentGame.words.length}`);
          }
          

          if (currentUser && currentUser.status === 'premium') {

              if (currentGame.currentWord) {
                  const word = currentGame.isHebrewToEnglish ? 
                      currentGame.currentWord.translation : 
                      currentGame.currentWord.word;
                  

                  trackWordEncounterWithoutCoins(word, 'arcade')
                      .then(() => {

                          broadcastCurrentParticipantData();
                      })
                      .catch(err => 
                          console.error('Error tracking word in arcade:', err)
                      );
              }
          }
          
          let coinReward = 5;
if (currentGame.correctStreak >= 3) {
    coinReward += 1;
} else if (currentGame.correctStreak >= 6) {
    coinReward += 2;
} else if (currentGame.correctStreak > 6) {
    coinReward += 3;
}
          

          if (currentUser && currentUser.status === 'premium') {
              coinReward += 2;
          }
          

          CoinsManager.updateCoins(coinReward).then(() => {

              if (typeof updateArcadePowerups === 'function') {
                  updateArcadePowerups();
              }
              

              updatePlayerRankDisplay();
              

              updateArcadeProgress();
              

              updatePlayerProgress({
                  username: playerName,
                  wordsCompleted: currentGame.wordsCompleted,
                  coins: currentGame.coins
              });
              

              broadcastCurrentParticipantData();
              

              if (currentGame.wordsCompleted >= currentArcadeSession.wordGoal) {
                  handlePlayerCompletedGoal(playerName);

                  currentGame.isProcessingAnswer = false;
                  return;
              }
              

              setTimeout(() => {
                  loadNextArcadeQuestion();
                  currentGame.isProcessingAnswer = false;
              }, 300);
          }).catch(err => {
              console.error("Error updating coins:", err);
              currentGame.isProcessingAnswer = false;
              

              setTimeout(loadNextArcadeQuestion, 500);
          });
      } else {

          currentGame.correctStreak = 0;
          currentGame.wrongStreak = (currentGame.wrongStreak || 0) + 1;
          

          updatePlayerProgress({
              username: playerName,
              wordsCompleted: currentGame.wordsCompleted,
              coins: currentGame.coins
          });
          
          if (rank > 0 && rank <= 3) {
            const rankBonuses = {
                1: 50,
                2: 40,
                3: 30
            };
            const bonus = rankBonuses[rank];
            

            if (currentGame) {
                currentGame.coins += bonus;

                document.querySelectorAll('.coin-count').forEach(el => {
                    el.textContent = currentGame.coins.toString();
                });
            }
            

            showNotification(`Ranked #${rank}: +${bonus} coins bonus!`, 'success');
        }


          broadcastCurrentParticipantData();
          

          setTimeout(() => {
              loadNextArcadeQuestion();
              currentGame.isProcessingAnswer = false;
          }, 300);
      }
  } catch (error) {
      console.error("Error in handleArcadeAnswer:", error);
      currentGame.isProcessingAnswer = false;
      

      setTimeout(() => {
          loadNextArcadeQuestion();
      }, 1000);
  }
}

function initialArcadeSession() {
  console.log("Initializing arcade session");

  if (currentArcadeSession && currentArcadeSession.wordPool && Array.isArray(currentArcadeSession.wordPool)) {

      currentGame.initialWordPool = JSON.parse(JSON.stringify(currentArcadeSession.wordPool));
      currentGame.words = JSON.parse(JSON.stringify(currentArcadeSession.wordPool));
      
      console.log(`Initial arcade word pool created with ${currentGame.initialWordPool.length} words`);
      

      if (currentGame.initialWordPool.length === 0) {
          console.warn("Empty word pool detected during initialization");
      }
  } else {
      console.error("Error initializing arcade word pool - invalid source data");
  }
}


const CoinController = {
    lastUpdate: 0,
    

    getCurrentCoins() {
        return currentGame?.coins || 0;
    },
    

    updateLocalCoins(newTotal) {
        if (!currentGame) return false;
        
        const oldValue = currentGame.coins || 0;
        currentGame.coins = newTotal;
        

        document.querySelectorAll('.coin-count').forEach(el => {
            animateCoinsChange(el, oldValue, newTotal);
        });
        

        if (typeof updateArcadePowerups === 'function') {
            updateArcadePowerups();
        }
        
        this.lastUpdate = Date.now();
        return true;
    }
};




async function syncPremiumUserCoins() {
  if (!currentUser || currentUser.status !== 'premium' || !currentArcadeSession.playerName) {
      return false;
  }
  
  try {

      const coins = await getCurrentCoinsForArcade();
      if (!coins) return false;
      
      console.log(`Synchronizing premium user coins: ${coins} for ${currentArcadeSession.playerName}`);
      

      if (currentGame) currentGame.coins = coins;
      gameState.coins = coins;
      

      document.querySelectorAll('.coin-count').forEach(el => {
          el.textContent = coins.toString();
      });
      

      if (window.arcadeChannel) {
          window.arcadeChannel.send({
              type: 'broadcast',
              event: 'premium_user_coins',
              payload: {
                  username: currentArcadeSession.playerName,
                  coins: coins,
                  wordsCompleted: currentGame?.wordsCompleted || 0,
                  isPremium: true,
                  timestamp: Date.now(),
                  isTrusted: true,
                  source: 'premiumCoinsSync'
              }
          });
      }
      

      updatePlayerProgress({
          username: currentArcadeSession.playerName,
          coins: coins,
          wordsCompleted: currentGame?.wordsCompleted || 0,
          isPremium: true,
          isTrusted: true,
          source: 'premiumCoinsSync'
      });
      

      updateAllPlayersProgress();
      
      return true;
  } catch (error) {
      console.error('Error synchronizing premium user coins:', error);
      return false;
  }
}

function initializeArcadeSession() {
    console.log("Initializing arcade session data structures");
    

    if (currentArcadeSession) {

        const preservedData = {
            otp: currentArcadeSession.otp,
            teacherId: currentArcadeSession.teacherId,
            selectedCustomLists: currentArcadeSession.selectedCustomLists || []
        };
        

        currentArcadeSession = {

            otp: preservedData.otp,
            teacherId: preservedData.teacherId,
            selectedCustomLists: preservedData.selectedCustomLists,
            

            wordPool: [],
            participants: [],
            wordGoal: 50,
            state: 'pre-start',
            completedPlayers: [],
            podiumRanks: {},
            startTime: null,
            endTime: null,
            winnerScreenShown: false,
            isInitialized: false,
            initialCoins: 0,
            joinEventSent: false,
            celebrationTriggered: false
        };
    }
    

    currentGame = {
        currentIndex: 0,
        correctStreak: 0,
        wrongStreak: 0,
        words: [],
        wordsCompleted: 0,
        coins: 0,
        lastBroadcast: Date.now(),
        lastAnswerTime: 0,
        isLoadingQuestion: false,
        isProcessingAnswer: false
    };
    

    cleanupArcadeTimers();
    
    console.log("Arcade session initialized with fresh state");
    return currentArcadeSession;
}

function cleanupArcadeTimers() {

    if (window.arcadeStatsInterval) {
        clearInterval(window.arcadeStatsInterval);
        window.arcadeStatsInterval = null;
    }
    

    if (window.arcadeTimeouts && Array.isArray(window.arcadeTimeouts)) {
        window.arcadeTimeouts.forEach(timeoutId => {
            if (timeoutId) clearTimeout(timeoutId);
        });
        window.arcadeTimeouts = [];
    }
    

    if (window.arcadeCheckInterval) {
        clearInterval(window.arcadeCheckInterval);
        window.arcadeCheckInterval = null;
    }
    
    if (window.arcadeBroadcastInterval) {
        clearInterval(window.arcadeBroadcastInterval);
        window.arcadeBroadcastInterval = null;
    }
    
    console.log("All arcade timers and intervals cleared");
}

function setupArcadeProgressPolling() {

    if (window.arcadeStatsInterval) {
        clearInterval(window.arcadeStatsInterval);
        window.arcadeStatsInterval = null;
    }
    

    window.arcadeStatsInterval = setInterval(() => {
        if (currentArcadeSession && 
            currentArcadeSession.state === 'active' && 
            currentArcadeSession.playerName) {
            

            const timeSinceLastBroadcast = Date.now() - (currentGame.lastBroadcast || 0);
            
            if (currentGame && 
                (currentGame.wordsCompleted > 0 || currentGame.coins > 0) && 
                timeSinceLastBroadcast > 2000) {
                
                broadcastCurrentParticipantData();
                currentGame.lastBroadcast = Date.now();
            }
        }
    }, 5000);
    
    console.log("Arcade progress polling initialized");
    return window.arcadeStatsInterval;
}

  function setupArcadeProgressPolling() {

    if (window.arcadeStatsInterval) {
      clearInterval(window.arcadeStatsInterval);
    }
    

    window.arcadeStatsInterval = setInterval(() => {
      if (currentArcadeSession && 
          currentArcadeSession.state === 'active' && 
          currentArcadeSession.playerName) {

        if (currentGame && (currentGame.wordsCompleted > 0 || currentGame.coins > 0)) {
          broadcastCurrentParticipantData();
        }
      }
    }, 5000);
    
    return window.arcadeStatsInterval;
  }


const currentArcadeSessionStructure = {
    eventId: null,
    otp: null,
    wordPool: [],
    participants: [],
    teacherId: null,
    wordGoal: 50,
    state: 'pre-start',
    completedPlayers: [],
    startTime: null,
    endTime: null,
    

    podiumRanks: {

    },
    

    playerName: null,
    winnerScreenShown: false
};









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
        
        if (delta >= 1000) {
            this.updateTimer();
            this.lastTick = timestamp;
        }
        
        requestAnimationFrame(this.update.bind(this));
    }
};

function cleanupLevel() {

    document.querySelectorAll('.buttons button').forEach(btn => {
        btn.onclick = null;
    });
    

    ParticleSystem.clear();
    

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
        

        await checkExistingSession();
        
        if (currentUser) {
            console.log("User is logged in, checking database schema");

            const schemaOk = await ensureCorrectSchema();
            
            if (schemaOk) {

                console.log("Schema is OK, loading progress from database");
                await loadUserGameProgress(currentUser.id);
            } else {
                console.log("Schema issues detected, loading from localStorage and initializing defaults");

                initializeGame();
            }
        } else {
            console.log("No user logged in, initializing local game state");

            initializeGame();
        }
        

        updatePerkButtons();
        initializeParticles(document.getElementById("welcome-screen"));
        

        await loadCustomLists();
        

        setupAutoSave();
        

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
    

    gameState.currentStage = 1;
    gameState.currentSet = 1;
    gameState.currentLevel = 1;
    gameState.coins = 0;
    gameState.perks = {};
    gameState.unlockedSets = {};
    gameState.unlockedLevels = {};
    gameState.perfectLevels = new Set();
    gameState.completedLevels = new Set();
    

    const savedProgress = localStorage.getItem("simploxProgress");
    if (savedProgress) {
        try {
            console.log("Found saved progress in localStorage");
            const progress = JSON.parse(savedProgress);
            

            if (progress.stage) gameState.currentStage = progress.stage;
            if (progress.set_number) gameState.currentSet = progress.set_number;
            if (progress.level) gameState.currentLevel = progress.level;
            if (progress.coins) gameState.coins = progress.coins;
            if (progress.perks) gameState.perks = progress.perks;
            

            if (progress.unlocked_sets) {
                Object.entries(progress.unlocked_sets).forEach(([stage, sets]) => {
                    gameState.unlockedSets[stage] = new Set(Array.isArray(sets) ? sets : []);
                });
            }
            

            if (progress.unlocked_levels) {
                Object.entries(progress.unlocked_levels).forEach(([setKey, levels]) => {
                    gameState.unlockedLevels[setKey] = new Set(Array.isArray(levels) ? levels : []);
                });
            }
            

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
    

    const savedContext = localStorage.getItem("gameContext");
    if (savedContext) {
        try {
            const context = JSON.parse(savedContext);
            const timeSinceContext = Date.now() - (context.timestamp || 0);
            

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
    

    console.group('Unlocked Sets');
    Object.entries(gameState.unlockedSets).forEach(([stageId, sets]) => {
        console.log(`Stage ${stageId}:`, Array.from(sets).sort((a, b) => a - b));
    });
    console.groupEnd();
    

    console.group('Unlocked Levels');
    Object.entries(gameState.unlockedLevels).forEach(([setKey, levels]) => {
        console.log(`Set ${setKey}:`, Array.from(levels).sort((a, b) => a - b));
    });
    console.groupEnd();
    

    console.log('Completed Levels:', Array.from(gameState.completedLevels));
    console.log('Perfect Levels:', Array.from(gameState.perfectLevels));
    console.groupEnd();
}



function clearCustomPracticeUI() {

    const listNameInput = document.getElementById('custom-list-name');
    if (listNameInput) {
        listNameInput.value = '';
    }


    const wordInput = document.getElementById('custom-word-input');
    if (wordInput) {
        wordInput.value = '';
    }


    const translationResults = document.getElementById('translation-results');
    if (translationResults) {
        translationResults.style.display = 'none';
    }


    const wordList = document.getElementById('word-translation-list');
    if (wordList) {
        wordList.innerHTML = '';
    }


    customPracticeLists.currentList = null;
    customPracticeLists.lists = [];
}

const gameState = {
    currentStage: 1,
    currentSet: 1,
    currentLevel: 1,
    coins: 0,
    perks: {
      timeFreeze: 0,
      skip: 0,
      clue: 0,
      reveal: 0
    },
    unlockedSets: {},
    unlockedLevels: {},
    perfectLevels: new Set(),
    completedLevels: new Set(),

    sessionStartTime: null,
  };



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
  
  function updatePerkButtons() {
    PerkManager.updateAllPerkButtons();
}



document.addEventListener('DOMContentLoaded', function() {

    PerkManager.init();
    

    PerkManager.updateAllPerkButtons();
    
    console.log("PerkManager initialized");
});

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



function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerElement = document.querySelector('.timer-value');
    
    if (timerElement) {
        timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        

        if (timeRemaining <= 10) {
            timerElement.classList.add('warning');
        } else {
            timerElement.classList.remove('warning');
        }
    }
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


  timerProgress.classList.remove('warning', 'caution');
  

  if (percentage <= 0.25) {
      timerProgress.classList.add('warning');
  } else if (percentage <= 0.5) {
      timerProgress.classList.add('caution');
  }

}

function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    timeRemaining = 0;
    isFrozen = false;
    
    const timerElement = document.querySelector('.timer-value');
    if (timerElement) {
      timerElement.classList.remove('warning');
    }
    
    updateTimerCircle(0, 1);
  }
  

  function startTimer(questionCount) {
    clearTimer();
    if (currentGame.currentIndex >= currentGame.words.length) return;
    

    if (!currentGame.initialTimeRemaining) {

      const secondsPerQuestion = currentGame.isBossLevel ? 4 : 5;
      currentGame.initialTimeRemaining = questionCount * secondsPerQuestion;
      timeRemaining = currentGame.initialTimeRemaining;
      currentGame.totalTime = timeRemaining;
    } else {

      timeRemaining = currentGame.initialTimeRemaining;
    }
    
    console.log('Starting timer with:', timeRemaining, 'seconds');
    currentGame.questionStartTime = Date.now();
    

    updateTimerDisplay();
    updateTimerCircle(timeRemaining, currentGame.totalTime, true);
    
    let lastTickTime = Date.now();
    timer = setInterval(() => {
      if (!isFrozen) {
        const currentTime = Date.now();

        const shouldUpdateVisual = (currentTime - lastTickTime) >= 250;
        
        timeRemaining = Math.max(0, timeRemaining - 1);
        updateTimerDisplay();
        

        if (shouldUpdateVisual) {
          updateTimerCircle(timeRemaining, currentGame.totalTime);
          lastTickTime = currentTime;
        }
        

        currentGame.initialTimeRemaining = timeRemaining;
        
        if (timeRemaining <= 0) {
          handleTimeUp();
        }
      }
    }, 1000);
}


const LEADERBOARD_UPDATE_INTERVAL = 10000;

function updatePlayerProgress(e) {
  if (!e || !e.username) return false;
  
  const timestamp = Date.now();
  const lastUpdated = window.lastProgressUpdate || 0;
  

  if (timestamp - lastUpdated < 10) {
      return false;
  }
  
  window.lastProgressUpdate = timestamp;
  

  const isPremiumCoinsSync = e.source === 'premiumCoinsSync';
  const isPlayerJoin = e.source === 'playerJoin';
  const isPremiumUser = e.isPremium === true;
  

  if (isPremiumUser && e.coins > 0) {
    console.log(`Processing update for premium user ${e.username} with ${e.coins} coins (source: ${e.source || 'unknown'})`);
  }
  

  let skipFiltering = isPremiumCoinsSync || isPlayerJoin || (isPremiumUser && e.coins > 0);
  

  if (e.username === currentArcadeSession.playerName && !skipFiltering) {

      const isTrustedSource = e.isTrusted === true || 
                              e.source === 'coinsManager' || 
                              e.source === 'coinController' ||
                              e.source === 'progressUpdate' ||
                              e.source === 'statsReport';
                         
      const isRecentUpdate = Math.abs(timestamp - (CoinsManager.lastUpdateTimestamp || 0)) < 1000;
      
      if (!isTrustedSource && isRecentUpdate) {
          console.log(`Ignoring untrusted update for ${e.username}`);
          return true;
      }
  }
  

  const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === e.username);
  
  if (playerIndex !== -1) {
      const player = currentArcadeSession.participants[playerIndex];
      const currentWordsCompleted = player.wordsCompleted || 0;
      const currentCoins = player.coins || 0;
      const newWordsCompleted = e.wordsCompleted !== undefined ? e.wordsCompleted : currentWordsCompleted;
      const newCoins = e.coins !== undefined ? e.coins : currentCoins;
      

      if (isPremiumUser && newCoins > 0 && newCoins !== currentCoins) {
        console.log(`Updating coins for premium user ${e.username}: ${currentCoins} → ${newCoins}`);
      }
      

      if (newWordsCompleted < currentWordsCompleted) {
          console.warn(`Prevented progress downgrade for ${e.username}: ${currentWordsCompleted} → ${newWordsCompleted}`);
          e.wordsCompleted = currentWordsCompleted;
      }
      
      if (newCoins < currentCoins) {
          console.warn(`Prevented coin downgrade for ${e.username}: ${currentCoins} → ${newCoins}`);
          e.coins = currentCoins;
      }
      

      const forceUpdate = isPremiumUser && e.coins > 0;
      

      currentArcadeSession.participants[playerIndex] = {
          ...player,
          ...e,
          wordsCompleted: Math.max(currentWordsCompleted, newWordsCompleted),
          coins: forceUpdate ? newCoins : Math.max(currentCoins, newCoins),
          isPremium: e.isPremium || player.isPremium
      };
      

      if (isPremiumUser && newCoins > 0) {
        const leaderboard = document.getElementById('arcade-leaderboard');
        if (leaderboard) {
          console.log(`Forcing leaderboard update for premium user ${e.username}`);
          window.lastLeaderboardUpdate = 0;
          updateAllPlayersProgress();
        }
      }
  } else {

      console.log(`Adding new participant: ${e.username} (coins: ${e.coins}, premium: ${e.isPremium})`);
      currentArcadeSession.participants.push({
          username: e.username,
          wordsCompleted: e.wordsCompleted || 0,
          coins: e.coins || 0,
          lateJoin: e.lateJoin || false,
          isPremium: e.isPremium || false
      });
      

      if (isPremiumUser && e.coins > 0) {
        const leaderboard = document.getElementById('arcade-leaderboard');
        if (leaderboard) {
          console.log(`Forcing leaderboard update for new premium user ${e.username}`);
          window.lastLeaderboardUpdate = 0;
          updateAllPlayersProgress();
        }
      }
  }
  

  if (e.username === currentArcadeSession.playerName && (e.isTrusted || isPremiumCoinsSync)) {
      gameState.coins = e.coins;
      if (currentGame) currentGame.coins = e.coins;
  }
  

  const leaderboard = document.getElementById('arcade-leaderboard');
  if (leaderboard && leaderboard.offsetParent !== null) {
      const timeSinceLastLeaderboardUpdate = timestamp - (window.lastLeaderboardUpdate || 0);
      

      const forceUpdate = isPremiumUser && e.coins > 0;
      
      if (forceUpdate || timeSinceLastLeaderboardUpdate > LEADERBOARD_UPDATE_INTERVAL) {
          window.lastLeaderboardUpdate = timestamp;
          updateAllPlayersProgress();
      }
  }
  

  updatePlayerRankDisplay();
  
  return true;
}

async function syncPremiumUserCoinsImmediately() {
  if (!currentUser || currentUser.status !== 'premium' || !currentArcadeSession.playerName) {
    return false;
  }
  
  try {

    const { data, error } = await supabaseClient
      .from('game_progress')
      .select('coins')
      .eq('user_id', currentUser.id)
      .single();
      
    if (error) {
      console.error("Error fetching premium user coins:", error);
      return false;
    }
    
    const coins = data.coins || 0;
    console.log(`Premium user immediate coins sync: ${coins} coins for ${currentArcadeSession.playerName}`);
    

    if (currentGame) currentGame.coins = coins;
    gameState.coins = coins;
    

    document.querySelectorAll('.coin-count').forEach(el => {
      el.textContent = coins.toString();
    });
    

    if (window.arcadeChannel) {
      await window.arcadeChannel.send({
        type: 'broadcast',
        event: 'premium_user_coins',
        payload: {
          username: currentArcadeSession.playerName,
          coins: coins,
          wordsCompleted: currentGame?.wordsCompleted || 0,
          isPremium: true,
          timestamp: Date.now(),
          isTrusted: true,
          source: 'premiumCoinsSync',
          priority: 'high',
          initialSync: true
        }
      });
    }
    

    const playerIndex = currentArcadeSession.participants.findIndex(
      p => p.username === currentArcadeSession.playerName
    );
    
    if (playerIndex !== -1) {
      currentArcadeSession.participants[playerIndex].coins = coins;
      currentArcadeSession.participants[playerIndex].isPremium = true;
    } else {

      currentArcadeSession.participants.push({
        username: currentArcadeSession.playerName,
        wordsCompleted: 0,
        coins: coins,
        isPremium: true
      });
    }
    

    window.lastLeaderboardUpdate = 0;
    updateAllPlayersProgress();
    
    return true;
  } catch (error) {
    console.error('Error in syncPremiumUserCoinsImmediately:', error);
    return false;
  }
}


function resetCoinsToZero() {
    console.log("Resetting all coins to zero");
    
    try {

        if (gameState) {
            gameState.coins = 0;
        }
        

        if (currentGame) {
            currentGame.coins = 0;
        }
        

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
        

        document.querySelectorAll('.coin-count').forEach(el => {
            el.textContent = '0';
        });
        
        console.log("Coins reset complete");
    } catch (error) {
        console.error("Error in resetCoinsToZero:", error);
    }
}

document.addEventListener('DOMContentLoaded', function() {

  const logoutButton = document.querySelector('.logout-button') || 
                        document.querySelector('#logoutButton') ||
                        document.querySelector('[data-action="logout"]');
  
  if (logoutButton) {

      const originalOnClick = logoutButton.onclick;
      

      logoutButton.onclick = function(event) {

          resetCoinsToZero();
          
          console.log("Coins reset as part of logout process");
          

          if (localStorage.getItem("gameContext")) {
              localStorage.removeItem("gameContext");
          }
          

          currentGame = null;
          gameState.currentLevel = null;
          gameState.currentSet = null;
          gameState.currentStage = null;
          gameState.sessionStartTime = null;
          

          window.preventAutoResume = true;
          

          setTimeout(() => {
              showScreen("welcome-screen");
              

              setTimeout(() => {
                window.preventAutoResume = false;
              }, 1000);
          }, 300);
          

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
          source: 'progressUpdate'
        }
      });
      

      const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === playerName);
      if (playerIndex !== -1) {
        currentArcadeSession.participants[playerIndex].wordsCompleted = currentWords;
        currentArcadeSession.participants[playerIndex].coins = currentCoins;
      } else {
        currentArcadeSession.participants.push({
          username: playerName,
          wordsCompleted: currentWords,
          coins: currentCoins
        });
      }
      

      updateAllPlayersProgress();
      
      return true;
    } catch (err) {
      console.error("Error broadcasting participant data:", err);
      return false;
    }
  }

function requestAllPlayerStats() {
    if (!window.arcadeChannel) return;
    
    console.log("Requesting latest stats from all players");
    
    window.arcadeChannel.send({
        type: 'broadcast',
        event: 'request_latest_stats',
        payload: {
            timestamp: Date.now(),
            requesterId: currentUser?.id || 'unknown'
        }
    });
    

    if (currentArcadeSession.playerName) {
        updatePlayerProgress({
            username: currentArcadeSession.playerName,
            wordsCompleted: currentGame?.wordsCompleted || 0,
            coins: currentGame?.coins || 0,
            isTrusted: true
        });
    }
}

function debugArcadeState() {
    console.group("Arcade Debug Information");
    

    console.log("Session State:", {
        state: currentArcadeSession.state,
        playerName: currentArcadeSession.playerName,
        wordGoal: currentArcadeSession.wordGoal,
        participantCount: currentArcadeSession.participants?.length || 0,
        wordPoolSize: currentArcadeSession.wordPool?.length || 0,
        selectedCustomLists: currentArcadeSession.selectedCustomLists
    });
    

    console.log("Game State:", {
        wordsCompleted: currentGame.wordsCompleted,
        coins: currentGame.coins,
        wordsRemaining: currentGame.words?.length || 0,
        isLoadingQuestion: currentGame.isLoadingQuestion,
        isProcessingAnswer: currentGame.isProcessingAnswer,
        lastAnswerTime: currentGame.lastAnswerTime ? new Date(currentGame.lastAnswerTime).toISOString() : 'never',
        timeSinceLastBroadcast: Date.now() - (currentGame.lastBroadcast || 0)
    });
    

    console.log("Channel State:", {
        channel: window.arcadeChannel?.topic || 'not initialized',
        subscriptionState: window.arcadeChannel?.subscription?.state || 'not subscribed',
        hasStatsInterval: !!window.arcadeStatsInterval,
        hasTimeouts: window.arcadeTimeouts?.length || 0
    });
    

    console.log("DOM State:", {
        questionScreenVisible: document.getElementById('question-screen')?.classList.contains('visible'),
        questionWordContent: document.getElementById('question-word')?.textContent,
        buttonCount: document.querySelectorAll('.buttons button')?.length || 0
    });
    
    console.groupEnd();
}


window.debugArcade = debugArcadeState;

  function animateCoinsChange(element, startValue, endValue) {
    if (!element) return;
    

    if (element.coinAnimationId) {
        cancelAnimationFrame(element.coinAnimationId);
        element.coinAnimationId = null;
    }
    
    startValue = parseFloat(startValue) || 0;
    endValue = parseFloat(endValue) || 0;
    

    if (startValue === endValue) {
        element.textContent = endValue;
        return;
    }
    

    const duration = 600; 
    const frameRate = 1000 / 60;
    const totalFrames = duration / frameRate;
    const changePerFrame = (endValue - startValue) / totalFrames;
    
    let currentFrame = 0;
    let currentValue = startValue;
    
    element.classList.add('animating');
    
    const animate = function() {
        currentFrame++;
        currentValue += changePerFrame;
        

        if (currentFrame <= totalFrames && 
            ((changePerFrame > 0 && currentValue < endValue) || 
             (changePerFrame < 0 && currentValue > endValue))) {
            
            element.textContent = Math.round(currentValue);
            
            if (changePerFrame > 0) {
                element.style.color = 'var(--success)';
            } else if (changePerFrame < 0) {
                element.style.color = 'var(--error)';
            }
            

            element.coinAnimationId = requestAnimationFrame(animate);
        } else {

            element.textContent = endValue;
            element.coinAnimationId = null;
            
            setTimeout(() => {
                element.style.color = '';
                element.classList.remove('animating');
            }, 300);
        }
    };
    

    element.coinAnimationId = requestAnimationFrame(animate);
}

function handleTimeUp() {
    if (currentGame.currentIndex >= currentGame.words.length) return;
    
    clearTimer();
    showReviveOverlay();
}



document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        console.log('Exited full-screen');
    }
});




function calculateWordsForLevel(level, vocabulary) {
    const totalWords = vocabulary.words.length;
    const wordSurplus = totalWords - 50;



    if (!vocabulary.randomIndices) {

        vocabulary.randomIndices = Array.from({ length: totalWords }, (_, i) => i);

        for (let i = vocabulary.randomIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [vocabulary.randomIndices[i], vocabulary.randomIndices[j]] = 
            [vocabulary.randomIndices[j], vocabulary.randomIndices[i]];
        }
        console.log('Created randomized word indices:', vocabulary.randomIndices);
    }


    if (level === 21) {
        return {
            startIndex: 0,
            count: totalWords,
            isBossLevel: true,
            speedChallenge: true,
            mixed: true,
            isTestLevel: true,
            isHebrewToEnglish: Math.random() < 0.5,
            testLevels: [],
            randomIndices: vocabulary.randomIndices
        };
    }


    if (level === 1 || level === 2) {

        const startPos = (level - 1) * 3;
        return {
            startIndex: startPos,
            count: 3,
            testLevels: [3, 10, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 3)
        };
    }


    if (level === 3) {

        return {
            startIndex: 0,
            count: 6,
            isTestLevel: true,
            mixed: true,
            isHebrewToEnglish: Math.random() < 0.5,
            randomIndices: vocabulary.randomIndices.slice(0, 6)
        };
    }


    if (level === 4 || level === 5) {
        const startPos = 6 + (level - 4) * 3;
        return {
            startIndex: startPos,
            count: 3,
            testLevels: [6, 10, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 3)
        };
    }


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


    if (level === 7 || level === 8) {
        const startPos = 12 + (level - 7) * 4;
        return {
            startIndex: startPos,
            count: 4,
            testLevels: [9, 10, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 4)
        };
    }


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


    if (level === 11 || level === 12) {
        const startPos = 20 + (level - 11) * 4;
        return {
            startIndex: startPos,
            count: 4,
            testLevels: [13, 20, 21],
            randomIndices: vocabulary.randomIndices.slice(startPos, startPos + 4)
        };
    }


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
  

  const gameContext = {
    stage: gameState.currentStage,
    set: gameState.currentSet,
    level: level,
    timestamp: Date.now()
  };
  
  console.log("Setting game context at level start:", gameContext);
  localStorage.setItem("gameContext", JSON.stringify(gameContext));
  

  if (!gameState.sessionStartTime) {
    gameState.sessionStartTime = Date.now();
  }
  

  updateStageBackground();
  

  currentGame.wrongStreak = 0;
  currentGame.correctAnswers = 0;
  currentGame.levelStartTime = Date.now();
  currentGame.firstAttempt = true;
  currentGame.streakBonus = true;
  currentGame.wordsLearned = 0;


  currentGame.coinAwardedWords = new Set();
  currentGame.mistakeRegisteredWords = new Set();
  updatePerkButtons();
  
  console.log("Current unlocked levels:", gameState.unlockedLevels);    
  const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
  console.log(`Current set key: ${setKey}, unlocked levels in set:`, 
    gameState.unlockedLevels[setKey] ? Array.from(gameState.unlockedLevels[setKey]) : "none");
  

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
  

  if (level === 21) {
    currentGame.isBossLevel = true;
    console.log("Boss level detected");
    setTimeout(applyBossLevelStyles, 100);
    setTimeout(applyBossLevelStyles, 500);
  } else {
    currentGame.isBossLevel = false;
  }
  





  const forceFullIntro = level === 21 || level === 1 || gameState.comingFromWelcome;
  

  if (gameState.comingFromWelcome) {
    gameState.comingFromWelcome = false;
  }
  
  proceedWithLevel(level, forceFullIntro);
}

function findFurthestProgression() {
    console.log("Finding furthest progression");
    

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
    

    if (gameState.currentStage && gameState.currentSet && gameState.currentLevel) {
        console.log(`Using current game state: Stage ${gameState.currentStage}, Set ${gameState.currentSet}, Level ${gameState.currentLevel}`);
        return {
            stage: gameState.currentStage,
            set: gameState.currentSet,
            level: gameState.currentLevel
        };
    }
    

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


function proceedWithLevel(levelId) {
    if (!currentGame.restartsRemaining) {
        currentGame.restartsRemaining = 2;
    }
    
    gameState.currentLevel = levelId;
    const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
    const vocabulary = vocabularySets[setKey];


    const coinDisplay = document.querySelector('.coin-count');
    if (coinDisplay) {
        coinDisplay.textContent = gameState.coins || 0;
        coinDisplay.style.display = 'block';
    }


    currentGame.startingCoins = gameState.coins;
    currentGame.startingPerks = { ...gameState.perks };
    currentGame.timeBonus = 0;
    currentGame.initialTimeRemaining = null;
    currentGame.streakBonus = true;
    currentGame.levelStartTime = Date.now();
    

    showLevelIntro(levelId, () => {

        const levelConfig = calculateWordsForLevel(levelId, vocabulary);
        setupGameState(levelConfig, vocabulary);
        

        showScreen('question-screen');
        updateProgressCircle();
        loadNextQuestion();
        

        setTimeout(() => {
            startTimer(currentGame.words.length);
        }, 200);
    });
}

function setupGameState(levelConfig, vocabulary) {
    if (typeof levelConfig === 'object') {

        if (levelConfig.randomIndices) {

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

        localStorage.setItem("completedTrialStage", gameState.currentStage);

        gameState.sessionStartTime = null;
        return showScreen("welcome-screen"), void setTimeout((()=>{
          showUpgradePrompt()
        }), 500);
      }
      
      if (n) {
        if (gameState.currentStage < 5) {
          gameState.currentStage++;
          gameState.currentSet = 1;

          gameState.sessionStartTime = null;
          startLevel(1);
        } else {

          gameState.sessionStartTime = null;
          showScreen("stage-screen");
        }
      } else {
        gameState.currentSet++;

        gameState.sessionStartTime = null;
        startLevel(1);
      }
    } else {
      startLevel(gameState.currentLevel + 1);
    }
  }


function updateProgressCircle() {
  const progressElement = document.querySelector('.progress-circle .progress');
  if (!progressElement) return;
  

  progressElement.style.willChange = 'stroke-dashoffset, stroke';
  
  const circumference = 2 * Math.PI * 54;
  const progress = currentGame.currentIndex / currentGame.words.length;


  const transitionNeeded = !progressElement.dataset.lastProgress || 
                          Math.abs(parseFloat(progressElement.dataset.lastProgress) - progress) > 0.01;
                          
  if (transitionNeeded) {
      progressElement.style.transition = 'stroke-dashoffset 0.3s ease-out, stroke 0.3s ease-out';
  } else {
      progressElement.style.transition = 'none';
  }
  

  progressElement.dataset.lastProgress = progress.toString();

  progressElement.style.strokeDasharray = `${circumference} ${circumference}`;
  progressElement.style.strokeDashoffset = `${circumference * (1 - progress)}`;
  

  if (progress <= 0.25) {
      progressElement.style.stroke = '#FF3D00';
  } else if (progress <= 0.5) {
      progressElement.style.stroke = '#FF9100';
  } else if (progress <= 0.75) {
      progressElement.style.stroke = '#FFC400';
  } else if (progress <= 0.85) {
      progressElement.style.stroke = '#76FF03';
  } else {
      progressElement.style.stroke = '#00E676';
  }


  if (currentGame.correctStreak >= 3) {
      if (!progressElement.classList.contains('streaking')) {
          progressElement.classList.add('streaking');
          

          if (!currentGame.lastNotifiedStreak || currentGame.lastNotifiedStreak !== currentGame.correctStreak) {
              showNotification(`${currentGame.correctStreak} answer streak!`, 'success');
              currentGame.lastNotifiedStreak = currentGame.correctStreak;
          }
      }
  } else {
      progressElement.classList.remove('streaking');
      currentGame.lastNotifiedStreak = 0;
  }
  

  setTimeout(() => {
      progressElement.style.willChange = 'auto';
  }, 1000);
}


function addProgressStreakStyles() {
    if (!document.getElementById("progress-streak-styles")) {
      const styleElement = document.createElement("style");
      styleElement.id = "progress-streak-styles";
      styleElement.textContent = `
        @keyframes progressStreak {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1; stroke: var(--gold, gold); }
        }
        
        .progress-circle .progress.streaking {
          animation: progressStreak 1.2s ease-in-out infinite;
          will-change: opacity, stroke;
        }
        
        .coin-pulse {
          animation: coinPulse 0.5s ease-in-out;
          will-change: transform;
        }
        
        @keyframes coinPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `;
      document.head.appendChild(styleElement);
    }
}





const GameLoop = {
    active: false,
    frameId: null,
    lastTimestamp: 0,
    callbacks: {
      animation: [],
      interval100ms: [],
      interval500ms: [],
      interval1s: []
    },
    intervals: {
      100: 0,
      500: 0,
      1000: 0
    },
    
    start() {
      if (this.active) return;
      this.active = true;
      this.lastTimestamp = performance.now();
      this.frameId = requestAnimationFrame(this.update.bind(this));
    },
    
    stop() {
      this.active = false;
      if (this.frameId) {
        cancelAnimationFrame(this.frameId);
        this.frameId = null;
      }
    },
    
    update(timestamp) {
      if (!this.active) return;
      
      const elapsed = timestamp - this.lastTimestamp;
      

      for (const callback of this.callbacks.animation) {
        callback(elapsed);
      }
      

      this.intervals[100] += elapsed;
      if (this.intervals[100] >= 100) {
        this.intervals[100] = 0;
        for (const callback of this.callbacks.interval100ms) {
          callback();
        }
      }
      
      this.intervals[500] += elapsed;
      if (this.intervals[500] >= 500) {
        this.intervals[500] = 0;
        for (const callback of this.callbacks.interval500ms) {
          callback();
        }
      }
      
      this.intervals[1000] += elapsed;
      if (this.intervals[1000] >= 1000) {
        this.intervals[1000] = 0;
        for (const callback of this.callbacks.interval1s) {
          callback();
        }
      }
      
      this.lastTimestamp = timestamp;
      this.frameId = requestAnimationFrame(this.update.bind(this));
    },
    
    addCallback(type, callback) {
      this.callbacks[type].push(callback);
      return callback;
    },
    
    removeCallback(type, callback) {
      const index = this.callbacks[type].indexOf(callback);
      if (index !== -1) {
        this.callbacks[type].splice(index, 1);
        return true;
      }
      return false;
    }
  };


function detectMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth < 768;
  }
  

  const PerformanceSettings = {
    isMobile: detectMobileDevice(),
    

    maxParticles: 0,
    useAnimations: true,
    useParticles: true,
    
    init() {
      this.isMobile = detectMobileDevice();
      

      if (this.isMobile) {
        this.maxParticles = 10;
        this.useAnimations = true;
        

        this.addMobileOptimizations();
      } else {
        this.maxParticles = 30;
        this.useAnimations = true;
      }
      
      console.log("Performance settings initialized for", this.isMobile ? "mobile" : "desktop");
    },
    
    addMobileOptimizations() {
      const style = document.createElement('style');
      style.textContent = `
        /* Optimize animations for mobile */
        .word-translation-item, .buttons button {
          transition: transform 0.2s ease-out;
          will-change: transform;
        }
        
        /* Reduce visual complexity */
        .particle-container {
          opacity: 0.5;
        }
      `;
      document.head.appendChild(style);
    }
  };
  

  document.addEventListener('DOMContentLoaded', () => {
    PerformanceSettings.init();
  });
  

function loadNextQuestion() {

    document.querySelectorAll('.buttons button').forEach(button => {
      button.classList.remove('correct', 'wrong');
    });
  

    if (currentGame.currentIndex >= currentGame.words.length) return;
  
    if (!currentGame.answerTimes) {
      currentGame.answerTimes = [];
    }

    


    currentGame.questionStartTime = Date.now();
  
    const questionWordElement = document.getElementById('question-word');
    

    const isSpecialLevel = [3, 6, 9, 10, 13, 16, 19, 20, 21].includes(gameState.currentLevel);
    const isHebrewToEnglish = isSpecialLevel && Math.random() < 0.5;
    
    const index = currentGame.currentIndex;
    const wordToDisplay = isHebrewToEnglish ? currentGame.translations[index] : currentGame.words[index];
    const correctAnswer = isHebrewToEnglish ? currentGame.words[index] : currentGame.translations[index];
    

    const answerPool = isHebrewToEnglish ? currentGame.words : currentGame.translations;
    

    const answerSet = new Set([correctAnswer]);
    

    while (answerSet.size < 3) {
      const randomAnswer = answerPool[Math.floor(Math.random() * answerPool.length)];
      if (randomAnswer !== correctAnswer) {
        answerSet.add(randomAnswer);
      }
    }
    

    const buttonsContainer = document.getElementById('buttons');
    buttonsContainer.innerHTML = '';
    

    const shuffledAnswers = Array.from(answerSet).sort(() => Math.random() - 0.5);
    

    shuffledAnswers.forEach(answer => {
      const button = document.createElement('button');
      button.textContent = answer;
      button.onclick = () => handleAnswer(answer === correctAnswer);
      buttonsContainer.appendChild(button);
    });
    

    

    if (PerformanceSettings.isMobileOrSlow) {

      questionWordElement.textContent = wordToDisplay;
    } else {

      if (currentGame.currentIndex > 0) {
        questionWordElement.classList.add('exiting');
        setTimeout(() => {
          questionWordElement.textContent = wordToDisplay;
          questionWordElement.classList.remove('exiting');
          questionWordElement.classList.add('entering');
          setTimeout(() => {
            questionWordElement.classList.remove('entering');
          }, 500);
        }, 500);
      } else {

        questionWordElement.textContent = wordToDisplay;
        questionWordElement.classList.add('entering');
        setTimeout(() => {
          questionWordElement.classList.remove('entering');
        }, 500);
      }
    }
  }

function showBossVictoryScreen() {
  console.log("Boss victory screen function called - redirecting to new implementation");
  showBossDefeatEffect();
}

function addAdminTestingButton() {

  if (!currentUser || currentUser.email !== 'admin123@gmail.com') return;
  
  const questionScreen = document.getElementById('question-screen');
  

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

    gameState.currentLevel = 20;
    startLevel(20);
  };
  
  questionScreen.appendChild(adminButton);
}

function awardTimeBonus() {

  const totalLevelTime = currentGame.totalTime || (currentGame.words.length * 5);
  const timeElapsed = (Date.now() - currentGame.levelStartTime) / 1000;
  const timeRemaining = totalLevelTime - timeElapsed;
  const percentRemaining = timeRemaining / totalLevelTime;
  
  if (percentRemaining >= 0.6) {
      return 5;
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

function checkSetCompletion(stage, set) {

  const totalLevels = gameStructure.stages[stage-1].levelsPerSet;
  

  let completedCount = 0;
  for (let i = 1; i <= totalLevels; i++) {
    const levelKey = `${stage}_${set}_${i}`;
    if (gameState.completedLevels.has(levelKey) || gameState.perfectLevels.has(levelKey)) {
      completedCount++;
    }
  }
  
  console.log(`Set ${stage}-${set} completion: ${completedCount}/${totalLevels}`);
  

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


    if (!isLastLevelInSet) {
        gameState.unlockedLevels[setKey].add(gameState.currentLevel + 1);
    } else if (!isLastSetInStage) {
        unlockNextSet();
    } else if (gameState.currentStage < 5) {
        unlockNextStage();
    }

    saveProgress();
    updateAllCoinDisplays();


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
  


function initializeParticles(container = document.body) {

    if (!(container instanceof HTMLElement)) {
        container = document.body;
    }
    

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
    

    for (let i = 0; i < 50; i++) {
        createLetterParticle();
    }
    

    const particleInterval = setInterval(createLetterParticle, 1000);
    

    particleContainer.dataset.intervalId = particleInterval;
}


window.onload = async () => {
    await checkExistingSession();
    initializeGame();
    updatePerkButtons();
    

    const welcomeScreen = document.getElementById('welcome-screen');
    initializeParticles(welcomeScreen);
    
    await loadCustomLists();
};


function handleResetProgress() {
    console.log("Resetting all game progress...");
    

    gameState.currentStage = 1;
    gameState.currentSet = 1;
    gameState.currentLevel = 1;
    gameState.coins = 0;
    gameState.perks = {timeFreeze: 0, skip: 0, clue: 0, reveal: 0};
    gameState.perfectLevels = new Set();
    gameState.completedLevels = new Set();
    gameState.sessionStartTime = null;
    


    gameState.unlockedSets = { "1": new Set() };
    gameState.unlockedLevels = {};
    

    for (let i = 1; i <= 9; i++) {
        gameState.unlockedSets[1].add(i);
        const setKey = `1_${i}`;
        gameState.unlockedLevels[setKey] = new Set([1]);
    }
    

    for (let stage = 2; stage <= 5; stage++) {
        if (!gameState.unlockedSets[stage]) {
            gameState.unlockedSets[stage] = new Set([1]);
        }
        const setKey = `${stage}_1`;
        gameState.unlockedLevels[setKey] = new Set([1]);
    }
    

    if (typeof setupDefaultUnlocks === 'function') {
        setupDefaultUnlocks();
    }
    

    const defaultProgress = {
        stage: 1,
        set_number: 1,
        level: 1,
        coins: 0,
        perks: {},

        unlocked_sets: serializeSetMap(gameState.unlockedSets),
        unlocked_levels: serializeSetMap(gameState.unlockedLevels),
        perfect_levels: [],
        completed_levels: []
    };
    
    localStorage.setItem("simploxProgress", JSON.stringify(defaultProgress));
    

    localStorage.removeItem("gameContext");
    

    if (typeof CoinsManager !== 'undefined') {

        if (CoinsManager.setCoins) {
            CoinsManager.setCoins(0);
        }
        

        CoinsManager.updateDisplays(0);
        

        if (CoinsManager.saveUserCoins) {
            CoinsManager.saveUserCoins();
        }
    }
    

    if (currentUser) {

        supabaseClient
            .from("game_progress")
            .update({
                stage: 1,
                set_number: 1,
                level: 1,
                coins: 0,
                perks: {},
                unlocked_sets: serializeSetMap(gameState.unlockedSets),
                unlocked_levels: serializeSetMap(gameState.unlockedLevels),
                perfect_levels: [],
                completed_levels: []
            })
            .eq("user_id", currentUser.id)
            .then(({ error }) => {
                if (error) console.error("Error resetting game progress:", error);
            });
        

        supabaseClient
            .from("player_stats")
            .update({ 
                unique_words_practiced: 0,
                total_levels_completed: 0
            })
            .eq("user_id", currentUser.id)
            .then(({ error }) => {
                if (error) console.error("Error resetting player stats:", error);
                else {

                    if (typeof WordsManager !== 'undefined' && WordsManager.updateDisplays) {
                        WordsManager.updateDisplays(0);
                    }
                }
            });
        

        supabaseClient
            .from("word_practice_history")
            .delete()
            .eq("user_id", currentUser.id)
            .then(({ error }) => {
                if (error) console.error("Error clearing word history:", error);
            });
    }
    

    document.querySelectorAll(".coin-count").forEach(el => {
        el.textContent = "0";
    });
    

    const totalCoinsElement = document.getElementById("totalCoins");
    if (totalCoinsElement) {
        totalCoinsElement.textContent = "0";
    }
    

    document.querySelectorAll("#totalWords").forEach(el => {
        el.textContent = "0";
    });
    

if (gameState.unlockedPerks) {

  const basicPerks = ['timeFreeze', 'skip', 'clue', 'reveal'];
  gameState.unlockedPerks = new Set(basicPerks);
  

  try {
      localStorage.setItem("simploxUnlockedPerks", JSON.stringify(basicPerks));
      console.log("Reset unlocked perks to basic only:", basicPerks);
  } catch (e) {
      console.error("Error resetting unlocked perks in localStorage:", e);
  }
}


    if (typeof updateNavigationContainer === 'function') {
        updateNavigationContainer();
    }
    

    if (typeof updatePerkButtons === 'function') {
        updatePerkButtons();
    }
    

    if (localStorage.getItem("preferredStage")) {
        localStorage.removeItem("preferredStage");
    }
    
    localStorage.setItem("showGradeSelector", "true");
    showScreen('welcome-screen');
    

    showNotification("All progress has been reset", "info");
}



document.addEventListener('DOMContentLoaded', function() {
    const resetButton = document.getElementById('resetProgressButton') || 
                        document.querySelector('.reset-progress-button');
    
    if (resetButton) {

        const oldClickHandler = resetButton.onclick;
        resetButton.onclick = null;
        

        resetButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            

            if (confirm("Are you sure you want to reset all progress? This cannot be undone.")) {
                handleResetProgress();
            }
        });
        
        console.log("Reset button properly initialized");
    } else {
        console.warn("Reset progress button not found in DOM");
    }
});

function handleRestartLevel() {

    if (currentGame.restartsRemaining <= 0) {
        return;
    }
    
    const restartButton = document.querySelector('.navigation-button.restart-level');
    

    currentGame.restartsRemaining--;
    

    if (currentGame.restartsRemaining === 1) {
        restartButton.style.opacity = '0.7';
    } else if (currentGame.restartsRemaining === 0) {
        restartButton.classList.add('disabled');
        

        restartButton.onclick = null;

        restartButton.disabled = true;
    }
    

    gameState.coins = currentGame.startingCoins;
    gameState.perks = { ...currentGame.startingPerks };
    

    updatePerkButtons();
    updateAllCoinDisplays();
    

    saveProgress();
    

    startLevel(gameState.currentLevel);
}



function findFurthestProgression() {

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


    const preferredStage = parseInt(localStorage.getItem("preferredStage"));
    

    console.log("Finding furthest progression");
    console.log("Current unlocked sets:", gameState.unlockedSets);
    console.log("Current unlocked levels:", gameState.unlockedLevels);
    console.log("Completed levels:", Array.from(gameState.completedLevels));
    console.log("Perfect levels:", Array.from(gameState.perfectLevels));


    let furthestLevel = null;
    let highestRank = -1;


    const isUnlockedNotCompleted = (stage, set, level) => {
        const levelKey = `${stage}_${set}_${level}`;
        const setKey = `${stage}_${set}`;
        

        const isUnlocked = gameState.unlockedLevels[setKey]?.has(level);
        

        const isNotCompleted = !gameState.completedLevels.has(levelKey) && 
                              !gameState.perfectLevels.has(levelKey);
                              
        return isUnlocked && isNotCompleted;
    };



    if (preferredStage && preferredStage >= 1 && preferredStage <= 5) {
        console.log(`Checking preferred stage: ${preferredStage}`);
        

        for (let set = 1; set <= gameStructure.stages[preferredStage-1].numSets; set++) {
            const setKey = `${preferredStage}_${set}`;
            

            if (!gameState.unlockedLevels[setKey]) continue;
            

            const levels = Array.from(gameState.unlockedLevels[setKey]).sort((a, b) => b - a);
            
            console.log(`Checking set ${setKey}, unlocked levels:`, levels);
            

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


    if (!furthestLevel) {

        for (let stage = 1; stage <= 5; stage++) {

            if (!gameState.unlockedSets[stage]) continue;
            

            const sets = Array.from(gameState.unlockedSets[stage]).sort((a, b) => b - a);
            
            for (let set of sets) {
                const setKey = `${stage}_${set}`;
                

                if (!gameState.unlockedLevels[setKey]) continue;
                

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


    if (furthestLevel) {
        console.log("Found furthest progress:", furthestLevel);
        return furthestLevel;
    }


    if (preferredStage && preferredStage >= 1 && preferredStage <= 5) {
        return {
            stage: preferredStage,
            set: 1,
            level: 1
        };
    }


    return {
        stage: 1,
        set: 1,
        level: 1
    };
}

function startGame() {

  

  if (!hasExistingProgress() || localStorage.getItem("showGradeSelector") === "true") {

    localStorage.removeItem("showGradeSelector");
    

    showGradeLevelSelector();
    return;
  }
  
  const stage = gameState.currentStage || 1;
  

  const unlockedSets = gameState.unlockedSets[stage] || new Set([1]);
  const furthestSet = Math.max(...Array.from(unlockedSets));
  

  const setKey = `${stage}_${furthestSet}`;
  const unlockedLevels = gameState.unlockedLevels[setKey] || new Set([1]);
  const furthestLevel = Math.max(...Array.from(unlockedLevels));
  
  console.log(`Starting game at Stage ${stage}, Set ${furthestSet}, Level ${furthestLevel}`);
  

  gameState.currentSet = furthestSet;
  gameState.currentLevel = furthestLevel;
  

  gameState.sessionStartTime = Date.now();
  gameState.comingFromWelcome = true;
  

  showScreen('question-screen');
  startLevel(furthestLevel);
}

function updateLevelProgress(stage, set, level, completed, perfect) {

    const levelKey = `${stage}_${set}_${level}`;
    

    if (perfect) {
        gameState.perfectLevels.add(levelKey);
        gameState.completedLevels.add(levelKey);
    } else if (completed) {
        gameState.completedLevels.add(levelKey);
    }
    

    const setKey = `${stage}_${set}`;
    if (!gameState.unlockedLevels[setKey]) {
        gameState.unlockedLevels[setKey] = new Set();
    }
    gameState.unlockedLevels[setKey].add(level);
    

    const nextLevel = level + 1;
    const isLastLevelInSet = level === gameStructure.stages[stage-1].levelsPerSet;
    
    if (!isLastLevelInSet) {
        gameState.unlockedLevels[setKey].add(nextLevel);
        console.log(`Unlocked next level: ${nextLevel} in set ${setKey}`);
    }
    

    if (isLastLevelInSet && completed) {
        checkSetCompletion(stage, set);
    }
    

    saveProgress();
}

function checkSetCompletion(stage, set) {

    const totalLevels = gameStructure.stages[stage-1].levelsPerSet;
    

    let completedCount = 0;
    for (let i = 1; i <= totalLevels; i++) {
        const levelKey = `${stage}_${set}_${i}`;
        if (gameState.completedLevels.has(levelKey) || gameState.perfectLevels.has(levelKey)) {
            completedCount++;
        }
    }
    
    console.log(`Set ${stage}-${set} completion: ${completedCount}/${totalLevels}`);
    

    if (completedCount === totalLevels) {
        console.log(`Set ${stage}-${set} is complete. Unlocking next set.`);
        unlockNextSet();
    }
}

function showLevelIntro(level, callback, forceFull = false) {

    if (!forceFull) {
        console.log(`Skipping level intro for level ${level} within active session`);
        callback();
        return;
    }


    document.querySelectorAll('.level-intro-overlay').forEach(el => el.remove());
    

    const overlay = document.createElement('div');
    overlay.className = 'level-intro-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(5px);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      transition: opacity 0.5s ease;
    `;
    

    const isTestLevel = [3, 6, 9, 10, 13, 16, 19, 20].includes(level);
    const isBossLevel = level === 21;
    const isCustomLevel = currentGame && currentGame.isCustomPractice;
    

    let newWordsCount = 0;
    let reviewWordsCount = 0;
    
    if (!isCustomLevel) {
      const setKey = `${gameState.currentStage}_${gameState.currentSet}`;
      const vocabulary = vocabularySets[setKey];
      
      if (vocabulary) {
        const levelData = calculateWordsForLevel(level, vocabulary);
        if (levelData) {
          if (isTestLevel) {
            reviewWordsCount = levelData.count || 0;
          } else {
            newWordsCount = levelData.count || 0;
          }
        }
      }
    }
    

    const announcementContent = document.createElement('div');
    announcementContent.style.cssText = `
      background: var(--glass);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 3rem;
      width: 500px;
      max-width: 90%;
      text-align: center;
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      transform: scale(0.9);
      opacity: 0;
      transition: transform 0.5s ease, opacity 0.5s ease;
      margin: 0;
    `;
    

    if (isCustomLevel) {
      if (currentGame.mixed) {

        announcementContent.innerHTML = `
          <h1 style="color: var(--gold); margin-bottom: 0.5rem; font-size: 2.5rem;">Test Challenge</h1>
          <h2 style="margin-bottom: 1.5rem; opacity: 0.9; font-size: 1.5rem;">Combined Words Review</h2>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 1.5rem; margin-bottom: 1rem;">
            <div style="display: inline-block; padding: 0.5rem 1.5rem; border-radius: 50px; font-weight: bold; margin-top: 1rem; background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); color: #ffffff;">Review Challenge</div>
            <button class="start-button" style="margin-top: 1rem;">Start</button>
          </div>
        `;
      } else {

        announcementContent.innerHTML = `
          <h1 style="color: var(--accent); margin-bottom: 0.5rem; font-size: 2.5rem;">Round ${level}</h1>
          <h2 style="margin-bottom: 1.5rem; opacity: 0.9; font-size: 1.5rem;">Custom Practice</h2>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 1.5rem; margin-bottom: 1rem;">
            ${isTestLevel ? '<div style="display: inline-block; padding: 0.5rem 1.5rem; border-radius: 50px; font-weight: bold; margin-top: 1rem; background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); color: #ffffff;">Review Challenge</div>' : ''}
            <button class="start-button" style="margin-top: 1rem;">Start</button>
          </div>
        `;
      }
    } else if (isBossLevel) {

        announcementContent.innerHTML = `
          <h1 style="color: #FFD700; margin-bottom: 0.5rem; font-size: 2.5rem; text-shadow: 0 2px 10px rgba(255, 215, 0, 0.7);">BOSS FIGHT!</h1>
          <h2 style="margin-bottom: 1rem; color: #FFFFFF; opacity: 0.9; font-size: 1.5rem;">FINAL CHALLENGE</h2>
          <p style="margin-bottom: 1.5rem; font-size: 1.1rem; color: #E0E0E0;">All words from this set</p>
          <div style="margin: 1.5rem 0; text-align: center;">
            <i class="fas fa-dragon" style="font-size: 3.5rem; color: #FFD700; margin-bottom: 1rem; filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));"></i>
          </div>
          <button class="start-button" style="margin-top: 1rem; background: linear-gradient(135deg, #2E3192 0%, #1BFFFF 100%); box-shadow: 0 4px 15px rgba(27, 255, 255, 0.4); color: white; font-weight: bold; padding: 1rem 2.5rem; font-size: 1.2rem;">BEGIN</button>
        `;
      } else {

      announcementContent.innerHTML = `
        <h1 style="color: var(--gold); margin-bottom: 0.5rem; font-size: 2.5rem;">Stage ${gameState.currentStage}</h1>
        <h2 style="color: var(--gold); margin-bottom: 1.5rem; opacity: 0.9; font-size: 1.8rem;">Set ${gameState.currentSet}</h2>
        <h3 style="margin-bottom: 1rem; opacity: 0.9; font-size: 1.5rem;">Level ${level}/${gameStructure.stages[gameState.currentStage-1].levelsPerSet}</h3>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 1.5rem; margin-bottom: 1rem;">
          ${isTestLevel ? 
            `<p style="margin-bottom: 1rem; font-size: 1.1rem;">Review ${reviewWordsCount} words from previous levels</p>
             <div style="display: inline-block; padding: 0.5rem 1.5rem; border-radius: 50px; font-weight: bold; background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); color: #ffffff;">Review Challenge</div>` : 
            `<p style="margin-bottom: 1rem; font-size: 1.1rem;">Learn ${newWordsCount} new words</p>`
          }
          <button class="start-button" style="margin-top: 1rem;">Start</button>
        </div>
      `;
    }
    

    if (isBossLevel) {
        announcementContent.style.background = 'linear-gradient(135deg, rgba(128, 0, 0, 0.95), rgba(220, 20, 60, 0.95))';
        announcementContent.style.boxShadow = '0 15px 35px rgba(255, 0, 0, 0.3), inset 0 2px 10px rgba(255, 255, 255, 0.2)';
        announcementContent.style.border = '1px solid rgba(255, 215, 0, 0.3)';
      }
    

    overlay.appendChild(announcementContent);
    

    document.body.appendChild(overlay);
    

    setTimeout(() => {
      overlay.style.opacity = '1';
      announcementContent.style.transform = 'scale(1)';
      announcementContent.style.opacity = '1';
    }, 100);
    

    const startButton = announcementContent.querySelector('.start-button');
    if (startButton) {
      startButton.addEventListener('click', () => {

        overlay.style.opacity = '0';
        announcementContent.style.transform = 'scale(0.9)';
        announcementContent.style.opacity = '0';
        

        setTimeout(() => {
          document.body.removeChild(overlay);
          callback();
        }, 500);
      });
    }
  }


  function handleLevelCompletion() {
    clearTimer();
    
    if (currentGame.isBossLevel) {
      if (currentGame.bossRewardApplied) {
        console.log("Boss already defeated and rewarded, just showing effects");
        restoreFromBossLevel();
        showBossDefeatEffect();
      } else {
        console.log("First boss defeat, applying reward");
        restoreFromBossLevel();
        currentGame.bossRewardApplied = true;
        showBossDefeatEffect();
      }
      return;
    }
  

    const levelKey = `${gameState.currentStage}_${gameState.currentSet}_${gameState.currentLevel}`;
    console.log(`Completing level: ${levelKey}`);
    
    const wasAlreadyCompleted = gameState.perfectLevels.has(levelKey) || gameState.completedLevels.has(levelKey);
    console.log(`Level was previously completed: ${wasAlreadyCompleted}`);
    
    const isPerfect = currentGame.streakBonus && currentGame.correctAnswers === currentGame.words.length;
    

    let timeBonus = 0;
    const totalLevelTime = currentGame.totalTime || (currentGame.words.length * 10);
    const actualTime = Date.now() - currentGame.levelStartTime;
    const fastThreshold = totalLevelTime * 1000 * (2/3);
    
    if (actualTime < fastThreshold) {
        timeBonus = 5;
        currentGame.timeBonus = timeBonus;
    }
    

    const completionStats = {
      isPerfect: isPerfect,
      mistakes: currentGame.progressLost || 0,
      timeElapsed: actualTime,
      coinsEarned: 0,
      correctAnswers: currentGame.correctAnswers || 0,
      incorrectAnswers: currentGame.words.length - currentGame.correctAnswers || 0,
      totalQuestions: currentGame.words.length || 0,
      timeBonus: timeBonus
    };
    

    debugLevelStats(completionStats, 'handleLevelCompletion');
    
    if (!wasAlreadyCompleted && isPerfect) {

      const coinReward = 5 + timeBonus;
      completionStats.coinsEarned = coinReward;
      
      CoinsManager.updateCoins(coinReward).then(() => {
        updateLevelProgress(gameState.currentStage, gameState.currentSet, gameState.currentLevel, true, true);
        const questionScreen = document.getElementById('question-screen').getBoundingClientRect();
        createParticles(questionScreen.left + questionScreen.width/2, questionScreen.top + questionScreen.height/2);
      });
    } else if (!wasAlreadyCompleted) {

      if (timeBonus > 0) {
        CoinsManager.updateCoins(timeBonus).then(() => {

          pulseCoins(1);
        });
      }
      updateLevelProgress(gameState.currentStage, gameState.currentSet, gameState.currentLevel, true, false);
    } else if (timeBonus > 0) {

      CoinsManager.updateCoins(timeBonus).then(() => {
        pulseCoins(1);
      });
    }
    
    updatePerkButtons();
    

    updateStageBackground();
  

    const stageData = gameStructure.stages[gameState.currentStage - 1];
    const isLastLevelInSet = gameState.currentLevel === stageData.levelsPerSet;
    const isLastSetInStage = gameState.currentSet === stageData.numSets;
    const userStatus = currentUser ? currentUser.status : "unregistered";
    

    if (isLastLevelInSet) {

      checkSetCompletion(gameState.currentStage, gameState.currentSet);
      
      if (isLastSetInStage) {

        if (userStatus === "premium" && gameState.currentStage < 5) {

          showLevelCompletionModal(completionStats, () => {
            gameState.currentStage++;
            gameState.currentSet = 1;
            gameState.currentLevel = 1;
            startLevel(1);
          });
        } else {

          showLevelCompletionModal(completionStats, () => {
            showScreen("stage-cascade-screen");
          });
        }
      } else {

        showLevelCompletionModal(completionStats, () => {
          gameState.currentSet++;
          gameState.currentLevel = 1;
          startLevel(1);
        });
      }
    } else {

      showLevelCompletionModal(completionStats, () => {
        gameState.currentLevel++;
        startLevel(gameState.currentLevel);
      });
    }
}


function debugLevelStats(stats, caller) {
    console.log(`Level stats from ${caller}:`, {
      correctAnswers: stats.correctAnswers || 0,
      incorrectAnswers: stats.incorrectAnswers || 0,
      totalQuestions: stats.totalQuestions || 0,
      timeBonus: stats.timeBonus || 0,
      isPerfect: stats.isPerfect || false,
      mistakes: stats.mistakes || 0,
      timeElapsed: stats.timeElapsed || 0,
      coinsEarned: stats.coinsEarned || 0
    });
  }

async function checkExistingSession() {
    console.log("Checking for existing user session");
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            console.log("Found existing session for user:", session.user.id);
            currentUser = session.user;
            

            const { data: profileData } = await supabaseClient
                .from("user_profiles")
                .select("status")
                .eq("id", currentUser.id)
                .single();
                
            if (profileData) {
                currentUser.status = profileData.status;
                updateUserStatusDisplay(profileData.status);
            }
            

            initializeStatusCheck();
            

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


document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM fully loaded, initializing game");
    

    gameInit.init().then(() => {
        console.log("Game initialization completed");
        

        const savedContext = localStorage.getItem("gameContext");
        if (savedContext && !window.location.hash) {
            try {
                const context = JSON.parse(savedContext);
                const timeSinceContext = Date.now() - (context.timestamp || 0);
                

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

    const autoSaveInterval = setInterval(() => {
        if (gameState.currentStage && gameState.currentSet && gameState.currentLevel) {
            console.log("Auto-saving game progress");
            saveProgress();
        }
    }, 30000);
    

    window.addEventListener("beforeunload", () => {
        if (gameState.currentStage && gameState.currentSet && gameState.currentLevel) {
            console.log("Saving progress before page unload");
            saveProgress();
        }
    });
    
    return autoSaveInterval;
}


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

          const completedStage = localStorage.getItem("completedTrialStage");
          if (completedStage) {

            localStorage.setItem("unlockNextSetForStage", completedStage);

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





let currentArcadeSession = {
    eventId: null,
    otp: null,
    wordPool: [],
    participants: [],
    teacherId: null,
    wordGoal: 50,
    state: 'pre-start',
    completedPlayers: [],
    playerRank: null,
    winnerScreenShown: false,
    startTime: null,
    endTime: null
};


async function showArcadeModal() {
    const modal = document.getElementById('arcade-modal');
    const teacherView = document.getElementById('teacher-view');
    const playerView = document.getElementById('player-view');
    const usernameInput = document.getElementById('arcadeUsername');
    const otpInput = document.getElementById('otpInput');
    const inputGroup = usernameInput ? usernameInput.closest('.input-group') : null;
    

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
                

                document.querySelectorAll('.stage-checkboxes input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = false;
                });
                

                const wordGoalInput = document.getElementById('wordGoalInput');
                const wordGoalSlider = document.getElementById('wordGoalSlider');
                const wordGoalDisplay = document.getElementById('wordGoalDisplay');
                
                if (wordGoalInput) wordGoalInput.value = "50";
                if (wordGoalSlider) wordGoalSlider.value = "50";
                if (wordGoalDisplay) wordGoalDisplay.textContent = "50";
                
                initializeWordGoalSlider();
                

                await loadCustomListsForArcade();
                

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
                usernameInput.value = "";
                
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

async function loadCustomListsForArcade() {

    const customListsContainer = document.getElementById('arcade-custom-lists');
    if (!customListsContainer) {

        createCustomListsSection();
        return;
    }
    
    customListsContainer.innerHTML = '<div class="loading-spinner">Loading lists...</div>';
    
    try {

        if (!CustomListsManager.lists || CustomListsManager.lists.length === 0) {
            await CustomListsManager.initialize();
        }
        

        const lists = CustomListsManager.lists || [];
        
        if (lists.length === 0) {
            customListsContainer.innerHTML = '<p class="no-lists-message">No custom lists available. Create lists in the Custom Practice section.</p>';
            return;
        }
        

        currentArcadeSession.selectedCustomLists = [];
        

        let listsHTML = '<div class="custom-lists-title">Include Custom Lists:</div><div class="custom-lists-grid">';
        
        lists.forEach(list => {

            if (list.words && list.words.length >= 3) {
                listsHTML += `
                    <div class="custom-list-checkbox">
                        <input type="checkbox" id="list-${list.id}" data-list-id="${list.id}" class="arcade-list-checkbox">
                        <label for="list-${list.id}">
                            ${list.name || 'Unnamed List'} 
                            <span class="word-count">(${list.words.length} words)</span>
                        </label>
                    </div>
                `;
            }
        });
        
        listsHTML += '</div>';
        listsHTML += '<div class="selected-words-counter">Selected Custom Words: <span id="selected-custom-words">0</span></div>';
        
        customListsContainer.innerHTML = listsHTML;
        

        document.querySelectorAll('.arcade-list-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectedCustomWordsCount);
        });
    } catch (error) {
        console.error('Error loading custom lists for arcade:', error);
        customListsContainer.innerHTML = '<p class="error-message">Error loading custom lists. Please try again.</p>';
    }
}

function createCustomListsSection() {
    const teacherView = document.getElementById('teacher-view');
    if (!teacherView) return;
    

    const stageSelector = teacherView.querySelector('.stage-selector');
    if (!stageSelector) return;
    

    const customListsSection = document.createElement('div');
    customListsSection.className = 'custom-lists-selector';
    customListsSection.innerHTML = `
        <div id="arcade-custom-lists" class="arcade-custom-lists">
            <div class="loading-spinner">Loading lists...</div>
        </div>
    `;
    

    stageSelector.parentNode.insertBefore(customListsSection, stageSelector.nextSibling);
    

    const spacer = document.createElement('div');
    spacer.style.height = '15px';
    customListsSection.parentNode.insertBefore(spacer, customListsSection.nextSibling);
    

    loadCustomListsForArcade();
}

function updateSelectedCustomWordsCount() {

    const selectedCheckboxes = document.querySelectorAll('.arcade-list-checkbox:checked');
    

    let totalSelectedWords = 0;
    const selectedListIds = [];
    

    selectedCheckboxes.forEach(checkbox => {
        const listId = checkbox.dataset.listId;
        const list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
        
        if (list && list.words) {
            totalSelectedWords += list.words.length;
            selectedListIds.push(listId);
        }
    });
    

    const counterElement = document.getElementById('selected-custom-words');
    if (counterElement) {
        counterElement.textContent = totalSelectedWords;
    }
    

    currentArcadeSession.selectedCustomLists = selectedListIds;
    

    const wordGoalInput = document.getElementById('wordGoalInput') || document.getElementById('wordGoalSlider');
    const wordGoal = parseInt(wordGoalInput?.value || '50');
    

    const warningElement = document.querySelector('.custom-lists-warning') || document.createElement('div');
    warningElement.className = 'custom-lists-warning';
    
    if (totalSelectedWords > wordGoal) {
        warningElement.textContent = `Warning: Selected custom words (${totalSelectedWords}) exceed word goal (${wordGoal})`;
        warningElement.style.display = 'block';
        

        const customListsContainer = document.getElementById('arcade-custom-lists');
        if (customListsContainer && !customListsContainer.querySelector('.custom-lists-warning')) {
            customListsContainer.appendChild(warningElement);
        }
    } else {
        warningElement.style.display = 'none';
    }
}

function initializeWordGoalSlider() {
    const slider = document.getElementById('wordGoalSlider');
    const display = document.getElementById('wordGoalDisplay');
    const input = document.getElementById('wordGoalInput');
    const stops = document.querySelectorAll('.slider-stop');
    
    if (!slider || !display || !input) return;
    

    slider.min = 0;
    slider.max = 200;
    slider.value = 50;
    display.textContent = 50;
    input.value = 50;
    

    slider.addEventListener('input', function() {
        const value = parseInt(this.value);
        display.textContent = value;
        input.value = value;
        

        const wordGoalElement = document.getElementById('sessionWordGoal');
        if (wordGoalElement) {
            wordGoalElement.textContent = value;
        }
    });
    

    input.addEventListener('input', function() {
        let value = parseInt(this.value) || 0;
        

        value = Math.max(0, Math.min(200, value));
        
        slider.value = value;
        display.textContent = value;
        this.value = value;
        

        const wordGoalElement = document.getElementById('sessionWordGoal');
        if (wordGoalElement) {
            wordGoalElement.textContent = value;
        }
    });
    

    stops.forEach(stop => {
        stop.addEventListener('click', function() {
            const value = parseInt(this.dataset.value);
            slider.value = value;
            display.textContent = value;
            input.value = value;
            

            const wordGoalElement = document.getElementById('sessionWordGoal');
            if (wordGoalElement) {
                wordGoalElement.textContent = value;
            }
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
      .on('broadcast', { event: 'premium_user_coins' }, ({ payload: data }) => {
        if (data && data.username && data.coins) {
            console.log(`Received premium user coins: ${data.username} has ${data.coins} coins`);
            

            updatePlayerProgress({
                username: data.username,
                coins: data.coins,
                wordsCompleted: data.wordsCompleted || 0,
                isPremium: true,
                isTrusted: true,
                source: 'premiumCoinsSync'
            });
        }
      })
      .on('broadcast', { event: 'celebration' }, ({ payload }) => {

      });
    

    await window.arcadeChannel.subscribe();
    

    let initialCoins = 0;
    if (currentUser && currentUser.status === 'premium') {
      initialCoins = await getCurrentCoinsForArcade();
      console.log(`Premium user joining with ${initialCoins} coins`);
    }


    await window.arcadeChannel.send({
      type: "broadcast",
      event: "player_join",
      payload: {
        username: username,
        joinedAt: (new Date()).toISOString(),
        coins: initialCoins,
        isPremium: currentUser?.status === 'premium'
      }
    });
    

    if (currentUser && currentUser.status === 'premium' && initialCoins > 0) {
      console.log(`Broadcasting premium user coins: ${initialCoins}`);
      await window.arcadeChannel.send({
        type: 'broadcast',
        event: 'premium_user_coins',
        payload: {
          username: username,
          coins: initialCoins,
          wordsCompleted: 0,
          isPremium: true,
          timestamp: Date.now(),
          isTrusted: true,
          source: 'premiumCoinsSync'
        }
      });
      

      updatePlayerProgress({
        username: username,
        coins: initialCoins,
        wordsCompleted: 0,
        isPremium: true,
        isTrusted: true,
        source: 'premiumCoinsSync'
      });
    }
    
    currentArcadeSession.joinEventSent = true;
    currentArcadeSession.otp = otp;
    

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
    

    statusCheckInterval = setInterval(async () => {
      await window.arcadeChannel.send({
        type: "broadcast",
        event: "check_game_status"
      });
    }, 2000);
    

    setTimeout(() => {
      if (statusCheckInterval) clearInterval(statusCheckInterval);
    }, 300000);
  } catch (error) {
    console.error("Join error:", error);
    alert("Failed to join arcade");
  }
  


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

function initializeWaitingGame() {

    addWaitingGameStyles();
    
    const waitingScreen = document.getElementById("waiting-screen");
    if (!waitingScreen) return;
    

    waitingScreen.querySelectorAll('.waiting-word-item').forEach(el => el.remove());
    

    if (!waitingScreen.querySelector('.waiting-header')) {

      const originalContent = waitingScreen.innerHTML;
      waitingScreen.innerHTML = `
        <div class="waiting-header">
          <h2>Waiting for Game to Start...</h2>
        </div>
        <div class="waiting-game-container">
          <div class="waiting-game-instructions">
            Catch matching translations, avoid wrong ones!
          </div>
          <div class="score-display">
            Score: <span id="waiting-game-score">0</span>
            <span class="lives-display">
              <span class="heart">❤️</span>
              <span class="heart">❤️</span>
              <span class="heart">❤️</span>
            </span>
          </div>
          <div class="waiting-game-area">
            <!-- Words will be placed here -->
          </div>
        </div>
        <div class="waiting-controls">
          <button id="play-waiting-game" class="start-button">Play</button>
        </div>
      `;
    }
    

    const playButton = waitingScreen.querySelector('#play-waiting-game');
    if (playButton) {
      playButton.onclick = startWaitingGame;
    }
    

    window.waitingGameState = {
      score: 0,
      lives: 3,
      isPlaying: false,
      words: [],
      gameInterval: null
    };
    

    const scoreDisplay = waitingScreen.querySelector('#waiting-game-score');
    if (scoreDisplay) {
      scoreDisplay.textContent = '0';
    }
    

    const heartsContainer = waitingScreen.querySelector('.lives-display');
    if (heartsContainer) {
      heartsContainer.innerHTML = `
        <span class="heart">❤️</span>
        <span class="heart">❤️</span>
        <span class="heart">❤️</span>
      `;
    }
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

  function addWaitingGameStyles() {
    if (!document.getElementById('waiting-game-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'waiting-game-styles';
      styleElement.textContent = `
        #waiting-screen {
          display: flex;
          flex-direction: column;
          height: 100vh;
          max-height: 100vh;
          overflow: hidden;
          padding: 20px;
          box-sizing: border-box;
          justify-content: space-between;
        }
        
        .waiting-header {
          flex: 0 0 auto;
          margin-bottom: 15px;
        }
        
        .waiting-game-container {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
          margin-bottom: 15px;
        }
        
        .waiting-game-container .score-display {
          margin-bottom: 10px;
        }
        
        .waiting-game-area {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 250px;
          max-height: 60vh;
        }
        
        .waiting-word-item {
          position: absolute;
          transform: translateY(0);
        }
        
        .waiting-controls {
          flex: 0 0 auto;
          margin-top: 10px;
        }
        
        @media (max-height: 600px) {
          #waiting-screen {
            padding: 10px;
          }
          
          .waiting-header h2 {
            font-size: 1.5rem;
            margin: 0.5rem 0;
          }
          
          .waiting-game-instructions {
            font-size: 0.9rem;
            margin: 0.5rem 0;
          }
          
          .waiting-game-area {
            min-height: 180px;
          }
        }
      `;
      document.head.appendChild(styleElement);
    }
  }

async function initializeArcade() {
    try {
        const initializeButton = document.querySelector('.initialize-button');
        const endArcadeButton = document.querySelector('.end-arcade-button');
        
        if (initializeButton) initializeButton.style.display = 'none';
        if (endArcadeButton) endArcadeButton.classList.add('visible');
        
        currentArcadeSession.state = 'active';
        currentArcadeSession.isInitialized = true;
        

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

  document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('visible');
  });
  

  document.getElementById('moderator-screen').classList.add('visible');
  

  const otpDisplay = document.getElementById('moderatorOtp');
  if (otpDisplay && currentArcadeSession.otp) {
      otpDisplay.textContent = currentArcadeSession.otp;
      

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
  

  initializeLeaderboard();
  

  const initializeButton = document.querySelector('.initialize-button');
  const endArcadeButton = document.querySelector('.end-arcade-button');
  
  if (currentArcadeSession.isInitialized && currentArcadeSession.state === 'active') {

      if (initializeButton) initializeButton.style.display = 'none';
      if (endArcadeButton) endArcadeButton.classList.add('visible');
  } else {

      if (initializeButton) initializeButton.style.display = 'block';
      if (endArcadeButton) endArcadeButton.classList.remove('visible');
  }
  

  if (window.arcadeChannel) {

      console.log("Requesting premium user coin updates...");
      

      window.arcadeChannel.send({
          type: 'broadcast',
          event: 'request_premium_updates',
          payload: {
              requesterId: currentUser?.id || 'moderator',
              timestamp: Date.now(),
              priority: 'high'
          }
      });
      

      setTimeout(() => {
          window.arcadeChannel.send({
              type: 'broadcast',
              event: 'request_premium_updates',
              payload: {
                  requesterId: currentUser?.id || 'moderator',
                  timestamp: Date.now(),
                  priority: 'high'
              }
          });
      }, 1000);
      

      setTimeout(() => {
          requestAllPlayerStats();
      }, 2000);
  }


  initializeModeratorInactivityTimer();
  

  setTimeout(() => {
      if (currentArcadeSession.participants && currentArcadeSession.participants.length > 0) {
          console.log("Forcing initial leaderboard update");
          window.lastLeaderboardUpdate = 0;
          updateAllPlayersProgress();
      }
  }, 300);
}

function initializeLeaderboard() {
    const leaderboard = document.getElementById('arcade-leaderboard');
    

    leaderboard.innerHTML = `
        <div class="leaderboard-header">
            <div>Rank</div>
            <div>Player</div>
            <div>Words</div>
            <div>Coins</div>
        </div>
    `;
    

    if (currentArcadeSession.participants.length > 0) {
        updateAllPlayersProgress();
    }
}

function updateAllPlayersProgress() {

    const leaderboard = document.getElementById('arcade-leaderboard');
    const leaderboardHeader = leaderboard?.querySelector('.leaderboard-header');
    
    if (!leaderboard || !leaderboardHeader) {
        console.warn("Leaderboard elements not found");
        return;
    }
    

    const existingEntries = {};
    leaderboard.querySelectorAll('.leaderboard-entry').forEach(entry => {
        const usernameEl = entry.querySelector('[data-username]');
        if (usernameEl) {
            existingEntries[usernameEl.dataset.username] = {
                element: entry,
                position: entry.getBoundingClientRect(),
                words: parseInt(entry.querySelector('[data-words]')?.textContent || '0'),
                coins: parseInt(entry.querySelector('[data-coins]')?.textContent || '0')
            };
        }
    });
    

    const sortedPlayers = [...currentArcadeSession.participants]
        .sort((a, b) => {
            if (b.wordsCompleted !== a.wordsCompleted) {
                return b.wordsCompleted - a.wordsCompleted;
            }
            return b.coins - a.coins;
        });
    

    leaderboard.innerHTML = '';
    leaderboard.appendChild(leaderboardHeader);
    

    const getRandomColor = () => shineColors[Math.floor(Math.random() * shineColors.length)];
    const getReadyPhrase = () => readyPhrases[Math.floor(Math.random() * readyPhrases.length)];
    

    const isGameActive = currentArcadeSession.state === 'active';
    

    sortedPlayers.forEach((player, index) => {
        let entry;
        const existingEntry = existingEntries[player.username];
        
        if (existingEntry) {

            entry = existingEntry.element.cloneNode(true);
            

            entry.setAttribute('data-rank', index + 1);
            

            entry.className = `leaderboard-entry ${index < 3 ? `rank-${index + 1}` : ''}`;
            if (!isGameActive) {
                entry.classList.add('waiting');
            }
        } else {

            entry = document.createElement('div');
            entry.className = `leaderboard-entry ${index < 3 ? `rank-${index + 1}` : ''}`;
            entry.setAttribute('data-rank', index + 1);
            
            if (!isGameActive) {
                entry.classList.add('waiting');
            }
        }
        

        if (isGameActive) {

            entry.innerHTML = `
                <div class="rank">${index + 1}</div>
                <div data-username="${player.username}" class="player-name">${player.username}</div>
                <div data-words="${player.wordsCompleted || 0}" class="words">${player.wordsCompleted || 0}</div>
                <div data-coins="${player.coins || 0}" class="coins">${player.coins || 0}</div>
            `;
        } else {

            entry.innerHTML = `
                <div class="rank">${index + 1}</div>
                <div data-username="${player.username}" class="player-name">${player.username}</div>
                <div class="player-status-waiting">
                    <span class="status-text" style="color: ${getRandomColor()}">${getReadyPhrase()}</span>
                </div>
                <div class="waiting-indicator">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            `;
        }
        

        leaderboard.appendChild(entry);
        

        if (existingEntry) {
            const newPosition = entry.getBoundingClientRect();
            const diff = existingEntry.position.top - newPosition.top;
            
            if (diff > 10) {
                entry.classList.add('moving-up');
            } else if (diff < -10) {
                entry.classList.add('moving-down');
            }
            

            const wordCountEl = entry.querySelector('[data-words]');
            if (wordCountEl && player.wordsCompleted !== existingEntry.words) {
                wordCountEl.classList.add('highlight-change');
                setTimeout(() => wordCountEl.classList.remove('highlight-change'), 2000);
            }
            

            const coinCountEl = entry.querySelector('[data-coins]');
            if (coinCountEl && player.coins !== existingEntry.coins) {
                coinCountEl.classList.add('highlight-change');
                setTimeout(() => coinCountEl.classList.remove('highlight-change'), 2000);
            }
        }
    });
    

    if (currentUser?.id === currentArcadeSession.teacherId && isGameActive) {
        if (!window.leaderboardRefreshInterval) {
            window.leaderboardRefreshInterval = setInterval(() => {
                requestAllPlayerStats();
            }, 5000);
        }
    }
    

    document.getElementById('activeParticipantCount').textContent = sortedPlayers.length;
}

function startWaitingGame() {
    const waitingScreen = document.getElementById("waiting-screen");
    const gameArea = waitingScreen.querySelector('.waiting-game-area');
    const playButton = waitingScreen.querySelector('#play-waiting-game');
    
    if (!gameArea || !playButton) return;
    

    playButton.textContent = 'Restart';
    

    if (window.waitingGameState.gameInterval) {
      clearInterval(window.waitingGameState.gameInterval);
    }
    gameArea.querySelectorAll('.waiting-word-item').forEach(el => el.remove());
    

    window.waitingGameState.score = 0;
    window.waitingGameState.lives = 3;
    window.waitingGameState.isPlaying = true;
    window.waitingGameState.words = [];
    

    const scoreDisplay = waitingScreen.querySelector('#waiting-game-score');
    if (scoreDisplay) {
      scoreDisplay.textContent = '0';
    }
    

    const heartsContainer = waitingScreen.querySelector('.lives-display');
    if (heartsContainer) {
      heartsContainer.innerHTML = `
        <span class="heart">❤️</span>
        <span class="heart">❤️</span>
        <span class="heart">❤️</span>
      `;
    }
    

    const wordPairs = generateWaitingGameWordPairs();
    

    window.waitingGameState.gameInterval = setInterval(() => {
      if (window.waitingGameState.isPlaying) {
        spawnWaitingGameWord(gameArea, wordPairs);
      }
    }, 2000);
  }

  function generateWaitingGameWordPairs() {

    const wordPairs = [];
    const seenWords = new Set();
    

    for (const setKey in vocabularySets) {
      const set = vocabularySets[setKey];
      if (set && set.words && set.translations) {
        for (let i = 0; i < set.words.length && wordPairs.length < 20; i++) {
          const word = set.words[i];
          const translation = set.translations[i];
          
          if (word && translation && !seenWords.has(word)) {
            wordPairs.push({ english: word, hebrew: translation });
            seenWords.add(word);
          }
        }
        

        if (wordPairs.length >= 20) break;
      }
    }
    

    if (wordPairs.length < 10) {
      const fallbackPairs = [
        { english: "hello", hebrew: "שלום" },
        { english: "goodbye", hebrew: "להתראות" },
        { english: "thanks", hebrew: "תודה" },
        { english: "yes", hebrew: "כן" },
        { english: "no", hebrew: "לא" },
        { english: "water", hebrew: "מים" },
        { english: "food", hebrew: "אוכל" },
        { english: "friend", hebrew: "חבר" },
        { english: "book", hebrew: "ספר" },
        { english: "house", hebrew: "בית" }
      ];
      
      for (const pair of fallbackPairs) {
        if (!seenWords.has(pair.english)) {
          wordPairs.push(pair);
          seenWords.add(pair.english);
        }
      }
    }
    
    return wordPairs;
  }
  
  function spawnWaitingGameWord(gameArea, wordPairs) {
    if (!gameArea || !wordPairs || wordPairs.length === 0) return;
    

    if (window.waitingGameState.words.length >= 5) {
      removeOldestWord();
    }
    

    const pairIndex = Math.floor(Math.random() * wordPairs.length);
    const pair = wordPairs[pairIndex];
    

    const showCorrectPair = Math.random() > 0.3;
    

    const wordItem = document.createElement('div');
    wordItem.className = 'waiting-word-item';
    

    if (showCorrectPair) {

      wordItem.innerHTML = `
        <div class="word english">${pair.english}</div>
        <div class="word hebrew">${pair.hebrew}</div>
      `;
      wordItem.dataset.correct = 'true';
    } else {

      let otherPairIndex;
      do {
        otherPairIndex = Math.floor(Math.random() * wordPairs.length);
      } while (otherPairIndex === pairIndex);
      
      wordItem.innerHTML = `
        <div class="word english">${pair.english}</div>
        <div class="word hebrew">${wordPairs[otherPairIndex].hebrew}</div>
      `;
      wordItem.dataset.correct = 'false';
    }
    

    wordItem.style.cssText = `
      position: absolute;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 10px;
      text-align: center;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: transform 0.2s, background 0.2s;
      left: ${Math.random() * 65}%;
      top: ${Math.random() * 70}%;
    `;
    

    wordItem.addEventListener('click', handleWaitingGameWordClick);
    

    gameArea.appendChild(wordItem);
    

    window.waitingGameState.words.push({
      element: wordItem,
      timestamp: Date.now()
    });
  }
  
  function removeOldestWord() {
    if (!window.waitingGameState.words.length) return;
    

    window.waitingGameState.words.sort((a, b) => a.timestamp - b.timestamp);
    

    const oldest = window.waitingGameState.words.shift();
    if (oldest.element && oldest.element.parentNode) {
      oldest.element.parentNode.removeChild(oldest.element);
    }
  }
  
  function handleWaitingGameWordClick(event) {
    const wordItem = event.currentTarget;
    if (!wordItem) return;
    

    window.waitingGameState.words = window.waitingGameState.words.filter(
      item => item.element !== wordItem
    );
    

    const isCorrect = wordItem.dataset.correct === 'true';
    
    if (isCorrect) {

      window.waitingGameState.score += 5;
      

      const scoreDisplay = document.getElementById('waiting-game-score');
      if (scoreDisplay) {
        scoreDisplay.textContent = window.waitingGameState.score;
      }
      

      wordItem.style.background = 'rgba(0, 255, 0, 0.3)';
      wordItem.style.transform = 'scale(1.1)';
      
      setTimeout(() => {
        if (wordItem.parentNode) {
          wordItem.parentNode.removeChild(wordItem);
        }
      }, 500);
    } else {

      window.waitingGameState.lives--;
      

      const heartsContainer = document.querySelector('.lives-display');
      if (heartsContainer) {
        const hearts = heartsContainer.querySelectorAll('.heart');
        if (hearts.length >= window.waitingGameState.lives) {
          hearts[hearts.length - 1].style.opacity = '0.2';
        }
      }
      

      wordItem.style.background = 'rgba(255, 0, 0, 0.3)';
      wordItem.style.transform = 'scale(0.9)';
      
      setTimeout(() => {
        if (wordItem.parentNode) {
          wordItem.parentNode.removeChild(wordItem);
        }
      }, 500);
      

      if (window.waitingGameState.lives <= 0) {
        endWaitingGame();
      }
    }
  }
  
  function endWaitingGame() {

    window.waitingGameState.isPlaying = false;
    
    if (window.waitingGameState.gameInterval) {
      clearInterval(window.waitingGameState.gameInterval);
      window.waitingGameState.gameInterval = null;
    }
    

    const gameArea = document.querySelector('.waiting-game-area');
    if (gameArea) {
      gameArea.querySelectorAll('.waiting-word-item').forEach(el => el.remove());
    }
    

    const playButton = document.querySelector('#play-waiting-game');
    if (playButton) {
      playButton.textContent = 'Play Again';
    }
    

    window.waitingGameState.words = [];
  }

async function startArcade() {

    const selectedStages = Array.from(document.querySelectorAll('.stage-checkboxes input:checked')).map(el => parseInt(el.value));
    const warningElement = document.querySelector('.stage-warning');
    

    const selectedListIds = currentArcadeSession.selectedCustomLists || [];
    const wordGoalInput = document.getElementById('wordGoal') || document.getElementById('wordGoalSlider');
    const wordGoalValue = parseInt(wordGoalInput?.value || '50');
    

    if (selectedStages.length === 0 && selectedListIds.length === 0) {
        if (warningElement) warningElement.style.display = 'block';
        console.error('No stages or custom lists selected');
        return;
    }
    
    if (warningElement) warningElement.style.display = 'none';
    

    try {
        currentArcadeSession.wordPool = await generateCombinedWordPool(selectedListIds, selectedStages, wordGoalValue);
    } catch (error) {
        console.error('Error generating word pool:', error);
        alert('Failed to generate word pool. Please try again.');
        return;
    }
    

    currentArcadeSession.wordGoal = wordGoalValue;
    console.log('Selected word goal:', currentArcadeSession.wordGoal);
    

    currentArcadeSession.state = 'started';
    currentArcadeSession.participants = [];
    currentArcadeSession.completedPlayers = [];
    currentArcadeSession.podiumRanks = {};
    currentArcadeSession.isInitialized = false;
    currentArcadeSession.startTime = null;
    currentArcadeSession.endTime = null;
    currentArcadeSession.winnerScreenShown = false;
    

    window.arcadeChannel.on('broadcast', { event: 'progress_update' }, ({ payload }) => {
        if (payload && payload.username) {

            const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === payload.username);
            
            if (playerIndex !== -1) {
                const player = currentArcadeSession.participants[playerIndex];
                const currentProgress = player.wordsCompleted || 0;
                

                if (payload.wordsCompleted !== undefined && payload.wordsCompleted < currentProgress) {
                    console.warn(`Prevented progress reset for ${payload.username}: ${currentProgress} → ${payload.wordsCompleted}`);
                    payload.wordsCompleted = currentProgress;
                }
                

                currentArcadeSession.participants[playerIndex] = {
                    ...player,
                    ...payload
                };
            } else {

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
        

        if (payload.username && !currentArcadeSession.completedPlayers.includes(payload.username)) {
            currentArcadeSession.completedPlayers.push(payload.username);
            

            if (payload.rank && payload.rank <= 3) {
                currentArcadeSession.podiumRanks[payload.username] = {
                    rank: payload.rank,
                    completionTime: payload.timestamp || Date.now()
                };
            }
            
            updatePlayerProgress(payload);
            

            if (currentArcadeSession.completedPlayers.length >= 3) {
                endArcadeForAll();
            }
        }
    });
    

    const arcadeModal = document.getElementById('arcade-modal');
    if (arcadeModal) arcadeModal.style.display = 'none';
    
    showModeratorScreen();
    

    if (currentUser?.id === currentArcadeSession.teacherId) {
        const idleDetection = initializeModeratorIdleDetection();
        currentArcadeSession.idleDetection = idleDetection;
    }
}

function updateModeratorScreenButtons() {
  const startArcadeBtn = document.querySelector('.start-arcade-button');
  const endArcadeBtn = document.querySelector('.end-arcade-button');
  
  if (currentArcadeSession && currentArcadeSession.state === 'started' || currentArcadeSession.state === 'active') {

    if (startArcadeBtn) startArcadeBtn.style.display = 'none';
    if (endArcadeBtn) endArcadeBtn.style.display = 'block';
  } else {

    if (startArcadeBtn) startArcadeBtn.style.display = 'block';
    if (endArcadeBtn) endArcadeBtn.style.display = 'none';
  }
}

async function generateCombinedWordPool(selectedListIds, selectedStages, wordGoal) {
    console.log('Generating combined word pool with:', { 
        selectedListIds, 
        selectedStages, 
        wordGoal 
    });
    
    let combinedPool = [];
    let debugStats = { customWords: 0, stageWords: 0 };
    

    if (selectedListIds && selectedListIds.length > 0) {
        try {
            const customWords = await getWordsFromCustomLists(selectedListIds);
            combinedPool = [...customWords];
            debugStats.customWords = customWords.length;
            console.log(`Added ${customWords.length} words from custom lists`);
        } catch (error) {
            console.error("Error getting custom list words:", error);

        }
    }
    

    let remainingCount = wordGoal - combinedPool.length;
    
    if (remainingCount > 0 && selectedStages && selectedStages.length > 0) {
        try {

            const buffer = Math.max(10, Math.ceil(wordGoal * 0.2));
            

            const stageWords = generateStageWordPool(selectedStages, remainingCount + buffer);
            

            const wordsToAdd = stageWords.slice(0, remainingCount);
            combinedPool = [...combinedPool, ...wordsToAdd];
            debugStats.stageWords = wordsToAdd.length;
            
            console.log(`Added ${wordsToAdd.length} words from selected stages`);
            

            remainingCount = wordGoal - combinedPool.length;
        } catch (error) {
            console.error("Error generating stage words:", error);

            remainingCount = wordGoal - combinedPool.length;
        }
    }
    

    if (remainingCount > 0) {
        console.warn(`Still need ${remainingCount} more words, adding emergency words`);
        const emergencyWords = generateEmergencyWordPool(remainingCount);
        combinedPool = [...combinedPool, ...emergencyWords];
        debugStats.emergencyWords = emergencyWords.length;
    }
    

    combinedPool = combinedPool.filter(word => {
        const isValid = word && typeof word === 'object' && 
                        typeof word.word === 'string' && 
                        typeof word.translation === 'string';
        
        if (!isValid) {
            console.error("Invalid word found in pool:", word);
        }
        
        return isValid;
    });
    

    combinedPool = shuffleArray(combinedPool);
    

    if (combinedPool.length > wordGoal) {
        combinedPool = combinedPool.slice(0, wordGoal);
    }
    

    if (combinedPool.length < wordGoal) {
        const shortfall = wordGoal - combinedPool.length;
        console.warn(`Final pool still short by ${shortfall} words, duplicating existing words`);
        

        const originals = [...combinedPool];
        for (let i = 0; i < shortfall; i++) {

            const wordToDuplicate = { ...originals[i % originals.length] };
            combinedPool.push(wordToDuplicate);
        }
        

        combinedPool = shuffleArray(combinedPool);
    }
    

    console.log(`Final word pool created with ${combinedPool.length}/${wordGoal} words:`, {
        customWords: debugStats.customWords,
        stageWords: debugStats.stageWords,
        emergencyWords: debugStats.emergencyWords || 0,
        totalWords: combinedPool.length,
        sampleWords: combinedPool.slice(0, 3)
    });
    
    return combinedPool;
}

async function getWordsFromCustomLists(listIds) {
    let combinedWords = [];
    

    if (!CustomListsManager.lists || CustomListsManager.lists.length === 0) {
        await CustomListsManager.initialize();
    }
    

    for (const listId of listIds) {
        const list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
        
        if (list && list.words && list.translations) {

            for (let i = 0; i < list.words.length; i++) {
                if (i < list.translations.length) {
                    combinedWords.push({
                        word: list.words[i],
                        translation: list.translations[i]
                    });
                }
            }
        }
    }
    
    return combinedWords;
}

function generateStageWordPool(stages, count) {
    let pool = [];
    let stageWords = [];
    

    stages.forEach(stage => {
        Object.keys(vocabularySets).forEach(key => {
            if (key.startsWith(`${stage}_`)) {
                const set = vocabularySets[key];
                set.words.forEach((word, index) => {
                    stageWords.push({
                        word: word,
                        translation: set.translations[index]
                    });
                });
            }
        });
    });
    

    stageWords = shuffleArray(stageWords);
    

    return stageWords.slice(0, count);
}

function shuffleArray(array) {
    if (!array || !Array.isArray(array)) return [];
    
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
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
  addResponsiveStyles();
  
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
  

  let initialCoins = 0;
  

  if (currentUser && currentUser.status === 'premium') {

    if (currentArcadeSession.initialCoins > 0) {
      initialCoins = currentArcadeSession.initialCoins;
      console.log(`Using arcade session initial coins: ${initialCoins}`);
    } else {

      console.log("No initial coins in session, fetching from database");
      initialCoins = await getCurrentCoinsForArcade();
      currentArcadeSession.initialCoins = initialCoins;
    }
    
    console.log(`Premium user starting game with ${initialCoins} coins`);
    

    await syncPremiumUserCoinsImmediately();
  }
  

  const isNewPlayerJoining = currentArcadeSession.participants.some(p => 
    p.wordsCompleted > 0 && p.username !== playerName);
  
  console.log("Is late joiner:", isNewPlayerJoining);
  console.log("Current participants:", currentArcadeSession.participants);
  

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
    isLateJoiner: isNewPlayerJoining,
    isLoadingQuestion: false,
    isProcessingAnswer: false
  };
  

  document.querySelectorAll('.coin-count').forEach(el => {
    el.textContent = initialCoins.toString();
  });

  if (currentUser && currentUser.status === 'premium' && initialCoins > 0) {

    console.log(`Broadcasting premium user coins for game start: ${initialCoins}`);
    window.arcadeChannel.send({
      type: 'broadcast',
      event: 'premium_user_coins',
      payload: {
        username: playerName,
        coins: initialCoins,
        timestamp: Date.now(),
        wordsCompleted: 0,
        isPremium: true,
        isTrusted: true,
        source: 'premiumCoinsSync',
        priority: 'high',
        gameStart: true
      }
    });
    

    const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === playerName);
    if (playerIndex !== -1) {
      currentArcadeSession.participants[playerIndex].coins = initialCoins;
      currentArcadeSession.participants[playerIndex].isPremium = true;
    } else {
      currentArcadeSession.participants.push({
        username: playerName,
        wordsCompleted: 0,
        coins: initialCoins,
        isPremium: true
      });
    }


    broadcastCurrentParticipantData();
  }
  


  if (!isNewPlayerJoining) {
    try {
      window.arcadeChannel.send({
        type: "broadcast",
        event: "progress_update",
        payload: {
          username: playerName,
          wordsCompleted: 0,
          coins: initialCoins,
          timestamp: Date.now(),
          isPremium: currentUser?.status === 'premium' || false,
          isTrusted: true
        }
      });
    } catch (err) {
      console.error("Failed to send initial progress update:", err);
    }
  }
  

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
  

  if (!currentGame.words || currentGame.words.length === 0) {
    console.error("Words array is empty, trying to initialize from session data");
    if (currentArcadeSession.wordPool && currentArcadeSession.wordPool.length > 0) {
      currentGame.words = JSON.parse(JSON.stringify(currentArcadeSession.wordPool));
      console.log(`Initialized words array with ${currentGame.words.length} words from wordPool`);
    } else {
      console.error("No word pool available in session data");
      showNotification("Error loading questions. Please restart the game.", "error");
      showScreen('welcome-screen');
      return;
    }
  }
  

  if (!currentGame.initialWordPool && currentGame.words.length > 0) {
    currentGame.initialWordPool = JSON.parse(JSON.stringify(currentGame.words));
    console.log(`Created initialWordPool backup with ${currentGame.initialWordPool.length} words`);
  }
  

  initializePowerups();
  initializeArcadeUI();

  setTimeout(() => {
      const circle = document.querySelector('.progress-circle .progress');
      if (circle) {
          const radius = 54;
          const circumference = 2 * Math.PI * radius;
          

          circle.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
          circle.setAttribute('stroke-dashoffset', `${circumference}`);
          circle.style.strokeDasharray = `${circumference} ${circumference}`;
          circle.style.strokeDashoffset = `${circumference}`;
          
          console.log('Forced progress circle reset to empty!');
      }
  }, 50);


  setupArcadeProgressPolling();
  

  reportUserStatsToModeratorView();
  
  updateAllCoinDisplays();
  

  console.log("Loading first arcade question...");
  loadNextArcadeQuestion();
}

function setupArcadeEventHandlers() {
  if (!window.arcadeChannel) {
      console.error("Arcade channel not initialized");
      return;
  }
  



  

  window.arcadeChannel
      .on('broadcast', { event: 'progress_update' }, ({ payload: e }) => {

          console.log("Progress update received:", e);
          

          if (e.username === currentArcadeSession.playerName) {
              console.log(`Ignoring self-update from ${currentArcadeSession.playerName}`);
              return;
          }
          

          updatePlayerProgress(e);
          

          updatePlayerRankDisplay();
      })
      .on('broadcast', { event: 'game_playing' }, ({ payload: event }) => {
          if (event.state === 'active') {

              currentArcadeSession.state = 'active';
              

              if (!currentArcadeSession.wordPool || currentArcadeSession.wordPool.length === 0) {
                  currentArcadeSession.wordPool = event.wordPool;
              }
              

              currentArcadeSession.wordGoal = event.wordGoal;
          }
      })
      .on('broadcast', { event: 'game_end' }, ({ payload }) => {
          handleGameEnd(payload);
          currentArcadeSession.state = 'ended';
      })
      .on('broadcast', { event: 'request_latest_stats' }, ({ payload }) => {

          if (currentGame && currentArcadeSession.playerName) {

              const delay = Math.floor(Math.random() * 300);
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
      });
      
  console.log("Arcade event handlers initialized");
}


function reportUserStatsToModeratorView() {
  if (!window.arcadeChannel || !currentUser || !currentArcadeSession.playerName) return;
  
  try {

      const coins = currentGame?.coins || gameState?.coins || 0;
      const wordsCompleted = currentGame?.wordsCompleted || 0;
      
      console.log(`Reporting stats to moderator: ${wordsCompleted} words, ${coins} coins`);
      

      window.arcadeChannel.send({
          type: 'broadcast',
          event: 'progress_update',
          payload: {
              username: currentArcadeSession.playerName,
              wordsCompleted: wordsCompleted,
              coins: coins,
              timestamp: Date.now(),
              isPremium: currentUser.status === 'premium',
              isTrusted: true,
              source: 'statsReport'
          }
      });
  } catch (error) {
      console.error("Error reporting stats to moderator:", error);
  }
}


reportUserStatsToModeratorView();

async function updatePlayerStatsAfterArcade() {
    if (!currentUser || !currentUser.id) {

        localStorage.removeItem('simploxCustomCoins');
        return;
    }
    

    if (currentUser.status === 'premium') {
        try {
            console.log('Updating premium user stats after arcade');
            const coinsEarned = currentGame.coins - currentArcadeSession.initialCoins;
            const wordsCompleted = currentGame.wordsCompleted || 0;
            
            if (coinsEarned <= 0 && wordsCompleted <= 0) {
                console.log('No stats to update (no progress made)');
                return;
            }
            

            if (coinsEarned > 0) {

                const { data: progressData, error: progressError } = await supabaseClient
                    .from('game_progress')
                    .select('coins, mode_coins')
                    .eq('user_id', currentUser.id)
                    .single();
                
                if (!progressError && progressData) {
                    const currentCoins = progressData.coins || 0;
                    const modeCoins = progressData.mode_coins || { arcade: 0, story: 0, custom: 0 };
                    

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
            

            if (wordsCompleted > 0) {
                const { data: statsData, error: statsError } = await supabaseClient
                    .from('player_stats')
                    .select('unique_words_practiced, total_levels_completed')
                    .eq('user_id', currentUser.id)
                    .single();
                
                if (!statsError && statsData) {


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

        localStorage.removeItem('simploxCustomCoins');
    }
}

async function updateArcadeCoins(amount) {

    const oldCoins = currentGame.coins;
    const newCoins = oldCoins + amount;
    

    if (currentUser) {
        try {
            const { error } = await supabaseClient
                .from('game_progress')
                .update({ coins: newCoins })
                .eq('user_id', currentUser.id);

            if (error) throw error;
        } catch (error) {
            console.error('Failed to update coins in database:', error);
            return false;
        }
    }


    return CoinController.updateLocalCoins(newCoins);
}

function safeUpdatePlayerProgress(data) {


    if (data.username === currentArcadeSession.playerName) {
      return;
    }
    

    updatePlayerProgress(data);
  }

  function loadNextArcadeQuestion() {

    if (currentGame.wordsCompleted >= currentArcadeSession.wordGoal) {
        console.log("Word goal reached, stopping question loading");
        return;
    }
    

    if (currentGame.isLoadingQuestion) {
        console.warn("Question already loading, preventing duplicate load");
        return;
    }
    
    try {

        currentGame.isLoadingQuestion = true;
        
        const questionWord = document.getElementById('question-word');
        const buttonsDiv = document.getElementById('buttons');
        
        if (!questionWord || !buttonsDiv) {
            console.error("Required DOM elements not found");
            currentGame.isLoadingQuestion = false;
            return;
        }
        

        buttonsDiv.innerHTML = '';
        

        if (!currentGame.initialWordPool || !Array.isArray(currentGame.initialWordPool)) {
            console.log("Creating initial word pool backup");

            if (currentArcadeSession.wordPool && Array.isArray(currentArcadeSession.wordPool)) {
                currentGame.initialWordPool = JSON.parse(JSON.stringify(currentArcadeSession.wordPool));
            } else {
                console.error("No valid word pool found in session");
                currentGame.initialWordPool = [];
            }
        }
        

        if (!currentGame.words || !Array.isArray(currentGame.words) || currentGame.words.length === 0) {
            console.log("Initializing active word pool");

            if (currentGame.initialWordPool && currentGame.initialWordPool.length > 0) {
                currentGame.words = JSON.parse(JSON.stringify(currentGame.initialWordPool));
            } else {

                if (currentArcadeSession.wordPool && Array.isArray(currentArcadeSession.wordPool) && 
                    currentArcadeSession.wordPool.length > 0) {
                    currentGame.words = JSON.parse(JSON.stringify(currentArcadeSession.wordPool));

                    currentGame.initialWordPool = JSON.parse(JSON.stringify(currentArcadeSession.wordPool));
                } else {
                    console.error("Failed to initialize word pool - no valid source found");

                    if (!currentGame.lastWord) {
                        showNotification("Error loading questions. Please restart the game.", "error");
                        currentGame.isLoadingQuestion = false;
                        return;
                    }
                }
            }
        }
        

        let currentWord;
        let currentIndex = -1;
        
        if ((!currentGame.words || currentGame.words.length === 0) && currentGame.lastWord) {
            console.log("Using last word as fallback");
            currentWord = currentGame.lastWord;
        } else {

            const wordPoolSize = currentGame.words.length;
            if (wordPoolSize === 0) {
                console.error("Word pool is empty");
                currentGame.isLoadingQuestion = false;
                return;
            }
            
            currentIndex = Math.floor(Math.random() * wordPoolSize);
            if (currentIndex >= wordPoolSize) {
                console.error("Invalid word index:", currentIndex, "pool size:", wordPoolSize);
                currentGame.isLoadingQuestion = false;
                return;
            }
            
            currentWord = currentGame.words[currentIndex];
            if (!currentWord) {
                console.error("Selected word is undefined at index:", currentIndex);
                currentGame.isLoadingQuestion = false;
                return;
            }
        }
        

        currentGame.currentWordIndex = currentIndex;
        currentGame.currentWord = currentWord;
        currentGame.lastWord = currentWord;
        

        console.log(`Loading word #${currentGame.wordsCompleted + 1}: `, 
                    currentWord.word, currentWord.translation);
        

        const isHebrewToEnglish = Math.random() < 0.5;
        currentGame.isHebrewToEnglish = isHebrewToEnglish;
        

        const wordToDisplay = isHebrewToEnglish ? currentWord.translation : currentWord.word;
        questionWord.textContent = wordToDisplay;
        

        let options = [isHebrewToEnglish ? currentWord.word : currentWord.translation];
        

        let optionPool = currentGame.initialWordPool || currentGame.words;
        if (!optionPool || optionPool.length < 3) {

            optionPool = [];
            Object.values(vocabularySets).forEach(set => {
                if (set.words && set.translations) {
                    for (let i = 0; i < set.words.length; i++) {
                        if (i < set.translations.length) {
                            optionPool.push({
                                word: set.words[i],
                                translation: set.translations[i]
                            });
                        }
                    }
                }
            });
        }
        

        let attempts = 0;
        while (options.length < 3 && attempts < 15 && optionPool.length > 1) {
            attempts++;
            const randomWordIndex = Math.floor(Math.random() * optionPool.length);
            const randomWord = optionPool[randomWordIndex];
            
            if (!randomWord) continue;
            
            const option = isHebrewToEnglish ? randomWord.word : randomWord.translation;
            const correctOption = isHebrewToEnglish ? currentWord.word : currentWord.translation;
            
            if (option !== correctOption && !options.includes(option)) {
                options.push(option);
            }
        }
        

        if (options.length < 3) {

            const fallbackWords = isHebrewToEnglish ? 
                ['dog', 'cat', 'house', 'water', 'book', 'friend', 'food', 'table', 'car', 'school'] :
                ['כלב', 'חתול', 'בית', 'מים', 'ספר', 'חבר', 'אוכל', 'שולחן', 'מכונית', 'בית ספר'];
            
            while (options.length < 3) {
                const fallback = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
                if (!options.includes(fallback)) {
                    options.push(fallback);
                }
            }
        }
        

        options = shuffleArray(options);
        

        options.forEach(option => {
            const button = document.createElement('button');
            button.textContent = option;
            

            const clickHandler = () => {

                buttonsDiv.querySelectorAll('button').forEach(btn => {
                    btn.onclick = null;
                    btn.disabled = true;
                });
                

                setTimeout(() => {
                    const correctAnswer = isHebrewToEnglish ? currentWord.word : currentWord.translation;
                    handleArcadeAnswer(option === correctAnswer);
                }, 50);
            };
            
            button.onclick = clickHandler;
            buttonsDiv.appendChild(button);
        });
        

        currentGame.isLoadingQuestion = false;
    } catch (error) {
        console.error("Error in loadNextArcadeQuestion:", error);
        currentGame.isLoadingQuestion = false;
    }
}

function isGuestUser() {
    return !currentUser || !currentUser.id;
}

function setupGuestArcadeMode() {

    if (window.arcadeStatsInterval) {
        clearInterval(window.arcadeStatsInterval);
        window.arcadeStatsInterval = null;
    }
    

    const guestProgressInterval = setInterval(() => {

        updateArcadeProgress();
        

        if (currentGame.wordsCompleted >= currentArcadeSession.wordGoal) {
            const playerName = currentArcadeSession.playerName || "Guest";
            handlePlayerCompletedGoal(playerName);
            clearInterval(guestProgressInterval);
        }
    }, 3000);
    

    window.guestProgressInterval = guestProgressInterval;
    
    console.log("Guest arcade mode initialized");
}

function cleanupArcadeSession() {
    console.log("Cleaning up arcade session");
    

    cleanupArcadeTimers();
    

    if (window.guestProgressInterval) {
        clearInterval(window.guestProgressInterval);
        window.guestProgressInterval = null;
    }
    

    if (window.arcadeChannel) {
        try {
            window.arcadeChannel.unsubscribe();
        } catch (error) {
            console.error("Error unsubscribing from channel:", error);
        }
    }
    

    currentGame = {
        coins: 0,
        wordsCompleted: 0,
        correctStreak: 0,
        wrongStreak: 0,
        words: [],
        lastAnswerTime: 0,
        isLoadingQuestion: false,
        isProcessingAnswer: false
    };
    
    console.log("Arcade cleanup complete");
}

function updateArcadeProgress() {
    const circle = document.querySelector('.progress-circle .progress');
    if (!circle) {
        console.error('Progress circle not found!');
        return;
    }
    
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    

    const wordsCompleted = currentGame.wordsCompleted || 0;
    const wordGoal = currentArcadeSession.wordGoal || 50;
    

    const progress = wordsCompleted / wordGoal;
    

    circle.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
    circle.setAttribute('stroke-dashoffset', `${circumference * (1 - progress)}`);
    

    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = `${circumference * (1 - progress)}`;
    
    console.log(`Updated arcade progress: ${progress} (${wordsCompleted}/${wordGoal})`);
}

function resetArcadeProgressCircle() {
    const circle = document.querySelector('.progress-circle .progress');
    if (circle) {
        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const wordsCompleted = currentGame.wordsCompleted || 0;
        const wordGoal = currentArcadeSession.wordGoal || 50;
        const progress = wordsCompleted / wordGoal;
        
        circle.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
        circle.setAttribute('stroke-dashoffset', `${circumference * (1 - progress)}`);
    }
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

  if (currentUser?.id === currentArcadeSession.teacherId) {
      console.log("Teacher ending arcade for all participants");
      endArcadeForAll();
  } else {

      console.log("Player exiting arcade");
      

      cleanupArcadeMode();

      if (window.arcadeChannel) {
          window.arcadeChannel.unsubscribe();
      }
      

      if (currentUser && currentUser.status === 'premium') {
          updatePlayerStatsAfterArcade().then(() => {

              currentArcadeSession = {
                  eventId: null,
                  otp: null,
                  wordPool: [],
                  participants: [],
                  teacherId: null,
                  wordGoal: 50,
                  state: 'pre-start',
                  completedPlayers: [],
                  playerRank: null,
                  winnerScreenShown: false,
                  startTime: null,
                  endTime: null
              };
              

              showScreen('welcome-screen');
          }).catch(err => {
              console.error("Error updating premium stats after arcade:", err);
              showScreen('welcome-screen');
          });
      } else {

          showScreen('welcome-screen');
      }
  }
}

function cleanupArcadeMode() {

  if (window.arcadeStatsInterval) {
      clearInterval(window.arcadeStatsInterval);
      window.arcadeStatsInterval = null;
  }
  
  if (window.arcadeTimeouts && Array.isArray(window.arcadeTimeouts)) {
      window.arcadeTimeouts.forEach(timeoutId => {
          if (timeoutId) clearTimeout(timeoutId);
      });
      window.arcadeTimeouts = [];
  }
  
  if (window.arcadeBroadcastInterval) {
      clearInterval(window.arcadeBroadcastInterval);
      window.arcadeBroadcastInterval = null;
  }
  
  if (window.guestProgressInterval) {
      clearInterval(window.guestProgressInterval);
      window.guestProgressInterval = null;
  }
  

  currentGame = null;
  

  document.querySelectorAll('.game-screen, .arcade-screen').forEach(el => {
      el.style.display = 'none';
  });
  
  console.log('Arcade mode cleaned up');
}

function handleAnswer(isCorrect, skipMode = false) {
  const now = Date.now();
  if (now - (currentGame.lastAnswerTime || 0) < 1000) {
    console.warn("Answer too quickly. Please wait a moment.");
    return;
  }
  
  currentGame.lastAnswerTime = now;
  

  if (currentGame.questionStartTime && !skipMode) {
    const answerTime = (now - currentGame.questionStartTime) / 1000;
    if (!currentGame.answerTimes) {
      currentGame.answerTimes = [];
    }
    currentGame.answerTimes.push(answerTime);
  }
  

  currentGame.questionStartTime = 0;
  

  if (!currentGame.coinAwardedWords) {
    currentGame.coinAwardedWords = new Set();
  }
    

    const currentWordKey = currentGame.currentIndex.toString();
    
    try {
      if (isCorrect) {
        currentGame.currentIndex++;
        incrementWordsLearned();

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
          
          if (!gameState.wordsLearned) gameState.wordsLearned = 0;
          gameState.wordsLearned++;
          

          if (PerkManager && typeof PerkManager.refreshPerks === 'function') {
              PerkManager.refreshPerks();
          }


          if (currentGame.currentIndex >= currentGame.words.length) {
            console.log("Boss defeated - final hit!");
            currentGame.bossDefeated = true;
            clearTimer();
            

            const progressCircle = document.querySelector('.progress-circle');
            if (progressCircle) {
              const progress = progressCircle.querySelector('.progress');
              if (progress) {
                const circumference = 2 * Math.PI * 54;
                progress.style.strokeDashoffset = circumference;
              }
            }
            

            showBossDefeatEffect();
            CoinsManager.updateCoins(100).then(() => {
              updateAllCoinDisplays();
            });
            
            return;
          }
          

          updateBossHealthBar();
        } else {
          updateProgressCircle();
        }
        

        if (!skipMode && !currentGame.coinAwardedWords.has(currentWordKey)) {

          currentGame.coinAwardedWords.add(currentWordKey);
          

          const coinsEarned = 5;
          

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

          CoinsManager.updateCoins(coinsEarned).then(() => {
            updatePerkButtons();
            pulseCoins(1);
          }).catch(err => {
            console.error("Error updating total coins:", err);
          });
          
          if (currentGame.correctStreak >= 3) {
            let streakBonus = 1;
            if (currentGame.correctStreak >= 6) {
              streakBonus = 2;
            }
            if (currentGame.correctStreak > 6) {
              streakBonus = 3;
            }
            CoinsManager.updateCoins(streakBonus).then(() => {
              showNotification(`Streak bonus: +${streakBonus} coins!`, 'success');
            });
          }

          currentGame.correctAnswers++;
          

          if (currentUser) {
            const wordIndex = currentGame.currentIndex - 1;
            const word = currentGame.isHebrewToEnglish ? 
              currentGame.words[wordIndex] : 
              currentGame.translations[wordIndex];
            
            const gameMode = currentGame.isCustomPractice ? 'custom' : 
                             currentGame.isArcadeMode ? 'arcade' : 'story';
            

            trackWordEncounter(word, gameMode);
          }
        }
      } else {
        currentGame.firstAttempt = false;
        currentGame.streakBonus = false;
        

        if (!currentGame.mistakeRegisteredWords.has(currentWordKey)) {
          currentGame.mistakeRegisteredWords.add(currentWordKey);
          currentGame.wrongStreak++;
          

          CoinsManager.updateCoins(-3).then(() => {
            updatePerkButtons();
          }).catch(err => {
            console.error("Error updating coins:", err);
          });
        }
        
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
      

      const allButtons = document.querySelectorAll(".buttons button");
      

      const currentCorrectAnswer = currentGame.isHebrewToEnglish
        ? currentGame.words[Math.max(0, currentGame.currentIndex - 1)]
        : currentGame.translations[Math.max(0, currentGame.currentIndex - 1)];
        

      allButtons.forEach((button) => {
        if (button.textContent === currentCorrectAnswer) {
          button.classList.add("correct");
        } else if (!isCorrect && event && event.target && button.textContent === event.target.textContent) {
          button.classList.add("wrong");
        }
      });
      
      saveProgress();
      

      const transitionDelay = 500;
      
      setTimeout(() => {

        allButtons.forEach(btn => {
          btn.classList.remove("correct", "wrong");
        });
        

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


async function trackWordEncounterWithoutCoins(word, gameMode = 'arcade') {

    if (!currentUser || !currentUser.id) {
      console.log('No user logged in, skipping word tracking');
      return null;
    }
  
    try {
      const trimmedWord = String(word).trim();
      const userId = currentUser.id;
      

      await ensureUserInitialization(userId);
      
      try {

        const { data, error } = await supabaseClient.rpc(
          'get_word_history',
          {
            p_user_id: userId,
            p_word: trimmedWord
          }
        );
        
        let isNewWord = false;
        

        if (error) {
          console.error("Error fetching word history:", error);
          return { isNewWord: false, error };
        }
        

        if (data && data.length > 0) {

          const existingRecord = data[0];
          const newCount = (existingRecord.practice_count || 0) + 1;
          
          const { error } = await supabaseClient
            .from("word_practice_history")
            .update({
              practice_count: newCount,
              last_practiced_at: new Date().toISOString(),
              game_mode: gameMode

            })
            .eq("user_id", userId)
            .eq("word", trimmedWord);
            
          if (error) {
            console.error("Error updating word history:", error);
          }
        } else {

          isNewWord = true;
          
          const { error } = await supabaseClient
            .from("word_practice_history")
            .insert([{
              user_id: userId,
              word: trimmedWord,
              practice_count: 1,
              game_mode: gameMode,
              coins_earned: 0,
              last_practiced_at: new Date().toISOString()
            }]);
            
          if (error) {
            console.error("Error inserting word history:", error);
          } else {

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
    exitArcade();
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
    

    const startingCoins = currentArcadeSession.initialCoins || 0;
    const currentCoins = gameState.coins || currentGame.coins || 0;
    const coinsEarned = currentCoins - startingCoins;
    

    const wordsCompleted = currentGame.wordsCompleted || 0;
    

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

  const existingModals = document.querySelectorAll('.arcade-completion-modal');
  existingModals.forEach(modal => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  });
  

  const overlay = document.createElement('div');
  overlay.className = 'arcade-completion-modal';
  

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
          <button id="returnHomeButton" class="start-button" style="margin-top: 1.5rem;">
              Return to Home
          </button>
      </div>
  `;
  
  document.body.appendChild(overlay);
  

  const homeButton = overlay.querySelector('#returnHomeButton');
  if (homeButton) {
      homeButton.addEventListener('click', function() {

          if (overlay.parentNode) {
              overlay.parentNode.removeChild(overlay);
          }
          

          cleanupArcadeSession();
          

          currentGame = {
              currentIndex: 0,
              correctStreak: 0,
              wrongStreak: 0,
              words: [],
              wordsCompleted: 0,
              coins: 0
          };
          

          currentArcadeSession = {
              eventId: null,
              otp: null,
              wordPool: [],
              participants: [],
              teacherId: null,
              wordGoal: 50,
              state: 'pre-start',
              completedPlayers: [],
              playerRank: null,
              winnerScreenShown: false,
              startTime: null,
              endTime: null
          };
          

          if (currentUser && currentUser.status === 'premium') {
              updatePlayerStatsAfterArcade();
          }
          

          showScreen('welcome-screen');
      });
  }
  

  overlay.classList.add('show');
}

async function getCurrentCoinsForArcade() {
  if (!currentUser) return 0;
  
  try {

      if (currentUser.status === 'premium') {
          console.log("Getting coins for premium user:", currentUser.id);
          

          const { data, error } = await supabaseClient
              .from('game_progress')
              .select('coins')
              .eq('user_id', currentUser.id)
              .single();
              
          if (error) {
              console.warn("Error fetching coins from game_progress:", error);

              return gameState?.coins || 0;
          }
          
          const coins = data?.coins || 0;
          console.log("Retrieved coins for premium user:", coins);
          return coins;
      }
      
      return 0;
  } catch (error) {
      console.error('Error fetching coins:', error);

      return gameState?.coins || 0;
  }
}


function reportUserStatsToModeratorView() {
  if (!window.arcadeChannel || !currentUser || !currentArcadeSession.playerName) return;
  
  try {

      const coins = currentGame?.coins || gameState?.coins || 0;
      const wordsCompleted = currentGame?.wordsCompleted || 0;
      
      console.log(`Reporting stats to moderator: ${wordsCompleted} words, ${coins} coins`);
      

      window.arcadeChannel.send({
          type: 'broadcast',
          event: 'progress_update',
          payload: {
              username: currentArcadeSession.playerName,
              wordsCompleted: wordsCompleted,
              coins: coins,
              timestamp: Date.now(),
              source: 'statsReport'
          }
      });
  } catch (error) {
      console.error("Error reporting stats to moderator:", error);
  }
}



reportUserStatsToModeratorView();

function showFinalResultsForPlayer(podiumPlayers) {
    const playerName = currentArcadeSession.playerName;
    const playerPodiumInfo = podiumPlayers.find(p => p.username === playerName);
    

    if (currentArcadeSession.winnerScreenShown && playerPodiumInfo && playerPodiumInfo.rank <= 3) {
        return;
    }
    

    let playerRank;
    if (playerPodiumInfo) {
        playerRank = playerPodiumInfo.rank;
    } else {

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

    if (currentArcadeSession.winnerScreenShown) return;
    currentArcadeSession.winnerScreenShown = true;
    
    console.log('Starting personal victory celebration with rank:', rank);
    

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
        padding: 0 16px;
        box-sizing: border-box;
        overflow: auto;
    `;
    

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
    

    const container = document.createElement('div');
    container.style.cssText = `
        width: 100%;
        max-width: 400px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        height: auto;
        max-height: 95vh;
    `;
    
    const victoryContent = `
        <div style="font-size: clamp(4rem, 10vw, 8rem); margin-bottom: clamp(0.5rem, 2vh, 1rem);">${content.emoji}</div>
        <h1 style="color: ${content.color}; font-size: clamp(2rem, 8vw, 3rem); margin: 0 0 clamp(0.5rem, 2vh, 1rem) 0; text-align: center; line-height: 1.2;">${content.title}</h1>
        <p style="font-size: clamp(1rem, 4vw, 1.5rem); margin-bottom: clamp(1rem, 4vh, 2rem); text-align: center; line-height: 1.4; max-width: 100%;">
            ${content.message}
        </p>
        
        <div style="display: flex; justify-content: space-around; width: 100%; margin: clamp(1rem, 3vh, 2rem) 0;">
            <div style="text-align: center;">
                <div style="font-size: clamp(0.8rem, 3vw, 1.2rem); color: var(--text); opacity: 0.8;">YOUR RANK</div>
                <div style="font-size: clamp(1.8rem, 6vw, 3rem); color: ${content.color};">${rank}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: clamp(0.8rem, 3vw, 1.2rem); color: var(--text); opacity: 0.8;">WORDS COMPLETED</div>
                <div style="font-size: clamp(1.8rem, 6vw, 3rem); color: var(--text);">${currentGame.wordsCompleted || 0}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: clamp(0.8rem, 3vw, 1.2rem); color: var(--text); opacity: 0.8;">COINS EARNED</div>
                <div style="font-size: clamp(1.8rem, 6vw, 3rem); color: var(--gold);">${currentGame.coins || 0}</div>
            </div>
        </div>
        
        <button class="victory-button" style="
            background: var(--accent);
            color: var(--text);
            border: none;
            padding: clamp(0.8rem, 3vh, 1rem) clamp(1.5rem, 5vw, 2.5rem);
            border-radius: 50px;
            font-size: clamp(1rem, 4vw, 1.2rem);
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 5px 15px rgba(30, 144, 255, 0.3);
            margin-top: clamp(1rem, 4vh, 2rem);
            min-width: clamp(150px, 40vw, 200px);
        ">
            Continue
        </button>
    `;
    
    container.innerHTML = victoryContent;
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    

    const continueBtn = overlay.querySelector('.victory-button');
    if (continueBtn) {
        continueBtn.addEventListener('click', closePersonalVictory);
    }
    

    setTimeout(() => {
        overlay.style.opacity = '1';
        

        startPlayerConfetti();
    }, 100);
}

function addResponsiveStyles() {
    if (!document.getElementById('responsive-victory-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'responsive-victory-styles';
        styleElement.textContent = `
            .personal-victory-overlay {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                overflow: auto;
            }
            
            @media (max-height: 600px) {
                .personal-victory-overlay {
                    align-items: flex-start;
                    padding-top: 10px;
                }
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
        `;
        document.head.appendChild(styleElement);
    }
}

function showModeratorVictoryScreen(players) {

    if (moderatorActivityTimer) clearTimeout(moderatorActivityTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    

    const overlay = document.querySelector('.inactivity-overlay');
    if (overlay) overlay.remove();
    

    startLeaderboardCelebration(players);
}


function showPlayerFinalResults(players) {

    const playerUsername = currentArcadeSession.playerName;
    const currentPlayer = players.find(p => p.username === playerUsername);
    

    const currentPlayerRank = currentPlayer?.rank || 
                            players.findIndex(p => p.username === playerUsername) + 1;
    

    if (currentArcadeSession.winnerScreenShown && currentPlayerRank <= 3) {
        return;
    }
    

    const overlay = document.createElement('div');
    overlay.className = 'arcade-completion-modal';
    

    const top3 = players
        .filter(p => p.rank <= 3)
        .sort((a, b) => a.rank - b.rank);
    

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
    

    function getPlayerBackground(rank, isCurrentPlayer) {
        const backgrounds = {
            1: 'linear-gradient(135deg, #FFD700 0%, #FFC800 100%)',
            2: 'linear-gradient(135deg, #C0C0C0 0%, #A9A9A9 100%)',
            3: 'linear-gradient(135deg, #CD7F32 0%, #B87333 100%)'
        };
        
        if (isCurrentPlayer) {
            return (backgrounds[rank] || 'rgba(255,255,255,0.1)') + 
                   '; border: 2px solid white; box-shadow: 0 0 15px rgba(255,255,255,0.5)';
        }
        
        return backgrounds[rank] || 'rgba(255,255,255,0.1)';
    }
}

function removePlayer(username) {

    currentArcadeSession.participants = currentArcadeSession.participants.filter(
        player => player.username !== username
    );
    

    if (window.arcadeChannel) {
        window.arcadeChannel.send({
            type: 'broadcast',
            event: 'player_removed',
            payload: { username }
        });
    }
    

    updateAllPlayersProgress();
}

async function joinArcadeWithUsername() {
  const usernameInput = document.getElementById('arcadeUsername');
  const otpInput = document.getElementById('otpInput');
  

  let username;
  if (currentUser) {
      username = currentUser.user_metadata?.username || 
                currentUser.email.split('@')[0];
  } else {
      username = usernameInput.value.trim();
      

      if (!username || username.length < 2 || username.length > 15) {
          showErrorToast('Username must be between 2 and 15 characters');
          usernameInput.focus();
          return;
      }


      const validUsernameRegex = /^[a-zA-Z0-9\u0590-\u05FF\s._-]+$/;
      if (!validUsernameRegex.test(username)) {
          showErrorToast('Username can contain letters, numbers, spaces, periods, underscores, and hyphens');
          usernameInput.focus();
          return;
      }
  }
  
  const otp = otpInput.value.trim();
  

  if (!otp || otp.length !== 4 || !/^\d+$/.test(otp)) {
      showErrorToast('Please enter a valid 4-digit game code');
      otpInput.focus();
      return;
  }

  try {

      let initialCoins = 0;
      const isPremium = currentUser && currentUser.status === 'premium';
      

      if (isPremium) {
        console.log('Premium user joining arcade, fetching coins...');
        initialCoins = await getCurrentCoinsForArcade();
        console.log('Premium user coins loaded:', initialCoins);
      }
      

      window.arcadeChannel = supabaseClient.channel(`arcade:${otp}`);
      

      currentArcadeSession.playerName = username;
      currentArcadeSession.initialCoins = initialCoins;
      currentArcadeSession.otp = otp;
      

      await window.arcadeChannel.subscribe();
      

      setupCelebrationHandler();
      

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
        .on('broadcast', { event: 'player_join' }, ({ payload: data }) => {
          console.log('Player join event received:', data);
          if (!currentArcadeSession.participants.find(p => p.username === data.username)) {
            currentArcadeSession.participants.push({
              username: data.username,
              wordsCompleted: 0,
              coins: data.coins || 0,
              isPremium: data.isPremium || false
            });
            
            document.getElementById('player-count').textContent = currentArcadeSession.participants.length;
            
            const leaderboard = document.getElementById('arcade-leaderboard');
            if (leaderboard && leaderboard.offsetParent !== null) {
              updateAllPlayersProgress();
            }
          }
        })
        .on('broadcast', { event: 'premium_user_coins' }, ({ payload: data }) => {
            if (data && data.username && data.coins) {
                console.log(`Received premium user coins update: ${data.username} has ${data.coins} coins`);
                

                const playerIndex = currentArcadeSession.participants.findIndex(
                  p => p.username === data.username
                );
                
                if (playerIndex !== -1) {

                  currentArcadeSession.participants[playerIndex].coins = data.coins;
                  currentArcadeSession.participants[playerIndex].isPremium = true;
                }
                

                updatePlayerProgress({
                    username: data.username,
                    coins: data.coins,
                    wordsCompleted: data.wordsCompleted || 0,
                    isPremium: true,
                    isTrusted: true,
                    source: 'premiumCoinsSync'
                });
                

                if (data.priority === 'high' || data.initialSync) {
                  window.lastLeaderboardUpdate = 0;
                  updateAllPlayersProgress();
                }
            }
        })
        .subscribe;
      

      const joinPayload = {
          username: username,
          type: 'initialJoin',
          coins: initialCoins,
          isPremium: isPremium,
          joinedAt: new Date().toISOString()
      };
      
      console.log("Sending join event with payload:", joinPayload);
      

      await window.arcadeChannel.send({
          type: 'broadcast',
          event: 'player_join',
          payload: joinPayload
      });
      
      currentArcadeSession.joinEventSent = true;
      

      if (isPremium && initialCoins > 0) {

          setTimeout(async () => {
              console.log(`Broadcasting premium user coins after join: ${initialCoins}`);
              

              await window.arcadeChannel.send({
                  type: 'broadcast',
                  event: 'premium_user_coins',
                  payload: {
                      username: username,
                      coins: initialCoins,
                      wordsCompleted: 0,
                      isPremium: true,
                      timestamp: Date.now(),
                      isTrusted: true,
                      source: 'premiumCoinsSync',
                      priority: 'high',
                      initialSync: true
                  }
              });
              

              syncPremiumUserCoinsImmediately();
          }, 200);
      }
      

      await window.arcadeChannel.send({
          type: 'broadcast',
          event: 'check_game_status',
          payload: {
              username: username,
              requestType: 'lateJoin',
              timestamp: Date.now()
          }
      });
      

      document.getElementById('arcade-modal').style.display = 'none';
      

      if (isPremium && initialCoins > 0) {
          document.querySelectorAll('.coin-count').forEach(el => {
              el.textContent = initialCoins.toString();
          });
          

          const ourIndex = currentArcadeSession.participants.findIndex(p => p.username === username);
          if (ourIndex !== -1) {
              currentArcadeSession.participants[ourIndex].coins = initialCoins;
              currentArcadeSession.participants[ourIndex].isPremium = true;
          } else {

              currentArcadeSession.participants.push({
                  username: username,
                  wordsCompleted: 0,
                  coins: initialCoins,
                  isPremium: true
              });
          }
          

          window.lastLeaderboardUpdate = 0;
          updateAllPlayersProgress();
      }
      

      setTimeout(() => {


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


    function getRandomPowerups(count = 3) {
        const powerupKeys = Object.keys(powerupDefinitions);
        const selectedKeys = [];
        
        while (selectedKeys.length < count && powerupKeys.length > 0) {
            const randomIndex = Math.floor(Math.random() * powerupKeys.length);
            selectedKeys.push(powerupKeys.splice(randomIndex, 1)[0]);
        }
        
        return selectedKeys;
    }
    

    const container = document.querySelector('.powerups-container');
    if (!container) return;
    

    container.innerHTML = '';
    

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
        

        powerupCard.onclick = async () => {
            console.log("Powerup clicked:", powerup.name);
            

            if (currentGame.coins < powerup.cost) {
                showNotification("Not enough coins!", "error");
                return;
            }
            

            const otherPlayers = currentArcadeSession.participants.filter(p => 
                p.username !== currentArcadeSession.playerName && 
                p.username !== undefined && 
                p.username !== null
            );
            
            if (otherPlayers.length === 0) {
                showNotification("Waiting for other players to join...", "info");
                return;
            }
            

            const targetPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            const oldCoins = currentGame.coins;
            currentGame.coins -= powerup.cost;
            

            document.querySelectorAll('.coin-count').forEach(el => {
                el.textContent = currentGame.coins;
            });
            
            try {

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
                

                showNotification(`Used ${powerup.name} on ${targetPlayer.username}!`, powerup.type);
                

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
                

                initializePowerups();
                
            } catch (error) {
                console.error("Powerup use error:", error);

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
    

    updateAvailability();
    

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
    

    return updateAvailability;
}


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

    const powerupCards = document.querySelectorAll('.powerup-card');
    

    const currentCoins = currentGame.coins || 0;
    

    powerupCards.forEach(card => {
        const costElement = card.querySelector('.powerup-cost');
        if (!costElement) return;
        

        const cost = parseInt(costElement.textContent);
        

        const canAfford = currentCoins >= cost;
        

        card.classList.toggle('disabled', !canAfford);
        card.style.opacity = canAfford ? '1' : '0.5';
        card.style.cursor = canAfford ? 'pointer' : 'not-allowed';
    });
}

function updateArcadeCoinDisplay() {

    const currentCoins = currentGame.coins || 0;
    

    document.querySelectorAll(".coin-count").forEach(element => {
      const displayedValue = parseInt(element.textContent) || 0;
      if (displayedValue !== currentCoins) {

        animateCoinsChange(element, displayedValue, currentCoins);
      }
    });
    

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


document.addEventListener("DOMContentLoaded", function() {
    addCoinAnimationStyles();
});

function proceedToGame() {
    const qrLanding = document.getElementById('qr-landing');
    const otp = qrLanding.dataset.otp;
    

    qrLanding.style.display = 'none';
    

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
  

  const bossOrb = document.createElement('div');
  bossOrb.className = 'boss-orb';
  bossOrb.innerHTML = `<div class="boss-orb-inner"></div>`;
  

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
  

  const orbStyle = document.createElement('style');
  orbStyle.innerHTML = `
    @keyframes pulseOrb {
      0%, 100% { transform: scale(1); filter: brightness(1); }
      50% { transform: scale(1.1); filter: brightness(1.2); }
    }
  `;
  document.head.appendChild(orbStyle);
  

  coinsContainer.innerHTML = '';
  coinsContainer.appendChild(bossOrb);
}

function initializeBossHealthBar() {
  const progressCircle = document.querySelector('.progress-circle');
  if (!progressCircle) return;
  
  const progress = progressCircle.querySelector('.progress');
  if (!progress) return;
  

  progress.style.stroke = '#4CAF50';
  

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
  

  const totalWords = currentGame.words.length;
  const currentIndex = currentGame.currentIndex || 0;
  const remainingWords = Math.max(0, totalWords - currentIndex);
  const remainingPercentage = remainingWords / totalWords;
  
  console.log(`Boss health: ${(remainingPercentage * 100).toFixed(2)}% (${remainingWords}/${totalWords})`);
  

  const circumference = 2 * Math.PI * 54;
  

  progress.style.strokeDashoffset = circumference * (1 - remainingPercentage);
  

  const bossOrb = document.querySelector('.boss-orb-inner');
  if (bossOrb) {
    const minSize = 5;
    const maxSize = 50;
    const currentSize = Math.max(minSize, maxSize * remainingPercentage);
    
    bossOrb.style.width = `${currentSize}px`;
    bossOrb.style.height = `${currentSize}px`;
    

    bossOrb.style.left = `${(50 - currentSize/2)}%`;
    bossOrb.style.top = `${(50 - currentSize/2)}%`;
  }
  

  if (remainingPercentage > 0.66) {

    progress.style.stroke = '#4CAF50';
    progress.classList.remove('warning');
  } else if (remainingPercentage > 0.33) {

    progress.style.stroke = '#FFA500';
    progress.classList.remove('warning');
    

    if (remainingPercentage <= 0.66 && !currentGame.bossFirstHealthRestored) {
      currentGame.bossFirstHealthRestored = true;
      console.log("First boss health restoration");
      
      if (bossOrb) {

        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, white, #FFEB3B)';
        bossOrb.style.transform = 'scale(1.3)';
        bossOrb.style.filter = 'brightness(1.8)';
        
        setTimeout(() => {
          bossOrb.style.transform = '';
          bossOrb.style.filter = '';
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      

      const restoredIndex = Math.floor(totalWords * 0.25);
      currentGame.currentIndex = restoredIndex;
      

      setTimeout(() => updateBossHealthBar(), 100);
    }
  } else {

    progress.style.stroke = '#FF3333';
    progress.classList.add('warning');
    

    if (remainingPercentage <= 0.33 && !currentGame.bossSecondHealthRestored) {
      currentGame.bossSecondHealthRestored = true;
      console.log("Second boss health restoration");
      
      if (bossOrb) {

        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, white, #4CAF50)';
        bossOrb.style.transform = 'scale(1.3)';
        bossOrb.style.filter = 'brightness(1.8)';
        
        setTimeout(() => {
          bossOrb.style.transform = '';
          bossOrb.style.filter = '';
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      

      const restoredIndex = Math.floor(totalWords * 0.5);
      currentGame.currentIndex = restoredIndex;
      

      setTimeout(() => updateBossHealthBar(), 100);
    }
  }


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
        startTimer(currentGame.words.length * 8);
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
        }, 500);
      }, 500);
    } else {
      loadNextQuestion();
    }
    
    setTimeout(() => {
      updateBossHealthBar();
    }, 50);
    

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

    questionScreen.removeAttribute("style");
    

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
  

  if (typeof stopBossRainingLetters === 'function') {
    stopBossRainingLetters();
  }
}


function initializeArcadeParticipation() {

    let lastActive = Date.now();
    const INACTIVE_THRESHOLD = 60000;


    setInterval(() => {
        if (Date.now() - lastActive > INACTIVE_THRESHOLD) {
            removeInactivePlayer();
        }
    }, 10000);


    ['mousemove', 'keypress', 'click'].forEach(event => {
        document.addEventListener(event, () => {
            lastActive = Date.now();
        });
    });


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


function handleArcadeCompletion(playerData) {
    const completionRank = currentArcadeSession.participants
        .sort((a, b) => b.wordsCompleted - a.wordsCompleted)
        .findIndex(p => p.username === playerData.username) + 1;

    if (completionRank <= 3) {
        showPersonalizedCompletion(completionRank);
        
        if (completionRank === 3) {

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

    if (currentArcadeSession.completedPlayers.includes(username)) return;
    

    const completionTime = Date.now();
    currentArcadeSession.completedPlayers.push(username);
    

    let rank = 0;
    const completionIndex = currentArcadeSession.completedPlayers.indexOf(username);
    if (completionIndex < 3) {

        rank = completionIndex + 1;
        

        if (!currentArcadeSession.podiumRanks) {
            currentArcadeSession.podiumRanks = {};
        }
        currentArcadeSession.podiumRanks[username] = {
            rank: rank,
            completionTime: completionTime
        };
        console.log(`Player ${username} earned podium rank ${rank} (first to finish)`);
    }
    

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
    

    if (username === currentArcadeSession.playerName && rank > 0) {

        showPersonalVictoryScreen(rank);
    }
    

    if (currentArcadeSession.completedPlayers.length >= 3) {
        console.log("All podium positions filled, ending game for all players");
        await endArcadeForAll();
    }
}

function resetArcadeSession() {
    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    

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
    

    if (window.arcadeChannel) {
        window.arcadeChannel.unsubscribe();
        window.arcadeChannel = null;
    }
    

    const leaderboard = document.getElementById('arcade-leaderboard');
    if (leaderboard) {
        const header = leaderboard.querySelector('.leaderboard-header');
        leaderboard.innerHTML = header ? header.outerHTML : '';
    }
    

    const otpDisplay = document.getElementById('moderatorOtp');
    if (otpDisplay) {
        otpDisplay.textContent = newOtp;
    }
    

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
    

    const endArcadeButton = document.querySelector('.end-arcade-button');
    if (endArcadeButton) {
        endArcadeButton.classList.remove('visible');
    }
    

    document.querySelectorAll('.celebration-overlay, .home-button-container').forEach(el => el.remove());
    

    currentGame = {
        currentIndex: 0,
        correctStreak: 0,
        wrongStreak: 0,
        words: [],
        wordsCompleted: 0,
        coins: 0,
        lastBroadcast: Date.now()
    };
    

    document.querySelectorAll('.stage-checkboxes input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    

    const wordGoalInput = document.getElementById('wordGoalInput');
    const wordGoalSlider = document.getElementById('wordGoalSlider');
    const wordGoalDisplay = document.getElementById('wordGoalDisplay');
    
    if (wordGoalInput) wordGoalInput.value = "50";
    if (wordGoalSlider) wordGoalSlider.value = "50";
    if (wordGoalDisplay) wordGoalDisplay.textContent = "50";
    
    console.log('Arcade session completely reset with new OTP:', newOtp);
}

function finishCelebrationAndGoHome() {

  document.querySelector(".celebration-overlay")?.remove();
  document.querySelector(".home-button-container")?.remove();
  
  if (window.celebrationConfettiInterval) {
      clearInterval(window.celebrationConfettiInterval);
  }
  
  document.querySelectorAll(".confetti, .celebration-emoji, .winner-entry.celebrating").forEach(
      element => element.remove()
  );
  

  if (localStorage.getItem("gameContext")) {
      localStorage.removeItem("gameContext");
  }
  

  currentGame = null;
  gameState.currentLevel = null;
  gameState.currentSet = null;
  gameState.currentStage = null;
  gameState.sessionStartTime = null;
  

  cleanupArcadeSession();
  cleanupModeratorInactivityMonitoring();
  resetArcadeSession();
  


  window.preventAutoResume = true;
  showScreen("welcome-screen");
  

  setTimeout(() => {
    window.preventAutoResume = false;
  }, 1000);
  

  updatePlayerStatsAfterArcade().catch(err => {
      console.error("Error updating player stats:", err);
  });
}

function handleGameEnd(payload) {
    console.log('Game End Payload:', payload);


    if (!payload) return;
    

    if (payload.forcedEnd) {
        showScreen('welcome-screen');
        return;
    }


    if (currentUser?.id === payload.teacherId) {
        const podiumPlayers = payload.podiumPlayers || [];
        showModeratorVictoryScreen(podiumPlayers);
        return;
    }


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


function endArcade() {

    if (currentUser?.id === currentArcadeSession.teacherId) {
        console.log("Teacher ending arcade for all participants");
        endArcadeForAll();
    } else {

        console.log("Player exiting arcade");
        exitArcade();
    }
}

async function endArcadeForAll() {
    currentArcadeSession.state = "ended";
    currentArcadeSession.endTime = Date.now();
    

    const podiumPlayers = [];
    

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
        

        podiumPlayers.sort((a, b) => a.rank - b.rank);
    }
    

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

    console.log("Moderator idle detection disabled - arcade will continue until manually ended");
    

    return {
        clearIdleTimer: () => {},
        idleCheckInterval: null
    };
}


let moderatorActivityTimer = null;
let countdownTimer = null;
let lastLeaderboardUpdate = Date.now();
let isCountingDown = false;

function initializeModeratorInactivityTimer() {

    if (!isModeratorScreenActive() || !currentArcadeSession.isInitialized) {
        return;
    }
    

    moderatorInactivity.isGameActive = true;
    

    clearModeratorTimers();
    

    moderatorInactivity.lastLeaderboardUpdate = Date.now();
    moderatorInactivity.isCountingDown = false;
    moderatorInactivity.isInitialized = true;
    

    createModeratorInactivityOverlay();
    

    startModeratorInactivityMonitoring();
    

    trackModeratorLeaderboardUpdates();
    
    console.log('Moderator inactivity timer initialized');
}

function createInactivityOverlay() {

    const existingOverlay = document.querySelector('.inactivity-overlay');
    if (existingOverlay) existingOverlay.remove();
    

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
    

    overlay.querySelector('.countdown-cancel').addEventListener('click', cancelCountdown);
    

    document.body.appendChild(overlay);
}

function startInactivityMonitoring() {

    const moderatorScreen = document.getElementById('moderator-screen');
    

    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    

    events.forEach(event => {
        moderatorScreen.addEventListener(event, resetInactivityTimer);
    });
    

    resetInactivityTimer();
}

function resetInactivityTimer() {

    if (isCountingDown) return;
    

    if (moderatorActivityTimer) clearTimeout(moderatorActivityTimer);
    

    moderatorActivityTimer = setTimeout(() => {

        const timeSinceLastUpdate = Date.now() - lastLeaderboardUpdate;
        

        if (timeSinceLastUpdate > 5000) {
            startCountdown();
        }
    }, 3000);
}

function trackLeaderboardUpdates() {

    const leaderboard = document.getElementById('arcade-leaderboard');
    if (!leaderboard) return;
    

    const observer = new MutationObserver(() => {
        lastLeaderboardUpdate = Date.now();
        

        if (isCountingDown) {
            cancelCountdown();
        }
    });
    

    observer.observe(leaderboard, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        characterData: true
    });
}

function startCountdown() {
    isCountingDown = true;
    

    const overlay = document.querySelector('.inactivity-overlay');
    if (overlay) overlay.classList.add('visible');
    

    let secondsLeft = 5;
    const timerDisplay = overlay.querySelector('.countdown-timer');
    const progressBar = overlay.querySelector('.countdown-bar');
    

    timerDisplay.textContent = secondsLeft;
    progressBar.style.transform = 'scaleX(1)';
    

    countdownTimer = setInterval(() => {
        secondsLeft--;
        

        timerDisplay.textContent = secondsLeft;
        progressBar.style.transform = `scaleX(${secondsLeft / 5})`;
        

        if (secondsLeft <= 0) {
            clearInterval(countdownTimer);
            handleCountdownComplete();
        }
    }, 1000);
}

function cancelCountdown() {

    const overlay = document.querySelector('.inactivity-overlay');
    if (overlay) overlay.classList.remove('visible');
    

    isCountingDown = false;
    if (countdownTimer) clearInterval(countdownTimer);
    

    resetInactivityTimer();
}

function handleCountdownComplete() {

    const hasPodiumWinners = currentArcadeSession.completedPlayers && 
                             currentArcadeSession.completedPlayers.length >= 3;
    
    if (hasPodiumWinners) {

        const podiumPlayers = [];
        
        if (currentArcadeSession.podiumRanks) {

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
            

            podiumPlayers.sort((a, b) => a.rank - b.rank);
        } else {

            const sortedPlayers = [...currentArcadeSession.participants]
                .sort((a, b) => b.wordsCompleted - a.wordsCompleted)
                .slice(0, 3);
                

            sortedPlayers.forEach((player, index) => {
                podiumPlayers.push({
                    ...player,
                    rank: index + 1
                });
            });
        }
        

        showModeratorVictoryScreen(podiumPlayers);
    } else {

        showScreen('welcome-screen');
    }
}


const moderatorInactivity = {
    activityTimer: null,
    countdownTimer: null,
    lastLeaderboardUpdate: Date.now(),
    isCountingDown: false,
    isInitialized: false,
    isGameActive: false
};

function initializeModeratorInactivityTimer() {

    if (!isModeratorScreenActive() || !currentArcadeSession.isInitialized) {
        return;
    }
    

    moderatorInactivity.isGameActive = true;
    

    clearModeratorTimers();
    

    moderatorInactivity.lastLeaderboardUpdate = Date.now();
    moderatorInactivity.isCountingDown = false;
    moderatorInactivity.isInitialized = true;
    

    createModeratorInactivityOverlay();
    

    startModeratorInactivityMonitoring();
    

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

    const existingOverlay = document.querySelector('.moderator-inactivity-overlay');
    if (existingOverlay) existingOverlay.remove();
    

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
    

    overlay.querySelector('.moderator-countdown-cancel').addEventListener('click', cancelModeratorCountdown);
    

    const moderatorScreen = document.getElementById('moderator-screen');
    if (moderatorScreen) {
        moderatorScreen.appendChild(overlay);
    }
}

function startModeratorInactivityMonitoring() {
    const moderatorScreen = document.getElementById('moderator-screen');
    if (!moderatorScreen) return;
    

    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    

    events.forEach(event => {
        moderatorScreen.addEventListener(event, resetModeratorInactivityTimer);
    });
    

    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !isModeratorScreenActive()) {

            clearModeratorTimers();
        } else if (moderatorInactivity.isGameActive && isModeratorScreenActive()) {

            resetModeratorInactivityTimer();
        }
    });
    

    resetModeratorInactivityTimer();
}

function resetModeratorInactivityTimer() {

    if (!isModeratorScreenActive() || !moderatorInactivity.isGameActive || moderatorInactivity.isCountingDown) {
        return;
    }
    

    if (moderatorInactivity.activityTimer) {
        clearTimeout(moderatorInactivity.activityTimer);
    }
    

    moderatorInactivity.activityTimer = setTimeout(() => {

        const timeSinceLastUpdate = Date.now() - moderatorInactivity.lastLeaderboardUpdate;
        

        if (timeSinceLastUpdate > 5000 && isModeratorScreenActive()) {

            const playerCount = currentArcadeSession.participants.length;
            let allowTimer = true;
            
            if (playerCount <= 3) {

                const allReachedGoal = currentArcadeSession.participants.every(player => 
                    player.wordsCompleted >= currentArcadeSession.wordGoal
                );
                

                allowTimer = allReachedGoal;
                
                if (!allowTimer) {
                    console.log("Inactivity timer prevented: some players still working toward word goal");

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
    

    if (playerCount === 0) {
        return false;
    }
    

    return currentArcadeSession.participants.every(player => 
        player.wordsCompleted >= currentArcadeSession.wordGoal
    );
}

function updateModeratorStatus() {

    if (!isModeratorScreenActive()) {
        return;
    }
    
    const playerCount = currentArcadeSession.participants.length;
    const completedPlayers = currentArcadeSession.participants.filter(p => 
        p.wordsCompleted >= currentArcadeSession.wordGoal
    ).length;
    

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
    

    let statusText = '';
    
    if (playerCount <= 3) {

        statusText = `<strong>Player Progress:</strong> ${completedPlayers}/${playerCount} completed`;
        
        if (completedPlayers < playerCount) {
            statusText += ' <span style="color:#ff9966">(Waiting for all players to finish)</span>';
        } else {
            statusText += ' <span style="color:#66ff99">(All players finished!)</span>';
        }
    } else {

        statusText = `<strong>Player Progress:</strong> ${completedPlayers}/${playerCount} completed`;
    }
    
    statusElement.innerHTML = statusText;
}

function trackModeratorLeaderboardUpdates() {

    const leaderboard = document.getElementById('arcade-leaderboard');
    if (!leaderboard) return;
    

    const observer = new MutationObserver(() => {

        if (isModeratorScreenActive() && moderatorInactivity.isGameActive) {
            moderatorInactivity.lastLeaderboardUpdate = Date.now();
            

            if (moderatorInactivity.isCountingDown) {
                cancelModeratorCountdown();
            }
        }
    });
    

    observer.observe(leaderboard, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        characterData: true
    });
}

function startModeratorCountdown() {

    if (!isModeratorScreenActive() || !moderatorInactivity.isGameActive) {
        return;
    }
    

    const playerCount = currentArcadeSession.participants.length;
    
    if (playerCount <= 3) {

        const allReachedGoal = currentArcadeSession.participants.every(player => 
            player.wordsCompleted >= currentArcadeSession.wordGoal
        );
        

        if (!allReachedGoal) {
            console.log("Inactivity timer prevented: not all players have reached their word goals yet");

            moderatorInactivity.lastLeaderboardUpdate = Date.now();
            return;
        }
    }
    

    moderatorInactivity.isCountingDown = true;
    

    const overlay = document.querySelector('.moderator-inactivity-overlay');
    if (overlay) overlay.classList.add('visible');
    

    let secondsLeft = 5;
    const timerDisplay = overlay.querySelector('.moderator-countdown-timer');
    const progressBar = overlay.querySelector('.moderator-countdown-bar');
    

    timerDisplay.textContent = secondsLeft;
    progressBar.style.transform = 'scaleX(1)';
    

    moderatorInactivity.countdownTimer = setInterval(() => {

        if (!isModeratorScreenActive()) {
            cancelModeratorCountdown();
            return;
        }
        
        secondsLeft--;
        

        timerDisplay.textContent = secondsLeft;
        progressBar.style.transform = `scaleX(${secondsLeft / 5})`;
        

        if (secondsLeft <= 0) {
            clearInterval(moderatorInactivity.countdownTimer);
            handleModeratorCountdownComplete();
        }
    }, 1000);
}

function cancelModeratorCountdown() {

    const overlay = document.querySelector('.moderator-inactivity-overlay');
    if (overlay) overlay.classList.remove('visible');
    

    moderatorInactivity.isCountingDown = false;
    if (moderatorInactivity.countdownTimer) {
        clearInterval(moderatorInactivity.countdownTimer);
        moderatorInactivity.countdownTimer = null;
    }
    

    if (isModeratorScreenActive() && moderatorInactivity.isGameActive) {
        resetModeratorInactivityTimer();
    }
}

function handleModeratorCountdownComplete() {

   if (currentArcadeSession.celebrationTriggered) {
       return;
   }
   

   const completedPlayers = currentArcadeSession.participants.filter(
       p => p.wordsCompleted >= currentArcadeSession.wordGoal
   );
   
   const hasPodiumWinners = completedPlayers && 
                            completedPlayers.length >= 3;
   
   currentArcadeSession.celebrationTriggered = true;
   
   if (hasPodiumWinners) {

       const podiumPlayers = [];
       
       if (currentArcadeSession.podiumRanks) {

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
           

           podiumPlayers.sort((a, b) => a.rank - b.rank);
       } else {

           const sortedPlayers = [...currentArcadeSession.participants]
               .sort((a, b) => b.wordsCompleted - a.wordsCompleted)
               .slice(0, 3);
               

           sortedPlayers.forEach((player, index) => {
               podiumPlayers.push({
                   ...player,
                   rank: index + 1
               });
           });
       }
       

       startLeaderboardCelebration(podiumPlayers);
   } else {

       showScreen('welcome-screen');
   }
}

function cleanupModeratorInactivityMonitoring() {


    console.log("Cleaning up moderator activity monitoring (disabled)");
    
    if (moderatorInactivity) {
        moderatorInactivity.isGameActive = false;
        moderatorInactivity.isInitialized = false;
    }
}

function startLeaderboardCelebration(podiumPlayers) {

    const inactivityOverlay = document.querySelector('.moderator-inactivity-overlay');
    if (inactivityOverlay) {
        inactivityOverlay.classList.remove('visible');
    }
    
    addCelebrationStyles();


    let celebrationOverlay = document.querySelector('.celebration-overlay');
    if (!celebrationOverlay) {
        celebrationOverlay = document.createElement('div');
        celebrationOverlay.className = 'celebration-overlay';

        celebrationOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(celebrationOverlay);
    }
    

    setTimeout(() => celebrationOverlay.classList.add('visible'), 10);
    

    podiumPlayers.forEach((player, index) => {
        if (!player.rank || player.rank < 1 || player.rank > 3) {
            console.warn(`Fixing invalid rank for player ${player.username}: ${player.rank}`);
            player.rank = index + 1;
        }
    });
    

    podiumPlayers.sort((a, b) => a.rank - b.rank);
    


    podiumPlayers.forEach((player, positionIndex) => {
        if (!player || !player.username) return;
        

        const verticalPosition = positionIndex * 190 + 100;
        

        const winnerEntry = document.createElement('div');
        winnerEntry.className = 'winner-entry celebrating';
        

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
            z-index: 10003;
            color: white;
            font-size: 1.5rem;
            text-align: center;
            pointer-events: auto;
        `;
        

        const innerContainer = document.createElement('div');
        innerContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
        `;
        

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
        

        const scoresContainer = document.createElement('div');
        scoresContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: flex-end;
            min-width: 200px;
            gap: 20px;
        `;
        

        const wordsDisplay = document.createElement('div');
        wordsDisplay.style.cssText = `
            font-size: 2rem;
            font-weight: bold;
            color: #4FC3F7;
        `;
        wordsDisplay.textContent = player.wordsCompleted || 0;
        scoresContainer.appendChild(wordsDisplay);
        

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
            z-index: 10004;
        `;
        winnerLabel.textContent = rankLabel;
        winnerEntry.appendChild(winnerLabel);
        

        celebrationOverlay.appendChild(winnerEntry);
        

        addWinnerEmojis(winnerEntry, emojis, player.rank);
    });
    

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
    

    let homeButton = document.querySelector('.home-button-container');
    if (!homeButton) {
        homeButton = document.createElement('div');
        homeButton.className = 'home-button-container';
        homeButton.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10005;
            opacity: 0;
            transition: opacity 0.5s ease;
            pointer-events: auto;
        `;
        homeButton.innerHTML = `
            <button class="start-button" onclick="finishCelebrationAndGoHome()">
                Return to Home
            </button>
        `;
        celebrationOverlay.appendChild(homeButton);
        setTimeout(() => homeButton.style.opacity = "1", 2500);
    }
}

function addCelebrationStyles() {
    if (!document.getElementById('celebration-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'celebration-styles';
        styleElement.textContent = `
            .celebration-overlay {
                opacity: 0;
                transition: opacity 0.5s ease;
            }
            
            .celebration-overlay.visible {
                opacity: 1;
            }
            
            .winner-entry {
                opacity: 0;
                transform: translateX(-50%) scale(0.8);
                transition: opacity 0.5s ease, transform 0.5s ease;
            }
            
            .winner-entry.celebrating {
                opacity: 1;
                transform: translateX(-50%) scale(1);
            }
            
            .celebration-emoji {
                position: fixed;
                font-size: 2rem;
                opacity: 0;
                animation: fadeInOut 3s ease forwards;
                z-index: 10004;
            }
            
            @keyframes fadeInOut {
                0% { opacity: 0; transform: scale(0.5); }
                20% { opacity: 1; transform: scale(1.2); }
                80% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(1.5); }
            }
            
            .confetti {
                position: fixed;
                top: -20px;
                z-index: 10002;
                animation: confettiFall linear forwards;
            }
            
            @keyframes confettiFall {
                0% { transform: translateY(0) rotate(0deg); }
                100% { transform: translateY(100vh) rotate(720deg); }
            }
            
            .home-button-container {
                opacity: 0;
                transition: opacity 0.5s ease;
            }
            
            .home-button-container.visible {
                opacity: 1;
            }
        `;
        document.head.appendChild(styleElement);
    }
}

function safeUpdateWordsCompleted(newValue, username) {
  if (!username) return false;
  
  const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === username);
  if (playerIndex === -1) return false;
  
  const player = currentArcadeSession.participants[playerIndex];
  const currentValue = player.wordsCompleted || 0;
  

  if (newValue < currentValue) {
      console.warn(`Prevented progress reset for ${username}: ${currentValue} → ${newValue}`);
      return false;
  }
  
  player.wordsCompleted = newValue;
  return true;
}


function safeUpdatePlayerCoins(newValue, username) {
  if (!username) return false;
  
  const playerIndex = currentArcadeSession.participants.findIndex(p => p.username === username);
  if (playerIndex === -1) return false;
  
  const player = currentArcadeSession.participants[playerIndex];
  const currentValue = player.coins || 0;
  

  if (newValue < currentValue) {
      console.warn(`Prevented coin decrease for ${username}: ${currentValue} → ${newValue}`);
      return false;
  }
  
  player.coins = newValue;
  return true;
}

function addWinnerEmojis(element, emojis, rank) {
    setTimeout(() => {

        emojis.forEach((emoji, index) => {
            const emojiElement = document.createElement('div');
            emojiElement.className = 'celebration-emoji';
            emojiElement.textContent = emoji;
            

            let x, y, size;
            const baseSize = 2.5;
            

            if (rank === 1) {

                size = baseSize + 0.5;
                if (index % 2 === 0) {

                    x = 5 + (index * 3) + '%';
                    y = 5 + (index * 2) + '%';
                } else {

                    x = 95 - (index * 3) + '%';
                    y = 5 + (index * 2) + '%';
                }
            } else if (rank === 2) {

                size = baseSize;
                if (index % 2 === 0) {

                    x = 5 + '%';
                    y = 40 + (index * 5) + '%';
                } else {

                    x = 95 + '%';
                    y = 40 + (index * 5) + '%';
                }
            } else {

                size = baseSize - 0.5;
                if (index % 2 === 0) {

                    x = 15 + (index * 5) + '%';
                    y = 90 + '%';
                } else {

                    x = 85 - (index * 5) + '%';
                    y = 90 + '%';
                }
            }
            
            emojiElement.style.fontSize = `${size}rem`;
            emojiElement.style.left = x;
            emojiElement.style.top = y;
            emojiElement.style.zIndex = '10004';
            emojiElement.style.animationDelay = `${1.8 + index * 0.3}s`;
            
            document.body.appendChild(emojiElement);
        });
    }, 1800);
}

function startConfettiShower() {

    const colors = [
        '#FFD700', '#FF1493', '#00BFFF', '#7CFC00', '#FF4500', 
        '#9400D3', '#FF8C00', '#1E90FF', '#32CD32', '#FF69B4'
    ];
    

    createConfettiBatch();
    

    const confettiInterval = setInterval(createConfettiBatch, 800);
    

    window.celebrationConfettiInterval = confettiInterval;
    

    function createConfettiBatch() {
        for (let i = 0; i < 60; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            

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
            confetti.style.zIndex = '10002';
            
            document.body.appendChild(confetti);
            

            setTimeout(() => {
                confetti.remove();
            }, (duration + delay) * 1000);
        }
    }
}

function setupCelebrationHandler() {
  if (!window.arcadeChannel) return;
  

  window.arcadeChannel.on('broadcast', { event: 'premium_user_coins' }, ({ payload: data }) => {
      if (data && data.username && data.coins) {
          console.log(`Received premium user coins: ${data.username} has ${data.coins} coins`);
          

          updatePlayerProgress({
              username: data.username,
              coins: data.coins,
              wordsCompleted: data.wordsCompleted || 0,
              isPremium: true,
              isTrusted: true,
              source: 'premiumCoinsSync'
          });
      }
  });
  

  window.arcadeChannel.on('broadcast', { event: 'celebration' }, ({ payload }) => {

  });
}

function showPersonalVictoryCelebration(rank) {

    if (currentArcadeSession.winnerScreenShown) return;
    currentArcadeSession.winnerScreenShown = true;
    

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
    

    setTimeout(() => {
        overlay.style.opacity = '1';
        

        startPlayerConfetti();
    }, 100);
}

function startPlayerConfetti() {

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
            

            setTimeout(() => {
                confetti.remove();
            }, 5000);
        }
    }
    

    createPlayerConfettiBatch();
    

    const interval = setInterval(createPlayerConfettiBatch, 1000);
    

    window.playerConfettiInterval = interval;
    

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
            


            currentGame = null;
            

            currentArcadeSession = {
                eventId: null,
                otp: null,
                wordPool: [],
                participants: [],
                teacherId: null,
                wordGoal: 50,
                state: 'pre-start',
                completedPlayers: [],
                playerRank: null,
                winnerScreenShown: false,
                startTime: null,
                endTime: null,
                celebrationTriggered: false
            };
            

            if (window.arcadeChannel) {
                window.arcadeChannel.unsubscribe();
                window.arcadeChannel = null;
            }
            

            if (currentUser && currentUser.status === 'premium') {
                updatePlayerStatsAfterArcade();
            }
            

            document.querySelectorAll('.game-screen, .arcade-screen').forEach(el => {
                el.style.display = 'none';
            });
            

            showScreen('welcome-screen');
            
        }, 500);
    }
}

function showCustomCompletionScreen() {

  clearTimer();
  

  const coinsEarned = gameState.coins - customGameState.startCoins;
  const totalQuestions = currentGame.words.length;
  const correctAnswers = currentGame.correctAnswers || 0;
  const incorrectAnswers = currentGame.mistakeRegisteredWords ? 
                         currentGame.mistakeRegisteredWords.size : 
                         Math.max(0, totalQuestions - correctAnswers);
  const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  

  let averageTime = "N/A";
  console.log("Debug - responseTimes:", currentGame.responseTimes);
  
  if (currentGame.responseTimes && currentGame.responseTimes.length > 0) {
    const totalTime = currentGame.responseTimes.reduce((sum, time) => sum + time, 0);
    averageTime = (totalTime / currentGame.responseTimes.length).toFixed(1);
    console.log("Debug - Total time:", totalTime, "divided by", currentGame.responseTimes.length, "= averageTime:", averageTime);
  } else if (currentGame.levelStartTime) {

    const totalElapsedTime = (Date.now() - currentGame.levelStartTime) / 1000;
    averageTime = (totalElapsedTime / totalQuestions).toFixed(1);
    console.log("Debug - Using fallback timing method. Total time:", totalElapsedTime, "per word:", averageTime);
  }
  

  console.log("Debug - totalQuestions:", totalQuestions, "correctAnswers:", correctAnswers, "incorrectAnswers:", incorrectAnswers);
  

  let timeBonus = 0;
  if (currentGame.levelStartTime) {
      const totalLevelTime = currentGame.totalTime || (totalQuestions * 5);
      const timeElapsed = (Date.now() - currentGame.levelStartTime) / 1000;
      const timeRemaining = totalLevelTime - timeElapsed;
      const percentRemaining = timeRemaining / totalLevelTime;
      
      if (percentRemaining >= 0.65) {
          timeBonus = 7;
          CoinsManager.updateCoins(timeBonus).then(() => {
              showNotification(`Fast completion bonus: +${timeBonus} coins!`, 'success');
          });
      }
  }
  

  const noMistakes = incorrectAnswers === 0;
  console.log("Debug - noMistakes calculation:", noMistakes);
  

  const fastCompletionThreshold = 5.0;
  const fastCompletion = averageTime !== "N/A" && parseFloat(averageTime) < fastCompletionThreshold;
  console.log("Debug - fastCompletion:", fastCompletion, "averageTime:", averageTime, "threshold:", fastCompletionThreshold);
  
  const starsEarned = 1 + (noMistakes ? 1 : 0) + (fastCompletion ? 1 : 0);
  console.log("Debug - Stars earned:", starsEarned);
  

  if (starsEarned === 3) {
      const perfectBonus = 15;
      CoinsManager.updateCoins(perfectBonus).then(() => {
          showNotification(`Perfect practice bonus: +${perfectBonus} coins!`, 'success');
      });
  }
  

  const overlay = document.createElement("div");
  overlay.className = "level-completion-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(5px);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    transition: opacity 0.5s ease;
  `;
  

  const completionContent = document.createElement('div');
  completionContent.className = 'level-completion-modal';
  completionContent.style.cssText = `
    background: var(--glass);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 3rem;
    width: 500px;
    max-width: 90%;
    text-align: center;
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transform: scale(0.9);
    opacity: 0;
    transition: transform 0.5s ease, opacity 0.5s ease;
    margin: 0;
  `;
  
  completionContent.innerHTML = `
    <h1 style="color: var(--gold); margin-bottom: 0.5rem; font-size: 2.5rem;">
      Practice Complete!
    </h1>
    <h2 style="margin-bottom: 1.5rem; opacity: 0.9; font-size: 1.5rem; color: ${scorePercentage >= 70 ? 'var(--success)' : 'var(--error)'}">
      ${scorePercentage >= 70 ? 'Great job!' : 'Try again to improve your score'}
    </h2>
    
    <!-- Star Rating -->
    <div class="star-rating-container" style="margin-bottom: 2.5rem; position: relative;">
      <div class="star-slots" style="display: flex; justify-content: center; gap: 1.5rem;">
        <!-- Three star slots, each with empty and filled versions -->
        <div class="star-slot" style="position: relative; width: 65px; height: 65px;">
          <div class="star-empty" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: #333; font-size: 3.5rem; line-height: 1; text-shadow: 0 0 5px rgba(0,0,0,0.3);">★</div>
          <div class="star-filled star-1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #FFD700, #FFA500); -webkit-background-clip: text; background-clip: text; color: transparent; font-size: 3.5rem; line-height: 1; opacity: 0; transform: scale(0); transition: opacity 0.5s ease, transform 0.5s ease; text-shadow: 0 0 10px rgba(255,215,0,0.7); filter: drop-shadow(0 0 5px gold);">★</div>
        </div>
        <div class="star-slot" style="position: relative; width: 65px; height: 65px;">
          <div class="star-empty" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: #333; font-size: 3.5rem; line-height: 1; text-shadow: 0 0 5px rgba(0,0,0,0.3);">★</div>
          <div class="star-filled star-2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #FFD700, #FFA500); -webkit-background-clip: text; background-clip: text; color: transparent; font-size: 3.5rem; line-height: 1; opacity: 0; transform: scale(0); transition: opacity 0.5s ease, transform 0.5s ease; text-shadow: 0 0 10px rgba(255,215,0,0.7); filter: drop-shadow(0 0 5px gold);">★</div>
        </div>
        <div class="star-slot" style="position: relative; width: 65px; height: 65px;">
          <div class="star-empty" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: #333; font-size: 3.5rem; line-height: 1; text-shadow: 0 0 5px rgba(0,0,0,0.3);">★</div>
          <div class="star-filled star-3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #FFD700, #FFA500); -webkit-background-clip: text; background-clip: text; color: transparent; font-size: 3.5rem; line-height: 1; opacity: 0; transform: scale(0); transition: opacity 0.5s ease, transform 0.5s ease; text-shadow: 0 0 10px rgba(255,215,0,0.7); filter: drop-shadow(0 0 5px gold);">★</div>
        </div>
      </div>
      <div class="star-criteria" style="margin-top: 1rem; font-size: 0.8rem; color: rgba(255,255,255,0.7); display: flex; justify-content: space-between; width: 100%; max-width: 330px; margin-left: auto; margin-right: auto;">
        <div>Complete</div>
        <div>No Mistakes</div>
        <div>Quick Time</div>
      </div>
      <div class="star-glow" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 350px; height: 100px; background: radial-gradient(ellipse at center, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0) 70%); z-index: -1; pointer-events: none;"></div>
    </div>
    
    <!-- Average response time section -->
    <div class="average-time-container" style="margin: 1.5rem 0; text-align: center;">
      <div style="font-size: 1.2rem; margin-bottom: 0.5rem; opacity: 0.8;">Average Response Time</div>
      <div style="font-size: 2.5rem; color: var(--accent); font-weight: bold;">
        ${averageTime}s
      </div>
    </div>
    
    <!-- List name display with icon -->
    <div class="custom-list-name" style="margin: 1.5rem 0; text-align: center; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 10px;">
      <div style="font-size: 1.2rem; margin-bottom: 0.5rem; opacity: 0.8; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <i class="fas fa-list" style="color: var(--accent);"></i>
        <span>List Name</span>
      </div>
      <div style="font-size: 1.5rem; color: var(--gold); font-weight: bold;">
        ${customGameState.currentList?.name || "Custom List"}
      </div>
    </div>
    
    <div class="button-container" style="display: flex; justify-content: center; gap: 1rem; margin-top: 2rem;">
      ${scorePercentage >= 70 ? 
        `<button class="continue-button start-button" style="background: var(--accent); min-width: 150px; padding: 0.8rem 1.5rem;">Continue</button>` : 
        `<button class="retry-button start-button" style="background: var(--accent); min-width: 150px; padding: 0.8rem 1.5rem;">Try Again</button>`
      }
      <button class="exit-button start-button" style="background: rgba(255,255,255,0.1); border: 1px solid var(--accent); min-width: 150px; padding: 0.8rem 1.5rem;">Return Home</button>
    </div>
  `;
  

  document.body.appendChild(overlay);
  overlay.appendChild(completionContent);
  

  const continueOrRetryButton = completionContent.querySelector('.continue-button, .retry-button');
  if (continueOrRetryButton) {
    continueOrRetryButton.addEventListener('click', () => {

      overlay.style.opacity = '0';
      completionContent.style.transform = 'scale(0.9)';
      completionContent.style.opacity = '0';
      

      setTimeout(() => {
        overlay.remove();
        

        if (scorePercentage >= 70) {
          const nextLevel = customGameState.currentLevel + 1;
          const nextLevelData = customGameState.getWordsForLevel(nextLevel);
          
          if (nextLevelData && nextLevelData.words && nextLevelData.words.length > 0) {
            startCustomLevel(nextLevel);
          } else {

            exitCustomPractice();
          }
        } else {

          startCustomLevel(customGameState.currentLevel);
        }
      }, 500);
    });
  }
  
  const exitButton = completionContent.querySelector('.exit-button');
  if (exitButton) {
    exitButton.addEventListener('click', () => {

      overlay.style.opacity = '0';
      completionContent.style.transform = 'scale(0.9)';
      completionContent.style.opacity = '0';
      

      setTimeout(() => {
        overlay.remove();
        exitCustomPractice();
      }, 500);
    });
  }
  

  if (!document.getElementById('star-animations')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'star-animations';
    styleElement.textContent = `
      @keyframes starPop {
        0% { transform: scale(0); opacity: 0; }
        50% { transform: scale(1.2); opacity: 1; }
        75% { transform: scale(0.9); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes starShine {
        0% { filter: drop-shadow(0 0 5px gold); }
        50% { filter: drop-shadow(0 0 15px gold); }
        100% { filter: drop-shadow(0 0 5px gold); }
      }
    `;
    document.head.appendChild(styleElement);
  }
  

  setTimeout(() => {

    overlay.style.opacity = '1';
    completionContent.style.transform = 'scale(1)';
    completionContent.style.opacity = '1';
    

    setTimeout(() => {

      const star1 = completionContent.querySelector('.star-1');
      if (star1) {
        star1.style.opacity = '1';
        star1.style.transform = 'scale(1)';
        console.log("First star shown (completion)");
      }
      

      if (noMistakes) {
        setTimeout(() => {
          const star2 = completionContent.querySelector('.star-2');
          if (star2) {
            star2.style.opacity = '1';
            star2.style.transform = 'scale(1)';
            console.log("Second star shown (no mistakes)");
          }
        }, 300);
      } else {
        console.log("No second star shown - mistakes were made:", incorrectAnswers);
      }
      

      if (fastCompletion) {
        setTimeout(() => {
          const star3 = completionContent.querySelector('.star-3');
          if (star3) {
            star3.style.opacity = '1';
            star3.style.transform = 'scale(1)';
            console.log("Third star shown (fast completion)");
          }
        }, 600);
      } else {
        console.log("No third star shown - completion not fast enough:", averageTime, "seconds vs threshold", fastCompletionThreshold);
      }
    }, 700);
    

    if (coinsEarned > 0) {
      const coinValue = completionContent.querySelector('.coin-value');
      if (coinValue) {

        let startValue = gameState.coins - coinsEarned;
        const endValue = gameState.coins;
        const duration = 1500;
        const stepTime = 50;
        const totalSteps = duration / stepTime;
        const stepValue = (endValue - startValue) / totalSteps;
        

        const coinIcon = completionContent.querySelector('.coin-icon');
        if (coinIcon) {
          coinIcon.style.filter = 'drop-shadow(0 0 5px var(--gold))';
          coinIcon.style.transition = 'filter 0.5s ease';
        }
        
        const counterInterval = setInterval(() => {
          startValue += stepValue;
          if (startValue >= endValue) {
            startValue = endValue;
            clearInterval(counterInterval);
            

            setTimeout(() => {
              if (coinIcon) {
                coinIcon.style.filter = 'none';
              }
            }, 500);
          }
          coinValue.textContent = Math.round(startValue);
        }, stepTime);
      }
    }
  }, 100);
  

  setTimeout(() => {
    try {

      const rect = overlay.getBoundingClientRect();
      if (typeof createParticles === 'function') {
        createParticles(rect.width / 2, rect.height / 3);
      }
    } catch (e) {
      console.log("Couldn't create particles effect", e);
    }
  }, 1000);
}

function addStarRatingStyles() {
  if (!document.getElementById('star-rating-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'star-rating-styles';
    styleElement.textContent = `
      @keyframes starShine {
        0% { filter: drop-shadow(0 0 5px gold); }
        50% { filter: drop-shadow(0 0 12px gold); }
        100% { filter: drop-shadow(0 0 5px gold); }
      }
      
      @keyframes starPop {
        0% { transform: scale(0); opacity: 0; }
        50% { transform: scale(1.3); opacity: 1; }
        75% { transform: scale(0.9); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      
      .star-filled {
        animation: starShine 2s infinite ease-in-out;
      }
      
      .star-rating-container {
        transform: perspective(800px) rotateX(10deg);
      }
      
      .star-slot {
        transform-style: preserve-3d;
        transition: transform 0.3s ease;
      }
      
      .star-slot:hover {
        transform: translateY(-5px);
      }
    `;
    document.head.appendChild(styleElement);
  }
}

function hasExistingProgress() {

    if (gameState.completedLevels.size > 0 || gameState.perfectLevels.size > 0) {
        return true;
    }
    

    for (let stage = 1; stage <= 5; stage++) {
        const unlockedSets = gameState.unlockedSets[stage];

        if (stage === 1 && unlockedSets && unlockedSets.size === 9) {
            continue;
        }

        if (unlockedSets && unlockedSets.size > 1) {
            return true;
        }
    }
    

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
    
    const sets = Array.from(gameState.unlockedSets[stage]).sort((a, b) => b - a);
    
    for (const set of sets) {
        const setKey = `${stage}_${set}`;
        if (!gameState.unlockedLevels[setKey]) continue;
        
        const levels = Array.from(gameState.unlockedLevels[setKey]).sort((a, b) => b - a);
        
        for (const level of levels) {
            const levelKey = `${stage}_${set}_${level}`;

            if (!gameState.perfectLevels.has(levelKey) && !gameState.completedLevels.has(levelKey)) {
                return { stage, set, level };
            }
        }
    }
    


    const stageConfig = gameStructure.stages[stage - 1];
    const currentSetIndex = sets[0];
    
    if (currentSetIndex < stageConfig.numSets) {

        return { stage, set: currentSetIndex + 1, level: 1 };
    } else if (stage < 5) {

        return { stage: stage + 1, set: 1, level: 1 };
    }
    

    return { stage, set: sets[0], level: 1 };
}

function showGradeLevelSelector() {

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

      else {
        const { data, error } = await supabaseClient
          .from("custom_lists")
          .insert(listData)
          .select()
          .single();

        if (error) throw error;


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

      this.lists = this.lists.filter(list => list.id !== id);
      localStorage.setItem("simploxCustomLists", JSON.stringify(this.lists));
      return true;
    }

    try {

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


    const maxLevels = this.words.length >= 12 ? 9 : 
                      this.words.length >= 9 ? 6 : 3;
    
    if (level > maxLevels) return null;


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
    

    let words = inputText.includes(',') ? 
      inputText.split(',').map(word => word.trim()).filter(word => word.length > 0) : 
      inputText.split(/\s+/).filter(word => word.length > 0);
    

    const maxWords = currentUser ? limits.maxWords : 10;
    if (words.length > maxWords) {
      showNotification(`Maximum ${maxWords} words allowed.`, "error");
      words = words.slice(0, maxWords);
    }
    

    wordList.innerHTML = "";
    resultsDiv.style.display = "block";
    

    words.forEach(word => {
      const wordItem = document.createElement("div");
      wordItem.className = "word-translation-item";
      wordItem.draggable = true;
      
      wordItem.innerHTML = `
        <div class="drag-handle">
            <i class="fas fa-grip-vertical"></i>
        </div>
        <span class="source-word" contenteditable="true">${word}</span>
        <input type="text" class="target-word" value="${findTranslation(word)}" placeholder="Hebrew translation">
        <button class="delete-word-btn" onclick="deleteWord(this)">
            <i class="fas fa-times"></i>
        </button>
      `;
      
      wordList.appendChild(wordItem);
      makeItemDraggable(wordItem);
    });
    

    const addWordButton = document.getElementById("add-word-btn");
    if (!addWordButton) {
        const addButton = document.createElement("button");
        addButton.id = "add-word-btn";
        addButton.className = "main-button add-word-button";
        addButton.innerHTML = '<i class="fas fa-plus"></i> Add Word';
        addButton.onclick = function() { addNewWord(); };
        
        const container = document.querySelector(".translation-input-container") || 
                       wordList.parentNode;
        if (container) {
            container.appendChild(addButton);
        }
    }
    

    setupDraggableWordList();
}

/**
 * Find a translation for a given word
 * @param {string} word - The word to translate
 * @returns {string} - The translation or empty string
 */
function findTranslation(word) {

  for (const setKey in vocabularySets) {
    const index = vocabularySets[setKey].words.indexOf(word.toLowerCase());
    if (index !== -1) {
      return vocabularySets[setKey].translations[index];
    }
  }
  return "";
}

function createWordItem(word, translation) {
    const wordItem = document.createElement("div");
    wordItem.className = "word-translation-item";
    wordItem.draggable = true;
    wordItem.setAttribute("data-word", word);
    
    wordItem.innerHTML = `
      <div class="word">${word}</div>
      <div class="translation">${translation || 'No translation'}</div>
      <button class="delete-word-btn">×</button>
    `;
    
    const deleteBtn = wordItem.querySelector(".delete-word-btn");
    deleteBtn.addEventListener("click", function() {
      deleteWord(this);
    });
    
    return wordItem;
  }

  function setupDragAndDrop() {
    const wordList = document.getElementById("word-translation-list");
    const items = wordList.querySelectorAll(".word-translation-item");
    
    items.forEach(item => {

      item.addEventListener("dragstart", function(e) {
        this.classList.add("dragging");
        e.dataTransfer.setData("text/plain", this.getAttribute("data-word"));
      });
      

      item.addEventListener("dragend", function() {
        this.classList.remove("dragging");
      });
    });
    

    wordList.addEventListener("dragover", function(e) {
      e.preventDefault();
      const afterElement = getDragAfterElement(wordList, e.clientY);
      const draggable = document.querySelector(".dragging");
      
      if (draggable) {
        if (afterElement == null) {
          wordList.appendChild(draggable);
        } else {
          wordList.insertBefore(draggable, afterElement);
        }
      }
    });
    

    wordList.addEventListener("drop", function(e) {
      e.preventDefault();
    });
  }

  function addNewWord() {
    const wordList = document.getElementById("word-translation-list");
    if (!wordList) return;
    
    const wordItem = document.createElement("div");
    wordItem.className = "word-translation-item";
    wordItem.innerHTML = `
      <div class="drag-handle">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <span class="source-word" contenteditable="true"></span>
      <input type="text" class="target-word" placeholder="Hebrew translation">
      <button class="delete-word-btn">❌</button>
    `;
    

    wordList.appendChild(wordItem);
    

    makeItemDraggable(wordItem);
    

    wordItem.querySelector(".source-word").focus();
  }
  

  function deleteWord(button) {
    if (!button) return;
    
    const wordItem = button.closest(".word-translation-item");
    if (wordItem && wordItem.parentNode) {
      wordItem.parentNode.removeChild(wordItem);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    addDragAndDropStyles();
    

    document.addEventListener('screenChange', function(e) {
      if (e.detail && e.detail.screen === 'custom-practice-screen') {
        setTimeout(setupDraggableWordList, 100);
      }
    });
  });

function initializeDragAndDrop(element) {
    if (!element) return;
    

    const clone = element.cloneNode(true);
    if (element.parentNode) {
      element.parentNode.replaceChild(clone, element);
    }
    

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
    

    const deleteBtn = element.querySelector(".delete-word-btn");
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteWord(deleteBtn);
    }
    
    return element;
  }

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
    

    wordList.querySelectorAll(".word-translation-item").forEach(item => 
      initializeDragAndDrop(item)
    );
  }

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


function addDragAndDropStyles() {
    const styleId = "drag-drop-styles";
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.textContent = `
        .word-translation-item {
          cursor: move;
          user-select: none;
          transition: background-color 0.2s ease;
        }
        
        .word-translation-item.dragging {
          opacity: 0.5;
          background-color: rgba(100, 100, 255, 0.2);
        }
      `;
      document.head.appendChild(styleElement);
    }
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

async function saveCurrentList() {
    try {
      const nameInput = document.getElementById("custom-list-name");
      const wordList = document.getElementById("word-translation-list");
      

      if (!wordList) {
        console.error("Word list container not found");
        showNotification("Error: Word list container not found", "error");
        return;
      }
      

      const name = nameInput && nameInput.value ? nameInput.value.trim() : 
                  (CustomListsManager.currentList ? 
                    CustomListsManager.currentList.name : 
                    `List ${CustomListsManager.lists.length + 1}`);
      

      const words = [];
      const translations = [];
      
      wordList.querySelectorAll(".word-translation-item").forEach(item => {

        const sourceWordElement = item.querySelector(".source-word");
        const targetWordElement = item.querySelector(".target-word");
        

        if (sourceWordElement && targetWordElement) {
          const word = sourceWordElement.textContent.trim();
          const translation = targetWordElement.value.trim();
          
          if (word && translation) {
            words.push(word);
            translations.push(translation);
          }
        }
      });
      

      if (words.length === 0) {
        showNotification("Please add at least one word with translation", "error");
        return;
      }
      

      const limits = CustomListsManager.getListLimits();
      if (words.length > limits.maxWords) {
        showNotification(`You can only create lists with up to ${limits.maxWords} words`, "error");
        return;
      }
      

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
      

      const savedList = await CustomListsManager.save(listToSave);
      
      if (savedList) {

        if (nameInput) nameInput.value = "";
        wordList.innerHTML = "";
        const translationResults = document.getElementById("translation-results");
        if (translationResults) translationResults.style.display = "none";
        CustomListsManager.currentList = null;
        

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
    } catch (error) {
      console.error("Error saving custom list:", error);
      showNotification("An unexpected error occurred while saving", "error");
    }
  }

  function editCustomList(listId) {
    const list = CustomListsManager.lists.find(list => list.id === listId);
    if (!list) return showNotification("List not found", "error");


    showScreen("custom-practice-screen");
    

    const nameInput = document.getElementById("custom-list-name");
    if (nameInput) {
        nameInput.value = list.name || "";
    }
    

    const translationResults = document.getElementById("translation-results");
    const wordList = document.getElementById("word-translation-list");
    
    if (wordList) {

        wordList.innerHTML = "";
        

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
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                wordList.appendChild(wordItem);
                makeItemDraggable(wordItem);
            });
        }
        

        if (wordList.children.length === 0) {
            const emptyWordItem = document.createElement("div");
            emptyWordItem.className = "word-translation-item";
            emptyWordItem.draggable = true;
            
            emptyWordItem.innerHTML = `
                <div class="drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <span class="source-word" contenteditable="true"></span>
                <input type="text" class="target-word" value="" placeholder="Hebrew translation">
                <button class="delete-word-btn" onclick="deleteWord(this)">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            wordList.appendChild(emptyWordItem);
            makeItemDraggable(emptyWordItem);
        }
        

        const addWordButton = document.getElementById("add-word-btn");
        if (!addWordButton) {
            const addButton = document.createElement("button");
            addButton.id = "add-word-btn";
            addButton.className = "main-button add-word-button";
            addButton.innerHTML = '<i class="fas fa-plus"></i> Add Word';
            addButton.onclick = function() { addNewWord(); };
            
            const container = document.querySelector(".translation-input-container") || 
                           wordList.parentNode;
            if (container) {
                container.appendChild(addButton);
            }
        }
        

        if (translationResults) {
            translationResults.style.display = "block";
        }
    }
    

    CustomListsManager.currentList = list;
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
        <button class="delete-word-btn" onclick="deleteWord(this)">
            <i class="fas fa-times"></i>
        </button>
    `;
    

    wordList.appendChild(wordItem);
    

    makeItemDraggable(wordItem);
    

    wordItem.querySelector(".source-word").focus();
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





function determineIfUserIsTeacher() {
    if (!currentUser) return false;
    

    for (const key in currentUser) {
        if (typeof currentUser[key] !== 'function') {
            console.log(`Current user property ${key}:`, currentUser[key]);
        }
    }
    


    return true;
}

function toggleListEditMode(listId) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${listId}"]`);
  if (!listItem) return;
  
  const list = CustomListsManager.lists.find(l => l.id === listId);
  if (!list) return;
  
  const editButton = listItem.querySelector(".edit-button");
  
  if (listItem.classList.contains("editing")) {

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
    

    list.name = newName;
    list.words = newWords;
    list.translations = newTranslations;
    
    CustomListsManager.save(list).then(() => {
      showNotification("List saved successfully", "success");
      

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
      

      listItem.classList.remove("editing");
      if (editButton) editButton.textContent = "Edit";
      

      listItem.classList.add("collapsed");
    }).catch(error => {
      console.error("Error saving list:", error);
      showNotification("Failed to save list", "error");
    });
  } else {

    listItem.classList.remove("collapsed");
    listItem.classList.add("editing");
    if (editButton) editButton.textContent = "Save";
    

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


function handleCustomLevelCompletion() {

  clearTimer();
  


const isPerfect = currentGame.mistakeRegisteredWords ? 
                  currentGame.mistakeRegisteredWords.size === 0 : 
                  (currentGame.streakBonus && currentGame.correctAnswers === currentGame.words.length);  
  if (isPerfect) {

    const coinsToAward = currentGame.firstAttempt ? 5 : 3;
    
    CoinsManager.updateCoins(coinsToAward).then(() => {
      pulseCoins(coinsToAward);
      

      customGameState.wordsCompleted += currentGame.words.length;
      customGameState.completedLevels.add(customGameState.currentLevel);
      

      const rect = document.getElementById("question-screen").getBoundingClientRect();
      createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
      

      const nextLevel = customGameState.currentLevel + 1;
      const nextLevelData = customGameState.getWordsForLevel(nextLevel);
      
      if (!nextLevelData || nextLevelData.words.length === 0 || currentGame.isFinalLevel) {
        setTimeout(() => showCustomCompletionScreen(), 1500);
      } else {
        setTimeout(() => startCustomLevel(nextLevel), 1500);
      }
    });
  } else {

    setTimeout(() => startCustomLevel(customGameState.currentLevel), 1500);
  }
  

  saveProgress();
}

function exitCustomPractice() {
  customGameState.reset();
  
  const overlay = document.querySelector(".completion-overlay");
  if (overlay) overlay.remove();
  
  showScreen("custom-practice-screen");
}

function handleCustomPracticeAnswer(correct, skipAnimation = false) {

    if (currentGame.questionStartTime) {
      const answerTime = (Date.now() - currentGame.questionStartTime) / 1000;
      if (!currentGame.answerTimes) {
        currentGame.answerTimes = [];
      }
      currentGame.answerTimes.push(answerTime);
    }
    

    currentGame.questionStartTime = 0;
    

    if (!currentGame.coinAwardedWords) {
      currentGame.coinAwardedWords = new Set();
    }
    

    const currentWordKey = currentGame.currentIndex.toString();
    
    if (correct) {

      currentGame.currentIndex++;
      
      if (!skipAnimation && !currentGame.coinAwardedWords.has(currentWordKey)) {

        currentGame.coinAwardedWords.add(currentWordKey);
        const coinReward = 10;
        

        if (typeof CoinsManager !== 'undefined' && CoinsManager.updateCoins) {
          CoinsManager.updateCoins(coinReward).then(() => {
            updatePerkButtons();
          }).catch(error => {
            console.error("Error updating coins:", error);
          });
        } else {

          const oldCoins = gameState.coins || 0;
          gameState.coins = oldCoins + coinReward;
          updateAllCoinDisplays();
          updatePerkButtons();
        }

        if (currentGame.correctStreak >= 3) {
          let streakBonus = 1;
          if (currentGame.correctStreak >= 6) {
            streakBonus = 2;
          }
          if (currentGame.correctStreak > 6) {
            streakBonus = 3;
          }
          CoinsManager.updateCoins(streakBonus).then(() => {
            showNotification(`Streak bonus: +${streakBonus} coins!`, 'success');
          });
        }
        

        currentGame.correctAnswers++;
        

        if (currentUser && currentUser.status === "premium") {
          const wordIndex = currentGame.currentIndex - 1;
          const word = currentGame.isHebrewToEnglish
            ? currentGame.words[wordIndex]
            : currentGame.translations[wordIndex];
          

          if (typeof trackWordEncounterWithoutCoins === 'function') {
            trackWordEncounterWithoutCoins(word, "custom");
          } else {
            trackWordEncounter(word, "custom");
          }
        }
      }
    } else {

      currentGame.firstAttempt = false;
      currentGame.streakBonus = false;
      

      if (!currentGame.mistakeRegisteredWords) {
        currentGame.mistakeRegisteredWords = new Set();
      }
      
      if (!currentGame.mistakeRegisteredWords.has(currentWordKey)) {
        currentGame.mistakeRegisteredWords.add(currentWordKey);
        currentGame.wrongStreak++;
        

        if (typeof CoinsManager !== 'undefined' && CoinsManager.updateCoins) {
          CoinsManager.updateCoins(-2).then(() => {
            updatePerkButtons();
          }).catch(error => {
            console.error("Error updating coins:", error);
          });
        } else {

          gameState.coins = Math.max(0, gameState.coins - 3);
          updateAllCoinDisplays();
          updatePerkButtons();
        }
      }
      

      if (currentGame.currentIndex > 0) {
        currentGame.progressLost++;
        currentGame.currentIndex = Math.max(0, currentGame.currentIndex - 1);
      }
      

      if (currentGame.wrongStreak >= 3) {
        showGameOverOverlay();
        const restartButton = document.querySelector(".restart-button");
        if (restartButton) {
          restartButton.onclick = () => {
            const failureOverlay = document.querySelector(".failure-overlay");
            if (failureOverlay) {
              failureOverlay.style.display = "none";
            }
            startCustomLevel(customGameState.currentLevel);
          };
        }
        return;
      }
    }
    
    updateProgressCircle();
    

    const currentCorrectAnswer = currentGame.isHebrewToEnglish
      ? currentGame.words[Math.max(0, currentGame.currentIndex - 1)]
      : currentGame.translations[Math.max(0, currentGame.currentIndex - 1)];
    

    const allButtons = document.querySelectorAll(".buttons button");
    allButtons.forEach((button) => {
      if (button.textContent === currentCorrectAnswer) {
        button.classList.add("correct");
      } else if (!correct && event && event.target && button === event.target) {
        button.classList.add("wrong");
      }
    });
    

    saveProgress();
    

    setTimeout(() => {

      allButtons.forEach(btn => {
        btn.classList.remove("correct", "wrong");
      });
      

      if (currentGame.currentIndex < currentGame.words.length) {
        loadNextQuestion();
        updatePerkButtons();
      } else {
        handleCustomLevelCompletion();
      }
    }, 500);
  }

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
          ${(currentUser && (
            currentUser.role === "teacher" || 
            currentUser.user_metadata?.role === "teacher" ||
            currentUser.role === "admin" ||
            currentUser.user_metadata?.role === "admin" ||
            currentUser.is_teacher === true || 
            currentUser.user_metadata?.is_teacher === true ||
            currentUser.isTeacher === true ||
            currentUser.user_metadata?.isTeacher === true
        )) ? `
            <button class="main-button share-button" onclick="showShareModal(${list.id})">
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


/**
 * Show the custom lists manager screen
 */
 function showCustomListsManager() {

  showScreen("custom-practice-screen");
  

  Promise.resolve(CustomListsManager.initialize()).then(() => {
    updateListsDisplay();
  }).catch(error => {
    console.error("Error initializing custom lists:", error);
    showNotification("Failed to load custom lists", "error");
  });
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

  const list = CustomListsManager.lists.find(list => list.id === id);
  if (!list) {
    showNotification("List not found", "error");
    return;
  }
  

  const validation = CustomListsManager.validateListForPractice(list);
  if (!validation.valid) {
    showNotification(validation.message, "error");
    return;
  }
  

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
  

  if (customGameState.initializeFromList(list)) {

    startCustomLevel(1);
  } else {
    showNotification("Failed to initialize practice", "error");
  }
}

function startCustomLevel(level, practiceState = null) {
    console.log(`Starting custom level ${level} ${practiceState ? 'with existing state' : 'fresh'}`);
    

    const powerupsContainer = document.querySelector(".powerups-container");
    if (powerupsContainer) {
      powerupsContainer.style.display = "none";
    }
    

    const perksContainer = document.querySelector(".perks-container");
    if (perksContainer) {
      perksContainer.style.display = "flex";
      document.querySelectorAll('.perk-button').forEach(btn => {
        btn.style.display = 'flex';
      });
    }
    

    let levelData;
    if (practiceState) {

      levelData = practiceState;
    } else {

      levelData = customGameState.getWordsForLevel(level);
      if (!levelData || !levelData.words || !levelData.words.length) {
        console.warn("No words found for custom level:", level);
        showNotification("No practice words found!", "error");
        showScreen("custom-practice-screen");
        return;
      }
    }
    

    customGameState.currentLevel = level;
    

    if (!levelData.words || !levelData.translations) {
      console.error("Invalid level data structure:", levelData);
      showNotification("Invalid practice data", "error");
      showScreen("custom-practice-screen");
      return;
    }
    

    currentGame = {
      words: levelData.words,
      translations: levelData.translations,
      currentIndex: practiceState ? practiceState.currentIndex || 0 : 0,
      correctAnswers: practiceState ? practiceState.correctAnswers || 0 : 0,
      firstAttempt: true,
      isHebrewToEnglish: levelData.isTest ? Math.random() < 0.5 : false,
      mixed: levelData.isTest || false,
      speedChallenge: false,
      isCustomPractice: true,
      practiceState: practiceState,
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
      isFinalLevel: levelData.isFinalLevel || false,
      answerTimes: []
    };
    
    console.log(`Custom level initialized with ${currentGame.words.length} words`);
    

    const startCustomGame = () => {
      showScreen("question-screen");
      

      const timerValue = document.querySelector('.timer-value');
      if (timerValue) {
        timerValue.classList.remove('warning');
      }
      


      const secondsPerWord = 3;
      const wordCount = currentGame.words.length;
      const totalSeconds = Math.max(10, secondsPerWord * wordCount);
      
      console.log(`Setting custom level timer: ${totalSeconds} seconds (${secondsPerWord} sec per word, ${wordCount} words)`);
      

      currentGame.initialTimeRemaining = totalSeconds;
      currentGame.totalTime = totalSeconds;
      

      updateProgressCircle();
      loadNextQuestion();
      


      startTimer(totalSeconds);
      

      const questionScreen = document.getElementById("question-screen");
      if (questionScreen) {
        questionScreen.style.background = "";
        

        questionScreen.querySelectorAll('.boss-orb, .boss-health-bar').forEach(el => {
          el.remove();
        });
      }
    };
    

    if (practiceState) {

      startCustomGame();
    } else {

      showLevelIntro(level, startCustomGame);
    }
}

/**
 * Load custom lists and update the UI
 * @returns {Promise} - Promise that resolves when lists are loaded
 */
async function loadCustomLists() {
  try {
    console.log("Loading custom lists...");
    

    await CustomListsManager.initialize();
    

    const customPracticeScreen = document.getElementById("custom-practice-screen");
    if (customPracticeScreen && 
        (customPracticeScreen.style.display === "block" || 
         document.querySelector(".screen.active")?.id === "custom-practice-screen")) {

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

    let list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
    

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
    

    const displayName = currentUser.user_metadata?.name || 
                       currentUser.user_metadata?.username || 
                       currentUser.email || 
                       "User";
    const sharedListName = `${list.name} (Shared by ${displayName})`;
    

    const words = Array.isArray(list.words) ? list.words : [];
    const translations = Array.isArray(list.translations) ? list.translations : [];
    

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
 * Exit the custom practice mode and return to the list screen
 * Called when the user clicks "Continue" on the completion screen
 */
 function exitCustomPractice() {
  console.log("Exiting custom practice mode");
  

  const overlay = document.querySelector(".completion-overlay");
  if (overlay) {
    overlay.remove();
  }
  

  if (customGameState) {
    customGameState.reset();
  }
  

  currentGame = null;
  

  showScreen("custom-practice-screen");
  

  if (typeof refreshCustomLists === 'function') {
    refreshCustomLists();
  }
}

function generateAnswerOptions(correctAnswer) {
  const buttonsContainer = document.querySelector(".buttons");
  if (!buttonsContainer) return;
  
  buttonsContainer.innerHTML = "";
  

  let options = [correctAnswer];
  const isHebrewAnswer = isHebrewWord(correctAnswer);
  

  const additionalOptions = getRandomAnswerOptions(correctAnswer, isHebrewAnswer, 3);
  options = options.concat(additionalOptions);
  

  options = shuffleArray(options);
  

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
    

    const { data: statsData, error: statsError } = await supabaseClient
      .from("player_stats")
      .select("user_id")
      .eq("user_id", userId)
      .single();
    

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
    

    const { data: progressData, error: progressError } = await supabaseClient
      .from("game_progress")
      .select("user_id")
      .eq("user_id", userId)
      .single();
    

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



function updatePlayerRankDisplay() {
  if (!currentArcadeSession || !currentArcadeSession.playerName) return;
  

  let foundSelf = false;
  let playerIndex = -1;
  
  for (let i = 0; i < currentArcadeSession.participants.length; i++) {
    if (currentArcadeSession.participants[i].username === currentArcadeSession.playerName) {
      foundSelf = true;
      playerIndex = i;
      break;
    }
  }
  

  if (!foundSelf && currentGame) {
    currentArcadeSession.participants.push({
      username: currentArcadeSession.playerName,
      wordsCompleted: currentGame.wordsCompleted || 0,
      coins: currentGame.coins || 0
    });
  } else if (foundSelf && currentGame) {

    currentArcadeSession.participants[playerIndex].wordsCompleted = currentGame.wordsCompleted || 0;
    currentArcadeSession.participants[playerIndex].coins = currentGame.coins || 0;
  }
  

  const sortedParticipants = [...currentArcadeSession.participants]
    .sort((a, b) => {
      if (b.wordsCompleted !== a.wordsCompleted) {
        return b.wordsCompleted - a.wordsCompleted;
      }
      return b.coins - a.coins;
    });
    

  let playerRank = 0;
  let prevWords = -1;
  let prevCoins = -1;
  let currentRank = 0;
  
  for (let i = 0; i < sortedParticipants.length; i++) {
    const p = sortedParticipants[i];
    

    if (p.wordsCompleted !== prevWords || p.coins !== prevCoins) {
      currentRank = i + 1;
      prevWords = p.wordsCompleted;
      prevCoins = p.coins;
    }
    

    if (p.username === currentArcadeSession.playerName) {
      playerRank = currentRank;
      break;
    }
  }
  

  if (playerRank === 0) playerRank = 1;
  

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
  

  let rankDisplay = document.querySelector('.player-rank-display');
  
  if (!rankDisplay) {

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
    

    if (oldRank !== playerRank) {

      rankDisplay.dataset.animating = "true";
      

      currentRankElement.classList.add('exiting');
      

      setTimeout(() => {
        if (rankDisplay) {
          const newRankElement = document.createElement('div');
          newRankElement.className = 'rank-number entering';
          newRankElement.innerHTML = `${playerRank}<span class="rank-suffix">${suffix}</span>`;
          
          rankDisplay.innerHTML = '';
          rankDisplay.appendChild(newRankElement);
          rankDisplay.dataset.currentRank = playerRank;
          

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
  

  rankDisplay.classList.remove('rank-1', 'rank-2', 'rank-3');
  if (playerRank >= 1 && playerRank <= 3) {
    rankDisplay.classList.add(`rank-${playerRank}`);
  }
}

function toggleInlineEdit(listId) {
  const listItem = document.querySelector(`.custom-list-item[data-list-id="${listId}"]`);
  if (!listItem) return;
  

  const isEditing = listItem.classList.contains('editing');
  
  if (isEditing) {

    saveInlineEdit(listId);
  } else {

    enterInlineEditMode(listId, listItem);
  }
}

function enterInlineEditMode(listId, listItem) {
  const list = CustomListsManager.lists.find(list => list.id === listId);
  if (!list) return;
  
  listItem.classList.add('editing');
  

  const editButton = listItem.querySelector('.edit-button');
  if (editButton) {
    editButton.textContent = 'Save';
  }
  

  const listHeader = listItem.querySelector('.list-header h3');
  const originalName = listHeader.textContent;
  

  listHeader.innerHTML = `<input type="text" class="list-name-edit" value="${originalName}" placeholder="List Name">`;
  

  let editContainer = listItem.querySelector('.inline-edit-container');
  
  if (!editContainer) {
    editContainer = document.createElement('div');
    editContainer.className = 'inline-edit-container';
    

    const wordTable = document.createElement('div');
    wordTable.className = 'inline-word-translation-list';
    editContainer.appendChild(wordTable);
    

    const addButton = document.createElement('button');
    addButton.className = 'main-button add-word-button';
    addButton.innerHTML = '<i class="fas fa-plus"></i> Add Word';
    addButton.onclick = function() { addInlineWord(listId); };
    editContainer.appendChild(addButton);
    

    listItem.appendChild(editContainer);
  }
  

  populateInlineWordList(listId, editContainer.querySelector('.inline-word-translation-list'));
  

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
    

    const deleteBtn = element.querySelector(".delete-word-btn");
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteInlineWord(deleteBtn);
    }
    
    return element;
  }

  function makeInlineWordListDraggable(container) {
    if (!container) return;
    
    container.addEventListener("dragover", (event) => {
      event.preventDefault();
      const draggingElement = container.querySelector(".dragging");
      if (!draggingElement) return;
      
      const afterElement = getInlineDragAfterElement(container, event.clientY);
      if (afterElement) {
        container.insertBefore(draggingElement, afterElement);
      } else {
        container.appendChild(draggingElement);
      }
    });
    

    container.querySelectorAll(".inline-word-translation-item").forEach(item => {
      initializeInlineDragAndDrop(item);
    });
  }

  function getInlineDragAfterElement(container, y) {
    if (!container) return null;
    
    const draggableElements = [...container.querySelectorAll(".inline-word-translation-item:not(.dragging)")];
    
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


function setupDraggableWordList() {
    const container = document.getElementById('word-translation-list');
    if (!container) return;
    

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingItem = document.querySelector('.dragging');
      if (!draggingItem) return;
  
      const afterElement = getDropPosition(container, e.clientY);
      if (afterElement) {
        container.insertBefore(draggingItem, afterElement);
      } else {
        container.appendChild(draggingItem);
      }
    });
  
    container.addEventListener('drop', (e) => {
      e.preventDefault();
    });
  

    setupAllDraggableItems();
  }
  

  function setupAllDraggableItems() {
    const items = document.querySelectorAll('.word-translation-item');
    items.forEach(item => makeItemDraggable(item));
  }
  
  function makeItemDraggable(item) {
    if (!item) return null;
    

    const clone = item.cloneNode(true);
    if (item.parentNode) {
        item.parentNode.replaceChild(clone, item);
    }
    

    const newItem = clone;
    

    newItem.setAttribute('draggable', 'true');
    
    newItem.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        newItem.classList.add('dragging');
        e.dataTransfer.setData('text/plain', '');
        e.dataTransfer.effectAllowed = 'move';
    });
    
    newItem.addEventListener('dragend', (e) => {
        e.stopPropagation();
        newItem.classList.remove('dragging');
    });
    

    const deleteBtn = newItem.querySelector('.delete-word-btn');
    if (deleteBtn) {
        deleteBtn.onclick = function() {
            if (newItem.parentNode) {
                newItem.parentNode.removeChild(newItem);
            }
        };
    }
    

    const sourceWord = newItem.querySelector('[contenteditable="true"]');
    if (sourceWord && !sourceWord.classList.contains('source-word')) {
        sourceWord.className = 'source-word';
    }
    
    const targetWord = newItem.querySelector('input[placeholder="Hebrew translation"]');
    if (targetWord && !targetWord.classList.contains('target-word')) {
        targetWord.className = 'target-word';
    }
    
    return newItem;
}
  

  function getDropPosition(container, y) {
    const draggableItems = [...container.querySelectorAll('.word-translation-item:not(.dragging)')];
    
    return draggableItems.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function addDragAndDropStyles() {
    const styleId = "drag-drop-styles";
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.textContent = `
        .word-translation-item {
          cursor: move;
          user-select: none;
          transition: background-color 0.2s ease, transform 0.2s ease;
          position: relative;
        }
        
        .word-translation-item.dragging {
          opacity: 0.7;
          background-color: rgba(100, 150, 255, 0.3);
          transform: scale(1.02);
          box-shadow: 0 3px 10px rgba(0,0,0,0.15);
          z-index: 100;
        }
        
        .word-translation-item .drag-handle {
          cursor: grab;
          padding: 0 8px;
          color: #888;
        }
        
        .word-translation-item .drag-handle:active {
          cursor: grabbing;
        }
      `;
      document.head.appendChild(styleElement);
    }
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
  

  const nameInput = listItem.querySelector('.list-name-edit');
  const newName = nameInput ? nameInput.value.trim() : list.name;
  

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
  

  const updatedList = {
    ...list,
    name: newName,
    words: words,
    translations: translations
  };
  

  CustomListsManager.save(updatedList).then(savedList => {
    if (savedList) {

      listItem.classList.remove('editing');
      

      const editButton = listItem.querySelector('.edit-button');
      if (editButton) {
        editButton.textContent = 'Edit';
      }
      

      const listHeader = listItem.querySelector('.list-header h3');
      if (listHeader) {
        listHeader.textContent = newName;
      }
      

      const wordPreview = listItem.querySelector('.word-preview');
      if (wordPreview) {
        wordPreview.textContent = words.slice(0, 5).join(", ") + (words.length > 5 ? "..." : "");
      }
      

      const wordCount = listItem.querySelector('.word-count');
      if (wordCount) {
        wordCount.textContent = words.length + " words";
        wordCount.classList.toggle('insufficient', words.length < 6);
      }
      

      const warningText = listItem.querySelector('.warning-text');
      if (warningText) {
        warningText.style.display = words.length < 6 ? '' : 'none';
      }
      

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

function showLevelCompletionModal(levelStats, callback) {

  levelStats = levelStats || {};
  levelStats.correctAnswers = levelStats.correctAnswers || 0;
  levelStats.incorrectAnswers = Math.abs(levelStats.incorrectAnswers || 0); 
  levelStats.totalQuestions = levelStats.totalQuestions || 
                             (levelStats.correctAnswers + levelStats.incorrectAnswers) || 1;
  levelStats.timeBonus = levelStats.timeBonus || 0;
  levelStats.coinsEarned = levelStats.coinsEarned || 0;
  

  const averageTime = currentGame.answerTimes && currentGame.answerTimes.length > 0 
    ? (currentGame.answerTimes.reduce((sum, time) => sum + time, 0) / currentGame.answerTimes.length).toFixed(1)
    : "N/A";
  

  const currentCoins = gameState.coins || 0;
  

  const totalBonusCoins = levelStats.timeBonus + levelStats.coinsEarned;
  const newCoinsTotal = currentCoins + totalBonusCoins;
  

  if (totalBonusCoins > 0) {
    gameState.coins = newCoinsTotal;

    saveProgress();
  }
  

  const scorePercentage = Math.round((levelStats.correctAnswers / levelStats.totalQuestions) * 100);
  const isPassed = scorePercentage >= 70;
  

  const stageData = gameStructure.stages[gameState.currentStage - 1];
  const totalLevelsInSet = stageData.levelsPerSet;
  const currentLevelProgress = gameState.currentLevel / totalLevelsInSet;
  

  const noMistakes = levelStats.mistakes === 0;
  const totalTime = currentGame.totalTime || (levelStats.totalQuestions * 5);
  const timeThreshold = totalTime * 0.75 * 1000;
  const fastCompletion = levelStats.timeElapsed < timeThreshold;
  

  const starsEarned = 1 + (noMistakes ? 1 : 0) + (fastCompletion ? 1 : 0);
  

  document.querySelectorAll('.level-completion-overlay').forEach(el => el.remove());
  

  const isLastLevelInSet = gameState.currentLevel === stageData.levelsPerSet;
  const isLastSetInStage = gameState.currentSet === stageData.numSets;
  

  let nextStage = gameState.currentStage;
  let nextSet = gameState.currentSet;
  let nextLevel = gameState.currentLevel + 1;
  
  if (isLastLevelInSet) {
    if (isLastSetInStage) {

      nextStage = gameState.currentStage + 1;
      nextSet = 1;
      nextLevel = 1;
    } else {

      nextSet = gameState.currentSet + 1;
      nextLevel = 1;
    }
  }
  

  const isGameComplete = nextStage > 5;
  

  const overlay = document.createElement('div');
  overlay.className = 'level-completion-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(5px);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    transition: opacity 0.5s ease;
  `;
  

  const completionContent = document.createElement('div');
  completionContent.className = 'level-completion-modal';
  completionContent.style.cssText = `
    background: var(--glass);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    padding: 1.5rem;
    width: 350px;
    max-width: 90%;
    text-align: center;
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transform: scale(0.9);
    opacity: 0;
    transition: transform 0.5s ease, opacity 0.5s ease;
    margin: 0;
  `;
  
  completionContent.innerHTML = `
    <h1 style="color: var(--gold); margin-bottom: 0.25rem; font-size: 1.8rem;">
      Level Complete!
    </h1>
    <h2 style="margin-bottom: 1rem; opacity: 0.9; font-size: 1.1rem; color: ${isPassed ? 'var(--success)' : 'var(--error)'}">
      ${isPassed ? 'Great job!' : 'Try again to improve your score'}
    </h2>
    
    <!-- Star Rating -->
    <div class="star-rating-container" style="margin-bottom: 1rem;">
      <div class="star-slots" style="display: flex; justify-content: center; gap: 0.5rem;">
        <!-- Three star slots, each with empty and filled versions -->
        <div class="star-slot" style="position: relative; width: 36px; height: 36px;">
          <div class="star-empty" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: #333; font-size: 2.2rem; line-height: 1;">★</div>
          <div class="star-filled star-1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: var(--gold); font-size: 2.2rem; line-height: 1; opacity: 0; transform: scale(0); transition: opacity 0.5s ease, transform 0.5s ease;">★</div>
        </div>
        <div class="star-slot" style="position: relative; width: 36px; height: 36px;">
          <div class="star-empty" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: #333; font-size: 2.2rem; line-height: 1;">★</div>
          <div class="star-filled star-2" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: var(--gold); font-size: 2.2rem; line-height: 1; opacity: 0; transform: scale(0); transition: opacity 0.5s ease, transform 0.5s ease;">★</div>
        </div>
        <div class="star-slot" style="position: relative; width: 36px; height: 36px;">
          <div class="star-empty" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: #333; font-size: 2.2rem; line-height: 1;">★</div>
          <div class="star-filled star-3" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; color: var(--gold); font-size: 2.2rem; line-height: 1; opacity: 0; transform: scale(0); transition: opacity 0.5s ease, transform 0.5s ease;">★</div>
        </div>
      </div>
      <div class="star-criteria" style="margin-top: 0.25rem; font-size: 0.7rem; color: rgba(255,255,255,0.7); display: flex; justify-content: space-between; width: 100%; max-width: 200px; margin-left: auto; margin-right: auto;">
        <div>Complete</div>
        <div>No Mistakes</div>
        <div>Quick Time</div>
      </div>
    </div>
    
    <div class="stats-container" style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
      <div class="stat-item" style="text-align: center; flex: 1;">
        <div style="font-size: 1.5rem; color: var(--accent);">${levelStats.correctAnswers}/${levelStats.totalQuestions}</div>
        <div style="opacity: 0.7; font-size: 0.8rem;">Correct</div>
      </div>
      <div class="stat-item" style="text-align: center; flex: 1;">
        <div style="font-size: 1.5rem; color: #ff4136;">${levelStats.incorrectAnswers}</div>
        <div style="opacity: 0.7; font-size: 0.8rem;">Mistakes</div>
      </div>
      <div class="stat-item coin-counter-container" style="text-align: center; flex: 1; position: relative;">
        <!-- Using the in-game coin counter style -->
        <div class="coins-display" style="display: inline-flex; align-items: center; justify-content: center;">
          <span class="coin-value" style="font-size: 1.5rem; color: var(--gold); font-weight: bold;">${currentCoins}</span>
          <span class="coin-icon" style="margin-left: 3px; display: inline-block;">
            <svg width="16" height="16" viewBox="0 0 24 24" style="transform: translateY(2px);">
              <circle cx="12" cy="12" r="10" fill="var(--gold)" />
              <text x="12" y="16" text-anchor="middle" fill="black" style="font-size: 14px; font-weight: bold;">¢</text>
            </svg>
          </span>
        </div>
        <div style="opacity: 0.7; font-size: 0.8rem;">Coins</div>
        ${totalBonusCoins > 0 ? `<div class="time-bonus-badge" style="position: absolute; top: -10px; right: -10px; background: var(--success); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">+${totalBonusCoins}</div>` : ''}
      </div>
    </div>
    
    <!-- Average response time section -->
    <div class="average-time-container" style="margin: 0.75rem 0; text-align: center;">
      <div style="font-size: 0.9rem; margin-bottom: 0.25rem; opacity: 0.8;">Average Response Time</div>
      <div style="font-size: 1.8rem; color: var(--accent); font-weight: bold;">
        ${averageTime}s
      </div>
    </div>
    
    <!-- Progress bar for set completion -->
    <div class="set-progress-container" style="width: 100%; margin: 1rem 0; padding: 0 0.5rem;">
      <div style="text-align: left; margin-bottom: 0.25rem; opacity: 0.7; font-size: 0.75rem;">
        Set Progress (Level ${gameState.currentLevel}/${totalLevelsInSet})
      </div>
      <div class="set-progress-bar" style="
        width: 100%;
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      ">
        <div class="set-progress-fill" style="
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 0%; /* Start at 0, will be animated */
          background: linear-gradient(90deg, var(--accent), var(--gold));
          border-radius: 4px;
          transition: width 1s ease-in-out;
        "></div>
      </div>
    </div>
    
    ${isPassed && !isGameComplete ? `
      <!-- Next Level Information - CLEAN MINIMALIST REDESIGN -->
      <div class="next-level-info" style="
        margin: 1.25rem 0; 
        background: linear-gradient(to right, rgba(20, 30, 80, 0.9), rgba(40, 60, 120, 0.9));
        border-radius: 12px; 
        overflow: hidden;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        position: relative;
        border: 1px solid rgba(100, 150, 255, 0.2);
      ">
        <!-- Header section - WITHOUT ARROW -->
        <div style="
          padding: 0.6rem 1rem;
          text-align: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        ">
          <h3 style="
            margin: 0;
            font-size: 1.1rem;
            color: var(--accent);
            letter-spacing: 0.5px;
            font-weight: 600;
          ">Next Level</h3>
        </div>
      
        <!-- Content area with centered details - NO CONTAINERS -->
        <div style="
          padding: 0.8rem 1rem;
          display: flex;
          justify-content: center;
          align-items: center;
        ">
          <div style="
            display: flex;
            gap: 2rem;
            align-items: center;
            justify-content: center;
          ">
            <!-- Stage -->
            <div style="text-align: center;">
              <div style="
                font-size: 0.7rem;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.6);
                letter-spacing: 1px;
                margin-bottom: 0.2rem;
              ">STAGE</div>
              <div style="
                font-size: 1.3rem;
                font-weight: 600;
                color: white;
              ">${nextStage}</div>
            </div>
            
            <!-- Set -->
            <div style="text-align: center;">
              <div style="
                font-size: 0.7rem;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.6);
                letter-spacing: 1px;
                margin-bottom: 0.2rem;
              ">SET</div>
              <div style="
                font-size: 1.3rem;
                font-weight: 600;
                color: white;
              ">${nextSet}</div>
            </div>
            
            <!-- Level -->
            <div style="text-align: center;">
              <div style="
                font-size: 0.7rem;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.6);
                letter-spacing: 1px;
                margin-bottom: 0.2rem;
              ">LEVEL</div>
              <div style="
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--gold);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
              ">${nextLevel}</div>
            </div>
          </div>
        </div>
        
        <!-- Decorative elements -->
        <div style="
          position: absolute;
          bottom: 0;
          right: 0;
          width: 80px;
          height: 80px;
          background: radial-gradient(circle at bottom right, rgba(100, 150, 255, 0.15), transparent 70%);
          pointer-events: none;
        "></div>
        
        <div style="
          position: absolute;
          top: 0;
          left: 20px;
          width: 60%;
          height: 2px;
          background: linear-gradient(to right, rgba(100, 150, 255, 0.5), transparent);
          pointer-events: none;
        "></div>
        
        ${nextLevel === 21 ? `
        <!-- Boss badge positioned at right side -->
        <div style="
          position: absolute;
          top: 50%;
          right: 1rem;
          transform: translateY(-50%);
          background: linear-gradient(135deg, #ff4136, #990000);
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: bold;
          color: white;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          box-shadow: 0 2px 8px rgba(255, 0, 0, 0.3);
        ">
          BOSS
        </div>
        ` : ''}
      </div>
      ` : ''}
    
    <div class="button-container" style="display: flex; justify-content: center; gap: 1rem; margin-top: 1rem;">
      <button class="${isPassed ? 'continue-button' : 'retry-button'} start-button" style="background: var(--accent);">
        ${isPassed ? (isGameComplete ? 'Back to Welcome' : 'Next Level') : 'Try Again'}
      </button>
    </div>
  `;
  

  document.body.appendChild(overlay);
  overlay.appendChild(completionContent);
  

  setTimeout(() => {
    overlay.style.opacity = '1';
    completionContent.style.transform = 'scale(1)';
    completionContent.style.opacity = '1';
    

    setTimeout(() => {
      const progressFill = completionContent.querySelector('.set-progress-fill');
      if (progressFill) {
        progressFill.style.width = `${currentLevelProgress * 100}%`;
      }
      

      setTimeout(() => {
        const star1 = completionContent.querySelector('.star-1');
        if (star1) {
          star1.style.opacity = '1';
          star1.style.transform = 'scale(1)';
        }
        
        if (noMistakes) {
          setTimeout(() => {
            const star2 = completionContent.querySelector('.star-2');
            if (star2) {
              star2.style.opacity = '1';
              star2.style.transform = 'scale(1)';
            }
          }, 300);
        }
        
        if (fastCompletion) {
          setTimeout(() => {
            const star3 = completionContent.querySelector('.star-3');
            if (star3) {
              star3.style.opacity = '1';
              star3.style.transform = 'scale(1)';
            }
          }, 600);
        }
      }, 500);
      

      if (totalBonusCoins > 0) {
        const coinValue = completionContent.querySelector('.coin-value');
        if (coinValue) {

          let startValue = currentCoins;
          const endValue = newCoinsTotal;
          const duration = 1500;
          const stepTime = 50;
          const totalSteps = duration / stepTime;
          const stepValue = (endValue - startValue) / totalSteps;
          

          const coinIcon = completionContent.querySelector('.coin-icon');
          if (coinIcon) {
            coinIcon.style.filter = 'drop-shadow(0 0 5px var(--gold))';
            coinIcon.style.transition = 'filter 0.5s ease';
          }
          
          const counterInterval = setInterval(() => {
            startValue += stepValue;
            if (startValue >= endValue) {
              startValue = endValue;
              clearInterval(counterInterval);
              

              setTimeout(() => {
                if (coinIcon) {
                  coinIcon.style.filter = 'none';
                }
              }, 500);
            }
            coinValue.textContent = Math.round(startValue);
          }, stepTime);
        }
      }
    }, 500);
  }, 100);
  

  setTimeout(() => {
    updateAllCoinDisplays();
  }, 2000);
  

  const actionButton = completionContent.querySelector(isPassed ? '.continue-button' : '.retry-button');
  if (actionButton) {
    actionButton.addEventListener('click', () => {

      overlay.style.opacity = '0';
      completionContent.style.transform = 'scale(0.9)';
      completionContent.style.opacity = '0';
      

      setTimeout(() => {
        document.body.removeChild(overlay);
        

        updateAllCoinDisplays();
        
        callback(isPassed);
      }, 500);
    });
  }
}

function initializeArcadeUI() {

    setTimeout(() => {
        const circle = document.querySelector('.progress-circle .progress');
        if (circle) {
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            

            circle.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
            circle.setAttribute('stroke-dashoffset', `${circumference}`);
            

            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = `${circumference}`;
        }
    }, 0);
}




const notificationTracker = {
    lastMessage: '',
    lastTime: 0,
    activeNotifications: new Set()
};


function showNotificationWithDebounce(message, type, duration = 3000) {
    const now = Date.now();
    

    if (message === notificationTracker.lastMessage && 
        now - notificationTracker.lastTime < 1000) {
        console.log('Preventing duplicate notification:', message);
        return;
    }
    

    if (notificationTracker.activeNotifications.has(message)) {
        console.log('Notification already active:', message);
        return;
    }
    

    notificationTracker.lastMessage = message;
    notificationTracker.lastTime = now;
    notificationTracker.activeNotifications.add(message);
    

    showNotification(message, type, duration);
    

    setTimeout(() => {
        notificationTracker.activeNotifications.delete(message);
    }, duration + 100);
}

function incrementWordsLearned() {

    if (!gameState.wordsLearned) {
        gameState.wordsLearned = 0;
    }
    

    const previouslyUnlocked = {};
    Object.keys(PERK_CONFIG).forEach(perkId => {
        previouslyUnlocked[perkId] = PerkManager.checkPerkConditionsMet(perkId);
    });
    

    gameState.wordsLearned++;
    
    console.log(`Words learned incremented to: ${gameState.wordsLearned}`);
    

    if (!gameState.unlockedPerks) {
        gameState.unlockedPerks = new Set();
    }
    

    Object.keys(PERK_CONFIG).forEach(perkId => {
        const nowUnlocked = PerkManager.checkPerkConditionsMet(perkId);
        

        if (nowUnlocked && !previouslyUnlocked[perkId]) {
            console.log(`Perk ${perkId} newly unlocked!`);
            gameState.unlockedPerks.add(perkId);
            PerkManager.announcePerkUnlocked(perkId);
        }
    });
    

    if (PerkManager && typeof PerkManager.refreshPerks === 'function') {
        PerkManager.refreshPerks();
    }
}

  document.addEventListener('DOMContentLoaded', function() {

    Object.keys(PERK_CONFIG).forEach(perkId => {
      const buttonId = `${perkId}Perk`;
      const button = document.getElementById(buttonId);
      if (!button) {
        console.error(`Missing perk button in DOM: ${buttonId}`);
        

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
    

    if (PerkManager && typeof PerkManager.init === 'function') {
      PerkManager.init();
      console.log('PerkManager initialized');
    }
  });

  function incrementWordsLearned() {

    if (!gameState.wordsLearned) {
      gameState.wordsLearned = 0;
    }
    

    const previouslyUnlockedPerks = new Set();
    Object.keys(PERK_CONFIG).forEach(perkId => {
      if (PerkManager.checkPerkConditionsMet(perkId)) {
        previouslyUnlockedPerks.add(perkId);
      }
    });
    

    gameState.wordsLearned++;
    
    console.log(`Words learned incremented to: ${gameState.wordsLearned}`);
    

    Object.keys(PERK_CONFIG).forEach(perkId => {
      const isUnlockedNow = PerkManager.checkPerkConditionsMet(perkId);
      

      if (isUnlockedNow && !previouslyUnlockedPerks.has(perkId)) {
        console.log(`Perk ${perkId} newly unlocked!`);
        

        if (!gameState.unlockedPerks) {
          gameState.unlockedPerks = new Set();
        }
        gameState.unlockedPerks.add(perkId);
        

        PerkManager.announcePerkUnlocked(perkId);
      }
    });
    

    if (PerkManager && typeof PerkManager.refreshPerks === 'function') {
      PerkManager.refreshPerks();
    }
  }

  function updateSetProgress(currentLevel) {
    const progressContainer = document.querySelector('.set-progress-container');
    if (!progressContainer) return;
    

    const stageConfig = gameStructure.stages[gameState.currentStage - 1];
    const totalLevels = stageConfig.levelsPerSet;
    

    progressContainer.innerHTML = '';
    

    progressContainer.innerHTML = `
      <div class="set-progress-label">Set Progress (Level ${currentLevel}/${totalLevels})</div>
      <div class="set-progress-track">
        <div class="set-progress-bar"></div>
        <div class="set-milestones"></div>
      </div>
    `;
    
    const progressBar = progressContainer.querySelector('.set-progress-bar');
    const milestonesContainer = progressContainer.querySelector('.set-milestones');
    

    const progressPercentage = (currentLevel - 1) / (totalLevels - 1) * 100;
    progressBar.style.width = `${progressPercentage}%`;
    

    const milestones = [3, 6, 9, 10, 13, 16, 19, 20, 21];
    

    milestones.forEach(milestoneLevel => {

      if (milestoneLevel > totalLevels) return;
      

      const position = (milestoneLevel - 1) / (totalLevels - 1) * 100;
      

      const isCompleted = currentLevel > milestoneLevel;
      

      const isBoss = milestoneLevel === 21;
      const milestoneType = isBoss ? 'boss' : 'test';
      

      const milestone = document.createElement('div');
      milestone.className = `set-milestone ${milestoneType}-milestone ${isCompleted ? 'completed' : 'upcoming'}`;
      milestone.style.left = `${position}%`;
      

      milestone.innerHTML = `
        <div class="milestone-icon">
          ${isBoss ? 
            '<i class="fas fa-dragon"></i>' : 
            '<i class="fas fa-graduation-cap"></i>'}
        </div>
        <div class="milestone-tooltip">
          ${isBoss ? 'Boss Level' : 'Test Level'} ${milestoneLevel}
        </div>
      `;
      
      milestonesContainer.appendChild(milestone);
    });
  }

  function addSetProgressStyles() {
    const styles = `
      .set-progress-container {
        margin: 1.5rem 0;
        padding: 0 10px;
      }
      
      .set-progress-label {
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.9rem;
        margin-bottom: 8px;
        text-align: left;
      }
      
      .set-progress-track {
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        position: relative;
        overflow: visible;
      }
      
      .set-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--accent) 0%, var(--gold) 100%);
        border-radius: 10px;
        transition: width 0.5s ease;
        position: relative;
        z-index: 1;
      }
      
      .set-milestones {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2;
        pointer-events: none;
      }
      
      .set-milestone {
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--primary-dark);
        transform: translate(-50%, -6px);
        display: flex;
        justify-content: center;
        align-items: center;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
        z-index: 3;
        cursor: pointer;
        pointer-events: auto;
      }
      
      .test-milestone {
        border: 2px solid var(--gold);
      }
      
      .boss-milestone {
        border: 2px solid #ff3333;
      }
      
      .completed.test-milestone {
        background: var(--gold);
      }
      
      .completed.boss-milestone {
        background: #ff3333;
      }
      
      .milestone-icon {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.9);
        z-index: 4;
      }
      
      .upcoming .milestone-icon {
        opacity: 0.6;
      }
      
      .completed .milestone-icon {
        opacity: 1;
      }
      
      .milestone-tooltip {
        position: absolute;
        top: -35px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease;
        pointer-events: none;
      }
      
      .set-milestone:hover .milestone-tooltip {
        opacity: 1;
        visibility: visible;
      }
      
      .set-milestone:hover {
        transform: translate(-50%, -6px) scale(1.2);
      }
    `;
    
    if (!document.getElementById('set-progress-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'set-progress-styles';
      styleElement.textContent = styles;
      document.head.appendChild(styleElement);
    }
    

    addSetProgressStyles();
  }