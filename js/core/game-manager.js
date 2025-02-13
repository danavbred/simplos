import { stateManager } from '../state/state-manager.js';
import { supabaseManager } from '../services/supabase-client.js';
import { uiManager } from '../utils/ui-manager.js';

class GameManager {
    constructor() {
        this.currentGame = {
            words: [],
            translations: [],
            currentIndex: 0,
            correctAnswers: 0,
            firstAttempt: true,
            isHebrewToEnglish: false,
            mixed: false,
            startTime: 0,
            levelStartTime: 0,
            timeBonus: 0,
            streakBonus: true,
            questionStartTime: 0,
            wrongStreak: 0,
            progressLost: 0
        };
        
        this.timer = null;
        this.timeRemaining = 0;
        this.isFrozen = false;
    }

    async initialize() {
        await stateManager.initialize();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Level progression events
        document.addEventListener('levelComplete', async (e) => {
            await this.handleLevelCompletion(e.detail);
        });

        // Answer events
        document.addEventListener('answerSubmitted', (e) => {
            this.handleAnswer(e.detail.isCorrect);
        });

        // Perk usage events
        document.addEventListener('perkUsed', (e) => {
            this.handlePerkUsage(e.detail.perkType);
        });
    }

    async startLevel(levelId) {
        this.clearLevel();

        const stage = stateManager.gameState.currentStage;
        const set = stateManager.gameState.currentSet;
        const setKey = `${stage}_${set}`;
        const levelConfig = this.calculateWordsForLevel(levelId, window.vocabularySets[setKey]);

        this.currentGame = {
            ...this.currentGame,
            words: levelConfig.words,
            translations: levelConfig.translations,
            currentIndex: 0,
            correctAnswers: 0,
            firstAttempt: true,
            isHebrewToEnglish: levelConfig.isHebrewToEnglish || false,
            mixed: levelConfig.mixed || false,
            startTime: Date.now(),
            levelStartTime: Date.now(),
            timeBonus: 0,
            streakBonus: true,
            questionStartTime: 0,
            wrongStreak: 0,
            progressLost: 0
        };

        uiManager.showLevelIntro(levelId, () => {
            uiManager.showScreen('question-screen');
            this.loadNextQuestion();
            this.startTimer(this.currentGame.words.length);
        });
    }

    calculateWordsForLevel(level, vocabulary) {
        // Same logic as before for calculating word sets
        // This would contain the extensive level configuration logic
        // Return words, translations, and level settings
    }

    startTimer(questionCount) {
        this.clearTimer();
        if (this.currentGame.currentIndex >= this.currentGame.words.length) return;
        
        if (!this.currentGame.initialTimeRemaining) {
            this.currentGame.initialTimeRemaining = questionCount * 10;
            this.timeRemaining = this.currentGame.initialTimeRemaining;
            this.currentGame.totalTime = this.timeRemaining;
        } else {
            this.timeRemaining = this.currentGame.initialTimeRemaining;
        }
        
        this.currentGame.questionStartTime = Date.now();
        uiManager.updateTimerDisplay(this.timeRemaining);
        uiManager.updateTimerCircle(this.timeRemaining, this.currentGame.totalTime);
        
        this.timer = setInterval(() => {
            if (!this.isFrozen) {
                this.timeRemaining = Math.max(0, this.timeRemaining - 1);
                uiManager.updateTimerDisplay(this.timeRemaining);
                uiManager.updateTimerCircle(this.timeRemaining, this.currentGame.totalTime);
                
                this.currentGame.initialTimeRemaining = this.timeRemaining;
                
                if (this.timeRemaining <= 10) {
                    uiManager.addTimerWarning();
                }
                
                if (this.timeRemaining <= 0) {
                    this.handleTimeUp();
                }
            }
        }, 1000);
    }

    clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.timeRemaining = 0;
        this.isFrozen = false;
        uiManager.clearTimerUI();
    }

    loadNextQuestion() {
        if (this.currentGame.currentIndex >= this.currentGame.words.length) {
            this.handleLevelCompletion();
            return;
        }

        this.currentGame.questionStartTime = Date.now();
        this.currentGame.firstAttempt = true;

        const isHebrewToEnglish = this.currentGame.mixed ? 
            Math.random() < 0.5 : this.currentGame.isHebrewToEnglish;

        const questionData = this.prepareQuestionData(isHebrewToEnglish);
        uiManager.displayQuestion(questionData);
    }

    prepareQuestionData(isHebrewToEnglish) {
        const currentIndex = this.currentGame.currentIndex;
        const questionWord = isHebrewToEnglish ? 
            this.currentGame.translations[currentIndex] : 
            this.currentGame.words[currentIndex];
        
        let options = new Set([isHebrewToEnglish ? 
            this.currentGame.words[currentIndex] : 
            this.currentGame.translations[currentIndex]]);
            
        while (options.size < 3) {
            const randomIndex = Math.floor(Math.random() * this.currentGame.words.length);
            options.add(isHebrewToEnglish ? 
                this.currentGame.words[randomIndex] : 
                this.currentGame.translations[randomIndex]);
        }

        return {
            questionWord,
            options: Array.from(options),
            correctAnswer: isHebrewToEnglish ? 
                this.currentGame.words[currentIndex] : 
                this.currentGame.translations[currentIndex]
        };
    }

    async handleAnswer(isCorrect) {
        if (!isCorrect) {
            this.currentGame.firstAttempt = false;
            this.currentGame.streakBonus = false;
            this.currentGame.wrongStreak++;
            
            await stateManager.updateCoins(-3);
            
            if (this.currentGame.currentIndex > 0) {
                this.currentGame.progressLost++;
                this.currentGame.currentIndex = Math.max(0, this.currentGame.currentIndex - 1);
            }

            if (this.currentGame.wrongStreak >= 3) {
                this.handleGameOver();
                return;
            }
        } else {
            this.currentGame.wrongStreak = 0;
            
            if (this.currentGame.firstAttempt) {
                const timeBonus = this.calculateTimeBonus();
                if (timeBonus > 0) {
                    await stateManager.updateCoins(timeBonus);
                }
                await stateManager.updateCoins(3);
            } else {
                await stateManager.updateCoins(1);
            }
            
            this.currentGame.correctAnswers++;
            this.currentGame.currentIndex++;
        }

        uiManager.updateProgressCircle(
            this.currentGame.currentIndex / this.currentGame.words.length
        );

        await stateManager.saveState();

        setTimeout(() => {
            if (this.currentGame.currentIndex < this.currentGame.words.length) {
                this.startTimer(this.currentGame.words.length - this.currentGame.currentIndex);
                this.loadNextQuestion();
            } else {
                this.handleLevelCompletion();
            }
        }, 333);
    }

    calculateTimeBonus() {
        const timeSpent = (Date.now() - this.currentGame.questionStartTime) / 1000;
        const maxTime = 10;
        if (timeSpent < maxTime) {
            const bonusCoins = Math.floor(maxTime - timeSpent);
            this.currentGame.timeBonus += bonusCoins;
            return bonusCoins;
        }
        return 0;
    }

    handleTimeUp() {
        this.clearTimer();
        uiManager.showGameOverOverlay();
    }

    handleGameOver() {
        this.clearTimer();
        uiManager.showGameOverOverlay(() => {
            this.startLevel(stateManager.gameState.currentLevel);
        });
    }

    async handleLevelCompletion() {
        this.clearTimer();
        const levelKey = `${stateManager.gameState.currentStage}_${stateManager.gameState.currentSet}_${stateManager.gameState.currentLevel}`;
        const isPerfectRun = !stateManager.gameState.perfectLevels.has(levelKey) && 
                            this.currentGame.streakBonus && 
                            this.currentGame.correctAnswers === this.currentGame.words.length;

        if (isPerfectRun) {
            await stateManager.updateCoins(5);
            await stateManager.markLevelComplete(
                stateManager.gameState.currentStage,
                stateManager.gameState.currentSet,
                stateManager.gameState.currentLevel,
                true
            );
            this.handleProgression();
        } else {
            this.startLevel(stateManager.gameState.currentLevel);
        }
    }

    handleProgression() {
        // Handle level progression logic
        // This would contain the logic for unlocking new levels and sets
    }

    handlePerkUsage(perkType) {
        if (stateManager.gameState.perks[perkType] <= 0) return;

        switch (perkType) {
            case 'timeFreeze':
                this.isFrozen = true;
                stateManager.updatePerks(perkType, -1);
                setTimeout(() => {
                    this.isFrozen = false;
                }, 5000);
                break;
            case 'skip':
            case 'reveal':
                stateManager.updatePerks(perkType, -1);
                this.handleAnswer(true, true);
                break;
            case 'clue':
                stateManager.updatePerks(perkType, -1);
                uiManager.eliminateWrongAnswer();
                break;
        }
    }

    clearLevel() {
        this.clearTimer();
        this.isFrozen = false;
    }
}

// Export singleton instance
export const gameManager = new GameManager();