import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
    baseURL: window.location.hostname === 'localhost' 
        ? 'http://localhost:3000'
        : 'https://helpmarq-backend.onrender.com'
});

// Helper to get current user
export async function getCurrentUser() {
    try {
        const session = await authClient.getSession();
        return session?.user || null;
    } catch {
        return null;
    }
}

// Helper to check authentication
export async function isAuthenticated() {
    const user = await getCurrentUser();
    return !!user;
}