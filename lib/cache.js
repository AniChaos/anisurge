const store = new Map();
const MAX_ENTRIES = 500;

const TTL = {
  catalog: 60 * 60 * 1000,        // 1 hour
  meta: 24 * 60 * 60 * 1000,      // 24 hours
  stream: 30 * 60 * 1000,         // 30 min
};

function evict() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  // first pass: remove expired
  for (const [key, entry] of store) {
    if (now > entry.expires) store.delete(key);
  }
  // still over limit: remove oldest entries
  if (store.size > MAX_ENTRIES) {
    const sorted = [...store.entries()].sort((a, b) => a[1].expires - b[1].expires);
    const toRemove = sorted.length - MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      store.delete(sorted[i][0]);
    }
  }
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  evict();
}

function wrap(prefix, ttlMs, fn) {
  return async (...args) => {
    const key = `${prefix}:${JSON.stringify(args)}`;
    const cached = get(key);
    if (cached !== null) return cached;
    const result = await fn(...args);
    if (result !== null && result !== undefined) {
      set(key, result, ttlMs);
    }
    return result;
  };
}

module.exports = { get, set, TTL, wrap };
