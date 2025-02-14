// ADD TO services/nhost.js

import { NhostClient } from '@nhost/nhost-js';
import SharedState from './state.js';

const nhostClient = new NhostClient({
    subdomain: 'pgeulffersfwphrklvoe',
    region: 'eu-central-1',
    adminSecret: 'nhost_admin_871b36e9f4d2c5a3'
});

class GameService {
    constructor() {
        this.state = new SharedState();
        this.subscriptions = new Map();
    }

    // Authentication Methods
    async signUp({ email, password, username }) {
        try {
            const { data, error } = await nhostClient.auth.signUp({
                email,
                password,
                options: {
                    displayName: username,
                    metadata: { username }
                }
            });

            if (error) throw error;

            // Initialize user profile
            await nhostClient.graphql.request(`
                mutation ($userId: uuid!, $username: String!, $email: String!) {
                    insert_user_profiles_one(object: {
                        id: $userId,
                        username: $username,
                        email: $email,
                        role: "student",
                        status: "free"
                    }) {
                        id
                    }
                }
            `, {
                userId: data.user.id,
                username,
                email
            });

            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }

    async signIn({ email, password }) {
        try {
            const { data, error } = await nhostClient.auth.signIn({
                email,
                password
            });

            if (error) throw error;

            // Load user data
            await this.loadUserData(data.user.id);

            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }

    async signOut() {
        try {
            await nhostClient.auth.signOut();
            this.state.setUser(null);
            this.state.loadState(); // Load guest state
            return { error: null };
        } catch (error) {
            return { error };
        }
    }

    // User Data Management
    async loadUserData(userId) {
        try {
            const { data } = await nhostClient.graphql.request(`
                query GetUserData($userId: uuid!) {
                    user_profiles_by_pk(id: $userId) {
                        status
                        role
                        username
                        game_progress {
                            coins
                            perks
                            unlocked_sets
                            unlocked_levels
                            perfect_levels
                            completed_levels
                        }
                    }
                }
            `, { userId });

            if (data?.user_profiles_by_pk) {
                const { game_progress, ...profile } = data.user_profiles_by_pk;
                this.state.setUser({ id: userId, ...profile });
                if (game_progress) {
                    this.state.setState(game_progress);
                }
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // Game Progress
    async updateCoins(amount) {
        const newTotal = this.state.updateCoins(amount);
        
        if (this.state.currentUser) {
            try {
                await nhostClient.graphql.request(`
                    mutation UpdateCoins($userId: uuid!, $coins: Int!) {
                        update_game_progress(
                            where: { user_id: { _eq: $userId } }
                            _set: { coins: $coins }
                        ) {
                            affected_rows
                        }
                    }
                `, {
                    userId: this.state.currentUser.id,
                    coins: newTotal
                });
            } catch (error) {
                console.error('Error updating coins:', error);
            }
        }
    }

    // Real-time Subscriptions
    subscribeToUserStatus(userId, callback) {
        const subscription = nhostClient.graphql.subscribe(`
            subscription UserStatus($userId: uuid!) {
                user_profiles_by_pk(id: $userId) {
                    status
                }
            }
        `, { userId });

        subscription.on('data', ({ data }) => {
            if (data?.user_profiles_by_pk) {
                callback(data.user_profiles_by_pk.status);
            }
        });

        this.subscriptions.set('userStatus', subscription);
        return () => {
            subscription.unsubscribe();
            this.subscriptions.delete('userStatus');
        };
    }

    // Wordcraft Lists
    async saveWordcraftList(list) {
        if (!this.state.currentUser) return { error: 'Not authenticated' };

        try {
            const { data, error } = await nhostClient.graphql.request(`
                mutation SaveList($list: wordcraft_lists_insert_input!) {
                    insert_wordcraft_lists_one(object: $list) {
                        id
                    }
                }
            `, { list });

            return { data, error };
        } catch (error) {
            return { error };
        }
    }

    // Arcade Session Management
    async createArcadeSession(teacherId, wordPool) {
        try {
            const { data, error } = await nhostClient.graphql.request(`
                mutation CreateArcadeSession($teacherId: uuid!, $wordPool: jsonb!) {
                    insert_arcade_events_one(object: {
                        teacher_id: $teacherId,
                        word_pool: $wordPool,
                        status: "waiting"
                    }) {
                        id
                        otp
                    }
                }
            `, { teacherId, wordPool });

            return { data, error };
        } catch (error) {
            return { error };
        }
    }

    // Clean up
    cleanup() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe());
        this.subscriptions.clear();
    }
}

export const gameService = new GameService();
export default gameService;