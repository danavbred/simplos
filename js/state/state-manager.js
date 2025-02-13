class StateManager {
    constructor() {
        this.initialized = false;
        this.supabase = window.supabaseClient; // Reference to global supabase client
        this.gameState = {
            currentStage: 1,
            currentSet: 1,
            currentLevel: 1,
            unlockedSets: {},
            unlockedLevels: {},
            perfectLevels: new Set(),
            completedLevels: new Set(),
            coins: 0,
            perks: {
                timeFreeze: 0,
                skip: 0,
                clue: 0,
                reveal: 0
            }
        };
        this.observers = new Map();
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Check for existing session
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                await this.loadUserState(session.user.id);
            } else {
                this.setupDefaultState();
            }
            
            this.initialized = true;
            this.notifyObservers('stateInitialized');
            
        } catch (error) {
            console.error('State initialization error:', error);
            this.setupDefaultState();
        }
    }

    async loadUserState(userId) {
        try {
            // Load game progress
            const { data: progress, error } = await this.supabase
                .from('game_progress')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // Record not found
                    await this.createInitialProgress(userId);
                } else {
                    throw error;
                }
            } else if (progress) {
                this.gameState = {
                    ...this.gameState,
                    currentStage: progress.stage || 1,
                    currentSet: progress.set_number || 1,
                    coins: progress.coins || 0,
                    perks: progress.perks || this.gameState.perks,
                    unlockedSets: this.convertSetsFromDB(progress.unlocked_sets),
                    unlockedLevels: this.convertLevelsFromDB(progress.unlocked_levels),
                    perfectLevels: new Set(progress.perfect_levels || []),
                    completedLevels: new Set(progress.completed_levels || [])
                };
            }

        } catch (error) {
            console.error('Error loading user state:', error);
            this.setupDefaultState();
        }
    }

    async saveState() {
        const session = await this.supabase.auth.getSession();
        if (!session?.data?.session?.user) return;

        const userId = session.data.session.user.id;
        const stateForDB = {
            user_id: userId,
            stage: this.gameState.currentStage,
            set_number: this.gameState.currentSet,
            coins: this.gameState.coins,
            perks: this.gameState.perks,
            unlocked_sets: this.convertSetsForDB(),
            unlocked_levels: this.convertLevelsForDB(),
            perfect_levels: Array.from(this.gameState.perfectLevels),
            completed_levels: Array.from(this.gameState.completedLevels)
        };

        try {
            const { error } = await this.supabase
                .from('game_progress')
                .upsert(stateForDB);

            if (error) throw error;
            this.notifyObservers('stateSaved');
            
        } catch (error) {
            console.error('Error saving state:', error);
        }
    }

    setupDefaultState() {
        // Set up default unlocks for stage 1
        this.gameState.unlockedSets = { "1": new Set([1]) };
        this.gameState.unlockedLevels = { "1_1": new Set([1]) };
        this.notifyObservers('stateChanged');
    }

    // State Update Methods
    updateCoins(amount) {
        this.gameState.coins = Math.max(0, this.gameState.coins + amount);
        this.notifyObservers('coinsChanged');
        this.saveState();
    }

    updatePerks(perkType, amount) {
        if (this.gameState.perks.hasOwnProperty(perkType)) {
            this.gameState.perks[perkType] = Math.max(0, this.gameState.perks[perkType] + amount);
            this.notifyObservers('perksChanged');
            this.saveState();
        }
    }

    unlockLevel(stage, set, level) {
        const setKey = `${stage}_${set}`;
        if (!this.gameState.unlockedLevels[setKey]) {
            this.gameState.unlockedLevels[setKey] = new Set();
        }
        this.gameState.unlockedLevels[setKey].add(level);
        this.notifyObservers('levelsChanged');
        this.saveState();
    }

    markLevelComplete(stage, set, level, isPerfect = false) {
        const levelKey = `${stage}_${set}_${level}`;
        this.gameState.completedLevels.add(levelKey);
        if (isPerfect) {
            this.gameState.perfectLevels.add(levelKey);
        }
        this.notifyObservers('progressChanged');
        this.saveState();
    }

    // Observer Pattern
    addObserver(event, callback) {
        if (!this.observers.has(event)) {
            this.observers.set(event, new Set());
        }
        this.observers.get(event).add(callback);
    }

    removeObserver(event, callback) {
        if (this.observers.has(event)) {
            this.observers.get(event).delete(callback);
        }
    }

    notifyObservers(event) {
        if (this.observers.has(event)) {
            this.observers.get(event).forEach(callback => callback(this.gameState));
        }
    }

    // Utility Methods
    convertSetsForDB() {
        return Object.fromEntries(
            Object.entries(this.gameState.unlockedSets)
                .map(([k, v]) => [k, Array.from(v)])
        );
    }

    convertSetsFromDB(dbSets) {
        return Object.fromEntries(
            Object.entries(dbSets || {})
                .map(([k, v]) => [k, new Set(v)])
        );
    }

    convertLevelsForDB() {
        return Object.fromEntries(
            Object.entries(this.gameState.unlockedLevels)
                .map(([k, v]) => [k, Array.from(v)])
        );
    }

    convertLevelsFromDB(dbLevels) {
        return Object.fromEntries(
            Object.entries(dbLevels || {})
                .map(([k, v]) => [k, new Set(v)])
        );
    }
}

// Export singleton instance
export const stateManager = new StateManager();