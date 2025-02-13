// /js/core/initialization.js

import { stateManager } from '../state/state-manager.js';
import { supabaseManager } from '../services/supabase-client.js';
import { gameManager } from './game-manager.js';
import { uiManager } from '../utils/ui-manager.js';
import { particleSystem } from '../utils/particle-system.js';

export const gameInitialization = {
    async init() {
        try {
            // Initialize managers in the correct order
            await stateManager.initialize();
            await supabaseManager.initialize();
            await gameManager.initialize();
            uiManager.initialize();
            
            // Initialize particle system
            this.initializeParticles();
            
            // Set up global event listeners
            this.setupEventListeners();
            
            // Hide loading overlay when everything is ready
            document.getElementById('loading-overlay').style.display = 'none';
            
        } catch (error) {
            console.error('Initialization error:', error);
        }
    },

    setupEventListeners() {
        // Auth-related events
        document.addEventListener('userLoggedIn', this.handleUserLogin.bind(this));
        document.addEventListener('userLoggedOut', this.handleUserLogout.bind(this));
        
        // Screen transitions
        document.addEventListener('screenChange', this.handleScreenChange.bind(this));
        
        // Modal handling
        document.addEventListener('modalOpen', this.handleModalOpen.bind(this));
        document.addEventListener('modalClose', this.handleModalClose.bind(this));
        
        // Click outside handlers for modals
        document.addEventListener('click', (e) => {
            // Handle auth modal clicks outside
            const authModal = document.getElementById('authModal');
            const authContent = authModal?.querySelector('.auth-modal-content');
            if (authModal?.classList.contains('show') && 
                !authContent.contains(e.target) && 
                !e.target.matches('.main-button')) {
                this.closeModal('authModal');
            }
            
            // Handle side panel clicks outside
            const sidePanel = document.querySelector('.side-panel');
            const hamburgerButton = document.querySelector('.hamburger-button');
            if (sidePanel.classList.contains('open') && 
                !sidePanel.contains(e.target) && 
                !hamburgerButton.contains(e.target)) {
                this.closeSidePanel();
            }
        });
        
        // Performance optimization: Use throttled resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            if (!resizeTimeout) {
                resizeTimeout = setTimeout(() => {
                    this.handleResize();
                    resizeTimeout = null;
                }, 66); // ~15fps
            }
        });
    },

    handleUserLogin(event) {
        const { user } = event.detail;
        // Update UI for logged-in state
        uiManager.updateAuthUI(user);
        // Load user's saved state
        stateManager.loadUserState(user.id);
    },

    handleUserLogout() {
        // Clear state and return to default
        stateManager.setupDefaultState();
        // Update UI for logged-out state
        uiManager.updateAuthUI(null);
        // Show welcome screen
        this.showScreen('welcome-screen');
    },

    handleScreenChange(event) {
        const { screenId, forceRefresh } = event.detail;
        const currentScreen = document.querySelector('.screen.visible');
        
        // Clean up current screen
        if (currentScreen) {
            // Remove event listeners specific to the current screen
            this.cleanupScreenEvents(currentScreen.id);
            // Remove any running animations
            this.cleanupAnimations(currentScreen);
        }
        
        // Initialize new screen
        this.initializeScreen(screenId);
    },

    initializeParticles() {
    // Initialize particles for welcome screen by default
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
        particleSystem.initializeContainer(welcomeScreen);
    }

    window.addEventListener('resize', () => {
        const currentScreen = document.querySelector('.screen.visible');
        if (currentScreen) {
            particleSystem.cleanup(currentScreen);
            particleSystem.initializeContainer(currentScreen);
            }
        });
    }

    initializeScreen(screenId) {
        const screen = document.getElementById(screenId);
        if (!screen) return;
        
        // Clean up particles from previous screen
        const previousScreen = document.querySelector('.screen.visible');
        if (previousScreen) {
            particleSystem.cleanup(previousScreen);
        }
        
        // Initialize particles for new screen
        particleSystem.initializeContainer(screen);
        
        // Set up screen-specific event listeners
        this.setupScreenEvents(screenId);
        
        // Show screen with transition
        requestAnimationFrame(() => {
            screen.classList.add('visible');
        });
    },

    handleModalOpen(event) {
        const { modalId, data } = event.detail;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Pre-populate modal data if provided
        if (data) {
            this.populateModal(modal, data);
        }
        
        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
    },

    handleModalClose(event) {
        const { modalId } = event.detail;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Hide modal with animation
        modal.classList.remove('show');
        
        // Clean up after animation
        modal.addEventListener('transitionend', () => {
            // Clear any form data
            const forms = modal.querySelectorAll('form');
            forms.forEach(form => form.reset());
        }, { once: true });
    },

    cleanupScreenEvents(screenId) {
        // Remove screen-specific event listeners
        // This will be populated based on each screen's needs
    },

    cleanupAnimations(screen) {
        // Remove any ongoing animations
        const animations = screen.getAnimations();
        animations.forEach(animation => animation.cancel());
    },

    handleResize() {
        // Update particle system
        particleSystem.updateParticles();
        // Update UI elements that depend on screen size
        uiManager.handleResize();
    }
};