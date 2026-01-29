import { createAuthClient } from "better-auth/client";

// ✅ FIX: More robust API URL detection
const getBaseURL = () => {
    const hostname = window.location.hostname;
    
    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.log('🔧 Using local backend');
        return "http://localhost:3000/api/auth";
    }
    
    // ✅ FIX: Production - check for Vercel deployment
    if (hostname.includes('vercel.app') || hostname === 'helpmarq-frontend.vercel.app') {
        console.log('🌐 Using production backend');
        return "https://helpmarq-backend.onrender.com/api/auth";
    }
    
    // Fallback to production
    console.log('🌐 Fallback to production backend');
    return "https://helpmarq-backend.onrender.com/api/auth";
};

const baseURL = getBaseURL();
console.log('🔗 Auth client base URL:', baseURL);

const authClient = createAuthClient({
    baseURL: baseURL,
    // ✅ FIX: Explicitly enable credentials
    credentials: 'include'
});

export async function signIn(email, password) {
    try {
        console.log('🔐 Attempting sign in...');
        
        const result = await authClient.signIn.email({
            email,
            password,
        });
        
        if (result.error) {
            console.error('❌ Sign in error:', result.error);
            throw new Error(result.error.message || 'Sign in failed');
        }
        
        console.log('✅ Sign in successful');
        return result.data;
    } catch (error) {
        console.error('❌ Sign in exception:', error);
        throw error;
    }
}

export async function signUp(email, password, name) {
    try {
        console.log('📝 Attempting sign up...');
        
        const result = await authClient.signUp.email({
            email,
            password,
            name,
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