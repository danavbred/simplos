class SyncManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.syncQueue = new SyncQueue();
        this.isSyncing = false;
    }

    async queueSync(change) {
        await this.syncQueue.add(change);
        if (navigator.onLine && !this.isSyncing) {
            await this.processQueue();
        }
    }

    async processQueue() {
        this.isSyncing = true;
        try {
            const changes = await this.syncQueue.getAll();
            for (const change of changes) {
                await supabaseClient.updateGameState(change);
                await this.syncQueue.remove(change.id);
            }
        } finally {
            this.isSyncing = false;
        }
    }
}

export default SyncManager;