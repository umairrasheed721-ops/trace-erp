const { createClient } = require('redis');

async function useRedisAuthState(tenantId, initAuthCreds, BufferJSON, redisUrl) {
  const client = createClient({ url: redisUrl });
  await client.connect();

  const keyPrefix = `wa_session:${tenantId}:`;

  async function readKey(key) {
    try {
      const value = await client.get(keyPrefix + key);
      return value ? JSON.parse(value, BufferJSON.reviver) : null;
    } catch (e) {
      console.error(`[WA-REDIS] Read failed for key ${key}:`, e.message);
      return null;
    }
  }

  async function writeKey(key, value) {
    try {
      if (value === null || value === undefined) {
        await client.del(keyPrefix + key);
      } else {
        await client.set(keyPrefix + key, JSON.stringify(value, BufferJSON.replacer));
      }
    } catch (e) {
      console.error(`[WA-REDIS] Write failed for key ${key}:`, e.message);
    }
  }

  async function deleteKey(key) {
    try {
      await client.del(keyPrefix + key);
    } catch (e) {
      console.error(`[WA-REDIS] Delete failed for key ${key}:`, e.message);
    }
  }

  let creds = await readKey('creds');
  if (!creds) {
    creds = initAuthCreds();
    await writeKey('creds', creds);
    console.log(`[WA-REDIS] ✨ Fresh credentials created and stored in Redis for tenant [${tenantId}]`);
  } else {
    console.log(`[WA-REDIS] ✅ Loaded existing session from Redis for tenant [${tenantId}]`);
  }

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        await Promise.all(
          ids.map(async (id) => {
            const value = await readKey(`key:${type}:${id}`);
            if (value) {
              data[id] = value;
            }
          })
        );
        return data;
      },
      set: async (data) => {
        const tasks = [];
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            const key = `key:${category}:${id}`;
            if (value) {
              tasks.push(writeKey(key, value));
            } else {
              tasks.push(deleteKey(key));
            }
          }
        }
        await Promise.all(tasks);
      }
    }
  };

  const saveCreds = async () => {
    await writeKey('creds', state.creds);
  };

  const wipeSession = async () => {
    try {
      const keys = await client.keys(`${keyPrefix}*`);
      if (keys.length > 0) {
        await client.del(keys);
      }
      console.log(`[WA-REDIS] ✅ Wiped all Redis keys for tenant [${tenantId}]`);
    } catch (err) {
      console.error(`[WA-REDIS] Failed to wipe session for tenant [${tenantId}]:`, err.message);
    }
  };

  return { state, saveCreds, wipeSession, client };
}

module.exports = { useRedisAuthState };
