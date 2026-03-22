// config/redis.js
// ioredis client for Railway-hosted Redis

const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        console.log(`🔄 Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
    },
    reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
        return targetErrors.some(e => err.message.includes(e));
    },
});

redis.on('connect', () => {
    console.log('✅ Redis connected');
});

redis.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
});

redis.on('close', () => {
    console.log('🔌 Redis connection closed');
});

module.exports = redis;
