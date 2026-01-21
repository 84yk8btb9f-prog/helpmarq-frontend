// Clean Better Auth client implementation

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://helpmarq-backend.onrender.com';

// Get current user
export async function getCurrentUser() {
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
        return data.user || null;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// Check authentication
export async function isAuthenticated() {
    const user = await getCurrentUser();
    return !!user;
}

// Get session
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

        return await response.json();
    } catch (error) {
        console.error('Get session error:', error);
        return null;
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
        throw error;
    }
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

// Export auth client for compatibility
export const authClient = {
    getSession,
    signOut
};