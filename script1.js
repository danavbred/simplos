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
    

    const form = document.getElementById('upgradeForm');
    if (form) {
      form.addEventListener('submit', function(e) {
        console.log("Form submit event triggered");
        handleUpgradeSubmit(e);
      });
    }
  });


  

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
        

        await checkExistingSession();
        initializeGame();
        updatePerkButtons();
        updateGuestPlayButton();
        

        CoinsManager.initialize();
        WordsManager.initialize();
        await CustomListsManager.initialize();
 

        if (currentUser) {
            gameState.coins = await CoinsManager.loadUserCoins();
            CoinsManager.updateDisplays();
            
            const words = await WordsManager.loadUserWords();
            WordsManager.updateDisplays(words);
        }
        

        window.addEventListener('hashchange', handleHashChange);
        window.addEventListener('load', handleHashChange);
        

        if (window.location.hash.startsWith('#join=')) {
            console.log('Initial join hash detected');
            const otp = window.location.hash.replace('#join=', '');
            history.pushState("", document.title, window.location.pathname);
            showJoinModal(otp);
        }
 

        const welcomeScreen = document.getElementById('welcome-screen');
        initializeParticles(welcomeScreen);
        

        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {

            document.addEventListener('touchstart', function onFirstTouch() {
                document.removeEventListener('touchstart', onFirstTouch);
            }, { once: true });
            

            document.addEventListener('click', function(e) {
                if (e.target.tagName === 'BUTTON') {
                }
            });
            

            if (screen.orientation) {
                screen.orientation.lock('portrait')
                    .catch(err => console.log('Failed to lock orientation:', err));
            }
        }
 

        const otpInput = document.getElementById('otpInput');
        if (otpInput) {
            otpInput.addEventListener('input', function(e) {

                this.value = this.value.replace(/[^0-9]/g, '');
                

                if (this.value.length > 4) {
                    this.value = this.value.slice(0, 4);
                }
            });
        }
 

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

    (async () => {
        await checkExistingSession();
        initializeGame();
        updatePerkButtons();
        updateGuestPlayButton();
        
        CoinsManager.initialize();
        WordsManager.initialize();
        

        if (currentUser) {
            const [coins, words] = await Promise.all([
                CoinsManager.loadUserCoins(),
                WordsManager.loadUserWords()
            ]);
            
            gameState.coins = coins;
            CoinsManager.updateDisplays();
            WordsManager.updateDisplays(words);
        }
        

        if (window.location.hash.startsWith('#join=')) {
            console.log('Initial join hash detected');
            const otp = window.location.hash.replace('#join=', '');
            history.pushState("", document.title, window.location.pathname);
            showJoinModal(otp);
        }


        const welcomeScreen = document.getElementById('welcome-screen');
        initializeParticles(welcomeScreen);
        
        await loadCustomLists();


        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {

            document.addEventListener('touchstart', function onFirstTouch() {
                document.removeEventListener('touchstart', onFirstTouch);
            }, { once: true });
            

            document.addEventListener('click', function(e) {
                if (e.target.tagName === 'BUTTON') {
                }
            });
            

            if (screen.orientation) {
                screen.orientation.lock('portrait')
                    .catch(err => console.log('Failed to lock orientation:', err));
            }
        }


        if (currentUser) {
            setupUserStatusSubscription();
            initializeStatusCheck();
        }
    })().catch(error => {
        console.error('Initialization error:', error);
    });
});

document.addEventListener('DOMContentLoaded', function() {

    

    if (document.getElementById('question-screen').classList.contains('visible')) {
      console.log("Question screen is visible on load, adding admin button");
      addAdminTestButton();
    }
    

    setTimeout(() => {
      if (currentUser && currentUser.email === 'admin123@gmail.com') {
        console.log("Admin user detected on page load");
        addAdminTestButton();
      }
    }, 2000);
  });

  document.addEventListener('DOMContentLoaded', function() {

});


document.addEventListener('DOMContentLoaded', () => {
    const otpInput = document.getElementById('otpInput');
    if (otpInput) {
        otpInput.addEventListener('input', function(e) {

            this.value = this.value.replace(/[^0-9]/g, '');
            

            if (this.value.length > 4) {
                this.value = this.value.slice(0, 4);
            }
        });
    }
});

document.addEventListener('progressSaved', (event) => {

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
        stages: {},
        currentWords: [],
        particles: new Set()
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
    

    if (authModal?.classList.contains('show') && 
        !authContent.contains(e.target) && 
        !e.target.matches('.main-button')) {
        hideAuthModal();
    }
    

    if (arcadeModal?.style.display === 'block' && 
        !arcadeContent.contains(e.target) && 
        !e.target.matches('.arcade-button')) {
        arcadeModal.style.display = 'none';
    }
});

