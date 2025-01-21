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
        console.log('Attempting to log out');
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('Logout error details:', error);
            throw error;
        }

        console.log('Logout successful');
        
        // Reset game state
        if (window.gameState) {
            window.gameState = initializeDefaultGameState();
        }
        
        // Show auth screen
        if (typeof showScreen === 'function') {
            showScreen('auth-screen');
        } else {
            console.error('showScreen function not found');
        }
        
        return { success: true };
        
    } catch (error) {
        console.error('Comprehensive logout error:', {
            message: error.message,
            name: error.name,
            stack: error.stack
        });
        
        // Fallback UI update
        document.getElementById('auth-screen').style.display = 'block';
        
        return { success: false, error: error.message };
    }
}

window.handleLogout = async () => {
    try {
        const result = await handleLogout();
        if (result.success) {
            // Additional UI cleanup if needed
            document.querySelector('.user-email-display')?.remove();
        } else {
            console.error('Logout failed', result.error);
        }
    } catch (error) {
        console.error('Logout process error', error);
    }
};

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

async function getUserType() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    
    const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', session.user.id)
        .single();
        
    return profile?.user_type;
}

async function initializeApplication() {
    await initializeAuth();
    await loadUserData();
    updatePerkCounts();
    
    const userType = await getUserType();
    if (userType) {
        showScreen('welcome-screen');
    } else {
        showScreen('auth-screen');
    }
}

async function saveCustomList() {
    console.log('Saving custom list...'); // Debug log
    
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
        alert('Please log in to save lists');
        return;
    }

    const userId = session.data.session.user.id;
    const listNameInput = document.getElementById('custom-list-name');
    const name = listNameInput.value.trim();
    
    if (!name) {
        alert('Please enter a list name');
        return;
    }

    const wordItems = document.querySelectorAll('.word-translation-item');
    const words = [];
    const translations = [];
    
    wordItems.forEach(item => {
        const word = item.querySelector('.source-word').textContent.trim();
        const translation = item.querySelector('.target-word').value.trim();
        if (word && translation) {
            words.push(word);
            translations.push(translation);
        }
    });

    if (words.length === 0) {
        alert('Please add at least one word');
        return;
    }

    try {
        console.log('Saving list with data:', { name, words, translations });

        const { data, error } = await supabase
            .from('custom_lists')
            .upsert({
                id: customPracticeLists.currentList?.id || undefined,
                created_by: userId,
                name: name,
                words: words,
                translations: translations
            });

        if (error) throw error;

        console.log('List saved successfully:', data);
        
        await loadCustomLists();
        showCustomListsManager();
        alert('List saved successfully!');

    } catch (error) {
        console.error('Error saving list:', error);
        alert('Failed to save list: ' + error.message);
    }
}

async function loadCustomLists() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        customPracticeLists.lists = [];
        updateListsDisplay();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('custom_lists')
            .select('*')
            .eq('created_by', session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        customPracticeLists.lists = data || [];
        updateListsDisplay();
        
    } catch (error) {
        console.error('Error loading lists:', error);
        customPracticeLists.lists = [];
        updateListsDisplay();
    }
}

async function deleteCustomList(listId) {
    if (!confirm('Are you sure you want to delete this list permanently?')) return;

    try {
        // First, remove from Supabase
        const { error } = await supabase
            .from('custom_lists')
            .delete()
            .eq('id', listId);

        if (error) throw error;

        // Remove from local lists
        customPracticeLists.lists = customPracticeLists.lists.filter(l => l.id !== listId);
        
        // Update UI
        updateListsDisplay();
        
        // Optional: Provide feedback
        alert('List deleted successfully');
    } catch (error) {
        console.error('Error deleting list:', error);
        alert('Failed to delete list. Please try again.');
    }
}
