'use strict';

// In-memory rate limiting and caching. Both are per process: on a single Node
// server that is exact; on serverless/multi-instance hosting it is best effort
// and should be swapped for a shared store (see README).

const MAX_TRACKED = 20000;

// Sliding-window counter: at most `limit` hits per `windowMs` per key.
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  // Returns 0 when allowed, otherwise the seconds until a slot frees up.
  take(key, now) {
    const t = now === undefined ? Date.now() : now;
    const floor = t - this.windowMs;
    const list = (this.hits.get(key) || []).filter((x) => x > floor);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return Math.max(1, Math.ceil((list[0] + this.windowMs - t) / 1000));
    }
    list.push(t);
    this.hits.delete(key);
    this.hits.set(key, list);
    trim(this.hits);
    return 0;
  }
}

// Caps how many different usernames one client may pull lists for in a
// window. This is the anti-enumeration control: one person checking their own
// account (plus the odd typo) never hits it; bulk analysis does.
class DistinctLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.seen = new Map();
  }

  take(key, value, now) {
    const t = now === undefined ? Date.now() : now;
    const mine = this.seen.get(key) || new Map();
    for (const [v, at] of mine) if (at <= t - this.windowMs) mine.delete(v);
    if (!mine.has(value)) {
      if (mine.size >= this.limit) {
        const oldest = Math.min.apply(null, Array.from(mine.values()));
        this.seen.set(key, mine);
        return Math.max(1, Math.ceil((oldest + this.windowMs - t) / 1000));
      }
      mine.set(value, t);
    }
    this.seen.delete(key);
    this.seen.set(key, mine);
    trim(this.seen);
    return 0;
  }
}

// Small TTL cache with a hard entry cap (oldest evicted first).
class TtlCache {
  constructor(ttlMs, maxEntries) {
    this.ttlMs = ttlMs;
    this.max = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

function trim(map) {
  while (map.size > MAX_TRACKED) map.delete(map.keys().next().value);
}

module.exports = { RateLimiter, DistinctLimiter, TtlCache };
