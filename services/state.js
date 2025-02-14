// ADD TO services/state.js

class SharedState {
    constructor() {
        this.gameState = {
            currentStage: 1,
            currentSet: 1,
            currentLevel: 1,
            coins: 0,
            unlockedSets: {},
            unlockedLevels: {},
            perfectLevels: new Set(),
            completedLevels: new Set(),
            perks: {
                timeFreeze: 0,
                skip: 0,
                clue: 0,
                reveal: 0
            }
        };

        this.currentUser = null;
        this.subscribers = new Set();
    }

    // State Updates
    setState(updates) {
        this.gameState = {
            ...this.gameState,
            ...updates
        };
        this.notifySubscribers();
    }

    // User Management
    setUser(user) {
        this.currentUser = user;
        this.notifySubscribers();
    }

    // Coin Management
    updateCoins(amount) {
        this.gameState.coins += amount;
        this.notifySubscribers();
        return this.gameState.coins;
    }

    // Level Management
    unlockLevel(stage, set, level) {
        const setKey = `${stage}_${set}`;
        if (!this.gameState.unlockedLevels[setKey]) {
            this.gameState.unlockedLevels[setKey] = new Set();
        }
        this.gameState.unlockedLevels[setKey].add(level);
        this.notifySubscribers();
    }

    unlockSet(stage, set) {
        if (!this.gameState.unlockedSets[stage]) {
            this.gameState.unlockedSets[stage] = new Set();
        }
        this.gameState.unlockedSets[stage].add(set);
        this.notifySubscribers();
    }

    // Progress Tracking
    markLevelComplete(stage, set, level, isPerfect = false) {
        const levelKey = `${stage}_${set}_${level}`;
        this.gameState.completedLevels.add(levelKey);
        if (isPerfect) {
            this.gameState.perfectLevels.add(levelKey);
        }
        this.notifySubscribers();
    }

    // Perk Management
    updatePerk(perkType, amount) {
        if (this.gameState.perks.hasOwnProperty(perkType)) {
            this.gameState.perks[perkType] += amount;
            this.notifySubscribers();
        }
    }

    // Subscription Management
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    notifySubscribers() {
        this.subscribers.forEach(callback => callback(this.gameState));
    }

    // State Persistence
    async saveState() {
        if (!this.currentUser) {
            localStorage.setItem('simploxProgress', JSON.stringify({
                ...this.gameState,
                perfectLevels: Array.from(this.gameState.perfectLevels),
                completedLevels: Array.from(this.gameState.completedLevels),
                unlockedSets: Object.fromEntries(
                    Object.entries(this.gameState.unlockedSets)
                        .map(([k, v]) => [k, Array.from(v)])
                ),
                unlockedLevels: Object.fromEntries(
                    Object.entries(this.gameState.unlockedLevels)
                        .map(([k, v]) => [k, Array.from(v)])
                )
            }));
        }
        // Database persistence will be handled by nhost.js
    }

    loadState() {
        const saved = localStorage.getItem('simploxProgress');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.gameState = {
                ...parsed,
                perfectLevels: new Set(parsed.perfectLevels),
                completedLevels: new Set(parsed.completedLevels),
                unlockedSets: Object.fromEntries(
                    Object.entries(parsed.unlockedSets)
                        .map(([k, v]) => [k, new Set(v)])
                ),
                unlockedLevels: Object.fromEntries(
                    Object.entries(parsed.unlockedLevels)
                        .map(([k, v]) => [k, new Set(v)])
                )
            };
            this.notifySubscribers();
        }
    }
}

export default SharedState;