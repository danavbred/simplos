// auth.js

// Initialize Supabase client
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://mczfgzffyyyacisrccqb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jemZnemZmeXl5YWNpc3JjY3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzczNzY5NDYsImV4cCI6MjA1Mjk1Mjk0Nn0.iTvzt-vkFP7rLn5-FHztMEzkF6DMqMh5zcKJzgyvUfo'
);

// Auth state management
let currentUser = null;
let authStateChangeCallbacks = [];

// Toggle between login and signup forms
export function toggleAuthForm(type) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if (type === 'login') {
        loginForm.style.display = 'flex';
        signupForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        signupForm.style.display = 'flex';
    }
}

// Handle user login
export async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        
        // Notify listeners of successful login
        notifyAuthStateChange('SIGNED_IN', data.session);
        
        return { success: true, data };
        
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
}

// Handle user signup
export async function handleSignup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const role = document.getElementById('signup-role').value;
    
    if (!email || !password || !role) {
        return { success: false, error: 'Please fill in all fields' };
    }

    try {
        // Create user account
        const { data, error: signupError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { 
                    role: role,
                    user_type: role
                }
            }
        });

        if (signupError) throw signupError;

        if (data.user) {
            // Create user profile
            const { error: profileError } = await createUserProfile(data.user.id, role);
            if (profileError) throw profileError;

            return { success: true, message: 'Please check your email to confirm your account.' };
        }
        
    } catch (error) {
        console.error('Signup error:', error);
        return { success: false, error: error.message };
    }
}

// Create user profile in the database
async function createUserProfile(userId, userType) {
    try {
        const { error } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                user_type: userType,
                created_at: new Date(),
                updated_at: new Date()
            });

        return { success: !error, error };
    } catch (error) {
        return { success: false, error };
    }
}

// Handle user logout
export async function handleLogout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        currentUser = null;
        
        // Notify listeners of logout
        notifyAuthStateChange('SIGNED_OUT', null);
        
        return { success: true };
        
    } catch (error) {
        console.error('Logout error:', error);
        return { success: false, error: error.message };
    }
}

// Check current user session
export async function checkUser() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
            currentUser = session.user;
            return { success: true, user: session.user };
        }
        
        return { success: true, user: null };
        
    } catch (error) {
        console.error('Session check error:', error);
        return { success: false, error: error.message };
    }
}

// Load user data including profile and preferences
export async function loadUserData() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            return { success: false, error: 'No active session' };
        }

        // Get user profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError) throw profileError;

        return { success: true, data: { ...session.user, profile } };
        
    } catch (error) {
        console.error('Error loading user data:', error);
        return { success: false, error: error.message };
    }
}

// Subscribe to auth state changes
export function onAuthStateChange(callback) {
    authStateChangeCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
        authStateChangeCallbacks = authStateChangeCallbacks.filter(cb => cb !== callback);
    };
}

// Notify listeners of auth state changes
function notifyAuthStateChange(event, session) {
    authStateChangeCallbacks.forEach(callback => {
        try {
            callback(event, session);
        } catch (error) {
            console.error('Error in auth state change callback:', error);
        }
    });
}

// Set up auth state listener
export function setupAuthListener() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
        }
        
        notifyAuthStateChange(event, session);
    });
}

// Get current user
export function getCurrentUser() {
    return currentUser;
}

// Initialize auth
export function initializeAuth() {
    setupAuthListener();
    return checkUser();
}

// Export Supabase instance if needed elsewhere
export { supabase };