class StreamValidationCache {
    constructor(cacheTTL = 300000) {
        this.validationCache = new Map();
        this.cacheTTL = cacheTTL;
    }

    getCachedValidation(streamUrl) {
        const cached = this.validationCache.get(streamUrl);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.result;
        }
        this.validationCache.delete(streamUrl);
        return null;
    }

    cacheValidationResult(streamUrl, result) {
        this.validationCache.set(streamUrl, {
            result,
            timestamp: Date.now()
        });
    }

    clearValidationCache(streamUrl = null) {
        if (streamUrl) {
            this.validationCache.delete(streamUrl);
        } else {
            this.validationCache.clear();
        }
    }

    getCacheStats() {
        return {
            cachedCount: this.validationCache.size,
            cacheTTL: this.cacheTTL
        };
    }
}

module.exports = { StreamValidationCache };