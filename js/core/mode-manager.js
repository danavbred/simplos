class ModeManager {
    constructor() {
        this.currentMode = null;
        this.modes = new Map();
        this.loadingManager = new LoadingManager();
    }

    async switchMode(modeName) {
        this.loadingManager.showLoading();
        
        try {
            // Cleanup current mode
            if (this.currentMode) {
                await this.currentMode.cleanup();
            }

            // Lazy load new mode
            const mode = await this.loadMode(modeName);
            this.currentMode = mode;
            await mode.initialize();
            
        } finally {
            this.loadingManager.hideLoading();
        }
    }

    async loadMode(modeName) {
        if (!this.modes.has(modeName)) {
            const module = await import(`./${modeName}.js`);
            this.modes.set(modeName, new module.default());
        }
        return this.modes.get(modeName);
    }
}

export default ModeManager;