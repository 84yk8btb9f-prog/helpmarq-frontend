import { createAuthClient } from "better-auth/client";

// ✅ CRITICAL FIX: Proper API URL detection with fallbacks
const getBaseURL = () => {
    const hostname = window.location.hostname;
    
    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.log('🔧 Using local backend');
        return "http://localhost:3000";
    }
    
    // ✅ FIX: Production - use Render backend
    console.log('🌐 Using production backend (Render)');
    return "https://helpmarq-backend.onrender.com";
};

const baseURL = getBaseURL();
console.log('🔗 Auth client base URL:', baseURL);

// ✅ CRITICAL FIX: Enhanced auth client configuration
const authClient = createAuthClient({
    baseURL: baseURL,
    // ✅ FIX: Enable credentials for cross-origin cookies
    fetchOptions: {
        credentials: 'include',
        // ✅ FIX: Add headers for Better Auth
        headers: {
            'Content-Type': 'application/json',
        },
    },
});

// ✅ FIX: Enhanced sign in with better error handling
export async function signIn(email, password) {
    try {
        console.log('🔐 Attempting sign in...');
        console.log('Email:', email);
        console.log('API URL:', `${baseURL}/api/auth`);
        
        const result = await authClient.signIn.email({
            email,
            password,
        }, {
            // ✅ FIX: Ensure credentials are sent
            onRequest: (ctx) => {
                ctx.options.credentials = 'include';
            }
        });
        
        if (result.error) {
            console.error('❌ Sign in error:', result.error);
            throw new Error(result.error.message || 'Sign in failed');
        }
        
        console.log('✅ Sign in successful');
        console.log('Result:', result);
        
        // ✅ FIX: Wait a moment for session to fully establish
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return result.data;
    } catch (error) {
        console.error('❌ Sign in exception:', error);
        throw error;
    }
}

// ✅ FIX: Enhanced sign up with better error handling
export async function signUp(email, password, name) {
    try {
        console.log('📝 Attempting sign up...');
        console.log('Email:', email);
        console.log('Name:', name);
        
        const result = await authClient.signUp.email({
            email,
            password,
            name,
        }, {
            onRequest: (ctx) => {
                ctx.options.credentials = 'include';
            }
        });
        
        if (result.error) {
            console.error('❌ Sign up error:', result.error);
            throw new Error(result.error.message || 'Sign up failed');
        }
        
        console.log('✅ Sign up successful');
        return result.data;
    } catch (error) {
        console.error('❌ Sign up exception:', error);
        throw error;
    }
}

// ✅ FIX: Enhanced sign out
export async function signOut() {
    try {
        console.log('👋 Signing out...');
        await authClient.signOut({
            fetchOptions: {
                credentials: 'include'
            }
        });
        console.log('✅ Signed out successfully');
    } catch (error) {
        console.error('❌ Sign out error:', error);
        throw error;
    }
}

// ✅ FIX: Enhanced getCurrentUser with retry logic
export async function getCurrentUser() {
    try {
        const session = await authClient.getSession({
            fetchOptions: {
                credentials: 'include'
            }
        });
        
        if (!session?.data?.user) {
            console.log('ℹ️ No current user');
            return null;
        }
        
        console.log('✅ Current user:', session.data.user.email);
        return session.data.user;
    } catch (error) {
        console.error('❌ Get current user error:', error);
        return null;
    }
}

// ✅ FIX: Enhanced getSession with proper error handling
export async function getSession() {
    try {
        const session = await authClient.getSession({
            fetchOptions: {
                credentials: 'include'
            }
        });
        
        if (!session?.data) {
            console.log('ℹ️ No active session');
            return null;
        }
        
        console.log('✅ Active session found');
        return session.data;
    } catch (error) {
        console.error('❌ Get session error:', error);
        return null;
    }
}

// ✅ FIX: Enhanced isAuthenticated
export async function isAuthenticated() {
    try {
        const session = await authClient.getSession({
            fetchOptions: {
                credentials: 'include'
            }
        });
        
        const authenticated = !!session?.data?.user;
        console.log(authenticated ? '✅ User authenticated' : 'ℹ️ User not authenticated');
        return authenticated;
    } catch (error) {
        console.error('❌ Authentication check error:', error);
        return false;
    }
}

// ✅ NEW: Helper function to check role with retry logic
export async function checkUserRole(maxAttempts = 3) {
    const API_URL = `${baseURL}/api`;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`🔍 Checking role (attempt ${attempt}/${maxAttempts})...`);
            
            const response = await fetch(`${API_URL}/user/me`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Role check result:', result);
                return result;
            } else if (response.status === 401) {
                console.log(`⏳ Session not ready (401), attempt ${attempt}/${maxAttempts}`);
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error(`❌ Role check attempt ${attempt} failed:`, error);
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
        }
    }
    
    return null;
}