// frontend/lib/auth.js - FINAL CORRECTED VERSION

import { createAuthClient } from "better-auth/client";

// ✅ CORRECT: Include /api/auth in baseURL
const authClient = createAuthClient({
    baseURL: "http://localhost:3000/api/auth"
});

export async function signIn(email, password) {
    try {
        console.log('🔐 Sign in attempt:', { email });
        console.log('🔗 Calling:', 'http://localhost:3000/api/auth/sign-in/email');
        
        const result = await authClient.signIn.email({
            email,
            password,
        });
        
        console.log('📬 Sign in result:', result);
        
        if (result.error) {
            console.error('❌ Sign in error from server:', result.error);
            throw new Error(result.error.message || 'Sign in failed');
        }
        
        console.log('✅ Sign in successful');
        return result.data;
    } catch (error) {
        console.error('💥 Sign in exception:', error);
        throw error;
    }
}

export async function signUp(email, password, name) {
    try {
        console.log('📝 Sign up attempt:', { email, name });
        console.log('🔗 Calling:', 'http://localhost:3000/api/auth/sign-up/email');
        
        const result = await authClient.signUp.email({
            email,
            password,
            name,
        });
        
        console.log('📬 Sign up result:', result);
        
        if (result.error) {
            console.error('❌ Sign up error from server:', result.error);
            throw new Error(result.error.message || 'Sign up failed');
        }
        
        console.log('✅ Sign up successful');
        return result.data;
    } catch (error) {
        console.error('💥 Sign up exception:', error);
        throw error;
    }
}

export async function signOut() {
    try {
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
        console.log('👤 Current session:', session);
        return session?.data?.user || null;
    } catch (error) {
        console.error('❌ Get current user error:', error);
        return null;
    }
}

export async function getSession() {
    try {
        const session = await authClient.getSession();
        return session?.data;
    } catch (error) {
        console.error('❌ Get session error:', error);
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