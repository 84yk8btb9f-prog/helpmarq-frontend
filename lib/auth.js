import { createAuthClient } from "better-auth/client";

// ✅ FIX: Proper API URL detection
const getBaseURL = () => {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.log('🔧 Using local backend');
        return "http://localhost:3000";
    }
    
    console.log('🌐 Using production backend (Render)');
    return "https://helpmarq-backend.onrender.com";
};

const baseURL = getBaseURL();
console.log('🔗 Auth client base URL:', baseURL);
// ✅ Session verification helper - polls until cookie is ready
async function waitForSessionReady(maxAttempts = 5, delayMs = 800) {
    console.log('⏳ Waiting for session cookie to be ready...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`${baseURL}/api/user/me`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                console.log(`✅ Session ready after ${attempt} attempt(s)`);
                return true;
            }
            
            if (attempt < maxAttempts) {
                console.log(`⏳ Session not ready, retrying... (${attempt}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            console.log(`⚠️ Verification attempt ${attempt} failed:`, error.message);
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    console.warn('⚠️ Session verification timeout - cookie may not be ready');
    return false;
}
// Keep auth client for session management only
const authClient = createAuthClient({
    baseURL: baseURL,
    fetchOptions: {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
    },
});

// ✅ FIX: Use direct fetch instead of Better Auth client to ensure proper JSON stringification
export async function signIn(email, password) {
    try {
        console.log('🔐 Attempting sign in...');
        console.log('Email:', email);
        console.log('API URL:', `${baseURL}/api/auth/sign-in/email`);
        
        const response = await fetch(`${baseURL}/api/auth/sign-in/email`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                password,
            }),
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Sign in error:', errorData);
            throw new Error(errorData.error || errorData.message || 'Sign in failed');
        }
        
        const result = await response.json();
        console.log('✅ Sign in successful:', result);
        
        // ✅ Wait for session cookie to be ready
        await waitForSessionReady();
        
        return result;
    } catch (error) {
        console.error('❌ Sign in exception:', error);
        throw error;
    }
}

// ✅ FIX: Use direct fetch for sign up
export async function signUp(email, password, name) {
    try {
        console.log('📝 Attempting sign up...');
        console.log('Email:', email);
        console.log('Name:', name);
        console.log('API URL:', `${baseURL}/api/auth/sign-up/email`);
        
        const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                password,
                name,
            }),
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Sign up error:', errorData);
            throw new Error(errorData.error || errorData.message || 'Sign up failed');
        }
        
        const result = await response.json();
        console.log('✅ Sign up successful:', result);
        
        return result;
    } catch (error) {
        console.error('❌ Sign up exception:', error);
        throw error;
    }
}

export async function signOut() {
    try {
        console.log('👋 Signing out...');
        await authClient.signOut();
        console.log('✅ Signed out successfully');
    } catch (error) {
        console.error('❌ Sign out error:', error);
        throw error;
    }
}

export async function getCurrentUser() {
    try {
        const session = await authClient.getSession();
        
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

export async function getSession() {
    try {
        const session = await authClient.getSession();
        
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

export async function isAuthenticated() {
    try {
        const session = await authClient.getSession();
        const authenticated = !!session?.data?.user;
        console.log(authenticated ? '✅ User authenticated' : 'ℹ️ User not authenticated');
        return authenticated;
    } catch (error) {
        console.error('❌ Authentication check error:', error);
        return false;
    }
}

// ✅ Helper function to check role with retry logic
export async function checkUserRole() {
    const API_URL = `${baseURL}/api`;
    
    try {
        console.log('🔍 Checking user role...');
        
        const response = await fetch(`${API_URL}/user/me`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            console.error(`❌ Role check failed: HTTP ${response.status}`);
            return null;
        }
        
        const result = await response.json();
        console.log('✅ Role check result:', result);
        return result;
        
    } catch (error) {
        console.error('❌ Role check error:', error);
        return null;
    }
}