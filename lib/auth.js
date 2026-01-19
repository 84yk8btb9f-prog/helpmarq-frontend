// lib/auth.js - Better Auth using vanilla fetch (NO IMPORTS NEEDED)

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://helpmarq-backend.onrender.com';

// Get current session
export async function getCurrentUser() {
    try {
        const response = await fetch(`${API_URL}/api/auth/get-session`, {
            method: 'GET',
            credentials: 'include', // Important for cookies
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.user || null;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// Check if authenticated
export async function isAuthenticated() {
    const user = await getCurrentUser();
    return !!user;
}

// Get session for auth headers
export async function getSession() {
    try {
        const response = await fetch(`${API_URL}/api/auth/get-session`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Get session error:', error);
        return null;
    }
}

// Get auth headers for API calls
export async function getAuthHeaders() {
    const session = await getSession();
    
    if (!session || !session.session) {
        throw new Error('No active session');
    }

    return {
        'Authorization': `Bearer ${session.session.token}`,
        'Content-Type': 'application/json'
    };
}

// Sign out
export async function signOut() {
    try {
        await fetch(`${API_URL}/api/auth/sign-out`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        localStorage.clear();
        sessionStorage.clear();
    } catch (error) {
        console.error('Sign out error:', error);
        localStorage.clear();
        sessionStorage.clear();
    }
}

// Sign in
export async function signIn(email, password) {
    try {
        const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Sign in failed');
        }

        return data;
    } catch (error) {
        console.error('Sign in error:', error);
        throw error;
    }
}

// Sign up
export async function signUp(name, email, password) {
    try {
        const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Sign up failed');
        }

        return data;
    } catch (error) {
        console.error('Sign up error:', error);
        throw error;
    }
}

// Export for compatibility with existing code
export const authClient = {
    getSession: getSession,
    signOut: signOut,
    signIn: { email: signIn },
    signUp: { email: signUp }
};