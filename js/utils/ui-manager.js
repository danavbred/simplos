import { stateManager } from '../state/state-manager.js';

class UIManager {
    constructor() {
        this.currentScreen = null;
        this.particles = new Set();
        this.notifications = [];
    }

    initialize() {
        this.setupScreenTransitions();
        this.setupParticleSystem();
    }

    // Screen Management
    showScreen(screenId, forceRefresh = false) {
        // Clean up current screen
        if (this.currentScreen === 'leaderboard-screen') {
            this.cleanupLeaderboard();
        }

        // Clear any running timer when leaving question screen
        if (this.currentScreen === 'question-screen') {
            document.dispatchEvent(new CustomEvent('clearTimer'));
        }

        // Handle force refresh
        if (forceRefresh && screenId === 'welcome-screen') {
            saveProgress();
            window.location.reload(true);
            return;
        }

        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('visible');
            
            // Remove existing particle containers
            const particleContainer = screen.querySelector('.particle-container');
            if (particleContainer) {
                particleContainer.remove();
            }
        });

        // Show target screen
        const screenElement = document.getElementById(screenId);
        if (!screenElement) {
            console.error(`Screen with id ${screenId} not found`);
            return;
        }
        
        screenElement.classList.add('visible');
        this.currentScreen = screenId;
        
        // Initialize particles for current screen
        this.initializeParticles(screenElement);
        
        // Update UI elements
        this.updateAllCoinDisplays();
        
        // Screen-specific initialization
        switch(screenId) {
            case 'question-screen':
                this.updatePerkCounts();
                break;
            case 'welcome-screen':
                if (this.restoreGameContext()) {
                    document.dispatchEvent(new CustomEvent('startGame'));
                }
                break;
            case 'stage-screen':
                this.updateStageDisplay();
                break;
        }
    }

    showLevelIntro(levelId, setupCallback) {
        const curtain = document.querySelector('.curtain-overlay');
        const titleContainer = document.querySelector('.curtain-title');
        const stageTitle = titleContainer.querySelector('h1');
        const levelTitle = titleContainer.querySelector('h2');
        
        stageTitle.textContent = `Stage ${stateManager.gameState.currentStage || 1}`;
        levelTitle.textContent = `Level ${stateManager.gameState.currentSet || 1}-${levelId}`;
        
        curtain.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0.4, 1)';
        curtain.style.transform = 'translateY(0)';
        
        setTimeout(() => {
            titleContainer.classList.add('show');
            
            setupCallback();
            
            setTimeout(() => {
                titleContainer.classList.remove('show');
                curtain.style.transition = 'transform 0.2s cubic-bezier(0.6, 0, 0.8, 1)';
                curtain.style.transform = 'translateY(-100%)';
            }, 1200);
        }, 200);
    }

    // Particle System
    setupParticleSystem() {
        this.particlePool = new Array(50).fill(null).map(() => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            return particle;
        });
    }

    createParticles(x, y, type = 'success') {
        const colors = type === 'success' ? 
            ['#4CAF50', '#45a049', '#357a38'] : 
            ['#f44336', '#e53935', '#c62828'];
        
        for (let i = 0; i < 15; i++) {
            const particle = this.particlePool.pop();
            if (!particle) return;

            const size = Math.random() * 8 + 4;
            const angle = Math.random() * Math.PI * 2;
            const velocity = Math.random() * 100 + 50;
            
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            
            document.body.appendChild(particle);

            const animation = particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity}px) scale(0)`, opacity: 0 }
            ], {
                duration: 1000,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
            });

            animation.onfinish = () => {
                particle.remove();
                this.particlePool.push(particle);
            };
        }
    }

    // Question Display
    displayQuestion(questionData) {
        const { questionWord, options, correctAnswer } = questionData;
        
        document.getElementById('question-word').textContent = questionWord;
        
        const buttonsDiv = document.getElementById('buttons');
        buttonsDiv.innerHTML = '';
        
        options
            .sort(() => Math.random() - 0.5)
            .forEach(option => {
                const button = document.createElement('button');
                button.textContent = option;
                button.onclick = () => {
                    document.dispatchEvent(new CustomEvent('answerSubmitted', {
                        detail: { isCorrect: option === correctAnswer }
                    }));
                };
                buttonsDiv.appendChild(button);
            });
    }

    // Timer UI
    updateTimerDisplay(timeRemaining) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        const timerElement = document.querySelector('.timer-value');
        if (timerElement) {
            timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }

    updateTimerCircle(timeRemaining, totalTime) {
        const progress = document.querySelector('.timer-progress');
        if (!progress) return;

        const radius = 40;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - timeRemaining / totalTime);
        
        progress.style.strokeDasharray = `${circumference} ${circumference}`;
        progress.style.strokeDashoffset = offset;

        if (timeRemaining <= 10) {
            progress.classList.add('warning');
        } else {
            progress.classList.remove('warning');
        }
    }

    // Progress Updates
    updateProgressCircle(progress) {
        const circle = document.querySelector('.progress-circle .progress');
        if (!circle) return;

        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - progress);
        
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        circle.style.strokeDashoffset = offset;

        if (progress >= 1) {
            this.handleLevelComplete();
        }
    }

    // Notifications
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `game-notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        requestAnimationFrame(() => notification.classList.add('show'));

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    // Utility Methods
    animateNumber(element, start, end, duration = 500) {
        if (!element) return;
        
        const startNum = Number(start);
        const endNum = Number(end);
        const diff = endNum - startNum;
        
        if (diff === 0) {
            element.textContent = endNum;
            return;
        }

        const increment = diff / 30;
        let current = startNum;
        let frame = 0;

        const animate = () => {
            current += increment;
            frame++;

            if (frame >= 30 || 
                (increment > 0 && current >= endNum) || 
                (increment < 0 && current <= endNum)) {
                element.textContent = Math.round(endNum);
                return;
            }

            element.textContent = Math.round(current);
            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    clearTimerUI() {
        const timerProgress = document.querySelector('.timer-progress');
        if (timerProgress) {
            timerProgress.classList.remove('warning');
            timerProgress.style.strokeDashoffset = '0';
        }
    }

    eliminateWrongAnswer() {
        const buttons = document.querySelectorAll('.buttons button');
        const correctAnswer = buttons[Math.floor(Math.random() * buttons.length)];
        
        buttons.forEach(button => {
            if (button !== correctAnswer) {
                button.disabled = true;
                button.style.opacity = '0.5';
            }
        });
    }

    // Modal Management
    showGameOverOverlay(callback) {
        const overlay = document.querySelector('.failure-overlay');
        overlay.style.display = 'flex';
        
        setTimeout(() => {
            overlay.classList.add('show');
        }, 100);

        overlay.querySelector('.restart-button').onclick = () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.style.display = 'none';
                if (callback) callback();
            }, 1000);
        };

        overlay.querySelector('.home-button').onclick = () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.style.display = 'none';
                this.showScreen('welcome-screen');
            }, 1000);
        };
    }

    updateAuthUI() {
        const sidePanel = document.querySelector('.side-panel');
        const userProfileSection = document.querySelector('.user-profile-section');
        const userEmailElement = document.getElementById('userEmail');
        const logoutButton = document.querySelector('.logout-button');
        const mainLoginButton = document.querySelector('.main-button.primary');

        const currentUser = stateManager.getCurrentUser();

        if (currentUser) {
            if (userProfileSection) userProfileSection.style.display = 'block';
            if (logoutButton) logoutButton.style.display = 'block';
            if (userEmailElement) {
                userEmailElement.textContent = currentUser.user_metadata?.username || currentUser.email;
            }
            if (mainLoginButton) mainLoginButton.style.display = 'none';
        } else {
            if (userProfileSection) userProfileSection.style.display = 'none';
            if (logoutButton) logoutButton.style.display = 'none';
            if (userEmailElement) userEmailElement.textContent = '';
            if (mainLoginButton) mainLoginButton.style.display = 'block';
        }
    }
}

// Export singleton instance
export const uiManager = new UIManager();