const ParticleSystem = {
    particlePool: [],
    maxParticles: 20,
    
    init() {

        for(let i = 0; i < this.maxParticles; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle mobile-particle';
            this.particlePool.push(particle);
        }
    },
    
    createParticle(x, y) {

        if (window.innerWidth <= 768) {
            return;
        }
        
        const particle = this.particlePool.pop();
        if (!particle) return;
        
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        
        setTimeout(() => {
            this.particlePool.push(particle);
        }, 500);
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
    '#1E90FF',
    '#FF1493',
    '#00CED1',
    '#9370DB',
    '#FFD700',
    '#FF4500',
    '#32CD32',
    '#FF69B4',
    '#4169E1',
    '#8A2BE2'
];



const CoinsManager = {
  initialized: false,
  updateLock: false,
  pendingUpdates: [],
  animationTimers: new Map(),
  lastUpdateTimestamp: 0,
  

  initialize: async function() {
      if (this.initialized) return;
      
      console.log("Initializing CoinsManager");
      this.initialized = true;
      

      await this.loadUserCoins();
      

      this.observeCoinsDisplay();
      

      this.updateDisplays();
  },
  

  loadUserCoins: async function() {
      try {

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
          

          gameState.coins = 0;
          return 0;
      } catch (error) {
          console.error("Error loading user coins:", error);
          gameState.coins = 0;
          return 0;
      }
  },
  

  updateCoins: async function(amount, animationOrigin = null) {
      if (this.updateLock) {
          this.pendingUpdates.push({amount, animationOrigin});
          console.log("Coin update queued:", amount);
          return gameState.coins;
      }
      
      try {
          this.updateLock = true;
          this.lastUpdateTimestamp = Date.now();
          
          const previousCoins = gameState.coins;
          gameState.coins += amount;
          
          console.log(`Updating coins: ${previousCoins} + (${amount}) = ${gameState.coins}`);
          

          this.updateDisplays(previousCoins);
          

          if (amount > 0 && animationOrigin) {
              showCoinAnimation(animationOrigin.x, animationOrigin.y, amount);
          }
          

          if (currentGame) {
              currentGame.coins = gameState.coins;
          }
          

          await this.saveUserCoins();
          

          this.updateArcadeParticipant();
          

          this.broadcastArcadeUpdate();
          
          return gameState.coins;
      } catch (error) {
          console.error("Error updating coins:", error);
          return gameState.coins;
      } finally {

          setTimeout(() => {
              this.updateLock = false;
              
              if (this.pendingUpdates.length > 0) {
                  const nextUpdate = this.pendingUpdates.shift();
                  this.updateCoins(nextUpdate.amount, nextUpdate.animationOrigin);
              }
          }, 300);
      }
  },
  

  awardCoins: function(amount) {
      if (amount <= 0) return gameState.coins;
      

      let origin = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
      };
      

      if (window.lastInteractionPos) {
          origin = window.lastInteractionPos;
      }
      

      return this.updateCoins(amount, origin);
  },
  

  deductCoins: function(amount) {
      if (amount <= 0) return gameState.coins;
      

      this.updateCoins(-amount);
      

      
      return gameState.coins;
  },
  

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
          

          this.updateDisplays(previousCoins);
          

          if (currentGame) {
              currentGame.coins = gameState.coins;
          }
          

          await this.saveUserCoins();
          

          this.updateArcadeParticipant();
          

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
  

  saveUserCoins: async function() {

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
  

  updateDisplays: function(previousValue = null) {
      if (previousValue === null) {
          previousValue = gameState.coins;
      }
      
      document.querySelectorAll('.coin-count').forEach(display => {
          this.animateCoinDisplay(display, previousValue, gameState.coins);
      });
      

      if (typeof updatePerkButtons === 'function') {
          updatePerkButtons();
      }
  },
  

  animateCoinDisplay: function(element, startValue, endValue) {
      if (!element) return;
      

      const existingTimerId = this.animationTimers.get(element);
      if (existingTimerId) {
          cancelAnimationFrame(existingTimerId);
          this.animationTimers.delete(element);
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
      
      const animate = () => {
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
              

              const newTimerId = requestAnimationFrame(animate);
              this.animationTimers.set(element, newTimerId);
          } else {

              element.textContent = endValue;
              this.animationTimers.delete(element);
              
              setTimeout(() => {
                  element.style.color = '';
                  element.classList.remove('animating');
              }, 300);
          }
      };
      

      const initialTimerId = requestAnimationFrame(animate);
      this.animationTimers.set(element, initialTimerId);
  },
  

  observeCoinsDisplay: function() {
      const observer = new MutationObserver(mutations => {
          let shouldUpdate = false;
          
          mutations.forEach(mutation => {
              if (mutation.addedNodes.length > 0) {

                  mutation.addedNodes.forEach(node => {
                      if (node.nodeType === 1) {
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
      

      observer.observe(document.body, {
          childList: true,
          subtree: true
      });
  },
  

  updateArcadeParticipant: function() {
      if (!currentArcadeSession?.playerName) return;
      
      const index = currentArcadeSession.participants.findIndex(
          p => p.username === currentArcadeSession.playerName
      );
      
      if (index !== -1) {
          currentArcadeSession.participants[index].coins = gameState.coins;
      }
  },
  

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
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 500);
}


function animateNumberChange(element, startValue, endValue) {
    if (!element) return;
    
    const duration = 300;
    const frames = 20;
    const increment = (endValue - startValue) / frames;
    
    let currentFrame = 0;
    let currentValue = startValue;

    function updateFrame() {
        currentFrame++;
        currentValue += increment;
        
        if (currentFrame <= frames) {

            element.textContent = Math.round(currentValue);
            requestAnimationFrame(updateFrame);
        } else {

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

  console.log(`Attempting to show screen: ${screenId}`);
  

  if (screenId === "stage-cascade-screen") {
    return renderStageCascadeScreen();
  }
  
  console.log("showScreen called with:", {
    screenId: screenId,
    forceRefresh: forceRefresh,
    currentUser: currentUser ? currentUser.id : "No user",
    preventAutoResume: window.preventAutoResume || false
  });
  

  const targetScreen = document.getElementById(screenId);
  if (!targetScreen) {
      console.error(`ERROR: Screen with id "${screenId}" not found in the DOM!`);

      const availableScreens = Array.from(document.querySelectorAll('.screen')).map(s => s.id);
      console.log("Available screens:", availableScreens);
      return;
  }
   

  if (document.querySelector('.screen.visible')?.id === 'leaderboard-screen') {
    cleanupLeaderboard();
  }
   
  const event = new CustomEvent('screenChange', { 
    detail: { screen: screenId } 
  });
  document.dispatchEvent(event);


  const currentScreen = document.querySelector('.screen.visible');
   

  if (currentScreen && currentScreen.id === 'question-screen') {
    if (typeof clearTimer === 'function') {
      clearTimer();
    }
    window.isFrozen = false;
  }
   

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
   

  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('visible');
    


  });
   

  if (targetScreen) {

    targetScreen.classList.add('visible');
       

    if (typeof initializeParticles === 'function') {

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
       

    if (typeof updateAllCoinDisplays === 'function') {
      updateAllCoinDisplays();
    }
       

    switch (screenId) {
      case "question-screen":
        if (typeof updatePerkButtons === 'function') {
          updatePerkButtons();
        }
               

        console.log("Question screen shown, checking for admin button");
        setTimeout(() => {
          if (typeof addAdminTestButton === 'function') {
            addAdminTestButton();
          }
        }, 100);
        break;
             
      case "welcome-screen":

        if (window.preventAutoResume) {
          console.log("Auto-resume prevented by explicit flag");

          if (localStorage.getItem("gameContext")) {
            console.log("Removing saved game context during prevented auto-resume");
            localStorage.removeItem("gameContext");
          }
        } else if (typeof restoreGameContext === 'function' && restoreGameContext()) {
          if (typeof startGame === 'function') {
            console.log("Restoring saved game after welcome screen shown");
            startGame();
          }
        } else {
          console.log("No saved game to restore or auto-resume prevented");
        }
        break;
             
      case "stage-cascade-screen":

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


function safeShowScreen(screenId, forceRefresh = false) {
  ensureScreenExists(screenId);
  showScreen(screenId, forceRefresh);
}


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

    const existingMenu = document.getElementById('options-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const optionsMenu = document.createElement('div');
    optionsMenu.id = 'options-menu';
    optionsMenu.className = 'floating-menu';
    

    const menuItems = [
        {
            id: 'profile-item',
            icon: 'fa-user',
            text: 'Profile',
            onClick: 'openProfileModal()',
            visibleTo: ['all']
        },
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
            visibleTo: ['free', 'pending', 'unregistered']
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
    

    const menuGrid = document.createElement('div');
    menuGrid.className = 'menu-grid';
    optionsMenu.appendChild(menuGrid);
    

    const userStatus = currentUser ? (currentUser.status || 'free') : 'unregistered';
    

    menuItems.forEach(item => {

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

    

    const screensWithNav = ['stage-screen', 'set-screen', 'level-screen', 'question-screen'];
    
    if (screensWithNav.includes(screenId)) {
        const navContainer = document.createElement('div');
        navContainer.className = 'screen-nav';
        

        const homeButton = document.createElement('button');
        homeButton.className = 'home-button';
        homeButton.innerHTML = '<i class="fas fa-home"></i>';
        homeButton.onclick = () => showScreen('welcome-screen');
        navContainer.appendChild(homeButton);
        

        if (screenId !== 'stage-screen') {
            const backButton = document.createElement('button');
            backButton.className = 'back-button';
            backButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
            

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
        

        const currentScreen = document.getElementById(screenId);
        currentScreen.appendChild(navContainer);
    }
}

function updateNavigationContainer() {

    const existingMenu = document.querySelector('.navigation-menu');
    if (existingMenu) {
        existingMenu.remove();
    }


    let navContainer = document.querySelector('.vertical-nav-container');
    

    if (!navContainer) {
        navContainer = document.createElement('div');
        navContainer.className = 'vertical-nav-container';
        document.body.appendChild(navContainer);
               

        const homeBtn = document.createElement('button');
        homeBtn.className = 'nav-button home-button';
        homeBtn.id = 'nav-home-btn';
        homeBtn.innerHTML = '<i class="fas fa-home"></i>';
        homeBtn.onclick = navigateHome || function() { showScreen('welcome-screen'); };
        navContainer.appendChild(homeBtn);
        

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'nav-button fullscreen-button';
        fullscreenBtn.id = 'nav-fullscreen-btn';
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.onclick = toggleFullScreen;
        navContainer.appendChild(fullscreenBtn);
        

        const resetBtn = document.createElement('button');
        resetBtn.className = 'nav-button reset-button';
        resetBtn.id = 'nav-reset-btn';
        resetBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        resetBtn.onclick = handleResetProgress;
        navContainer.appendChild(resetBtn);
        

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

    ParticleSystem.maxParticles = 20;
    
    const debouncedShowScreen = debounce(showScreen, 200);
    

    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        document.body.classList.add('mobile-device');
        

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

    document.addEventListener('touchstart', () => {}, { passive: true });
    document.addEventListener('touchmove', () => {}, { passive: true });
    

    const cleanupEventListeners = () => {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.removeEventListener('touchstart', () => {});
            screen.removeEventListener('touchmove', () => {});
        });
    };
}


document.addEventListener('DOMContentLoaded', function() {

    const originalShowScreen = window.showScreen;
    if (typeof originalShowScreen === 'function') {
      window.showScreen = function(screenId, forceRefresh) {
        originalShowScreen(screenId, forceRefresh);
        if (screenId === 'question-screen') {
          optimizeQuestionScreenForMobile();
        }
      };
    }
    

    if (document.getElementById('question-screen')?.classList.contains('visible')) {
      optimizeQuestionScreenForMobile();
    }
  });

  function initVerticalNavigation() {

    const existingButtons = {
        hamburger: document.querySelector('.hamburger-button:not(.vertical-nav-container .hamburger-button)'),
        home: document.querySelector('.home-button:not(.vertical-nav-container .home-button)'),
        fullscreen: document.querySelector('.fullscreen-button:not(.vertical-nav-container .fullscreen-button)'),
        reset: document.querySelector('.reset-button:not(.vertical-nav-container .reset-button)'),
        settings: document.querySelector('.settings-button:not(.vertical-nav-container .settings-button)'),
        accessibility: document.querySelector('.accessibility-toggle')
    };
    

    let navContainer = document.querySelector('.vertical-nav-container');
    if (!navContainer) {
        navContainer = document.createElement('div');
        navContainer.className = 'vertical-nav-container';
        document.body.appendChild(navContainer);
    }
    

    navContainer.innerHTML = '';
      

    const homeBtn = document.createElement('button');
    homeBtn.className = 'nav-button home-button';
    homeBtn.id = 'nav-home-btn';
    homeBtn.innerHTML = '<i class="fas fa-home"></i>';
    homeBtn.onclick = navigateHome || function() { showScreen('welcome-screen'); };
    navContainer.appendChild(homeBtn);
    

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'nav-button fullscreen-button';
    fullscreenBtn.id = 'nav-fullscreen-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.onclick = toggleFullScreen;
    navContainer.appendChild(fullscreenBtn);
    

    const resetBtn = document.createElement('button');
    resetBtn.className = 'nav-button reset-button';
    resetBtn.id = 'nav-reset-btn';
    resetBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    resetBtn.onclick = handleResetProgress;
    navContainer.appendChild(resetBtn);
    

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'nav-button settings-button';
    settingsBtn.id = 'nav-settings-btn';
    settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
    settingsBtn.onclick = function() { 

        const accessibilityModal = document.querySelector('.accessibility-modal');
        if (accessibilityModal) accessibilityModal.classList.add('show');
    };
    navContainer.appendChild(settingsBtn);
    

    const accessBtn = document.createElement('button');
    accessBtn.className = 'nav-button accessibility-button';
    accessBtn.id = 'nav-accessibility-btn';
    accessBtn.innerHTML = '<i class="fas fa-universal-access"></i>';
    accessBtn.onclick = function() { 
        const accessibilityModal = document.querySelector('.accessibility-modal');
        if (accessibilityModal) accessibilityModal.classList.add('show');
    };
    navContainer.appendChild(accessBtn);
    

    Object.values(existingButtons).forEach(button => {
        if (button && button.parentNode) {
            button.parentNode.removeChild(button);
        }
    });
}


document.addEventListener('DOMContentLoaded', initVerticalNavigation);


function updateSidePanelLinks() {
    const levelMapLink = document.querySelector('.nav-link[onclick*="stage-screen"]');
    if (levelMapLink) {
        levelMapLink.setAttribute('onclick', "safeShowScreen('stage-cascade-screen'); return false;");
    }
    

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

    gameState.currentStage = stageId;
    showStageCascadeScreen();
    

    setTimeout(() => {
        const stageWrapper = document.querySelector(`.stage-wrapper[data-stage="${stageId}"]`);
        if (stageWrapper && !stageWrapper.classList.contains('open')) {
            stageWrapper.classList.add('open');
        }
    }, 100);
}

function showStageCascadeScreen() {

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    

    const stageCascadeScreen = document.getElementById('stage-cascade-screen');
    if (stageCascadeScreen) {
        stageCascadeScreen.classList.add('visible');
    }
    

    let stageCascadeContainer = document.querySelector('.stage-cascade-container');
    if (!stageCascadeContainer) {

        const container = document.createElement('div');
        container.className = 'stage-cascade-container';
        stageCascadeScreen.appendChild(container);
        stageCascadeContainer = container;
    } else {

        stageCascadeContainer.innerHTML = '';
    }
    

    const totalStages = gameStructure.stages.length;
    for (let stageIndex = 0; stageIndex < totalStages; stageIndex++) {
        const stage = gameStructure.stages[stageIndex];
        const stageNumber = stageIndex + 1;
        

        const stageCard = document.createElement('div');
        stageCard.className = 'stage-card';
        

        const isUnlocked = gameState.unlockedSets[stageNumber] && gameState.unlockedSets[stageNumber].size > 0;
        if (!isUnlocked) {
            stageCard.classList.add('locked');
        }
        

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
        

        if (isUnlocked) {
            stageCard.addEventListener('click', () => {
                gameState.currentStage = stageNumber;
                showStageScreen();
            });
        }
        
        stageCascadeContainer.appendChild(stageCard);
    }
    

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
      

      updateStageCompletionStats();
}

function renderStageCascadeScreen() {
    const stagesContainer = document.querySelector(".stages-container");
    if (!stagesContainer) return;
    

    stagesContainer.innerHTML = "";
    

    console.log("Current unlocked sets:", gameState.unlockedSets);
    

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
      

      populateSetsGrid(stage.id);
    });
    

    addStageToggleListeners();
    

    if (gameState.currentStage) {
      const currentStageWrapper = document.querySelector(`.stage-wrapper[data-stage="${gameState.currentStage}"]`);
      if (currentStageWrapper) {
        currentStageWrapper.classList.add("open");
      }
    }
    

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
    

    document.querySelector('.home-button').onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.style.display = 'none';
            showScreen('welcome-screen');
        }, 1000);
    };
}



async function handleLogin() {
    const loginInput = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!loginInput || !password) {
        alert('Please enter both username/email and password');
        return;
    }

    try {

        const isEmail = loginInput.includes('@');
        let userEmail = loginInput;
        

        if (!isEmail) {

            userEmail = `${loginInput}@gmail.com`;
        }
        

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: userEmail,
            password: password
        });


        if (error) {

            if (!isEmail && error.message.includes('Invalid login')) {



                alert('Login failed. Please try using your full email address.');
            } else {
                alert(error.message);
            }
            return;
        }


        if (data && data.user) {
            currentUser = data.user;
            

            hideAuthModal();
            

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


            try {
                await Promise.all([
                    loadCustomLists(),
                    loadUserGameProgress(currentUser.id)
                ]);
            } catch (loadError) {
                console.warn('Error loading user data:', loadError);
            }


            updateAuthUI();
            updateGuestPlayButton();
            showScreen('welcome-screen');
        }
    } catch (error) {
        console.error('Unexpected Login Error:', error);
        alert('An unexpected error occurred during login');
    }
}


function setupFormKeyboardNavigation() {

    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {

        const inputs = form.querySelectorAll('input, select, textarea, button');
        

        inputs.forEach(input => {

            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    

                    if (input.tagName === 'BUTTON') {
                        input.click();
                        return;
                    }
                    

                    const currentIndex = Array.from(inputs).indexOf(input);
                    const nextElement = inputs[currentIndex + 1];
                    

                    if (nextElement) {
                        nextElement.focus();
                    } else {

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
    

    const authForms = ['loginForm', 'signupForm', 'upgradeForm'];
    
    authForms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            setupFormSubmitOnEnter(form);
        }
    });
    

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    const newForms = node.tagName === 'FORM' ? [node] : node.querySelectorAll('form');
                    newForms.forEach(form => {
                        setupFormSubmitOnEnter(form);
                    });
                    

                    authForms.forEach(formId => {
                        if (node.id === formId) {
                            setupFormSubmitOnEnter(node);
                        }
                    });
                }
            });
        });
    });
    

    observer.observe(document.body, { childList: true, subtree: true });
}


function setupFormSubmitOnEnter(form) {
    if (!form) return;
    
    const inputs = form.querySelectorAll('input, select, textarea');
    const submitButton = form.querySelector('button[type="submit"]') || 
                        form.querySelector('input[type="submit"]') ||
                        form.querySelector('button:not([type="button"])');
    
    inputs.forEach(input => {

        const hasHandler = input.getAttribute('data-enter-handler');
        if (hasHandler === 'true') return;
        

        input.setAttribute('data-enter-handler', 'true');
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                

                const currentIndex = Array.from(inputs).indexOf(input);
                const nextInput = inputs[currentIndex + 1];
                

                if (nextInput) {
                    nextInput.focus();
                } else if (submitButton) {

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
                1: [1],
                2: [1],
                3: [1],
                4: [1],
                5: [1]
            },
            defaultUnlockedLevels: {
                1: true,
            }
        };
    }


    const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('status, payment_pending')
        .eq('id', currentUser.id)
        .single();

    if (error) return null;


    if (data.payment_pending || data.status === 'free' || data.status === 'pending') {
        return {
            fullAccess: false,
            unlockedStages: {
                1: [1],
                2: [1],
                3: [1],
                4: [1],
                5: [1]
            },
            defaultUnlockedLevels: {
                1: true,
            }
        };
    }


    if (data.status === 'premium') {
        return {
            fullAccess: true,
            unlockedStages: {
                1: [1],
                2: [1],
                3: [1],
                4: [1],
                5: [1]
            },
            defaultUnlockedLevels: {
                1: true,
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
      

      if (otpInput) otpInput.value = "";
      const usernameInput = document.getElementById("arcadeUsername");
      if (usernameInput) {
        usernameInput.value = "";
        usernameInput.readOnly = false;
        usernameInput.style.display = "block";
        

        const usernameDisplay = usernameInput.closest(".input-group")?.querySelector(".username-display");
        if (usernameDisplay) {
          usernameDisplay.remove();
        }
        

        if (otpInput && otp) {
          otpInput.value = otp;
          setTimeout(() => usernameInput.focus(), 300);
        }
      }
      

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

    const baseUrl = window.location.origin + window.location.pathname;
    const joinUrl = `${baseUrl}#join=${otp}`;
    

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
        

        document.dispatchEvent(new CustomEvent('userStatusChanged', { 
          detail: { status: status } 
        }));
      } else {
        userTierText.classList.add('unregistered');
        userTierText.textContent = 'Unregistered';
        userProfileSection.style.display = 'none';
        

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
        .channel('user-status-' + currentUser.id)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_profiles',
            filter: `id=eq.${currentUser.id}`
        }, 
        payload => {
            console.log('Profile update received:', payload.new);
            if (payload.new && payload.new.status) {
                updateUserStatusDisplay(payload.new.status);
                

                if (payload.new.status === 'premium') {
                    showPremiumCelebration();
                }
            }
        })
        .subscribe(status => {
            console.log('Subscription status:', status);
        });

    return subscription;
}

function checkUpgradeStatus() {
    const userStatus = currentUser ? currentUser.status : "unregistered";
    

    if (userStatus === "premium") return true;
    

    const userIdentifier = currentUser ? `upgradeRequested_${currentUser.id}` : 'upgradeRequested_guest';
    

    const upgradeRequested = localStorage.getItem(userIdentifier);
    


    if (!sessionStorage.getItem('upgradePromptShownThisSession')) {
      sessionStorage.setItem('upgradePromptShownThisSession', 'true');
      return false;
    }
    

    return !!upgradeRequested;
  }

  function showUpgradeScreen() {

    if (currentUser && currentUser.status === 'premium') {
        console.log("User is already premium, no need to show upgrade screen");

        showNotification("You already have premium access!", "info");
        return;
    }
    

    if (currentUser && localStorage.getItem(`upgradeRequested_${currentUser.id}`)) {
        hideUpgradePromptAndContinue();
        return;
    }
    
    console.log("Showing upgrade screen to", currentUser ? currentUser.status : "unregistered user");
    

    showScreen('upgrade-screen');
}

function showUpgradePrompt(callback) {

    if (currentUser && currentUser.status === 'premium') {
        console.log("User is premium, skipping upgrade prompt");

        if (callback) callback();
        return true;
    }
    
    console.log("Showing upgrade prompt");
    

    const gameContext = {
      stage: gameState.currentStage,
      set: gameState.currentSet,
      level: gameState.currentLevel,
      timestamp: Date.now()
    };
    localStorage.setItem("gameContext", JSON.stringify(gameContext));
    

    showScreen("upgrade-screen");
    

    if (typeof callback === 'function') {
      window.upgradeCallback = callback;
    }
    
    return false;
}


function addUpgradeTracing() {

    const originalShowUpgradeScreen = window.showUpgradeScreen;
    const originalShowUpgradePrompt = window.showUpgradePrompt;
    

    window.showUpgradeScreen = function() {
        console.group("Upgrade Screen Trace");
        console.log("showUpgradeScreen called with user status:", currentUser?.status || "unregistered");
        console.trace("Call stack for showUpgradeScreen");
        console.groupEnd();
        

        return originalShowUpgradeScreen.apply(this, arguments);
    };
    

    window.showUpgradePrompt = function() {
        console.group("Upgrade Prompt Trace");
        console.log("showUpgradePrompt called with user status:", currentUser?.status || "unregistered");
        console.trace("Call stack for showUpgradePrompt");
        console.groupEnd();
        

        return originalShowUpgradePrompt.apply(this, arguments);
    };
    
    console.log("Upgrade function tracing enabled");
}


document.addEventListener('DOMContentLoaded', function() {
    setTimeout(addUpgradeTracing, 1000);
});

function handleUpgradeButtonClick(event) {
    console.log("Upgrade button clicked directly");
    


    if (event) {
      event.preventDefault();
    }
    

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

    document.querySelectorAll('.upgrade-confirmation-popup, .confirmation-popup').forEach(popup => popup.remove());
    

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
    

    popupOverlay.appendChild(popupContent);
    document.body.appendChild(popupOverlay);
    

    setTimeout(() => {
      const continueButton = document.getElementById('upgrade-continue-button');
      
      if (continueButton) {
        console.log("Adding event listener to continue button");
        

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
    

    localStorage.removeItem("gameContext");
    

    hideUpgradePromptAndContinue();
    showScreen("welcome-screen");
    
    console.log("Upgrade process completed, redirected to welcome screen");
  }

  function showPremiumCelebration() {

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
    

    document.body.appendChild(celebrationOverlay);
    

    setTimeout(() => {
        celebrationOverlay.classList.add('show');
    }, 100);
}

async function safeUpsertRecord(table, data, keyField = 'user_id') {
    try {

      const { data: existingData, error: checkError } = await supabaseClient
        .from(table)
        .select(keyField)
        .eq(keyField, data[keyField])
        .single();
      
      if (checkError && checkError.code === "PGRST116") {

        const { error: insertError } = await supabaseClient
          .from(table)
          .insert([data]);
        
        if (insertError) {

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

        const { data, error } = await supabaseClient
            .from("game_progress")
            .select("*")
            .eq("user_id", currentUser.id)
            .single();
            
        if (error) {
            console.error("Error checking database schema:", error);
            return false;
        }
        

        const missingCompletedLevels = !('completed_levels' in data);
        const missingPerfectLevels = !('perfect_levels' in data);
        
        if (!missingCompletedLevels && !missingPerfectLevels) {
            console.log("Database schema is up to date");
            return true;
        }
        
        console.log("Adding missing columns to database schema");
        

        const updateData = {
            user_id: currentUser.id,
            stage: data.stage || 1,
            set_number: data.set_number || 1,
            level: data.level || 1
        };
        

        if ('coins' in data) updateData.coins = data.coins || 0;
        if ('unlocked_sets' in data) updateData.unlocked_sets = data.unlocked_sets || {};
        if ('unlocked_levels' in data) updateData.unlocked_levels = data.unlocked_levels || {};
        

        if (missingCompletedLevels) updateData.completed_levels = [];
        if (missingPerfectLevels) updateData.perfect_levels = [];
        

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

async function loadUserGameProgress() {
  console.log("Loading user game progress...");
  
  let progress = null;
  

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
      

      gameState.unlockedPerks = new Set(progress.unlocked_perks || []);
      

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
      
      console.log("Game progress loaded successfully", {
          stage: gameState.currentStage,
          set: gameState.currentSet,
          level: gameState.currentLevel,
          coins: gameState.coins,
          perks: gameState.perks,
          unlockedPerks: Array.from(gameState.unlockedPerks || [])
      });
      
      return true;
  }
  
  console.log("No saved progress found");
  return false;
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

        const { data, error } = await supabaseClient
            .from("game_progress")
            .select("*")
            .eq("user_id", currentUser.id)
            .single();
            
        if (error) {
            if (error.code === "PGRST116") {

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
        

        let needsUpdate = false;
        const updateData = { ...data };
        

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
    

    if (progress.unlocked_sets) {
        console.log("Updating unlocked sets from:", progress.unlocked_sets);
        gameState.unlockedSets = {};
        Object.entries(progress.unlocked_sets).forEach(([stage, sets]) => {
            gameState.unlockedSets[stage] = new Set(Array.isArray(sets) ? sets : []);
        });
    }
    

    if (progress.unlocked_levels) {
        console.log("Updating unlocked levels from saved data");
        gameState.unlockedLevels = {};
        Object.entries(progress.unlocked_levels).forEach(([setKey, levels]) => {
            gameState.unlockedLevels[setKey] = new Set(Array.isArray(levels) ? levels : []);
        });
    }
    

    if (progress.completed_levels) {
        console.log("Updating completed levels from saved data");
        gameState.completedLevels = new Set(progress.completed_levels);
    }
    

    if (progress.perfect_levels) {
        console.log("Updating perfect levels from saved data");
        gameState.perfectLevels = new Set(progress.perfect_levels);
    }
}

document.addEventListener('DOMContentLoaded', function() {

    initAccessibilityMenu();
    setupFormKeyboardNavigation();
});

function initAccessibilityMenu() {

    const toggleButton = document.querySelector('.accessibility-toggle');
    const modal = document.querySelector('.accessibility-modal');
    const closeButton = document.querySelector('.close-accessibility');
    

    loadAccessibilitySettings();
    

    if (toggleButton && modal) {
        toggleButton.addEventListener('click', function() {
            modal.classList.add('show');
        });
    }
    

    if (closeButton && modal) {
        closeButton.addEventListener('click', function() {
            modal.classList.remove('show');
        });
        

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
    

    const accessibilityButtons = document.querySelectorAll('.accessibility-button');
    accessibilityButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const value = this.getAttribute('data-value');
            
            applyAccessibilitySetting(action, value);
            

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
        

        if (settings.classNames) {
            body.className = settings.classNames;
        }
        

        if (settings.fontSize) {
            body.style.fontSize = settings.fontSize;
        }
        

        if (settings.fontScale) {
            body.style.setProperty('--font-scale', settings.fontScale);
        }
        

        updateActiveButtons();
    }
}

function updateActiveButtons() {
    const body = document.body;
    

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
    

    body.classList.remove(
        'high-contrast', 'inverted-colors', 'light-theme', 'dark-theme',
        'grayscale', 'dyslexic-font', 'increased-letter-spacing',
        'no-animations', 'reduced-animations', 'high-focus',
        'large-buttons', 'large-cursor'
    );
    

    body.style.fontSize = '';
    body.style.removeProperty('--font-scale');
    

    document.querySelectorAll('.accessibility-button.active').forEach(button => {
        button.classList.remove('active');
    });
    

    document.querySelector('[data-action="contrast"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="theme"][data-value="default"]')?.classList.add('active');
    document.querySelector('[data-action="saturation"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="fontFamily"][data-value="default"]')?.classList.add('active');
    document.querySelector('[data-action="letterSpacing"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="animations"][data-value="enabled"]')?.classList.add('active');
    document.querySelector('[data-action="focus"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="buttonSize"][data-value="normal"]')?.classList.add('active');
    document.querySelector('[data-action="cursorSize"][data-value="normal"]')?.classList.add('active');
    

    localStorage.removeItem('accessibilitySettings');
}

function animateNumber(element, start, end, duration = 500) {

    start = Number(start);
    end = Number(end);
    

    if (start === end) {
        element.textContent = end;
        return;
    }

    const difference = end - start;
    const frames = 30;
    const step = difference / frames;
    let current = start;
    let frameCount = 0;
    

    element.classList.add("animating");
    
    function updateNumber() {
        current += step;
        frameCount++;
        

        if (frameCount >= frames || 
            (step > 0 && current >= end) || 
            (step < 0 && current <= end)) {
            element.textContent = Math.round(end);
            

            setTimeout(() => {
                element.style.color = "var(--text)";
                element.classList.remove("animating");
            }, 300);
            
            return;
        }
        
        element.textContent = Math.round(current);
        

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

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    

    let particleConfig;
    let colors;
    
    if (type) {

        particleConfig = {
            count: isMobile ? 8 : 15,
            size: 8,
            distance: isMobile ? 50 : 100,
            opacity: isMobile ? 0.7 : 1,
            duration: isMobile ? 800 : 1000
        };
        
        colors = type === 'blessing' ? 
            ['#3498db', '#2980b9', '#1abc9c'] : 
            ['#e74c3c', '#c0392b', '#d35400'];
    } else {

        particleConfig = isMobile 
            ? {
                count: 10,
                size: 6,
                distance: 50,
                opacity: 0.7,
                duration: 1000
            }
            : {
                count: 40,
                size: 10,
                distance: 150,
                opacity: 1,
                duration: 1500
            };
            
        colors = ['#ffd700', '#FFA500', '#4CAF50', '#FFD700'];
    }

    const container = document.body;
    
    for (let i = 0; i < particleConfig.count; i++) {
        const particle = document.createElement('div');
        particle.className = type ? `particle ${type}` : 'particle';
        

        const size = type ? Math.random() * 8 + 4 : particleConfig.size;
        const angle = (Math.random() * Math.PI * 2);
        const distance = particleConfig.distance + (Math.random() * 50);
        

        particle.style.position = 'fixed';
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.opacity = `${particleConfig.opacity}`;
        

        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        if (type) {

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

            particle.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
            particle.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
            

            particle.style.animation = `particleBurst ${particleConfig.duration / 1000}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
            
            container.appendChild(particle);
            

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
    

    setTimeout(() => notification.classList.add('show'), 10);
    

    setTimeout(() => {
        notification.classList.remove('show');

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
    

    setTimeout(() => notification.classList.add('show'), 10);
    

    setTimeout(() => {
        notification.classList.remove('show');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

function toggleFullScreen() {
    const root = document.documentElement;
    

    const fullscreenIcon = document.querySelector('#nav-fullscreen-btn i') || 
                          document.querySelector('.vertical-nav-container .fullscreen-button i');
    
    if (document.fullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
                if (fullscreenIcon) {

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

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {

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
        

        if (avatarButton) {

            avatarButton.classList.remove('status-unregistered', 'status-free', 'status-pending', 'status-premium');
            

            avatarButton.classList.add('status-free');
            

            const avatarIcon = avatarButton.querySelector('i');
            if (avatarIcon) {
                avatarIcon.className = 'fas fa-user-check';
            }
        }
        

        if (userEmailElement) {
            userEmailElement.textContent = currentUser.user_metadata?.username || currentUser.email;
        }
        

        if (currentUser.id) {
            supabaseClient
                .from('user_profiles')
                .select('status, username')
                .eq('id', currentUser.id)
                .single()
                .then(({ data }) => {
                    if (data) {

                        if (data.username && userEmailElement) {
                            userEmailElement.textContent = data.username;
                        }
                        

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
        

        if (typeof updateUserStats === 'function') {
            updateUserStats();
        }
    } else {

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
        

        if (avatarButton) {
            avatarButton.classList.remove('status-free', 'status-premium', 'status-pending');
            avatarButton.classList.add('status-unregistered');
            

            const avatarIcon = avatarButton.querySelector('i');
            if (avatarIcon) {
                avatarIcon.className = 'fas fa-user';
            }
        }
        

        if (userEmailElement) {
            userEmailElement.textContent = '';
        }
        
    }
}

document.addEventListener('DOMContentLoaded', function() {

    

    const avatarButton = document.getElementById('login-avatar-btn');
    if (avatarButton) {

        avatarButton.classList.add('status-unregistered');
        

        avatarButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleAvatarButtonClick();
        });
        

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
        

        if (typeof updateAuthUI === 'function') {
            updateAuthUI();
        }
    }
});


function handleAvatarButtonClick() {
  console.log("Avatar button clicked");
  


  if (currentUser) {
    openProfileModal();
  } else {
    showAuthModal();
  }
}


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


    const upgradeScreen = document.getElementById("upgrade-screen");
    if (upgradeScreen) {
        upgradeScreen.classList.remove("visible");
    }


    const upgradeForm = document.getElementById("upgradeForm");
    if (upgradeForm) {
        upgradeForm.reset();
    }


    const currentLevel = gameState.currentLevel;
    

    localStorage.removeItem("gameContext");
    

    if (typeof hideUpgradePromptAndContinue === 'function') {
        hideUpgradePromptAndContinue();
    }
    

    showScreen("welcome-screen");
    

    if (currentLevel && false) {
        console.log(`Resuming gameplay at level ${currentLevel}`);
        setTimeout(() => {

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
        

        const completedStage = localStorage.getItem("unlockNextSetForStage");
        if (completedStage) {
            const stageNum = parseInt(completedStage, 10);
            if (!isNaN(stageNum) && stageNum >= 2 && stageNum <= 5) {
                console.log(`Unlocking set 2 for previously completed stage ${stageNum}`);
                

                gameState.unlockedSets[stageNum] = gameState.unlockedSets[stageNum] || new Set();
                

                gameState.unlockedSets[stageNum].add(2);
                

                const setKey = `${stageNum}_2`;
                gameState.unlockedLevels[setKey] = gameState.unlockedLevels[setKey] || new Set();
                

                gameState.unlockedLevels[setKey].add(1);
                

                if (typeof saveProgress === 'function') {
                    saveProgress();
                }
                

                localStorage.removeItem("unlockNextSetForStage");
            }
        }
        
        setTimeout(() => {
            overlay.remove();

            showScreen('welcome-screen');
        }, 500);
    }
}

function setupDefaultUnlocks() {
    console.log('Setting up default unlocks...');
    console.log('Before setup:', gameState.unlockedSets, gameState.unlockedLevels);
    

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


    for (let stage = 2; stage <= 5; stage++) {
        if (!gameState.unlockedSets[stage]) {
            gameState.unlockedSets[stage] = new Set([1]);
        }
        const setKey = `${stage}_1`;
        if (!gameState.unlockedLevels[setKey]) {
            gameState.unlockedLevels[setKey] = new Set([1]);
        }
    }
    


    Object.entries(gameState.unlockedLevels).forEach(([setKey, levels]) => {
        const maxLevel = Math.max(...Array.from(levels));
        for (let i = 1; i < maxLevel; i++) {
            levels.add(i);
        }
    });
    
    console.log('After setup:', gameState.unlockedSets, gameState.unlockedLevels);
}


function optimizeQuestionScreenForMobile() {
    var questionScreen = document.getElementById("question-screen");
    if (questionScreen && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {

        questionScreen.classList.add("mobile-optimized");
        

        if (!document.body.classList.contains("reduced-animations")) {
            let buttons = questionScreen.querySelectorAll(".buttons button");
            buttons.forEach(button => {
                button.style.transition = "transform 0.15s, background-color 0.2s";
            });
        }
        

        let progressCircle = questionScreen.querySelector(".progress-circle");
        if (progressCircle) {
            progressCircle.style.margin = "0.5rem auto";
        }
        
        console.log("Mobile optimizations applied to question screen");
    }
}


async function updateWordPracticeHistory(word, gameMode, coinsEarned = 0) {
    if (!currentUser || !word) {
        console.log("Missing user or word, skipping word history update");
        return false;
    }
    
    try {
        console.log(`Updating word practice history for word: ${word}, mode: ${gameMode}`);
        

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
        

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching word history:", error);
          

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
    const progressCircle = document.querySelector('.progress-circle');
    if (!progressCircle) return;
    

    const rect = progressCircle.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    

    for (let i = 0; i < 40; i++) {
        const particle = document.createElement('div');
        particle.className = 'resurrection-particle';
        

        const angle = Math.random() * Math.PI * 2;
        const distance = 100 + Math.random() * 150;
        const duration = 1 + Math.random() * 1.5;
        const delay = Math.random() * 0.5;
        const size = 3 + Math.random() * 7;
        

        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance;
        

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
        

        particle.style.setProperty('--end-x', `${endX}px`);
        particle.style.setProperty('--end-y', `${endY}px`);
        
        document.body.appendChild(particle);
        

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


document.addEventListener('DOMContentLoaded', () => {
    updateSidePanelLink();
});

function showReviveOverlay() {

  clearTimer();
  

  const coinsContainer = document.querySelector('.coins-container');
  if (coinsContainer) {
      window.originalCoinsHTML = coinsContainer.innerHTML;
      

      coinsContainer.innerHTML = `
          <div class="ankh-container">
              <div class="ankh-symbol">☥</div>
              <div class="revive-timer">5</div>
          </div>
      `;
      coinsContainer.classList.add('resurrection-mode');
  }
  

  const questionScreen = document.getElementById('question-screen');
  if (questionScreen) {

      window.originalQuestionBackground = questionScreen.style.background;
      

      questionScreen.style.transition = 'background 2s ease';
      

      void questionScreen.offsetWidth;
      

      questionScreen.style.background = '#000000';
  }
  

  const questionWord = document.getElementById('question-word');
  if (questionWord) {
      window.originalQuestionWord = questionWord.innerHTML;
      questionWord.innerHTML = `<span class="revive-title">Revive?</span>`;
      questionWord.classList.add('revive-question');
  }
  

  const buttonsContainer = document.querySelector('.buttons');
  if (buttonsContainer) {

      window.originalButtonsHTML = buttonsContainer.innerHTML;
      

      buttonsContainer.innerHTML = `
          <button class="game-btn revive-button">
              <span>Continue Playing</span>
          </button>
          <button class="game-btn home-button resurrection-home-button">
              <span>Return to Menu</span>
          </button>
      `;
  }
  

  const progressCircle = document.querySelector('.progress-circle');
  if (progressCircle) {
      progressCircle.classList.add('resurrection-ready');
  }
  

  let seconds = 5;
  const timerDisplay = document.querySelector('.revive-timer');
  
  const countdownInterval = setInterval(() => {
      seconds--;
      if (timerDisplay) {
          timerDisplay.textContent = seconds;
      }
      
      if (seconds <= 0) {
          clearInterval(countdownInterval);
          handleReviveTimeout();
      }
  }, 1000);
  

  const reviveButton = document.querySelector('.revive-button');
  if (reviveButton) {
      reviveButton.onclick = () => {
          clearInterval(countdownInterval);
          handleRevive();
      };
  }
  

  const homeButton = document.querySelector('.resurrection-home-button');
  if (homeButton) {
      homeButton.onclick = () => {
          clearInterval(countdownInterval);
          handleReviveTimeout();
      };
  }
  

  window.reviveCountdownInterval = countdownInterval;
}


document.addEventListener('DOMContentLoaded', function() {

  const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
              const target = mutation.target;
              

              if (target.classList.contains('resurrection-ready') || 
                  target.classList.contains('resurrection-mode')) {
                  

                  if (window.innerWidth <= 768) {

                      const questionWord = document.getElementById('question-word');
                      if (questionWord) {
                          setTimeout(() => {
                              questionWord.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'center'
                              });
                          }, 300);
                      }
                      

                      const buttons = document.querySelectorAll('.revive-button, .resurrection-home-button');
                      buttons.forEach(button => {
                          button.style.touchAction = 'manipulation';
                          button.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
                      });
                  }
              }
          }
      });
  });
  

  observer.observe(document.body, { 
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
  });
});

function handleReviveTimeout() {
  console.log("Revive timeout - returning to welcome screen");
  

  if (window.reviveCountdownInterval) {
      clearInterval(window.reviveCountdownInterval);
      window.reviveCountdownInterval = null;
  }
  

  if (currentGame) {
      currentGame.active = false;
  }
  

  localStorage.removeItem("gameContext");
  

  const questionScreen = document.getElementById('question-screen');
  if (questionScreen) {
      questionScreen.style.transition = 'none';
      questionScreen.style.background = window.originalQuestionBackground || '';
  }
  

  const coinsContainer = document.querySelector('.coins-container');
  if (coinsContainer && window.originalCoinsHTML) {
      coinsContainer.innerHTML = window.originalCoinsHTML;
      coinsContainer.classList.remove('resurrection-mode');
  }
  
  const progressCircle = document.querySelector('.progress-circle');
  if (progressCircle) {
      progressCircle.classList.remove('resurrection-ready', 'resurrection-active');
  }
  
  const questionWord = document.getElementById('question-word');
  if (questionWord && window.originalQuestionWord !== undefined) {
      questionWord.innerHTML = window.originalQuestionWord;
      questionWord.classList.remove('revive-question');
  }
  

  window.originalQuestionBackground = undefined;
  window.originalQuestionWord = undefined;
  window.originalCoinsHTML = undefined;
  window.originalButtonsHTML = undefined;
  

  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {

      welcomeScreen.style.background = '';
  }
  

  window.preventAutoResume = true;
  

  setTimeout(() => {
      showScreen('welcome-screen');
      

      if (questionScreen) {
          setTimeout(() => {
              questionScreen.style.transition = '';
          }, 50);
      }
      
      console.log("Navigation to welcome screen completed");
  }, 50);
}

function restoreGameUI() {

  const questionScreen = document.getElementById('question-screen');
  if (questionScreen && window.originalQuestionBackground !== undefined) {

      questionScreen.style.transition = 'background 2s ease';
      

      questionScreen.style.background = window.originalQuestionBackground;
      

      setTimeout(() => {
          questionScreen.style.transition = '';
          window.originalQuestionBackground = undefined;
      }, 2000);
  }
  

  const questionWord = document.getElementById('question-word');
  if (questionWord && window.originalQuestionWord !== undefined) {
      questionWord.innerHTML = window.originalQuestionWord;
      questionWord.classList.remove('revive-question');
      window.originalQuestionWord = undefined;
  }
  

  const coinsContainer = document.querySelector('.coins-container');
  if (coinsContainer && window.originalCoinsHTML) {
      coinsContainer.innerHTML = window.originalCoinsHTML;
      coinsContainer.classList.remove('resurrection-mode');
      window.originalCoinsHTML = undefined;
  }
  

  const buttonsContainer = document.querySelector('.buttons');
  if (buttonsContainer && window.originalButtonsHTML) {
      buttonsContainer.style.opacity = '1';
      buttonsContainer.innerHTML = window.originalButtonsHTML;
      window.originalButtonsHTML = undefined;
  }
  

  const progressCircle = document.querySelector('.progress-circle');
  if (progressCircle) {
      progressCircle.classList.remove('resurrection-ready', 'resurrection-active');
      
      const progress = progressCircle.querySelector('.progress');
      if (progress) {
          progress.style.transition = '';
          progress.style.stroke = '';
          progress.style.strokeDashoffset = '';
          progress.style.zIndex = '';
      }
  }
}

function handleRevive() {

  const progressCircle = document.querySelector('.progress-circle');
  const progress = progressCircle ? progressCircle.querySelector('.progress') : null;
  const coinsContainer = document.querySelector('.coins-container');
  const questionWord = document.getElementById('question-word');
  const buttonsContainer = document.querySelector('.buttons');
  

  if (window.reviveCountdownInterval) {
      clearInterval(window.reviveCountdownInterval);
      window.reviveCountdownInterval = null;
  }
  
  if (progressCircle && coinsContainer && questionWord) {

      questionWord.innerHTML = `<span class="revive-title">Reviving...</span>`;
      

      if (buttonsContainer) {
          buttonsContainer.style.opacity = '0';
      }
      

      coinsContainer.innerHTML = `
          <div class="ankh-container">
              <div class="ankh-symbol resurrection-ankh">☥</div>
          </div>
      `;
      

      progressCircle.classList.add('resurrection-active');
      

      const originalStroke = progress.style.stroke;
      const originalDashOffset = progress.style.strokeDashoffset;
      

      const circumference = 2 * Math.PI * 54;
      progress.style.strokeDasharray = `${circumference} ${circumference}`;
      progress.style.strokeDashoffset = circumference;
      progress.style.stroke = '#FFD700';
      progress.style.zIndex = '10';
      

      createResurrectionParticles();
      

      setTimeout(() => {
          progress.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1)';
          progress.style.strokeDashoffset = '0';
      }, 100);
      

      setTimeout(() => {

          restoreGameUI();
          

          currentGame.wrongStreak = 0;
          timeRemaining = currentGame.initialTimeRemaining;
          

          if (currentGame.isCustomPractice) {
              startCustomLevel(currentGame.customLevel);
          } else {
              startLevel(gameState.currentLevel);
          }
      }, 2500);
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

    if (stageId > 2 && (!currentUser || currentUser.status !== 'premium')) {
        return 'Premium Feature';
    }
    

    return `${completedSets}/${totalSets} Sets Completed`;
}

function showBossDefeatEffect() {
    console.log('Starting boss defeat effect sequence');
    
    if (currentGame.bossDefeatedEffectShown) {
        console.log('Boss defeat effect already shown, skipping');
        return;
    }
    

    window.bossVictoryAnimationInProgress = true;
    


    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (stage && stage.bossLevel) {
        const bossLevelId = stage.bossLevel;
        const levelKey = `${gameState.currentStage}_${gameState.currentSet}_${bossLevelId}`;
        
        console.log(`Marking boss level as completed: ${levelKey}`);
        

        gameState.completedLevels.add(levelKey);
        

        updateStageCompletionStats();
        updateStageCompletionCounters();
        

        saveProgress();
    } else {
        console.error("Could not find boss level configuration");
    }
    

    currentGame.bossDefeatedEffectShown = true;
    

    const originalCoins = gameState.coins;
    const targetCoins = originalCoins + 100;
    

    currentGame.bossRewardApplied = true;
    

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
    

    setTimeout(() => {
        const bossOrb = document.querySelector('.boss-orb-inner');
        
        if (bossOrb) {
            console.log('Disintegrating boss orb');
            
            const incinerationEffect = document.createElement('div');
            incinerationEffect.className = 'incineration-effect';
            bossOrb.appendChild(incinerationEffect);
            
            bossOrb.style.animation = 'boss-shrink 2.5s forwards';
            

            setTimeout(() => {
                console.log('Applying coin reward animation');
                
                const coinsContainer = document.querySelector('.coins-container');
                
                if (coinsContainer && window.originalCoinsHTML) {

                    coinsContainer.innerHTML = window.originalCoinsHTML;
                    

                    document.querySelectorAll('.coin-count').forEach(el => {
                        el.dataset.protectedValue = 'true';
                        el.textContent = originalCoins;
                    });
                    
                    const coinIcon = coinsContainer.querySelector('.coin-icon');
                    const coinCount = coinsContainer.querySelector('.coin-count');
                    
                    if (coinCount) {

                        coinsContainer.style.transform = 'scale(1.2)';
                        coinsContainer.style.transition = 'transform 0.3s ease';
                        

                        const steps = 60;
                        const stepDelay = 2000 / steps;
                        let currentStep = 0;
                        
                        const animateCoins = () => {
                            if (currentStep <= steps) {
                                const progress = currentStep / steps;
                                const currentValue = Math.round(originalCoins + (targetCoins - originalCoins) * progress);
                                

                                document.querySelectorAll('.coin-count').forEach(el => {
                                    el.textContent = currentValue;
                                    el.style.color = 'var(--gold)';
                                    el.style.textShadow = '0 0 10px var(--gold)';
                                });
                                
                                currentStep++;
                                setTimeout(animateCoins, stepDelay);
                            } else {

                                gameState.coins = targetCoins;
                                saveProgress();
                                

                                document.querySelectorAll('.coin-count').forEach(el => {
                                    el.textContent = targetCoins;
                                    delete el.dataset.protectedValue;
                                });
                                

                                setTimeout(() => {
                                    document.querySelectorAll('.coin-count').forEach(el => {
                                        el.style.color = '';
                                        el.style.textShadow = '';
                                    });
                                    coinsContainer.style.transform = 'scale(1)';
                                }, 1000);
                            }
                        };
                        

                        animateCoins();
                        

                        if (coinIcon) {
                            coinIcon.classList.add('coin-pulse');
                            coinIcon.style.animation = 'coinPulse 0.5s ease-in-out 6';
                        }
                    }
                }
            }, 500);
            

            setTimeout(() => {
                console.log('Showing victory notification');
                

                showBossVictoryNotification(false);
            }, 5000);
        } else {
            setTimeout(() => {
                showBossVictoryNotification(false);
            }, 3000);
        }
    }, 1000);


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


window.refreshSetsDisplay = function() {
    console.log("Forcing refresh of sets display");
    

    addGoldShineStyles();
    

    gameStructure.stages.forEach(stage => {
        populateSetsGrid(stage.id);
    });
    

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

      showAuthModal();

      setTimeout(() => {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        if (loginForm && signupForm) {
          loginForm.classList.add('hidden');
          signupForm.classList.remove('hidden');
        }
      }, 100);
    } else if (currentUser.status === 'premium') {

      showNotification("You're already enjoying premium access! Thank you for your support!", "success");
    } else {

      localStorage.removeItem(`upgradeRequested_${currentUser.id}`);
      showUpgradePrompt();
    }
  }


function hideCrownIconsForPremiumUsers() {

    if (!currentUser || currentUser.status !== 'premium') return;
    
    console.log("Hiding crown icons for premium user");
    

    const crownIcons = document.querySelectorAll('.fa-crown');
    
    crownIcons.forEach(crown => {

      let container = crown;
      let depth = 0;
      const maxDepth = 5;
      

      while (depth < maxDepth && container && container.tagName !== 'BODY') {

        if (container.classList.contains('premium-item') || 
            container.classList.contains('premium-feature') ||
            container.id === 'premium-menu-item' ||
            container.classList.contains('premium-crown') ||
            container.getAttribute('onclick')?.includes('upgrade') ||
            container.getAttribute('data-feature') === 'premium') {
          

          container.style.display = 'none';
          console.log("Hidden premium container:", container);
          break;
        }
        

        container = container.parentElement;
        depth++;
      }
      

      if (depth >= maxDepth || !container || container.tagName === 'BODY') {

        crown.style.pointerEvents = 'none';

        crown.style.opacity = '0.5';
        console.log("Disabled individual crown icon");
      }
    });
  }
  

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(hideCrownIconsForPremiumUsers, 1000);
    

    setInterval(hideCrownIconsForPremiumUsers, 5000);
  });
  

  document.addEventListener('userStatusChanged', function(event) {
    setTimeout(hideCrownIconsForPremiumUsers, 100);
  });


document.addEventListener('DOMContentLoaded', function() {

    document.querySelectorAll('.fa-crown').forEach(crown => {
        crown.addEventListener('click', handleCrownClick);
    });
    

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
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
            e.stopPropagation();
        });
    });
}



document.addEventListener('DOMContentLoaded', () => {

    ensureScreenExists('stage-cascade-screen');
    

    updateSidePanelLinks();
    

    initializeStageCascadeScreen();
});


function initializeStageCascadeScreen() {
    const screen = document.getElementById('stage-cascade-screen');
    if (!screen.querySelector('.stages-container')) {
        const container = document.createElement('div');
        container.className = 'stages-container';
        screen.appendChild(container);
    }
}

const SessionManager = {
    maxInactiveTime: 30 * 60 * 1000,
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
        

        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            const qrLanding = document.getElementById('qr-landing');
            const codeDisplay = qrLanding.querySelector('.game-code-display');
            

            document.querySelectorAll('.screen').forEach(screen => {
                screen.style.display = 'none';
            });
            

            qrLanding.style.display = 'flex';
            codeDisplay.textContent = otp;
            

            qrLanding.dataset.otp = otp;
        } else {

            history.pushState("", document.title, window.location.pathname);
            showJoinModal(otp);
        }
    }
}

function updateUI() {

    requestAnimationFrame(() => {
        const fragment = document.createDocumentFragment();

        document.body.appendChild(fragment);
    });
}


function updateGuestPlayButton() {
    const guestPlayButton = document.querySelector('.guest-play-button');
    

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
    

    const parentInputs = parentSection.querySelectorAll('input');
    const adultInputs = adultSection.querySelectorAll('input');
    
    if (isAdult) {
        parentSection.style.display = 'none';
        adultSection.style.display = 'block';
        

        parentInputs.forEach(input => input.required = false);
        adultInputs.forEach(input => input.required = true);
    } else {
        parentSection.style.display = 'block';
        adultSection.style.display = 'none';
        

        parentInputs.forEach(input => input.required = true);
        adultInputs.forEach(input => input.required = false);
    }
}



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


window.debugUpgrade = function() {
  checkPopupStatus();
  console.log("Upgrade screen visible:", document.getElementById("upgrade-screen").classList.contains("visible"));
  console.log("Upgrade form:", document.getElementById("upgradeForm"));
  console.log("Current user:", currentUser);
};


function skipUpgrade() {
    console.log("Skip upgrade button clicked");
    

    if (currentUser && currentUser.id) {
      localStorage.setItem(`upgradeRequested_${currentUser.id}`, 'true');
    } else {
      localStorage.setItem('upgradeRequested_guest', 'true');
    }
    

    localStorage.removeItem("gameContext");
    

    document.getElementById('upgrade-screen').classList.remove('visible');
    

    const upgradeForm = document.getElementById("upgradeForm");
    if (upgradeForm) {
      upgradeForm.reset();
    }
    

    showScreen('welcome-screen');
}

function handleUpgradeSubmit(event) {
    console.log("Upgrade form submitted");
    

    if (event) {
      event.preventDefault();
    }
    

    if (currentUser && currentUser.id) {
      localStorage.setItem(`upgradeRequested_${currentUser.id}`, 'true');
    } else {
      localStorage.setItem('upgradeRequested_guest', 'true');
    }
    

    const form = document.getElementById('upgradeForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    

    console.log("Upgrade request data:", data);
    

    showNotification("Thanks for your interest! We'll contact you soon.", "success");
    

    if (currentUser && currentUser.id) {
      updateUserStatus("pending").then(() => {
        console.log("User status updated to pending");
      }).catch(error => {
        console.error("Failed to update user status:", error);
      });
    }
    

    document.getElementById('upgrade-screen').classList.remove('visible');
    

    showUpgradeConfirmation();
    


    console.log("Upgrade form closed, user can continue");
}

document.addEventListener('DOMContentLoaded', function() {

    const isAdultCheckbox = document.getElementById('isAdult');
    
    if (isAdultCheckbox) {
      isAdultCheckbox.checked = true;
      toggleParentFields();
      
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
      

      currentUser.status = status;
      
      return data;
    } catch (error) {
      console.error("Error updating user status:", error);
      return Promise.reject(error);
    }
  }

  function showUnregisteredWarning(callback) {

    if (window.unregisteredWarningShown) {
        if (callback) callback();
        return;
    }


    window.unregisteredWarningShown = true;


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


    document.body.appendChild(fullscreenPrompt);
    

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


    localStorage.setItem('upgradeRequested_guest', 'true');
    

    const gameContext = {
        stage: gameState.currentStage,
        set: gameState.currentSet,
        level: gameState.currentLevel,
        timestamp: Date.now()
    };
    localStorage.setItem("gameContext", JSON.stringify(gameContext));


    const skipButton = fullscreenPrompt.querySelector('.skip-signup-button');
    const signupButton = fullscreenPrompt.querySelector('.signup-now-button');
    
    skipButton.addEventListener('click', function() {

        document.body.removeChild(fullscreenPrompt);
        if (styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
        

        if (callback) {
            callback();
        }
    });
    
    signupButton.addEventListener('click', function() {

        document.body.removeChild(fullscreenPrompt);
        if (styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
        

        showScreen('welcome-screen');
        

        setTimeout(function() {
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.classList.add('show');
                

                const signupForm = document.getElementById('signupForm');
                const loginForm = document.getElementById('loginForm');
                if (signupForm && loginForm) {
                    signupForm.classList.remove('hidden');
                    loginForm.classList.add('hidden');
                }
            }
        }, 100);
    });
}

async function handleSignup() {
    const email = document.getElementById("signupEmail").value;
    const username = document.getElementById("signupUsername").value;
    const password = document.getElementById("signupPassword").value;
  
    if (email && username && password) {
      try {

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
        

        const { data: existingProgress, error: progressCheckError } = await supabaseClient
          .from("game_progress")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .single();
        

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

            console.error("Game progress initialization error:", insertProgressError);
          }
        }
        

        const { data: existingStats, error: statsCheckError } = await supabaseClient
          .from("player_stats")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .single();
        

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

            console.error("Player stats initialization error:", insertStatsError);
          }
        }
        

        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        });
        
        if (signInError) throw signInError;
        

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
        

        const storedContext = localStorage.getItem("gameContext");
        if (storedContext) {
          try {
            const context = JSON.parse(storedContext);

            if (context.stage && context.set && context.level) {
              gameState.currentStage = context.stage;
              gameState.currentSet = context.set;
              gameState.currentLevel = context.level;
              

              if (typeof window.signupCallback === 'function') {
                setTimeout(() => {
                  window.signupCallback();
                  window.signupCallback = null;
                }, 500);
              } else {

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
        

        localStorage.removeItem('gameContext');
        
        return true;
    }
    return false;
}



function navigateHome() {
    console.log('Navigating home with full refresh');
    saveProgress();
    window.location.reload(true);
}

function forceReload() {
    console.log('Force Reload Initiated');
    

    if (window.location) {
        window.location.href = window.location.href;
    }
    
    if (window.location.reload) {
        window.location.reload(true);
    }
    

    window.location.replace(window.location.pathname);
}


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
            

            const currentEntries = entriesContainer.children;
            const positions = {};
            
            Array.from(currentEntries).forEach(entry => {
                const username = entry.querySelector("[data-username]").dataset.username;
                positions[username] = entry.getBoundingClientRect();
            });
            

            entriesContainer.innerHTML = data.map((player, index) => `
                <div class="leaderboard-entry ${player.username === currentUser?.user_metadata?.username ? "you" : ""} ${index < 3 ? `rank-${index+1}` : ""}"
                     data-rank="${index+1}">
                    <div>${player.player_rank}</div>
                    <div data-username="${player.username}">${player.username || "Anonymous"}</div>
                    <div>${player.total_levels_completed}</div>
                    <div>${player.total_words_learned}</div>
                </div>
            `).join("");
            

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
        

        await updateLeaderboard();
        

        const pollInterval = setInterval(updateLeaderboard, 10000);
        

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

        if (leaderboardScreen.dataset.channel) {
            supabaseClient.removeChannel(leaderboardScreen.dataset.channel);
            delete leaderboardScreen.dataset.channel;
        }

        if (leaderboardScreen.dataset.pollInterval) {
            clearInterval(parseInt(leaderboardScreen.dataset.pollInterval));
            delete leaderboardScreen.dataset.pollInterval;
        }
    }
}

async function updatePlayerStats(levelTime, mistakes, currentStreak) {
    if (currentUser && "premium" === currentUser.status) {
        try {

            const { data: currentStats, error: statsError } = 
                await supabaseClient.from("player_stats")
                    .select("*")
                    .eq("user_id", currentUser.id)
                    .single();

            if (statsError && statsError.code !== "PGRST116") throw statsError;


            const uniqueWords = [...new Set(currentGame.words)];
            const wordsToAdd = uniqueWords.length;


            const statsUpdate = {
                user_id: currentUser.id,
                total_levels_completed: (currentStats?.total_levels_completed || 0) + 1,
                unique_words_practiced: (currentStats?.unique_words_practiced || 0) + wordsToAdd,
                last_updated: new Date().toISOString()
            };


            const { error: upsertError } = 
                await supabaseClient.from("player_stats")
                    .upsert(statsUpdate, { onConflict: "user_id", returning: "minimal" });

            if (upsertError) throw upsertError;


            await WordsManager.updateWords(wordsToAdd);

        } catch (error) {
            console.error("Error updating player stats:", error);
        }
    }
}

function addAdminTestButton() {
    console.log("Checking for admin user...");
    

    const existingButton = document.getElementById("admin-test-button");
    if (existingButton) {
      existingButton.remove();
    }
    
    console.log("Current user:", currentUser ? currentUser.email : "No user");
    

    if (!currentUser || (currentUser.email !== "admin123@gmail.com" && !currentUser.email?.includes("admin123"))) {
      console.log("Not admin user, not adding button");
      return;
    }
    
    console.log("Admin user detected, adding test buttons");
    

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
    

    addAdminSkipButton();
  }


function isAdminUser() {
    return currentUser && currentUser.email === "admin123@gmail.com";
  }
  

  function addAdminSkipButton() {

    if (!isAdminUser()) return;
    

    const existingButton = document.getElementById("admin-skip-10-button");
    if (existingButton) existingButton.remove();
    

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
    

    skipButton.onclick = function() {
      console.log("Admin skip-10 button clicked");
      handleAdminSkip10();
    };
    

    const questionScreen = document.getElementById("question-screen");
    if (questionScreen) {
      questionScreen.appendChild(skipButton);
    }
  }
  

  function handleAdminSkip10() {

    if (!isAdminUser()) return;
    

    if (!currentGame || !currentGame.words || !currentGame.words.length) {
      console.error("No active game found");
      return;
    }
    

    const skipCount = Math.min(10, currentGame.words.length - currentGame.currentIndex);
    console.log(`Skipping ${skipCount} questions`);
    

    if (currentGame.isBossLevel) {


      currentGame.currentIndex = Math.max(0, currentGame.words.length - 1);
      updateBossHealthBar();
      loadNextBossQuestion();
      showNotification(`Boss almost defeated! One more hit!`, "success");
      return;
    }
    

    currentGame.currentIndex += skipCount;
    

    if (currentGame.currentIndex >= currentGame.words.length) {
      handleLevelCompletion();
      return;
    }
    

    updateProgressCircle();
    loadNextQuestion();
    showNotification(`Skipped ${skipCount} questions!`, "success");
  }
  
  function createRainingParticles() {
    const questionScreen = document.getElementById('question-screen');
    if (!questionScreen) return;
    
    const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",..."אבגדהוזחטיכלמנסעפצקרשת"];
    const containerWidth = questionScreen.clientWidth;
    

    if (window.rainingLettersInterval) {
      clearInterval(window.rainingLettersInterval);
    }
    

    window.rainingLettersInterval = setInterval(() => {

      const count = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < count; i++) {
        const letter = document.createElement('div');
        letter.className = 'raining-letter';
        letter.textContent = letters[Math.floor(Math.random() * letters.length)];
        

        const left = Math.random() * containerWidth;
        const duration = 5 + Math.random() * 5;
        
        letter.style.left = `${left}px`;
        letter.style.animationDuration = `${duration}s`;
        
        questionScreen.appendChild(letter);
        

        setTimeout(() => {
          if (letter.parentNode === questionScreen) {
            questionScreen.removeChild(letter);
          }
        }, duration * 1000);
      }
    }, 300);
  }
  
  function hideUpgradePromptAndContinue() {
    console.log("Hiding upgrade prompt and continuing gameplay");
    

    const upgradeScreen = document.getElementById("upgrade-screen");
    if (upgradeScreen) {
      upgradeScreen.classList.remove("visible");
    }
    

    const upgradeForm = document.getElementById("upgradeForm");
    if (upgradeForm) {
      upgradeForm.reset();
    }
    

    const confirmationOverlay = document.querySelector('.upgrade-confirmation-overlay');
    if (confirmationOverlay) {
      confirmationOverlay.remove();
    }
    

    document.querySelectorAll(".confirmation-popup").forEach(popup => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    });
    

    const gameContext = localStorage.getItem("gameContext");
    let destination = "welcome-screen";
    
    if (gameContext) {
      try {
        const context = JSON.parse(gameContext);
        console.log("Resuming from stored game context:", context);
        

        if (context.level) {

          if (typeof startLevel === 'function') {
            setTimeout(() => {
              startLevel(context.level);
              return;
            }, 100);
          } else if (context.screen && typeof showScreen === 'function') {

            destination = context.screen;
          }
        } else if (context.screen && typeof showScreen === 'function') {

          destination = context.screen;
        }
      } catch (e) {
        console.error("Error parsing game context:", e);
      }
    }
    

    if (typeof showScreen === 'function') {
      showScreen(destination);
    }
    


    if (destination !== "welcome-screen") {
      localStorage.removeItem("gameContext");
    }
  }


function setupUnregisteredUserInactivityWipe() {
    let inactivityTimer;
    const inactivityTimeout = 15000;
    let lastActivityTime = Date.now();
    

    function resetInactivityTimer() {

        lastActivityTime = Date.now();
        

        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }
        

        if (!currentUser) {
            inactivityTimer = setTimeout(checkInactivity, 30000);
        }
    }
    

    function checkInactivity() {
        const currentTime = Date.now();
        const inactiveTime = currentTime - lastActivityTime;
        

        if (inactiveTime >= inactivityTimeout && !currentUser) {
            console.log(`Unregistered user inactive for ${Math.floor(inactiveTime/60000)} minutes - wiping coins`);
            resetCoinsToZero();
        } else {

            inactivityTimer = setTimeout(checkInactivity, 30000);
        }
    }
    

    const activityEvents = [
        'mousedown', 'mousemove', 'keypress', 
        'scroll', 'touchstart', 'click', 'touchmove'
    ];
    
    activityEvents.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
    

    resetInactivityTimer();
    

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            const currentTime = Date.now();
            const inactiveTime = currentTime - lastActivityTime;
            

            if (inactiveTime >= inactivityTimeout && !currentUser) {
                console.log(`Tab inactive for ${Math.floor(inactiveTime/60000)} minutes - wiping coins`);
                resetCoinsToZero();
            }
            

            resetInactivityTimer();
        }
    });
}


document.addEventListener('DOMContentLoaded', function() {


    

    setupUnregisteredUserInactivityWipe();
    
    console.log("Unregistered user inactivity coin wipe setup complete (3 minute timeout)");
});





  document.addEventListener('DOMContentLoaded', function() {

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        const crowns = node.querySelectorAll('.fa-crown');
                        crowns.forEach(crown => {
                            crown.addEventListener('click', function(event) {
                                event.stopPropagation();

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

    const carouselButtons = document.querySelectorAll('.carousel-button');
    const descriptionElement = document.getElementById('carousel-description');
    
    carouselButtons.forEach(button => {
      if (button.id !== 'settings-toggle') {
        button.addEventListener('click', function() {

          carouselButtons.forEach(btn => btn.classList.remove('active'));
          this.classList.add('active');
          

          if (descriptionElement) {
            descriptionElement.textContent = this.getAttribute('data-description');
          }
          

          const action = this.getAttribute('data-action');
          if (action) {
            try {
              new Function(action)();
            } catch (e) {
              console.error('Error executing action:', e);
            }
          }
          

          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu && optionsMenu.classList.contains('show')) {
            optionsMenu.classList.remove('show');
          }
        });
      }
    });
    

    const settingsToggle = document.getElementById('settings-toggle');
    const optionsMenu = document.getElementById('options-menu');
    
    if (settingsToggle && optionsMenu) {
      settingsToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        optionsMenu.classList.toggle('show');
        

        if (optionsMenu.classList.contains('show')) {
          carouselButtons.forEach(btn => btn.classList.remove('active'));
          this.classList.add('active');
        }
      });
      

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

    function setupPremiumButton() {
      const premiumItem = document.querySelector('#premium-item');
      if (premiumItem) {

        const originalAction = premiumItem.getAttribute('onclick');
        premiumItem.removeAttribute('onclick');
        
        premiumItem.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Premium menu item clicked by', currentUser ? currentUser.status : 'unregistered user');
          

          showScreen('upgrade-screen');
          

          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu) {
            optionsMenu.classList.remove('show');
          }
        });
        
        console.log('Direct premium button handler set up');
      }
    }
    

    setupPremiumButton();
    

    document.addEventListener('menuRefreshed', setupPremiumButton);
    

    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function() {
        setTimeout(setupPremiumButton, 100);
      });
    }
  });


function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) {
        console.error("Profile modal element not found");
        return;
    }
    

    const usernameEl = document.getElementById('modal-username');
    if (usernameEl) {
        usernameEl.textContent = currentUser?.user_metadata?.username || 
                                currentUser?.email?.split('@')[0] || 
                                'Guest';
    }
    

    const statusEl = document.getElementById('modal-status');
    if (statusEl) {
        const status = currentUser?.status || 'free';
        

        statusEl.className = 'status-badge';
        

        statusEl.classList.add(status);
        

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
    

    const wordCountEl = document.getElementById('modal-word-count');
    const coinCountEl = document.getElementById('modal-coin-count');
    
    if (wordCountEl) {
        wordCountEl.textContent = document.getElementById('totalWords')?.textContent || '0';
    }
    
    if (coinCountEl) {
        coinCountEl.textContent = document.getElementById('totalCoins')?.textContent || '0';
    }
    

    modal.classList.add('show');
    

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


document.addEventListener('DOMContentLoaded', function() {

    const profileButton = document.querySelector('.menu-item[onclick="showScreen(\'user-stats-screen\')"]');
    if (profileButton) {
        profileButton.setAttribute('onclick', 'openProfileModal()');
        console.log("Profile button found and updated to open modal");
    } else {
        console.warn("Profile button not found in the menu");
    }
    

    const avatarButton = document.getElementById('login-avatar-btn');
    if (avatarButton) {
        avatarButton.onclick = function() {


            if (currentUser) {
                openProfileModal();
            } else {
                showAuthModal();
            }
        };
        console.log("Avatar button updated to handle profile/auth");
    }
});


(function() {

    document.addEventListener('DOMContentLoaded', function() {

      window.showAboutScreen = function() {
        console.log("Showing about screen");
        

        const existingOverlay = document.getElementById('simple-about-overlay');
        if (existingOverlay) {
          existingOverlay.remove();
        }
        

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
        

        document.body.appendChild(overlay);
        

        document.getElementById('about-close-btn').addEventListener('click', function() {
          overlay.remove();
        });
        

        document.addEventListener('keydown', function(event) {
          if (event.key === 'Escape') {
            overlay.remove();
          }
        });
      };
      

      function updateAboutButton() {

        const aboutButton = document.querySelector('.menu-item i.fa-info-circle')?.closest('.menu-item');
        if (aboutButton) {
          aboutButton.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            

            const optionsMenu = document.getElementById('options-menu');
            if (optionsMenu && optionsMenu.classList.contains('show')) {
              optionsMenu.classList.remove('show');
            }
            
            window.showAboutScreen();
            return false;
          };
          console.log("About button updated");
        }
        

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
      

      updateAboutButton();
      setTimeout(updateAboutButton, 2000);
    });
  })();

  function setupStandaloneHomeButton() {

    const existingButtons = document.querySelectorAll('.standalone-home-button');
    existingButtons.forEach(button => button.remove());
    

    const homeButton = document.createElement('button');
    homeButton.className = 'standalone-home-button';
    homeButton.id = 'standalone-home-btn';
    homeButton.innerHTML = '<i class="fas fa-home"></i>';
    homeButton.onclick = navigateHome;
    

    document.body.appendChild(homeButton);
  }
  

  document.addEventListener('DOMContentLoaded', setupStandaloneHomeButton);
  

  const originalShowScreen = window.showScreen;
  window.showScreen = function(screenId, forceRefresh) {
    originalShowScreen(screenId, forceRefresh);
    setupStandaloneHomeButton();
  };

  function updateAllCoinDisplays() {

    if (window.bossVictoryAnimationInProgress) {
        console.log('Boss victory animation in progress, skipping updateAllCoinDisplays');
        return;
    }
    
    const displays = document.querySelectorAll('.coin-count');
    displays.forEach(display => {

        if (display.dataset.protectedValue === 'true') {
            console.log('Skipping protected element in updateAllCoinDisplays');
            return;
        }
        
        const currentValue = parseInt(display.textContent) || 0;
        let targetValue;


        if (window.location.pathname.includes('arcade')) {
            targetValue = currentGame.coins || 0;
        } else {
            targetValue = gameState.coins || 0;
        }


        const startNum = Number(currentValue);
        const endNum = Number(targetValue);

        animateNumber(display, startNum, endNum);
    });
}
function pulseCoins(times = 1) {

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

    const previousCoins = gameState.coins;
    gameState.coins += amount;
    

    updateAllCoinDisplays();
    updatePerkButtons();
    

    if (currentUser) {
        try {
            const { error } = await supabaseClient
                .from("game_progress")
                .update({ coins: gameState.coins })
                .eq("user_id", currentUser.id);
                
            if (error) {
                console.error("Failed to update coins in database:", error);

                gameState.coins = previousCoins;
                updateAllCoinDisplays();
                updatePerkButtons();
                return false;
            }
        } catch (err) {
            console.error("Error updating coins:", err);

            gameState.coins = previousCoins;
            updateAllCoinDisplays();
            updatePerkButtons();
            return false;
        }
    }
    

    const progressData = JSON.parse(localStorage.getItem("simploxProgress") || "{}");
    progressData.coins = gameState.coins;
    localStorage.setItem("simploxProgress", JSON.stringify(progressData));
    
    return true;
}

function positionOptionsMenu() {
    const optionsMenu = document.getElementById('options-menu');
    const settingsToggle = document.getElementById('settings-toggle');
    
    if (!optionsMenu || !settingsToggle) return;
    

    if (!optionsMenu.classList.contains('show')) return;
    

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    

    const menuRect = optionsMenu.getBoundingClientRect();
    const toggleRect = settingsToggle.getBoundingClientRect();
    

    let left = toggleRect.left + (toggleRect.width / 2) - (menuRect.width / 2);
    let top = toggleRect.bottom + 10;
    

    if (left + menuRect.width > viewportWidth - 10) {
        left = viewportWidth - menuRect.width - 10;
    }
    

    if (left < 10) {
        left = 10;
    }
    

    if (top + menuRect.height > viewportHeight - 10) {

        top = toggleRect.top - menuRect.height - 10;
        

        if (top < 10) {

            top = Math.max(10, (viewportHeight - menuRect.height) / 2);
            

            if (top + menuRect.height > viewportHeight - 10) {

                const maxHeight = viewportHeight - 20;
                optionsMenu.style.maxHeight = `${maxHeight}px`;
                optionsMenu.style.overflow = 'auto';
            }
        }
    }
    

    optionsMenu.style.left = `${left}px`;
    optionsMenu.style.top = `${top}px`;
    optionsMenu.style.transform = 'none';
}

function refreshOptionsMenu() {

    const existingMenu = document.getElementById('options-menu');
    if (existingMenu) {

        existingMenu.classList.remove('show');
        

        setTimeout(() => {

            if (existingMenu.parentNode) {
                existingMenu.parentNode.removeChild(existingMenu);
            }
            
        }, 100);
    }
}


document.addEventListener('DOMContentLoaded', function() {

    const arcadeButton = document.querySelector('.carousel-button[data-action="showArcadeModal()"]');
    
    if (arcadeButton) {

      arcadeButton.removeEventListener('click', window.showArcadeModal);
      

      arcadeButton.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Arcade button clicked - directly calling showArcadeModal');
        showArcadeModal();
      });
    } else {
      console.error('Arcade button not found in the DOM');
    }
  });


function openArcadeModalSimple() {
    console.log('Simple arcade modal opener called');
    const modal = document.getElementById('arcade-modal');
    
    if (!modal) {
      console.error('Arcade modal element not found');
      return;
    }
    
    console.log('Found arcade modal, displaying it');
    modal.style.display = 'block';
    

    const teacherView = document.getElementById('teacher-view');
    const playerView = document.getElementById('player-view');
    
    if (teacherView && playerView) {

      teacherView.style.display = 'none';
      playerView.style.display = 'block';
      console.log('Showing player view');
    } else {
      console.error('Teacher or player view elements not found');
    }
  }

  document.addEventListener('DOMContentLoaded', function() {

    document.querySelectorAll('.carousel-button').forEach(button => {
      const buttonText = button.querySelector('span')?.textContent?.trim();
      if (buttonText === 'Arcade') {
        button.onclick = function() {
          console.log('Arcade button clicked through direct handler');

          openArcadeModalSimple();


        };
      }
    });
    

    document.querySelectorAll('[onclick*="showArcadeModal"]').forEach(element => {
      element.onclick = function(e) {
        e.preventDefault();
        console.log('Element with showArcadeModal onclick attribute clicked');

        openArcadeModalSimple();


        return false;
      };
    });
  });


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
  

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(checkArcadeModalStructure, 1000);
  });


function ensureArcadeModalExists() {
    let modal = document.getElementById('arcade-modal');
    
    if (!modal) {
      console.log('Creating arcade modal element as it was not found');
      modal = document.createElement('div');
      modal.id = 'arcade-modal';
      modal.className = 'modal';
      

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
  

  document.addEventListener('DOMContentLoaded', function() {
    ensureArcadeModalExists();
  });


document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - Setting up arcade button handlers');
    

    const modalExists = ensureArcadeModalExists();
    if (modalExists) {
      console.log('Created arcade modal as it was missing');
    }
    

    document.querySelectorAll('.carousel-button').forEach(button => {
      const buttonText = button.querySelector('span')?.textContent?.trim();
      if (buttonText === 'Arcade') {
        console.log('Found Arcade button in carousel, adding direct click handler');
        
        button.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log('Arcade button clicked');
          

          const modal = document.getElementById('arcade-modal');
          if (modal) {
            modal.style.display = 'block';
            

            try {
              showArcadeModal();
            } catch (error) {
              console.error('Error in showArcadeModal:', error);
              

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
    

    document.querySelectorAll('[onclick*="showArcadeModal"]').forEach(element => {
      console.log('Found element with showArcadeModal onclick attribute, replacing handler');
      
      element.setAttribute('onclick', ''); 
      element.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Element with showArcadeModal onclick clicked');
        

        const modal = document.getElementById('arcade-modal');
        if (modal) {
          modal.style.display = 'block';
          

          try {
            showArcadeModal();
          } catch (error) {
            console.error('Error in showArcadeModal:', error);
            

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
  

  if (!livesElement) {
    const livesDiv = document.createElement('div');
    livesDiv.id = 'waiting-game-lives';
    livesDiv.style.cssText = 'position: absolute; top: 40px; right: 10px; color: var(--gold); font-size: 1.2rem; z-index: 10;';
    livesDiv.textContent = '❤️❤️❤️';
    gameContainer.appendChild(livesDiv);
  }
  

  gameContainer.style.display = 'block';
  

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
  

  wordPairs = window.shuffleArray([...wordPairs]);
  

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
  

  function setRandomHebrewWord() {
    const randomPair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    currentHebrewWord = randomPair.hebrew;
    playerElement.textContent = currentHebrewWord;
  }
  
  function createFallingWord() {
    if (!gameActive) return;
    

    const matchingWord = wordPairs.find(pair => pair.hebrew === currentHebrewWord)?.english;
    const nonMatchingWords = wordPairs
      .filter(pair => pair.hebrew !== currentHebrewWord)
      .map(pair => pair.english);
    

    const isMatching = Math.random() < 0.4;
    

    const wordElement = document.createElement('div');
    wordElement.className = 'falling-word';
    

    if (isMatching && matchingWord) {
      wordElement.textContent = matchingWord;
      wordElement.dataset.matching = 'true';
    } else {
      const randomNonMatching = nonMatchingWords[Math.floor(Math.random() * nonMatchingWords.length)];
      wordElement.textContent = randomNonMatching || 'word';
      wordElement.dataset.matching = 'false';
    }
    

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
    

    fallingWords.push({
      element: wordElement,
      y: -30,
      x: parseFloat(wordElement.style.left),
      width: 0,
      isMatching: wordElement.dataset.matching === 'true'
    });
  }
  
  function gameLoop() {
    if (!gameActive) return;
    
    const containerBottom = gameContainer.offsetHeight;
    const playerTop = containerBottom - 60;
    

    for (let i = fallingWords.length - 1; i >= 0; i--) {
      const word = fallingWords[i];
      

      if (word.width === 0) {
        word.width = word.element.offsetWidth;
      }
      

      word.y += speed;
      word.element.style.top = `${word.y}px`;
      

      if (word.y > containerBottom) {

        if (word.isMatching) {
          missedMatches++;
          

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
          

          const livesDisplay = document.getElementById('waiting-game-lives');
          if (livesDisplay) {
            livesDisplay.textContent = '❤️'.repeat(Math.max(0, 3 - missedMatches));
          }
          

          if (missedMatches >= maxMissed) {
            gameOver();
          }
        }
        

        gameContainer.removeChild(word.element);
        fallingWords.splice(i, 1);
        continue;
      }
      

      const playerRect = playerElement.getBoundingClientRect();
      const wordRect = word.element.getBoundingClientRect();
      
      if (word.y + word.element.offsetHeight >= playerTop &&
          word.x + word.width >= playerPosition - playerElement.offsetWidth/2 &&
          word.x <= playerPosition + playerElement.offsetWidth/2) {
        

        if (word.isMatching) {

          score += 10;
          scoreElement.textContent = `Score: ${score}`;
          

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
          

          speed += 0.05;
          

          setRandomHebrewWord();
        } else {

          score = Math.max(0, score - 5);
          scoreElement.textContent = `Score: ${score}`;
          
          lives--;
          

          const livesDisplay = document.getElementById('waiting-game-lives');
          if (livesDisplay) {
            livesDisplay.textContent = '❤️'.repeat(lives);
          }
          

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
          

          if (lives <= 0) {
            gameOver();
          }
        }
        

        gameContainer.removeChild(word.element);
        fallingWords.splice(i, 1);
      }
    }
    

    gameLoopId = requestAnimationFrame(gameLoop);
  }
  
  function gameOver() {
    gameActive = false;
    clearInterval(spawnIntervalId);
    

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
    

    document.getElementById('game-restart-btn').addEventListener('click', () => {
      gameContainer.removeChild(gameOverMsg);
      startGame();
    });
  }
  

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

    playerPosition = Math.max(playerElement.offsetWidth/2, 
                     Math.min(gameContainer.offsetWidth - playerElement.offsetWidth/2, 
                     playerPosition));
    
    playerElement.style.left = `${playerPosition}px`;
  }
  

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
  

  playerElement.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
  

  playerElement.addEventListener('touchstart', handleStart, { passive: false });
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);
  
  function startGame() {

    gameActive = true;
    score = 0;
    speed = 1;
    lives = 3;
    missedMatches = 0;
    

    const livesDisplay = document.getElementById('waiting-game-lives');
    if (livesDisplay) {
      livesDisplay.textContent = '❤️❤️❤️';
    }
    

    fallingWords.forEach(word => {
      if (word.element.parentNode) {
        gameContainer.removeChild(word.element);
      }
    });
    fallingWords = [];
    

    scoreElement.textContent = `Score: ${score}`;
    

    setRandomHebrewWord();
    

    gameLoopId = requestAnimationFrame(gameLoop);
    

    spawnIntervalId = setInterval(createFallingWord, 2000);
  }
  

  function checkArcadeStatus() {
    if (currentArcadeSession && currentArcadeSession.state === 'active') {

      clearInterval(spawnIntervalId);
      cancelAnimationFrame(gameLoopId);
      gameContainer.style.display = 'none';
      

      playerElement.removeEventListener('mousedown', handleStart);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      playerElement.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      

      clearInterval(arcadeCheckId);
    }
  }
  
  const arcadeCheckId = setInterval(checkArcadeStatus, 1000);
  

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
  

  const totalWords = currentGame.words.length;
  const currentIndex = currentGame.currentIndex || 0;
  const remainingWords = Math.max(0, totalWords - currentIndex);
  const remainingPercentage = remainingWords / totalWords;
  
  console.log(`Boss health: ${remainingPercentage.toFixed(2) * 100}% (${remainingWords}/${totalWords})`);
  

  const circumference = 2 * Math.PI * 54;
  

  progress.style.strokeDashoffset = circumference * (1 - remainingPercentage);
  

  if (!progress.classList.contains('boss-health')) {
    progress.classList.add('boss-health');
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
      

      const newIndex = Math.floor(totalWords * 0.25);
      currentGame.currentIndex = newIndex;
      

      const bossOrb = document.querySelector('.boss-orb-inner');
      if (bossOrb) {
        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #FFEB3B, #FFA500)';
        setTimeout(() => {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      

      setTimeout(() => updateBossHealthBar(), 100);
    }
  } else {

    progress.style.stroke = '#FF3333';
    progress.classList.add('warning');
    

    if (remainingPercentage <= 0.33 && !currentGame.bossSecondHealthRestored) {
      currentGame.bossSecondHealthRestored = true;
      console.log("Second boss health restoration");
      

      const newIndex = Math.floor(totalWords * 0.5);
      currentGame.currentIndex = newIndex;
      

      const bossOrb = document.querySelector('.boss-orb-inner');
      if (bossOrb) {
        bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #4CAF50, #388E3C)';
        setTimeout(() => {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
        }, 1000);
      }
      

      setTimeout(() => updateBossHealthBar(), 100);
    }
  }
}

function healBoss(newHealthPercentage, flashColor) {
  const progressCircle = document.querySelector('.progress-circle');
  const progress = progressCircle ? progressCircle.querySelector('.progress') : null;
  const bossOrb = document.querySelector('.boss-orb-inner');
  
  if (!progress || !bossOrb) return;
  

  const originalColor = bossOrb.style.background;
  bossOrb.style.background = flashColor;
  bossOrb.classList.add('boss-restore-health');
  

  const questionScreen = document.querySelector('.question-screen');
  if (questionScreen) {
    questionScreen.style.animation = 'none';
    questionScreen.offsetHeight;
    questionScreen.style.animation = 'bossRestoreHealth 1s';
  }
  

  const circumference = 2 * Math.PI * 54;
  const newOffset = circumference * (1 - newHealthPercentage);
  

  setTimeout(() => {
    progress.style.transition = 'stroke-dashoffset 1s ease-out';
    progress.style.strokeDashoffset = newOffset;
    

    setTimeout(() => {
      bossOrb.style.background = originalColor;
      bossOrb.classList.remove('boss-restore-health');
    }, 1000);
  }, 300);
}

function showBossHitEffect(randomColor = false) {
  const bossOrb = document.querySelector('.boss-orb-inner');
  if (!bossOrb) return;
  

  const originalBg = bossOrb.style.background;
  

  if (randomColor) {
    const colors = ['yellow', 'purple', 'turquoise', 'darkgreen', 'brown'];
    const randomColorChoice = colors[Math.floor(Math.random() * colors.length)];
    bossOrb.style.background = `radial-gradient(circle at 30% 30%, ${randomColorChoice}, #990000)`;
  }
  

  bossOrb.classList.add('boss-orb-hit');
  

  setTimeout(() => {
    bossOrb.classList.remove('boss-orb-hit');

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
  

  const questionWord = document.getElementById("question-word");
  if (questionWord) {
    questionWord.style.setProperty("color", "#ff3333", "important");
    questionWord.style.setProperty("text-shadow", "0 0 10px rgba(255, 0, 0, 0.5)", "important");
    questionWord.style.setProperty("animation", "pulseWord 2s infinite", "important");
  }
  

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

    const progressCircle = document.querySelector(".progress-circle");
    const progressBar = progressCircle?.querySelector(".progress");
    
    if (progressBar) {

      const originalColor = progressBar.style.stroke;
      

      const flickerColors = ["#ffffff", "#ffff00", "#800080", "#990000"];
      const randomColor = flickerColors[Math.floor(Math.random() * flickerColors.length)];
      
      progressBar.style.transition = "stroke 0.2s ease";
      progressBar.style.stroke = randomColor;
      

      setTimeout(() => {
        progressBar.style.stroke = originalColor;
      }, 200);
    }
  }
}



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


    requestAnimationFrame(() => {
        victoryOverlay.style.opacity = '1';
    });
}


function updateCoinsAfterBossVictory() {
    const currentCoins = gameState.coins;
    const newCoins = currentCoins;
    

    gameState.coins = newCoins;
    

    document.querySelectorAll('.coin-count').forEach(el => {
        animateCoinsChange(el, currentCoins, newCoins);
    });
    

    document.querySelectorAll('.coin-icon').forEach(icon => {
        icon.classList.add('coin-pulse');
        setTimeout(() => {
            icon.classList.remove('coin-pulse');
        }, 1500);
    });
    

    saveProgress();
}

function updateStageCompletionCounters() {

    const stageWrappers = document.querySelectorAll('.stage-wrapper');
    
    stageWrappers.forEach(stageWrapper => {
      const stageId = stageWrapper.getAttribute('data-stage');
      if (!stageId) return;
      

      const stageNum = parseInt(stageId);
      const stage = gameStructure.stages[stageNum - 1];
      if (!stage) return;
      

      let completedSets = 0;
      const totalSets = stage.numSets;
      

      for (let setId = 1; setId <= totalSets; setId++) {
        let allLevelsComplete = true;
        

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
      

      const counterElement = stageWrapper.querySelector('.stage-status');
      if (counterElement) {
        counterElement.textContent = `${completedSets}/${totalSets} Sets Completed`;
      }
    });
  }

  function showBossVictoryNotification(coinRewardNeeded = false) {

    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (stage && stage.bossLevel) {
        const bossLevelKey = `${gameState.currentStage}_${gameState.currentSet}_${stage.bossLevel}`;
        console.log(`Ensuring boss level ${bossLevelKey} is marked as completed before victory notification`);
        gameState.completedLevels.add(bossLevelKey);
        saveProgress();
    }
    

    if (coinRewardNeeded) {
        console.log("Adding 100 coin bonus in showBossVictoryNotification");
        saveProgress();
    }
    

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
    

    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (stage && stage.bossLevel) {
        const bossLevelKey = `${gameState.currentStage}_${gameState.currentSet}_${stage.bossLevel}`;
        console.log(`Final boss level completion check: ${bossLevelKey}`);
        gameState.completedLevels.add(bossLevelKey);
        saveProgress();
    }
    
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
            

            const currentStage = gameState.currentStage;
            const currentSet = gameState.currentSet;
            const stageStructure = gameStructure.stages[currentStage-1];
            
            if (!stageStructure) {
                console.error(`Invalid stage: ${currentStage}`);
                showScreen("welcome-screen");
                return;
            }
            
            const userStatus = currentUser ? currentUser.status : "unregistered";
            

            const isLastSetInStage = currentSet >= stageStructure.numSets;
            
            if (isLastSetInStage) {

                if (currentStage < 5) {

                    if (currentStage >= 2 && userStatus !== "premium") {

                        console.log("Non-premium user attempted to access next stage, showing upgrade prompt");
                        showScreen("welcome-screen");
                        setTimeout(() => {
                            showUpgradePrompt();
                        }, 500);
                        return;
                    }
                    

                    gameState.currentStage += 1;
                    gameState.currentSet = 1;
                    gameState.currentLevel = 1;
                    
                    console.log(`Moving to Stage ${gameState.currentStage}, Set 1, Level 1`);
                } else {

                    console.log("Final stage completed, showing stage selection");
                    showScreen("stage-screen");
                    return;
                }
            } else {

                const nextSet = currentSet + 1;
                

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
    

    window.bossVictoryAnimationInProgress = false;
}

function resetBossStyles(e = false) {
  console.log("Resetting boss styles", e ? "(preserving overlay)" : "");


  const progressCircle = document.querySelector('.progress-circle');
  if (progressCircle) {
    const progress = progressCircle.querySelector('.progress');
    if (progress) {
      progress.classList.remove('warning', 'boss-health');
      progress.style.stroke = '';
      progress.style.animation = 'none';
      

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
        

        const currentStage = gameState.currentStage;
        const currentSet = gameState.currentSet;
        const stageStructure = gameStructure.stages[currentStage-1];
        
        if (stageStructure && stageStructure.bossLevel) {
          const bossLevelKey = `${currentStage}_${currentSet}_${stageStructure.bossLevel}`;
          gameState.completedLevels.add(bossLevelKey);
        }
        

        localStorage.removeItem("gameContext");
        

        if (currentGame) {
          currentGame.active = false;
          currentGame.bossDefeatedEffectShown = false;
          currentGame.bossMadeComplete = false;
          currentGame.bossRewardApplied = false;
        }
        

        saveProgress();
        

        window.location.hash = '';
        showScreen("welcome-screen", true);
      }, 300);
    }
  }
  
  createBossStyleSheet();

function showStageCascadeScreen() {
    console.log("Showing stage cascade screen");
    

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('visible');
    });
    

    const stageCascadeScreen = document.getElementById('stage-cascade-screen');
    if (stageCascadeScreen) {
        stageCascadeScreen.classList.add('visible');
    } else {
        console.error("Stage cascade screen element not found");
        return;
    }
    

    const stagesContainer = stageCascadeScreen.querySelector('.stages-container');
    if (!stagesContainer) {

        const container = document.createElement('div');
        container.className = 'stages-container';
        stageCascadeScreen.appendChild(container);
    }
    

    stagesContainer.innerHTML = '';
    

    gameStructure.stages.forEach(stage => {

        const stageWrapper = document.createElement('div');
        stageWrapper.className = 'stage-wrapper';
        stageWrapper.dataset.stage = stage.id;
        

        const totalSets = stage.numSets;
        const unlockedSets = gameState.unlockedSets[stage.id] || new Set();
        let completedSets = 0;
        

        unlockedSets.forEach(setId => {
            if (isSetCompleted(stage.id, setId)) {
                completedSets++;
            }
        });
        

        const stageIcon = getStageIcon(stage.id);
        const stageName = getStageHebrewName(stage.id);
        const stageDesc = getStageDescription(stage.id);
        const stageStatus = getStageStatus(stage.id, completedSets, totalSets);
        

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
        

        populateSetsGrid(stage.id);
    });
    

    addStageToggleListeners();
    

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
      

      const completionElement = stageBlock.querySelector('.stage-completion');
      if (completionElement) {
        completionElement.textContent = `${completedSets}/${totalSets} sets are completed`;
      }
    });
  }

  function showLevelScreen(setId) {
    gameState.currentSet = setId;
    debugUnlockState();
    

    const container = document.getElementById('level-container');
    if (!container) return;
    container.innerHTML = '';
    

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
        updateStageCompletionStats();
    };
    container.appendChild(returnArrow);
    
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (!stage) return;
    

    const levelHeader = document.createElement('div');
    levelHeader.className = 'level-header';
    

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
    

    const levelGrid = document.createElement('div');
    levelGrid.className = 'level-grid';
    
    const testLevels = [3, 6, 9, 10, 13, 16, 19, 20];
    const setKey = `${gameState.currentStage}_${setId}`;
    

    if (!gameState.unlockedLevels[setKey]) {
        gameState.unlockedLevels[setKey] = new Set([1]);
    }
    
    console.log(`Rendering levels for ${setKey}. Unlocked levels:`, 
                Array.from(gameState.unlockedLevels[setKey] || []));
    
    for (let i = 1; i <= stage.levelsPerSet; i++) {
        const levelItem = document.createElement('div');
        const levelKey = `${gameState.currentStage}_${setId}_${i}`;
        

        const isUnlocked = gameState.unlockedLevels[setKey]?.has(i);
        console.log(`Level ${i} unlocked:`, isUnlocked);
        
        const isPerfect = gameState.perfectLevels.has(levelKey);
        const isCompleted = gameState.completedLevels.has(levelKey);
        const isBossLevel = i === stage.bossLevel;
        const isTestLevel = testLevels.includes(i);
        

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
    

    showScreen('level-screen');
}


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


document.addEventListener('DOMContentLoaded', function() {

  addReturnArrowStyles();
});


function getSetIcon(stageId, setId) {
    const baseIcons = {
        1: 'fas fa-book',
        2: 'fas fa-graduation-cap',
        3: 'fas fa-school',
        4: 'fas fa-university',
        5: 'fas fa-brain'
    };
    

    const variations = [
        'fas fa-book-open', 
        'fas fa-book-reader', 
        'fas fa-bookmark', 
        'fas fa-pencil-alt',
        'fas fa-pen'
    ];
    

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
    

    return `${stageNames[stageId] || 'Advanced'} vocabulary - Group ${setId}`;
}

function isSetCompleted(stageId, setId) {

    const stage = gameStructure.stages[stageId - 1];
    if (!stage) return false;
    

    console.log(`Checking if set ${stageId}-${setId} is completed...`);
    

    for (let levelId = 1; levelId <= stage.levelsPerSet; levelId++) {
        const levelKey = `${stageId}_${setId}_${levelId}`;
        const isBossLevel = (levelId === stage.bossLevel);
        

        console.log(`Level ${levelKey}: Completed=${gameState.completedLevels.has(levelKey)}, Perfect=${gameState.perfectLevels.has(levelKey)}`);
        

        if (!gameState.completedLevels.has(levelKey) && !gameState.perfectLevels.has(levelKey)) {
            console.log(`Set ${stageId}-${setId} is NOT completed because level ${levelId} is not completed`);
            return false;
        }
    }
    

    console.log(`Set ${stageId}-${setId} is COMPLETED!`);
    return true;
}

  function updateLevelAndSetCompletionStatus() {

    document.querySelectorAll('.level-item').forEach(levelItem => {

      const levelId = parseInt(levelItem.textContent);
      const setId = gameState.currentSet;
      const stageId = gameState.currentStage;
      
      if (!levelId || !setId || !stageId) return;
      
      const levelKey = `${stageId}_${setId}_${levelId}`;
      const isBossLevel = levelItem.classList.contains('boss');
      

      if (gameState.perfectLevels.has(levelKey)) {
        levelItem.classList.add('perfect');
        levelItem.classList.add('completed');
      } else if (gameState.completedLevels.has(levelKey)) {
        levelItem.classList.add('completed');
      }
    });
    

    const currentSetId = gameState.currentSet;
    const currentStageId = gameState.currentStage;
    
    if (currentSetId && currentStageId) {

      const setButton = document.querySelector(`.set-button[data-set-id="${currentSetId}"][data-stage-id="${currentStageId}"]`);
      
      if (setButton && isSetCompleted(currentStageId, currentSetId)) {
        setButton.classList.add('completed');
        

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
    

    updateStageCompletionStats();
  }
  
    function markLevelCompleted(levelId, isPerfect = false) {
    const stageId = gameState.currentStage;
    const setId = gameState.currentSet;
    
    if (!stageId || !setId) return;
    
    const levelKey = `${stageId}_${setId}_${levelId}`;
    

    gameState.completedLevels.add(levelKey);
    

    if (isPerfect) {
      gameState.perfectLevels.add(levelKey);
    }
    

    const stage = gameStructure.stages[stageId - 1];
    if (!stage) return;
    

    const setKey = `${stageId}_${setId}`;
    

    if (!gameState.unlockedLevels[setKey]) {
      gameState.unlockedLevels[setKey] = new Set([1]);
    }
    

    if (levelId < stage.levelsPerSet) {
      gameState.unlockedLevels[setKey].add(levelId + 1);
    }
    

    if (isSetCompleted(stageId, setId)) {

      const nextSetId = setId + 1;
      if (nextSetId <= stage.numSets) {
        if (!gameState.unlockedSets[stageId]) {
          gameState.unlockedSets[stageId] = new Set([1]);
        }
        gameState.unlockedSets[stageId].add(nextSetId);
      }
    }
    

    updateLevelAndSetCompletionStatus();
    

    const event = new CustomEvent('levelCompleted', { 
      detail: { levelId, stageId, setId, isPerfect } 
    });
    document.dispatchEvent(event);
    

    saveGameState();
  }


function markBossLevelCompleted(isPerfect = false) {

    if (currentGame && currentGame.bossMadeComplete) {
      console.log("Boss already marked as complete, skipping");
      return;
    }
    

    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (!stage || !stage.bossLevel) {
      console.error("Cannot find boss level for current stage");
      return;
    }
    

    const levelKey = `${gameState.currentStage}_${gameState.currentSet}_${stage.bossLevel}`;
    
    console.log(`Marking boss level as completed: ${levelKey}`);
    

    gameState.completedLevels.add(levelKey);
    

    if (isPerfect) {
      gameState.perfectLevels.add(levelKey);
    }
    

    if (currentGame) {
      currentGame.bossMadeComplete = true;
    }
    

    if (typeof saveProgress === 'function') {
      saveProgress();
      console.log("Progress saved after boss completion");
    } else {
      console.warn("saveProgress function not found!");
    }
    

    console.log(`After marking - Boss completed: ${gameState.completedLevels.has(levelKey)}`);
    console.log(`All completed levels:`, Array.from(gameState.completedLevels));
    

    if (typeof showLevelScreen === 'function') {
      console.log("Refreshing level screen");
      setTimeout(() => showLevelScreen(gameState.currentSet), 100);
    }
  }

  function updateBossHealthBar() {

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
    

    const totalWords = currentGame.words.length;
    const currentIndex = currentGame.currentIndex || 0;
    const remainingWords = Math.max(0, totalWords - currentIndex);
    const remainingPercentage = remainingWords / totalWords;
    
    console.log(`Boss health: ${remainingPercentage.toFixed(2) * 100}% (${remainingWords}/${totalWords})`);
    

    const circumference = 2 * Math.PI * 54;
    

    progress.style.strokeDashoffset = circumference * (1 - remainingPercentage);
    

    if (!progress.classList.contains('boss-health')) {
      progress.classList.add('boss-health');
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
        

        const newIndex = Math.floor(totalWords * 0.25);
        currentGame.currentIndex = newIndex;
        

        const bossOrb = document.querySelector('.boss-orb-inner');
        if (bossOrb) {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #FFEB3B, #FFA500)';
          setTimeout(() => {
            bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
          }, 1000);
        }
        

        setTimeout(() => updateBossHealthBar(), 100);
      }
    } else {

      progress.style.stroke = '#FF3333';
      progress.classList.add('warning');
      

      if (remainingPercentage <= 0.33 && !currentGame.bossSecondHealthRestored) {
        currentGame.bossSecondHealthRestored = true;
        console.log("Second boss health restoration");
        

        const newIndex = Math.floor(totalWords * 0.5);
        currentGame.currentIndex = newIndex;
        

        const bossOrb = document.querySelector('.boss-orb-inner');
        if (bossOrb) {
          bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #4CAF50, #388E3C)';
          setTimeout(() => {
            bossOrb.style.background = 'radial-gradient(circle at 30% 30%, #ff3333, #990000)';
          }, 1000);
        }
        

        setTimeout(() => updateBossHealthBar(), 100);
      }
    }
  }
  
  function healBoss(newHealthPercentage, flashColor) {
    const progressCircle = document.querySelector('.progress-circle');
    const progress = progressCircle ? progressCircle.querySelector('.progress') : null;
    const bossOrb = document.querySelector('.boss-orb-inner');
    
    if (!progress || !bossOrb) return;
    

    const originalColor = bossOrb.style.background;
    bossOrb.style.background = flashColor;
    bossOrb.classList.add('boss-restore-health');
    

    const questionScreen = document.querySelector('.question-screen');
    if (questionScreen) {
      questionScreen.style.animation = 'none';
      questionScreen.offsetHeight;
      questionScreen.style.animation = 'bossRestoreHealth 1s';
    }
    

    const circumference = 2 * Math.PI * 54;
    const newOffset = circumference * (1 - newHealthPercentage);
    

    setTimeout(() => {
      progress.style.transition = 'stroke-dashoffset 1s ease-out';
      progress.style.strokeDashoffset = newOffset;
      

      setTimeout(() => {
        bossOrb.style.background = originalColor;
        bossOrb.classList.remove('boss-restore-health');
      }, 1000);
    }, 300);
  }
  
  function showBossHitEffect(randomColor = false) {
    const bossOrb = document.querySelector('.boss-orb-inner');
    if (!bossOrb) return;
    

    const originalBg = bossOrb.style.background;
    

    if (randomColor) {
      const colors = ['yellow', 'purple', 'turquoise', 'darkgreen', 'brown'];
      const randomColorChoice = colors[Math.floor(Math.random() * colors.length)];
      bossOrb.style.background = `radial-gradient(circle at 30% 30%, ${randomColorChoice}, #990000)`;
    }
    

    bossOrb.classList.add('boss-orb-hit');
    

    setTimeout(() => {
      bossOrb.classList.remove('boss-orb-hit');

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
    

    const questionWord = document.getElementById("question-word");
    if (questionWord) {
      questionWord.style.setProperty("color", "#ff3333", "important");
      questionWord.style.setProperty("text-shadow", "0 0 10px rgba(255, 0, 0, 0.5)", "important");
      questionWord.style.setProperty("animation", "pulseWord 2s infinite", "important");
    }
    

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

      const progressCircle = document.querySelector(".progress-circle");
      const progressBar = progressCircle?.querySelector(".progress");
      
      if (progressBar) {

        const originalColor = progressBar.style.stroke;
        

        const flickerColors = ["#ffffff", "#ffff00", "#800080", "#990000"];
        const randomColor = flickerColors[Math.floor(Math.random() * flickerColors.length)];
        
        progressBar.style.transition = "stroke 0.2s ease";
        progressBar.style.stroke = randomColor;
        

        setTimeout(() => {
          progressBar.style.stroke = originalColor;
        }, 200);
      }
    }
  }
  

  
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
      

      window.bossVictoryAnimationInProgress = true;
      

      currentGame.bossDefeatedEffectShown = true;
      

      const originalCoins = gameState.coins;
      const targetCoins = originalCoins + 100;
      

      currentGame.bossRewardApplied = true;
      

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
          markBossLevelCompleted(false);
        }
      

      setTimeout(() => {
          const bossOrb = document.querySelector('.boss-orb-inner');
          
          if (bossOrb) {
              console.log('Disintegrating boss orb');
              
              const incinerationEffect = document.createElement('div');
              incinerationEffect.className = 'incineration-effect';
              bossOrb.appendChild(incinerationEffect);
              
              bossOrb.style.animation = 'boss-shrink 2.5s forwards';
              

              setTimeout(() => {
                  console.log('Applying coin reward animation');
                  
                  const coinsContainer = document.querySelector('.coins-container');
                  
                  if (coinsContainer && window.originalCoinsHTML) {

                      coinsContainer.innerHTML = window.originalCoinsHTML;
                      

                      document.querySelectorAll('.coin-count').forEach(el => {
                          el.dataset.protectedValue = 'true';
                          el.textContent = originalCoins;
                      });
                      
                      const coinIcon = coinsContainer.querySelector('.coin-icon');
                      const coinCount = coinsContainer.querySelector('.coin-count');
                      
                      if (coinCount) {

                          coinsContainer.style.transform = 'scale(1.2)';
                          coinsContainer.style.transition = 'transform 0.3s ease';
                          

                          const steps = 60;
                          const stepDelay = 2000 / steps;
                          let currentStep = 0;
                          
                          const animateCoins = () => {
                              if (currentStep <= steps) {
                                  const progress = currentStep / steps;
                                  const currentValue = Math.round(originalCoins + (targetCoins - originalCoins) * progress);
                                  

                                  document.querySelectorAll('.coin-count').forEach(el => {
                                      el.textContent = currentValue;
                                      el.style.color = 'var(--gold)';
                                      el.style.textShadow = '0 0 10px var(--gold)';
                                  });
                                  
                                  currentStep++;
                                  setTimeout(animateCoins, stepDelay);
                              } else {

                                  gameState.coins = targetCoins;
                                  saveProgress();
                                  

                                  document.querySelectorAll('.coin-count').forEach(el => {
                                      el.textContent = targetCoins;
                                      delete el.dataset.protectedValue;
                                  });
                                  

                                  setTimeout(() => {
                                      document.querySelectorAll('.coin-count').forEach(el => {
                                          el.style.color = '';
                                          el.style.textShadow = '';
                                      });
                                      coinsContainer.style.transform = 'scale(1)';
                                  }, 1000);
                              }
                          };
                          

                          animateCoins();
                          

                          if (coinIcon) {
                              coinIcon.classList.add('coin-pulse');
                              coinIcon.style.animation = 'coinPulse 0.5s ease-in-out 6';
                          }
                      }
                  }
              }, 500);
              

              setTimeout(() => {
                  console.log('Showing victory notification');
                  

                  showBossVictoryNotification(false);
              }, 5000);
          } else {
              setTimeout(() => {
                  showBossVictoryNotification(false);
              }, 3000);
          }
      }, 1000);
  

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
  

  function updateCoinsAfterBossVictory() {
      const currentCoins = gameState.coins;
      const newCoins = currentCoins;
      

      gameState.coins = newCoins;
      

      document.querySelectorAll('.coin-count').forEach(el => {
          animateCoinsChange(el, currentCoins, newCoins);
      });
      

      document.querySelectorAll('.coin-icon').forEach(icon => {
          icon.classList.add('coin-pulse');
          setTimeout(() => {
              icon.classList.remove('coin-pulse');
          }, 1500);
      });
      

      saveProgress();
  }
  
  function showBossVictoryNotification(coinRewardNeeded = false) {

      if (coinRewardNeeded) {
          console.log("Adding 100 coin bonus in showBossVictoryNotification");
          saveProgress();
      }
      

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
        

        const currentStage = gameState.currentStage;
        const currentSet = gameState.currentSet;
        const stageStructure = gameStructure.stages[currentStage-1];
        
        if (!stageStructure) {
          console.error(`Invalid stage: ${currentStage}`);
          showScreen("welcome-screen");
          return;
        }
        
        const userStatus = currentUser ? currentUser.status : "unregistered";
        

        const isLastSetInStage = currentSet >= stageStructure.numSets;
        
        if (isLastSetInStage) {

          if (currentStage < 5) {

            if (currentStage >= 2 && userStatus !== "premium") {

              console.log("Non-premium user attempted to access next stage, showing upgrade prompt");
              showScreen("welcome-screen");
              setTimeout(() => {
                showUpgradePrompt();
              }, 500);
              return;
            }
            

            gameState.currentStage += 1;
            gameState.currentSet = 1;
            gameState.currentLevel = 1;
            
            console.log(`Moving to Stage ${gameState.currentStage}, Set 1, Level 1`);
          } else {

            console.log("Final stage completed, showing stage selection");
            showScreen("stage-screen");
            return;
          }
        } else {

          const nextSet = currentSet + 1;
          

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
    

    window.bossVictoryAnimationInProgress = false;
  }
  
  function resetBossStyles(e = false) {
    console.log("Resetting boss styles", e ? "(preserving overlay)" : "");
  

    const progressCircle = document.querySelector('.progress-circle');
    if (progressCircle) {
      const progress = progressCircle.querySelector('.progress');
      if (progress) {
        progress.classList.remove('warning', 'boss-health');
        progress.style.stroke = '';
        progress.style.animation = 'none';
        

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
  
  function debugPremiumButtonClick() {
    console.group("Premium Button Click Debug");
    

    const userStatus = currentUser ? currentUser.status : 'unregistered';
    console.log("Current user status:", userStatus);
    console.log("Is premium user:", userStatus === 'premium');
    

    const premiumButton = document.querySelector('#premium-menu-item');
    console.log("Premium button exists:", premiumButton ? "YES" : "NO");
    
    if (premiumButton) {
      console.log("Premium button visibility:", window.getComputedStyle(premiumButton).display);
      console.log("Premium button click handler:", premiumButton.getAttribute('onclick'));
      

      console.log("Will call:", premiumButton.getAttribute('onclick') || "No onclick attribute");
    } else {
      console.log("Premium button NOT FOUND - this is expected for premium users");
    }
    
    console.groupEnd();
  }

  window.debugPremium.simulatePremiumButtonClick();


  window.debugPremium.setUserStatus('premium');
  
  
  window.debugPremium.setUserStatus('free');
  
  
  window.debugPremium.setUserStatus('unregistered');
  
  
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

  function showLevelScreen(setId) {
    gameState.currentSet = setId;
    console.log(`Opening set ${setId} in stage ${gameState.currentStage}`);
    

    const container = document.getElementById('level-container');
    if (!container) {
        console.error("Level container not found");
        return;
    }
    container.innerHTML = '';
    

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
        updateStageCompletionStats();
    };
    container.appendChild(returnArrow);
    
    const stage = gameStructure.stages[gameState.currentStage - 1];
    if (!stage) {
        console.error(`Invalid stage: ${gameState.currentStage}`);
        return;
    }
    

    const levelHeader = document.createElement('div');
    levelHeader.className = 'level-header';
    

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
    

    const levelGrid = document.createElement('div');
    levelGrid.className = 'level-grid';
    levelGrid.dataset.setId = setId;
    levelGrid.dataset.stageId = gameState.currentStage;
    
    const testLevels = [3, 6, 9, 10, 13, 16, 19, 20];
    const setKey = `${gameState.currentStage}_${setId}`;
    

    if (!gameState.unlockedLevels[setKey]) {
        gameState.unlockedLevels[setKey] = new Set([1]);
    }
    
    console.log(`Rendering levels for ${setKey}. Unlocked levels:`, 
                Array.from(gameState.unlockedLevels[setKey] || []));
    
    for (let i = 1; i <= stage.levelsPerSet; i++) {
        const levelItem = document.createElement('div');
        const levelKey = `${gameState.currentStage}_${setId}_${i}`;
        

        levelItem.dataset.levelId = i;
        levelItem.dataset.levelKey = levelKey;
        

        const isUnlocked = gameState.unlockedLevels[setKey]?.has(i);
        console.log(`Level ${i} unlocked:`, isUnlocked);
        
        const isPerfect = gameState.perfectLevels.has(levelKey);
        const isCompleted = gameState.completedLevels.has(levelKey);
        const isBossLevel = i === stage.bossLevel;
        const isTestLevel = testLevels.includes(i);
        

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
    

    console.log(`Is set ${gameState.currentStage}-${setId} completed:`, 
                isSetCompleted(gameState.currentStage, setId));
    

    showScreen('level-screen');
    

    const isComplete = isSetCompleted(gameState.currentStage, setId);
    if (isComplete) {
        console.log(`Set ${gameState.currentStage}-${setId} is complete!`);
        

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
    

    const stage = gameStructure.stages[currentStage - 1];
    if (stage && stage.bossLevel) {
      const bossLevelKey = `${currentStage}_${currentSet}_${stage.bossLevel}`;
      
      console.log(`Ensuring boss level ${bossLevelKey} is marked as completed`);
      gameState.completedLevels.add(bossLevelKey);
      

      updateStageCompletionStats();
      updateStageCompletionCounters();
    }
    

    const stageStructure = gameStructure.stages[currentStage-1];
    if (!stageStructure) {
      console.error(`Invalid stage: ${currentStage}`);
      return;
    }
    

    if (currentSet < stageStructure.numSets) {
      const nextSet = currentSet + 1;
      

      if (!gameState.unlockedSets[currentStage]) {
        gameState.unlockedSets[currentStage] = new Set();
      }
      

      gameState.unlockedSets[currentStage].add(nextSet);
      

      const nextSetKey = `${currentStage}_${nextSet}`;
      if (!gameState.unlockedLevels[nextSetKey]) {
        gameState.unlockedLevels[nextSetKey] = new Set();
      }
      gameState.unlockedLevels[nextSetKey].add(1);
      
      console.log(`Unlocked set ${currentStage}-${nextSet} and its first level`);
      

      saveProgress();
    } else if (currentStage < 5) {

      unlockNextStage();
    }
}
  
  function unlockNextStage() {
    const currentStage = gameState.currentStage;
    

    if (currentStage < 5) {
      const nextStage = currentStage + 1;
      

      if (!gameState.unlockedSets[nextStage]) {
        gameState.unlockedSets[nextStage] = new Set();
      }
      

      gameState.unlockedSets[nextStage].add(1);
      

      const nextSetKey = `${nextStage}_1`;
      if (!gameState.unlockedLevels[nextSetKey]) {
        gameState.unlockedLevels[nextSetKey] = new Set();
      }
      gameState.unlockedLevels[nextSetKey].add(1);
      
      console.log(`Unlocked stage ${nextStage}, set 1, level 1`);
      

      saveProgress();
    }
  }


window.fixBossCompletion = function(stageId = null, setId = null) {

    const stage = stageId || gameState.currentStage;
    const set = setId || gameState.currentSet;
    
    const stageConfig = gameStructure.stages[stage - 1];
    if (!stageConfig || !stageConfig.bossLevel) {
        console.error(`Invalid stage ${stage} or no boss level defined`);
        return false;
    }
    

    const bossLevelKey = `${stage}_${set}_${stageConfig.bossLevel}`;
    console.log(`Marking boss level ${bossLevelKey} as completed via manual repair`);
    gameState.completedLevels.add(bossLevelKey);
    

    saveProgress();
    

    updateStageCompletionStats();
    updateStageCompletionCounters();
    
    return true;
};


function ensureGameStateStructure() {

    if (!gameState.completedLevels || !(gameState.completedLevels instanceof Set)) {
        console.warn("completedLevels is not a Set, fixing...");
        gameState.completedLevels = new Set(Array.isArray(gameState.completedLevels) ? 
            gameState.completedLevels : []);
    }
    

    if (!gameState.perfectLevels || !(gameState.perfectLevels instanceof Set)) {
        console.warn("perfectLevels is not a Set, fixing...");
        gameState.perfectLevels = new Set(Array.isArray(gameState.perfectLevels) ? 
            gameState.perfectLevels : []);
    }
    

    if (!gameState.unlockedSets || typeof gameState.unlockedSets !== 'object') {
        console.warn("unlockedSets is not properly structured, fixing...");
        gameState.unlockedSets = { 1: new Set([1]) };
    } else {

        Object.keys(gameState.unlockedSets).forEach(key => {
            if (!(gameState.unlockedSets[key] instanceof Set)) {
                gameState.unlockedSets[key] = new Set(Array.isArray(gameState.unlockedSets[key]) ? 
                    gameState.unlockedSets[key] : []);
            }
        });
    }
    

    if (!gameState.unlockedLevels || typeof gameState.unlockedLevels !== 'object') {
        console.warn("unlockedLevels is not properly structured, fixing...");
        gameState.unlockedLevels = { "1_1": new Set([1]) };
    } else {

        Object.keys(gameState.unlockedLevels).forEach(key => {
            if (!(gameState.unlockedLevels[key] instanceof Set)) {
                gameState.unlockedLevels[key] = new Set(Array.isArray(gameState.unlockedLevels[key]) ? 
                    gameState.unlockedLevels[key] : []);
            }
        });
    }
    
    console.log("GameState structure verified and fixed if needed");
}


document.addEventListener('DOMContentLoaded', function() {

    checkExistingSession().then(() => {

        loadUserGameProgress(currentUser?.id).then(() => {
            ensureGameStateStructure();
            initializeGame();
        });
    });
});


function loadProgress() {
    const saved = localStorage.getItem('simploxProgress');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            

            gameState.unlockedSets = Object.fromEntries(
                Object.entries(data.unlockedSets || {}).map(([k, v]) => [k, new Set(v)])
            );
            
            gameState.unlockedLevels = Object.fromEntries(
                Object.entries(data.unlockedLevels || {}).map(([k, v]) => [k, new Set(v)])
            );
            

            gameState.perfectLevels = new Set(data.perfectLevels || []);
            gameState.completedLevels = new Set(data.completedLevels || []);
            
            gameState.coins = data.coins || 0;
            gameState.perks = data.perks || {timeFreeze: 0, skip: 0, clue: 0, reveal: 0};
            
            console.log("Progress loaded with proper Set conversion");
        } catch (e) {
            console.error("Error loading game progress:", e);

            setupDefaultUnlocks();
        }
    }
    
    const savedCustomCoins = localStorage.getItem('simploxCustomCoins');
    if (savedCustomCoins) {
        gameState.coins = parseInt(savedCustomCoins);
    }
}

function addGoldShineStyles() {

    const existingStyle = document.getElementById('gold-set-styles');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    const styleEl = document.createElement('style');
    styleEl.id = 'gold-set-styles';
    styleEl.textContent = `
        
        .set-button.fully-completed {
            background: linear-gradient(135deg, var(--gold), #ffa500) !important;
            border: 2px solid var(--gold) !important;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.6) !important;
            position: relative !important;
            overflow: hidden !important;
            animation: pulseGoldSet 2s infinite alternate !important;
            transform: scale(1.05) !important;
            z-index: 5 !important; 
            color: black !important; 
        }
        
        
        .set-button.fully-completed .completed-indicator {
            color: #000 !important;
            background-color: rgba(255, 255, 255, 0.3) !important;
            border-radius: 50% !important;
            padding: 3px !important;
        }
        
        
        .set-button.fully-completed span {
            color: #000 !important;
            font-weight: bold !important;
            text-shadow: 0 0 3px rgba(255, 255, 255, 0.5) !important;
            position: relative !important;
            z-index: 10 !important;
        }
        
        
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


function forceRefreshGoldButtons() {
    console.log("Force-refreshing gold styling on set buttons");
    

    addGoldShineStyles();
    

    document.querySelectorAll('.set-button.completed').forEach(button => {
        const stageId = parseInt(button.dataset.stageId);
        const setId = parseInt(button.dataset.setId);
        
        if (!stageId || !setId) return;
        
        const stage = gameStructure.stages[stageId - 1];
        if (!stage || !stage.levelsPerSet) return;
        

        let allPerfect = true;
        for (let levelId = 1; levelId <= stage.levelsPerSet; levelId++) {
            const levelKey = `${stageId}_${setId}_${levelId}`;
            if (!gameState.perfectLevels.has(levelKey)) {
                allPerfect = false;
                break;
            }
        }
        

        if (allPerfect) {
            console.log(`Force-applying gold styling to set ${stageId}-${setId}`);
            button.classList.add('fully-completed');
            

            setTimeout(() => {
                button.classList.remove('fully-completed');
                setTimeout(() => button.classList.add('fully-completed'), 50);
            }, 100);
        }
    });
}


document.addEventListener('DOMContentLoaded', () => {
    setTimeout(forceRefreshGoldButtons, 500);
});


document.addEventListener('screenChange', event => {
    if (event.detail && event.detail.screen === 'stage-cascade-screen') {
        setTimeout(forceRefreshGoldButtons, 200);
    }
});


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
    

    t.innerHTML = "";
    

    for (let s = 1; s <= n.numSets; s++) {
        const setButton = document.createElement("div"),
            a = r.has(s);
        let i = !1;
        e >= 2 && s > 1 && "premium" !== o && (i = !0);
        

        setButton.dataset.setId = s;
        setButton.dataset.stageId = e;
        
        setButton.className = "set-button";
        a && !i ? setButton.classList.add("active") : setButton.classList.add("locked");
        

        const isCompleted = isSetCompleted(e, s);
        

        let allLevelsPerfect = false;
        
        if (isCompleted && n.levelsPerSet) {
            allLevelsPerfect = true;
            

            for (let levelId = 1; levelId <= n.levelsPerSet; levelId++) {
                const levelKey = `${e}_${s}_${levelId}`;
                

                if (!gameState.perfectLevels.has(levelKey)) {
                    allLevelsPerfect = false;
                    break;
                }
            }
            
            console.log(`Set ${e}-${s} all perfect levels check:`, allLevelsPerfect);
        }
        

        if (isCompleted) {
            setButton.classList.add("completed");
            

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

            setButton.onclick = () => showUpgradePrompt();
            

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
    

    ensureGoldShineStyles();
}


function ensureGoldShineStyles() {

    if (!document.getElementById('gold-set-styles')) {

        const styleEl = document.createElement('style');
        styleEl.id = 'gold-set-styles';
        styleEl.textContent = `
            
            .set-button.fully-completed {
                background: linear-gradient(135deg, var(--gold), #ffa500) !important;
                border: 2px solid var(--gold) !important;
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.6) !important;
                position: relative;
                overflow: hidden;
                animation: pulseGoldSet 2s infinite alternate;
                color: #000 !important; 
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
        

        document.head.appendChild(styleEl);
        console.log("Enhanced gold shine styles added to page");
    }
}


document.addEventListener('DOMContentLoaded', ensureGoldShineStyles);

function updateStageBackground() {
    const currentStage = gameState.currentStage;
    

    const questionScreen = document.getElementById('question-screen');
    if (!questionScreen) return;
    

    questionScreen.classList.remove('stage-3-bg', 'stage-4-bg', 'stage-5-bg');
    

    if (currentStage >= 3 && currentStage <= 5) {
      questionScreen.classList.add(`stage-${currentStage}-bg`);
    }
  }

  


function updatePremiumButtonVisibility() {

    const premiumMenuItemStatic = document.getElementById('premium-menu-item');
    

    const userStatus = currentUser ? currentUser.status : 'unregistered';
    const shouldShowPremium = userStatus !== 'premium';
    

    if (premiumMenuItemStatic) {
      premiumMenuItemStatic.style.display = shouldShowPremium ? 'flex' : 'none';
      console.log(`Premium button visibility: ${shouldShowPremium ? 'visible' : 'hidden'} for user status: ${userStatus}`);
    }
  }
  

  document.addEventListener('DOMContentLoaded', function() {
    updatePremiumButtonVisibility();
  });
  

  document.addEventListener('userStatusChanged', function(event) {
    updatePremiumButtonVisibility();
  });


  const originalCreateOptionsMenu = createOptionsMenu;
  createOptionsMenu = function() {

    const existingMenu = document.getElementById('options-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
  
    const optionsMenu = document.createElement('div');
    optionsMenu.id = 'options-menu';
    optionsMenu.className = 'floating-menu';
    

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
        visibleTo: ['free', 'pending', 'unregistered']
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
    

    const menuGrid = document.createElement('div');
    menuGrid.className = 'menu-grid';
    optionsMenu.appendChild(menuGrid);
    

    const userStatus = currentUser ? (currentUser.status || 'free') : 'unregistered';
    console.log("Creating menu with user status:", userStatus);
    

    menuItems.forEach(item => {

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
    

    document.dispatchEvent(new CustomEvent('menuRefreshed'));
    
    return optionsMenu;
  };


window.createOptionsMenu = function() {
  console.log("Creating options menu with user status:", currentUser?.status || "unregistered");
  

  const existingMenu = document.getElementById('options-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  const optionsMenu = document.createElement('div');
  optionsMenu.id = 'options-menu';
  optionsMenu.className = 'floating-menu';
  

  const menuGrid = document.createElement('div');
  menuGrid.className = 'menu-grid';
  optionsMenu.appendChild(menuGrid);
  

  const userStatus = currentUser ? currentUser.status : 'unregistered';
  const isPremiumUser = userStatus === 'premium';
  
  console.log(`User is premium: ${isPremiumUser}`);
  

  const menuItems = [];
  

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
  

  if (!isPremiumUser) {
    menuItems.push({
      icon: 'fa-crown',
      text: 'Premium',
      onClick: 'showScreen(\'upgrade-screen\')'
    });
  }
  

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
  

  menuItems.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    

    if (item.text === 'Premium') {
      menuItem.id = 'premium-menu-item';
    }
    

    if (item.onClick) {
      menuItem.setAttribute('onclick', item.onClick);
    }
    

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

  function updatePremiumMenuItems() {

    const userStatus = currentUser ? currentUser.status : 'unregistered';
    const isPremium = userStatus === 'premium';
    
    console.log(`Updating premium button visibility - User status: ${userStatus}, Premium: ${isPremium}`);
    

    const staticPremiumButton = document.getElementById('premium-menu-item');
    if (staticPremiumButton) {
      staticPremiumButton.style.display = isPremium ? 'none' : 'flex';
    }
    

    const optionsMenu = document.getElementById('options-menu');
    if (optionsMenu) {
      const premiumItems = optionsMenu.querySelectorAll('.menu-item[id="premium-item"], .menu-item i.fa-crown, .menu-item:has(i.fa-crown)');
      
      premiumItems.forEach(item => {
        item.style.display = isPremium ? 'none' : 'flex';
      });
    }
  }
  

  function createOptionsMenuWithDebug() {
    console.log("Creating options menu with debug");
    const menu = createOptionsMenu();
        

    const premiumButton = document.querySelector('#premium-menu-item');
    if (premiumButton) {
      const originalClick = premiumButton.onclick;
      premiumButton.onclick = function(e) {
        console.log("Premium button clicked!");
        debugPremiumButtonClick();
        

        if (originalClick) {
          originalClick.call(this, e);
        } else {

          const onclickAttr = premiumButton.getAttribute('onclick');
          if (onclickAttr) {
            eval(onclickAttr);
          }
        }
      };
    }
    
    return menu;
  }
  

  document.addEventListener('DOMContentLoaded', function() {
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function() {
        console.log("Settings toggle clicked!");
        createOptionsMenuWithDebug();
        

        const optionsMenu = document.getElementById('options-menu');
        if (optionsMenu) {
          optionsMenu.classList.add('show');
        }
      });
    }
  });
  

  document.addEventListener('DOMContentLoaded', function() {

    function setupPremiumButton() {
      const premiumItem = document.querySelector('#premium-item');
      if (premiumItem) {

        const originalAction = premiumItem.getAttribute('onclick');
        premiumItem.removeAttribute('onclick');
        
        premiumItem.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Premium menu item clicked by', currentUser ? currentUser.status : 'unregistered user');
          debugPremiumButtonClick();
          

          showScreen('upgrade-screen');
          

          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu) {
            optionsMenu.classList.remove('show');
          }
        });
        
        console.log('Direct premium button handler set up');
      }
    }
    

    setupPremiumButton();
    

    document.addEventListener('menuRefreshed', setupPremiumButton);
    

    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function() {
        setTimeout(setupPremiumButton, 100);
      });
    }
  });

function fixCrownButtonBehavior() {

    const premiumMenuItem = document.querySelector('#options-menu .menu-item[id="premium-menu-item"], #options-menu .menu-item i.fa-crown').closest('.menu-item');
    
    if (premiumMenuItem) {
      console.log("Found premium menu item, fixing click behavior");
      

      premiumMenuItem.removeAttribute('onclick');
      

      premiumMenuItem.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Premium menu item clicked - showing upgrade screen");
        

        const optionsMenu = document.getElementById('options-menu');
        if (optionsMenu) {
          optionsMenu.classList.remove('show');
        }
        

        showScreen('upgrade-screen');
      }, true);
      

      const crownIcon = premiumMenuItem.querySelector('i.fa-crown');
      if (crownIcon) {
        crownIcon.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log("Crown icon clicked - showing upgrade screen");
          

          const optionsMenu = document.getElementById('options-menu');
          if (optionsMenu) {
            optionsMenu.classList.remove('show');
          }
          

          showScreen('upgrade-screen');
        }, true);
      }
    } else {
      console.warn("Premium menu item not found in the floating menu");
    }
  }
  

  document.addEventListener('DOMContentLoaded', function() {

    setTimeout(fixCrownButtonBehavior, 500);
    

    document.addEventListener('menuRefreshed', fixCrownButtonBehavior);
    

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


    console.log("Current user:", currentUser);
    console.log("User status:", currentUser?.status);
    console.log("User metadata:", currentUser?.user_metadata);
    console.log("App metadata:", currentUser?.app_metadata);
    

    if (currentUser) {
        console.log("All user properties:");
        for (const key in currentUser) {
            if (typeof currentUser[key] !== 'function') {
                console.log(`- ${key}:`, currentUser[key]);
            }
        }
        

        if (currentUser.user_metadata) {
            console.log("All user_metadata properties:");
            for (const key in currentUser.user_metadata) {
                console.log(`- ${key}:`, currentUser.user_metadata[key]);
            }
        }
        

        if (currentUser.app_metadata) {
            console.log("All app_metadata properties:");
            for (const key in currentUser.app_metadata) {
                console.log(`- ${key}:`, currentUser.app_metadata[key]);
            }
        }
    }
    
    const limits = CustomListsManager.getListLimits();
    const userStatus = currentUser?.status || "unregistered";
    

    console.log("User premium status check:", userStatus === "premium");
    

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
            

            const hasShareButton = !!listItem.querySelector('.share-button');
            console.log(`List ${list.id} - Share button exists: ${hasShareButton}, Premium user: ${userStatus === "premium"}`);
            

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


function addCustomWordList(name = null) {

    if (customPracticeLists.lists.length >= customPracticeLists.maxLists) {
        alert(`You can only create up to ${customPracticeLists.maxLists} custom lists.`);
        return null;
    }


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



function translateWord(word) {
    const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|he`;
    
    return fetch(apiUrl)
        .then(response => response.json())
        .then(data => {

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

        deleteCustomList(listId);
        return false;
    }
    
    return limits.maxPlays - plays;
}








function updateLocalSharedLists(sharedList) {

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
        

        saveCustomLists();
    }
}


async function debugShareList(listId, recipientId) {
    try {
        console.log("Debug share function called with:", { listId, recipientId });
        

        const list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
        if (!list) {
            console.error("List not found for debug sharing");
            return false;
        }
        

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
        

        const list = CustomListsManager.lists.find(l => String(l.id) === String(listId));
        
        if (!list) {
            console.error("List not found for sharing:", listId);
            return false;
        }
        
        console.log("Found list to share:", list.name);
        

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
    

    document.querySelectorAll(".share-modal-wrapper").forEach(el => el.remove());
    

    const modalWrapper = document.createElement("div");
    modalWrapper.className = "share-modal-wrapper";
    modalWrapper.setAttribute('data-list-id', listId);

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
    

    document.body.appendChild(modalWrapper);
    

    modalWrapper.querySelector(".cancel-share-btn").addEventListener("click", () => {
        closeShareModal();
    });
    

    modalWrapper.userData = [];
    

    const searchInput = modalWrapper.querySelector("#user-search");
    searchInput.addEventListener("input", () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        filterUsers(searchTerm, modalWrapper);
    });
    

    fetchUsersForSharing(listId, modalWrapper.querySelector(".users-list"), modalWrapper);
    

    setTimeout(() => {
        modalWrapper.style.opacity = "0";
        modalWrapper.style.transition = "opacity 0.3s ease";
        

        modalWrapper.offsetHeight;
        

        modalWrapper.style.opacity = "1";
    }, 10);
}

function closeShareModal() {
    const modal = document.querySelector(".share-modal-wrapper");
    if (modal) {

        modal.style.opacity = "0";
        

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
    

    if (modalWrapper && !modalWrapper.hasAttribute('data-list-id')) {
        modalWrapper.setAttribute('data-list-id', listId);
    }
    

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
            

            if (modalWrapper) {
                modalWrapper.userData = data;
            }
            

            const resultsCount = modalWrapper ? modalWrapper.querySelector('.search-results-count') : null;
            if (resultsCount) {
                resultsCount.textContent = `${data.length} users`;
                resultsCount.style.display = 'block !important';
            }
            

            renderUsersList(data, container, listId);
        });
}

function renderUsersList(users, container, listId) {

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
    

    container.querySelectorAll('.share-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            const listIdToShare = btn.getAttribute('data-list-id');
            
            if (!listIdToShare) {
                console.error("Missing list ID for sharing");
                showNotification("Error: List ID is missing", "error");
                return;
            }
            

            btn.disabled = true;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sharing...';
            

            console.log(`Attempting to share list ${listIdToShare} with user ${userId}`);
            const success = await shareListWithUser(listIdToShare, userId);
            
            if (success) {
                showNotification("List shared successfully!", "success");
                closeShareModal();
            } else {

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
    const listId = modalWrapper.getAttribute('data-list-id');
    
    if (!usersList) return;
    

    if (!searchTerm) {
        renderUsersList(modalWrapper.userData, usersList, listId);
        
        if (resultsCount) {
            resultsCount.textContent = `${modalWrapper.userData.length} users`;
            resultsCount.style.display = 'block';
        }
        return;
    }
    

    const filteredUsers = modalWrapper.userData.filter(user => {
        const username = (user.username || "").toLowerCase();
        return username.includes(searchTerm);
    });
    

    if (resultsCount) {
        resultsCount.textContent = `${filteredUsers.length}/${modalWrapper.userData.length}`;
        resultsCount.style.display = 'block';
    }
    

    renderUsersList(filteredUsers, usersList, listId);
}

function handleProgressionAfterCompletion(isLevelCompleted) {
    if (!isLevelCompleted && currentGame.streakBonus) {

        gameState.coins += 5;
        pulseCoins(5);
        

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



function changeCurrentStage(stageId) {
    stageId = parseInt(stageId);
    

    if (stageId < 1 || stageId > 5) {
      console.error("Invalid stage ID:", stageId);
      return;
    }
    

    gameState.currentStage = stageId;
    

    const stageDescription = document.getElementById('stage-description');
    if (stageDescription) {
      stageDescription.textContent = getStageDescription(stageId);
    }
    

    saveProgress();
    
    console.log(`Stage changed to ${stageId}: ${getStageHebrewName(stageId)}`);
    showNotification(`Stage changed to ${getStageHebrewName(stageId)}`, "success");
  }
  

  function updateStageSelector() {
    const stageSelector = document.getElementById('stage-selector');
    const stageDescription = document.getElementById('stage-description');
    
    if (stageSelector) {

      stageSelector.value = gameState.currentStage || "1";
      

      if (stageDescription) {
        stageDescription.textContent = getStageDescription(gameState.currentStage || 1);
      }
    }
  }
  

  function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) {
      console.error("Profile modal element not found");
      return;
    }
    

    const usernameEl = document.getElementById('modal-username');
    if (usernameEl) {
      usernameEl.textContent = currentUser?.user_metadata?.username || 
                              currentUser?.email?.split('@')[0] || 
                              'Guest';
    }
    

    const statusEl = document.getElementById('modal-status');
    if (statusEl) {
      const status = currentUser?.status || 'free';
      

      statusEl.className = 'status-badge';
      

      statusEl.classList.add(status);
      

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
    

    const wordCountEl = document.getElementById('modal-word-count');
    const coinCountEl = document.getElementById('modal-coin-count');
    
    if (wordCountEl) {
      wordCountEl.textContent = document.getElementById('totalWords')?.textContent || '0';
    }
    
    if (coinCountEl) {
      coinCountEl.textContent = document.getElementById('totalCoins')?.textContent || '0';
    }
    

    updateStageSelector();
    

    modal.classList.add('show');
    

    closeOptionsMenu();
    
    console.log("Profile modal opened");
  }
  

  function startGameFromStage() {

    const currentStage = gameState.currentStage || 1;
    const unlockedSets = gameState.unlockedSets[currentStage] || new Set([1]);
    const furthestSet = Math.max(...Array.from(unlockedSets));
    

    const setKey = `${currentStage}_${furthestSet}`;
    const unlockedLevels = gameState.unlockedLevels[setKey] || new Set([1]);
    const furthestLevel = Math.max(...Array.from(unlockedLevels));
    
    console.log(`Starting game at Stage ${currentStage}, Set ${furthestSet}, Level ${furthestLevel}`);
    

    gameState.currentSet = furthestSet;
    gameState.currentLevel = furthestLevel;
    

    closeProfileModal();
    

    showScreen('question-screen');
    startLevel(furthestLevel);
  }
  

  document.addEventListener('DOMContentLoaded', function() {

    const profileActions = document.querySelector('#profile-modal .profile-actions');
    
    if (profileActions) {

      const playButton = document.createElement('button');
      playButton.className = 'play-modal-btn';
      playButton.innerHTML = '<i class="fas fa-play"></i> Play Game';
      playButton.onclick = startGameFromStage;
      

      profileActions.insertBefore(playButton, profileActions.firstChild);
      

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
        
        
        .profile-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
        }
      `;
      document.head.appendChild(style);
    }
  });
  

const GameEconomy = {

  rewards: {

      correctAnswer: 10,
      wrongAnswer: -3,
      perfectLevel: 25,
      levelCompletion: 15,
      

      newWord: 5,
      wordMastery: 3,
      

      shortStreak: 5,
      mediumStreak: 10,
      longStreak: 20,
      

      bossDefeat: 100,
      setCompletion: 50,
      dailyLogin: 25,
      

      arcadeBase: 5,
      customPracticeBase: 8
  },
  

  perkCosts: {
      timeFreeze: [20, 30, 45, 65, 90],
      skip: [30, 45, 65, 90, 120],
      clue: [15, 25, 40, 60, 85],
      reveal: [50, 75, 100, 150, 200]
  },
  

  maxPerkLevel: 5,
  

  getPerkPrice: function(perkType, ownedAmount) {
      if (!this.perkCosts[perkType]) return 999;
      
      const level = Math.min(ownedAmount, this.perkCosts[perkType].length - 1);
      return this.perkCosts[perkType][level];
  },
  

  getStreakBonus: function(streak) {
      if (streak >= 10) return this.rewards.longStreak;
      if (streak >= 5) return this.rewards.mediumStreak;
      if (streak >= 3) return this.rewards.shortStreak;
      return 0;
  },
  

  getWordReward: function(isNewWord, practiceCount) {
      if (isNewWord) return this.rewards.newWord;
      

      const masteryReward = Math.max(
          this.rewards.wordMastery, 
          Math.floor(this.rewards.wordMastery * (5 / (practiceCount + 3)))
      );
      
      return masteryReward;
  }
};




function showCoinAnimation(x, y, amount) {

  if (amount <= 0) return;

  const coinText = document.createElement('div');
  coinText.className = 'coin-animation';
  coinText.textContent = `+${amount}`;
  

  coinText.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      color: var(--gold);
      font-weight: bold;
      font-size: 1.2rem;
      text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      animation: floatUpAndFade 1.5s ease-out forwards;
  `;
  
  document.body.appendChild(coinText);
  

  for (let i = 0; i < Math.min(amount, 8); i++) {
      const particle = document.createElement('div');
      const size = 5 + Math.random() * 10;
      
      particle.className = 'coin-particle';
      particle.style.cssText = `
          position: fixed;
          left: ${x}px;
          top: ${y}px;
          width: ${size}px;
          height: ${size}px;
          background: var(--gold);
          border-radius: 50%;
          pointer-events: none;
          z-index: 9998;
          transform: translate(-50%, -50%);
          animation: coinParticleAnim 1s ease-out forwards;
      `;
      

      const angle = Math.random() * Math.PI * 2;
      const distance = 30 + Math.random() * 50;
      particle.style.setProperty('--angle', angle);
      particle.style.setProperty('--distance', distance + 'px');
      
      document.body.appendChild(particle);
      

      setTimeout(() => {
          if (particle.parentNode) {
              particle.parentNode.removeChild(particle);
          }
      }, 1000);
  }
  

  setTimeout(() => {
      if (coinText.parentNode) {
          coinText.parentNode.removeChild(coinText);
      }
  }, 1500);
}


function addCoinAnimationStyles() {
  if (document.getElementById('coin-animation-styles')) return;
  
  const styleElement = document.createElement('style');
  styleElement.id = 'coin-animation-styles';
  styleElement.textContent = `
      @keyframes floatUpAndFade {
          0% { transform: translate(-50%, -50%); opacity: 0; }
          10% { transform: translate(-50%, -60%); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translate(-50%, -150%); opacity: 0; }
      }
      
      @keyframes coinParticleAnim {
          0% { transform: translate(-50%, -50%); opacity: 1; }
          100% { 
              transform: translate(
                  calc(-50% + Math.cos(var(--angle)) * var(--distance)), 
                  calc(-50% + Math.sin(var(--angle)) * var(--distance))
              ); 
              opacity: 0; 
          }
      }
  `;
  
  document.head.appendChild(styleElement);
}


document.addEventListener('DOMContentLoaded', addCoinAnimationStyles);


function setupInteractionTracking() {

  window.lastInteractionPos = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
  };
  

  document.addEventListener('mousemove', function(e) {
      window.lastInteractionPos = {
          x: e.clientX,
          y: e.clientY
      };
  }, {passive: true});
  

  document.addEventListener('touchmove', function(e) {
      if (e.touches && e.touches[0]) {
          window.lastInteractionPos = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY
          };
      }
  }, {passive: true});
  

  document.addEventListener('click', function(e) {
      window.lastInteractionPos = {
          x: e.clientX,
          y: e.clientY
      };
  }, {passive: true});
}


document.addEventListener('DOMContentLoaded', setupInteractionTracking);


const COIN_REWARDS = {

  CORRECT_ANSWER: 5,
  WRONG_ANSWER: -2,
  PERFECT_LEVEL_BONUS: 10,
  

  STREAK_THRESHOLD: 3,
  STREAK_BONUS: 1,
  

  NEW_WORD: 3,
  REPEAT_WORD: 1,
  

  BOSS_VICTORY: 100,
  

  SET_COMPLETION: 25,
  

  PERK_COSTS: {
      timeFreeze: 15,
      skip: 10,
      clue: 5,
      reveal: 20
  }
};


function updatePerkCosts() {

  document.querySelectorAll('.perk-button').forEach(button => {
      const perkType = button.getAttribute('data-perk-type');
      if (perkType && COIN_REWARDS.PERK_COSTS[perkType]) {
          const costDisplay = button.querySelector('.perk-cost');
          if (costDisplay) {
              costDisplay.textContent = COIN_REWARDS.PERK_COSTS[perkType];
          }
      }
  });
  

  if (typeof updatePerkButtons === 'function') {
      updatePerkButtons();
  }
}


document.addEventListener('DOMContentLoaded', function() {

  setTimeout(updatePerkCosts, 1000);
});

function restorePerksAfterResurrection() {
  const perksContainer = document.querySelector('.perks-container');
  if (perksContainer) {

      perksContainer.classList.remove('perks-disabled');
      const overlay = perksContainer.querySelector('.perks-disabled-overlay');
      if (overlay) {
          overlay.remove();
      }
      

      if (window.originalPerksState) {
          perksContainer.style.pointerEvents = window.originalPerksState.pointerEvents || '';
          perksContainer.style.opacity = window.originalPerksState.opacity || '';
          window.originalPerksState = null;
      } else {

          perksContainer.style.pointerEvents = '';
          perksContainer.style.opacity = '';
      }
  }
}

function restorePerksAfterResurrection() {
  const perksContainer = document.querySelector('.perks-container');
  if (perksContainer) {

      perksContainer.classList.remove('perks-disabled');
      const overlay = perksContainer.querySelector('.perks-disabled-overlay');
      if (overlay) {
          overlay.remove();
      }
      

      if (window.originalPerksState) {
          perksContainer.style.pointerEvents = window.originalPerksState.pointerEvents || '';
          perksContainer.style.opacity = window.originalPerksState.opacity || '';
          window.originalPerksState = null;
      } else {

          perksContainer.style.pointerEvents = '';
          perksContainer.style.opacity = '';
      }
  }
}


document.addEventListener('DOMContentLoaded', function() {

  setTimeout(function() {
      const homeButtons = document.querySelectorAll('.home-button, .main-menu-button, [data-action="home"]');
      console.log(`Found ${homeButtons.length} home button(s)`);
      
      homeButtons.forEach(button => {

          button.addEventListener('click', function(e) {
              console.log('HOME BUTTON CLICKED - PRESERVING PERKS STATE');
              

              if (gameState && gameState.unlockedPerks) {
                  try {
                      const perksArray = Array.from(gameState.unlockedPerks);
                      

                      localStorage.setItem("simploxPerksBackup", JSON.stringify(perksArray));
                      console.log("Backed up perks before home navigation:", perksArray);
                      

                      localStorage.setItem("simploxPerksBackupTime", Date.now().toString());
                  } catch (e) {
                      console.error("Error backing up perks:", e);
                  }
              }
          }, true);
      });
  }, 1000);
});

function handleUserLogout() {
  console.log("User logging out - clearing local game data");
  

  localStorage.removeItem("simploxProgress");
  localStorage.removeItem("simploxUnlockedPerks");
  localStorage.removeItem("simploxCustomLists");
  localStorage.removeItem("simploxWordStats");
  

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
  
  console.log("Local game data cleared");
}

const LOG_ENABLED = false;  // Set to true to enable logging

class ConsoleLogger {
    static log(...args) {
        if (LOG_ENABLED) {
            console.log(...args);
        }
    }

    static error(...args) {
        if (LOG_ENABLED) {
            console.error(...args);
        }
    }

    static warn(...args) {
        if (LOG_ENABLED) {
            console.warn(...args);
        }
    }

    static info(...args) {
        if (LOG_ENABLED) {
            console.info(...args);
        }
    }

    static debug(...args) {
        if (LOG_ENABLED) {
            console.debug(...args);
        }
    }

    // Optional: Capture and log errors to a tracking system
    static trackError(error, context = {}) {
        if (LOG_ENABLED) {
            console.error('Tracked Error:', error, context);
            // Here you could add integration with error tracking services
        }
    }

    // Method to globally enable/disable logging
    static setLoggingEnabled(enabled) {
        LOG_ENABLED = enabled;
    }
}

// Replace global console calls
window.console = {
    log: ConsoleLogger.log,
    error: ConsoleLogger.error,
    warn: ConsoleLogger.warn,
    info: ConsoleLogger.info,
    debug: ConsoleLogger.debug
};
