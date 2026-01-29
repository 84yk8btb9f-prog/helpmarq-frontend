import { createAuthClient } from "better-auth/client";

const getBaseURL = () => {
    const hostname = window.location.hostname;
    
    // If running locally
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return "http://localhost:3000/api/auth";
    }
    
    // If deployed (sapavault.com or any other domain)
    return "https://helpmarq-backend.onrender.com/api/auth";
};

console.log('🔗 Auth client using:', getBaseURL());

const authClient = createAuthClient({
    baseURL: getBaseURL()
});

export async function signIn(email, password) {
    try {
        const result = await authClient.signIn.email({
            email,
            password,
        });
        
        if (result.error) {
            throw new Error(result.error.message || 'Sign in failed');
        }
        
        return result.data;
    } catch (error) {
        throw error;
    }
}

export async function signUp(email, password, name) {
    try {
        const result = await authClient.signUp.email({
            email,
            password,
            name,
        });
        
        if (result.error) {
            throw new Error(result.error.message || 'Sign up failed');
        }
         return result.data;
    } catch (error) {
        throw error;
    }
}

export async function signOut() {
    try {
        await authClient.signOut();
    } catch (error) {
        throw error;
    }
}

export async function getCurrentUser() {
    try {
        const session = await authClient.getSession();
        return session?.data?.user || null;
    } catch (error) {
        return null;
    }
}

export async function getSession() {
    try {
        const session = await authClient.getSession();
        return session?.data;
    } catch (error) {
        return null;
    }
}

export async function isAuthenticated() {
    try {
        const session = await authClient.getSession();
        return !!session?.data?.user;
    } catch (error) {
        return false;
    }
}