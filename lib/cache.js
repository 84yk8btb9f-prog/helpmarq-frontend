// Simple cache for API responses
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function getCached(key) {
    const item = cache.get(key);
    
    if (!item) return null;
    
    const now = Date.now();
    if (now - item.timestamp > CACHE_DURATION) {
        cache.delete(key);
        return null;
    }
    
    return item.data;
}

export function setCache(key, data) {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
}

export function clearCache() {
    cache.clear();
}

// Clear cache when signing out
export function initCacheClear() {
    window.addEventListener('beforeunload', () => {
        clearCache();
    });
}