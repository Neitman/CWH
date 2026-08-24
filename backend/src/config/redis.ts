import Redis from 'ioredis';
import { config } from './env';

const redis = new Redis(config.redisUrl);

redis.on('connect', () => {
  console.log('Successfully connected to Redis.');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;
