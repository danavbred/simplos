class SupabaseClient {
    constructor() {
        this.client = window.supabaseClient;
        this.currentUser = null;
        this.subscriptions = new Map();
    }

    async initialize() {
        try {
            // Check existing session
            const { data: { session }, error } = await this.client.auth.getSession();
            if (error) throw error;
            
            if (session) {
                this.currentUser = session.user;
                await this.setupUserProfile();
                this.initializeStatusListener();
            }
            
            // Set up auth state change listener
            this.client.auth.onAuthStateChange(async (event, session) => {
                await this.handleAuthChange(event, session);
            });
            
        } catch (error) {
            console.error('Supabase initialization error:', error);
        }
    }

    async handleAuthChange(event, session) {
        if (event === 'SIGNED_IN') {
            this.currentUser = session.user;
            await this.setupUserProfile();
            this.initializeStatusListener();
        } else if (event === 'SIGNED_OUT') {
            this.currentUser = null;
            this.cleanup();
        }
    }

    async signUp(email, password, username) {
        try {
            const { data, error } = await this.client.auth.signUp({
                email,
                password,
                options: {
                    data: { 
                        username: username,
                        full_name: username
                    }
                }
            });

            if (error) throw error;

            // Initialize user profile
            await this.client
                .from('user_profiles')
                .upsert({
                    id: data.user.id,
                    username: username,
                    email: email,
                    status: 'free',
                    role: 'student'
                });

            // Initialize game progress
            await this.client
                .from('game_progress')
                .upsert({
                    user_id: data.user.id,
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

            return data;

        } catch (error) {
            console.error('SignUp error:', error);
            throw error;
        }
    }

    async signIn(email, password) {
        try {
            const { data, error } = await this.client.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return data;

        } catch (error) {
            console.error('SignIn error:', error);
            throw error;
        }
    }

    async signOut() {
        try {
            const { error } = await this.client.auth.signOut();
            if (error) throw error;
            this.cleanup();
        } catch (error) {
            console.error('SignOut error:', error);
            throw error;
        }
    }

    async setupUserProfile() {
        if (!this.currentUser) return;

        try {
            const { data: profile, error } = await this.client
                .from('user_profiles')
                .select('status, role')
                .eq('id', this.currentUser.id)
                .single();

            if (error) throw error;

            this.currentUser.status = profile.status;
            this.currentUser.role = profile.role;

        } catch (error) {
            console.error('Profile setup error:', error);
        }
    }

    initializeStatusListener() {
        if (!this.currentUser) return;

        // Clear any existing subscription
        if (this.subscriptions.has('status')) {
            this.client.removeChannel(this.subscriptions.get('status'));
        }

        // Subscribe to profile changes
        const statusSubscription = this.client
            .channel(`public:user_profiles:id=eq.${this.currentUser.id}`)
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'user_profiles' },
                payload => {
                    if (payload.new && payload.new.status) {
                        this.currentUser.status = payload.new.status;
                        window.dispatchEvent(new CustomEvent('userStatusChanged', {
                            detail: { status: payload.new.status }
                        }));
                    }
                }
            )
            .subscribe();

        this.subscriptions.set('status', statusSubscription);
    }

    cleanup() {
        // Clear all subscriptions
        this.subscriptions.forEach(subscription => {
            this.client.removeChannel(subscription);
        });
        this.subscriptions.clear();
    }

    // Game Progress Methods
    async updateGameProgress(progress) {
        if (!this.currentUser) return;

        try {
            const { error } = await this.client
                .from('game_progress')
                .upsert({
                    user_id: this.currentUser.id,
                    ...progress
                });

            if (error) throw error;

        } catch (error) {
            console.error('Progress update error:', error);
            throw error;
        }
    }

    async getUserProgress() {
        if (!this.currentUser) return null;

        try {
            const { data, error } = await this.client
                .from('game_progress')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .single();

            if (error) throw error;
            return data;

        } catch (error) {
            console.error('Progress fetch error:', error);
            return null;
        }
    }

    async updatePlayerStats(stats) {
        if (!this.currentUser) return;

        try {
            const { error } = await this.client
                .from('player_stats')
                .upsert({
                    user_id: this.currentUser.id,
                    ...stats,
                    last_updated: new Date().toISOString()
                });

            if (error) throw error;

        } catch (error) {
            console.error('Stats update error:', error);
        }
    }
}

// Export singleton instance
export const supabaseManager = new SupabaseClient();