import { createLogger } from '../utils/logger.js';

const log = createLogger('api-server:store');

const forceMemory = process.env.STORE_MEMORY === '1';
const redisUrl = process.env.REDIS_URL;
const useRedis = !forceMemory && !!redisUrl;

// singleton Redis client so we do not reconnect every call
let redisClientPromise = null;

async function getRedisClient() {
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const { createClient } = await import('redis'); // lazy import
      const client = createClient({ url: redisUrl });
      client.on('error', (err) => log.warn('redis_error', { err: String(err) }));
      await client.connect();
      return client;
    })();
  }
  return redisClientPromise;
}

function createMemoryBucket(name) {
  const m = new Map();
  log.log(`bucket=${name} backend=memory`);
  return {
    async get(id) { return m.get(id) ?? null; },
    async set(id, obj) { m.set(id, obj); },
    async delete(id) { m.delete(id); },
    async values() { return [...m.values()]; },
    async clear() { m.clear(); },
  };
}

function createRedisBucket(name) {
  log.log(`bucket=${name} backend=redis`);
  const keyFor = (id) => `${name}:${encodeURIComponent(id)}`;
  const match = `${name}:*`;

  return {
    async get(id) {
      try {
        const client = await getRedisClient();
        const v = await client.get(keyFor(id));
        return v == null ? null : JSON.parse(v);
      } catch (err) {
        log.warn('redis_get_error', { bucket: name, id, err: String(err) });
        return null;
      }
    },
    async set(id, obj) {
      try {
        const client = await getRedisClient();
        // add EX if you want TTL: await client.set(keyFor(id), JSON.stringify(obj), { EX: 3600 })
        await client.set(keyFor(id), JSON.stringify(obj));
        log.log('redis_set_success', { bucket: name, id });
      } catch (err) {
        log.warn('redis_set_error', { bucket: name, id, err: String(err) });
        throw err;
      }
    },
    async delete(id) {
      try {
        const client = await getRedisClient();
        await client.del(keyFor(id));
        log.log('redis_delete_success', { bucket: name, id });
      } catch (err) {
        log.warn('redis_delete_error', { bucket: name, id, err: String(err) });
        throw err;
      }
    },
    async values() {
      try {
        const client = await getRedisClient();
        const keys = await client.keys(match);

        if (keys.length === 0) return [];

        const values = await client.mGet(keys);
        return values
          .filter(val => val != null)
          .map(val => {
            try {
              return JSON.parse(val);
            } catch (err) {
              log.warn('redis_parse_error', { err: String(err) });
              return null;
            }
          })
          .filter(Boolean);
      } catch (err) {
        log.warn('redis_values_error', { bucket: name, err: String(err) });
        return [];
      }
    },
    async clear() {
      try {
        const client = await getRedisClient();
        const keys = await client.keys(match);
        if (keys.length > 0) {
          await client.del(keys);
        }
      } catch (err) {
        log.warn('redis_clear_error', { bucket: name, err: String(err) });
      }
    },
  };
}

export function createStore() {
  const make = useRedis ? createRedisBucket : createMemoryBucket;
  if (useRedis) {
    log.log('store=redis reason=REDIS_URL_present');
  } else if (forceMemory) {
    log.log('store=memory reason=STORE_MEMORY=1');
  } else {
    log.log('store=memory reason=no_redis_env');
  }
  return {
    projects: make('projects'),
    tasks: make('tasks'),
  };
}
