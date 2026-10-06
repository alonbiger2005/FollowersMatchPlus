'use strict';

// JSON API for automatic lookup. Stateless between requests (apart from the
// caches and rate limits in ./guard), so it runs the same on one Node process
// or behind a serverless adapter.
//
//   GET /api/profile?username=NAME
//   GET /api/followers?username=NAME[&cursor=C]
//   GET /api/following?username=NAME[&cursor=C]
//   GET /api/health
//
// The browser walks the pages itself and compares locally with the same
// engine the export workflow uses. That keeps progress real (it is the
// browser's own count) and needs no job store on the server.

const { LookupError, STATUS, MESSAGES } = require('./errors');
const { normalizeUsername, isListedUsername } = require('./username');
const { RateLimiter, DistinctLimiter, TtlCache } = require('./guard');

const MINUTE = 60 * 1000;
const CURSOR = /^[\x21-\x7e]{1,512}$/;
const PICTURE = /^(https:\/\/[^\s"'<>]{1,2040}|data:image\/(?:png|jpeg|webp|svg\+xml)[;,][^\s"'<>]{1,20000})$/;
const MAX_PAGE_USERS = 5000;

function int(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function createApi(provider, env) {
  const cfg = {
    maxAccountSize: int(env.FMP_MAX_ACCOUNT_SIZE, 25000),
    timeoutMs: int(env.FMP_PROVIDER_TIMEOUT_MS, 20000),
    trustProxy: env.FMP_TRUST_PROXY === '1',
    quiet: env.FMP_QUIET === '1'
  };
  const limits = {
    profile: new RateLimiter(int(env.FMP_RATE_PROFILE, 20), 15 * MINUTE),
    pages: new RateLimiter(int(env.FMP_RATE_PAGES, 900), 15 * MINUTE),
    accounts: new DistinctLimiter(int(env.FMP_RATE_ACCOUNTS, 5), 60 * MINUTE)
  };
  const profiles = new TtlCache(5 * MINUTE, 2000);
  const pages = new TtlCache(10 * MINUTE, 4000);

  function clientKey(req) {
    if (cfg.trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (fwd) return fwd;
    }
    return (req.socket && req.socket.remoteAddress) || 'unknown';
  }

  function limit(limiter, key, value) {
    const wait = value === undefined ? limiter.take(key) : limiter.take(key, value);
    if (wait) throw new LookupError('RATE_LIMITED', { retryAfter: wait });
  }

  function timed(promise) {
    let timer;
    const stop = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new LookupError('PROVIDER_TIMEOUT')), cfg.timeoutMs);
    });
    return Promise.race([promise, stop]).finally(() => clearTimeout(timer));
  }

  async function profileOf(username) {
    const hit = profiles.get(username);
    if (hit) return hit;
    const raw = await timed(Promise.resolve().then(() => provider.getProfile(username)));
    const p = cleanProfile(raw, username);
    profiles.set(username, p);
    return p;
  }

  function verdict(p) {
    if (p.isPrivate) return 'PRIVATE_ACCOUNT';
    if ((p.followerCount || 0) > cfg.maxAccountSize || (p.followingCount || 0) > cfg.maxAccountSize) {
      return 'ACCOUNT_TOO_LARGE';
    }
    return null;
  }

  async function profile(req, q) {
    const username = normalizeUsername(q.get('username'));
    if (!username) throw new LookupError('INVALID_USERNAME');
    limit(limits.profile, clientKey(req));
    const p = await profileOf(username);
    const blocked = verdict(p);
    return {
      demo: !!provider.demo,
      maxAccountSize: cfg.maxAccountSize,
      profile: Object.assign({}, p, { analyzable: !blocked, reason: blocked })
    };
  }

  async function list(req, q, which) {
    const username = normalizeUsername(q.get('username'));
    if (!username) throw new LookupError('INVALID_USERNAME');
    const rawCursor = q.get('cursor');
    if (rawCursor !== null && rawCursor !== '' && !CURSOR.test(rawCursor)) throw new LookupError('INVALID_REQUEST');
    const cursor = rawCursor || null;

    const who = clientKey(req);
    limit(limits.pages, who);
    // The server re-checks the profile itself: private and oversized accounts
    // are refused here, not just hidden in the UI.
    const blocked = verdict(await profileOf(username));
    if (blocked) throw new LookupError(blocked);
    limit(limits.accounts, who, username);

    const key = which + ':' + username + ':' + (cursor || '');
    let page = pages.get(key);
    if (!page) {
      const fn = which === 'followers' ? provider.getFollowers : provider.getFollowing;
      page = cleanPage(await timed(Promise.resolve().then(() => fn(username, cursor))));
      pages.set(key, page);
    }
    return page;
  }

  const routes = {
    '/api/profile': profile,
    '/api/followers': (req, q) => list(req, q, 'followers'),
    '/api/following': (req, q) => list(req, q, 'following'),
    '/api/health': async () => ({ status: 'up' })
  };

  return async function handle(req, res, url) {
    const started = Date.now();
    let status = 200;
    let code = null;
    let body;
    let retryAfter;
    try {
      const route = Object.prototype.hasOwnProperty.call(routes, url.pathname) ? routes[url.pathname] : null;
      if (!route) throw new LookupError('NOT_FOUND');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new LookupError('METHOD_NOT_ALLOWED');
      body = Object.assign({ ok: true }, await route(req, url.searchParams));
    } catch (err) {
      const known = err instanceof LookupError;
      code = known ? err.code : 'UNKNOWN_ERROR';
      status = STATUS[code];
      retryAfter = known ? err.retryAfter : undefined;
      body = { ok: false, error: { code, message: MESSAGES[code] } };
      // Unexpected faults get a stack in the log; nothing about them reaches the client.
      if (!known && !cfg.quiet) console.error('[api] unexpected', url.pathname, err && err.stack ? err.stack : err);
    }

    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    if (status === 405) headers.Allow = 'GET, HEAD';
    if (retryAfter) headers['Retry-After'] = String(retryAfter);
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));

    // Route, outcome and timing only: no usernames, cursors or addresses.
    if (!cfg.quiet) console.log(JSON.stringify({ at: new Date().toISOString(), route: url.pathname, status, code, ms: Date.now() - started }));
  };
}

function count(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function cleanProfile(raw, asked) {
  if (!raw || typeof raw !== 'object' || raw.exists === false) throw new LookupError('ACCOUNT_NOT_FOUND');
  const name = typeof raw.displayName === 'string' ? raw.displayName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : '';
  const pic = typeof raw.profilePicture === 'string' && PICTURE.test(raw.profilePicture) ? raw.profilePicture : null;
  return {
    exists: true,
    username: normalizeUsername(raw.username) || asked,
    displayName: name || null,
    profilePicture: pic,
    isPrivate: raw.isPrivate === true,
    followerCount: count(raw.followerCount),
    followingCount: count(raw.followingCount)
  };
}

function cleanPage(raw) {
  if (!raw || !Array.isArray(raw.users) || raw.users.length > MAX_PAGE_USERS) {
    throw new Error('provider returned a malformed page');
  }
  const users = [];
  for (const u of raw.users) {
    const name = u && typeof u === 'object' ? u.username : u;
    if (isListedUsername(name)) users.push({ username: name });
  }
  const next = typeof raw.nextCursor === 'string' && CURSOR.test(raw.nextCursor) ? raw.nextCursor : null;
  // hasMore without a usable cursor is passed through as-is: the browser
  // treats it as an incomplete list rather than guessing.
  return { users, nextCursor: next, hasMore: raw.hasMore === true };
}

module.exports = { createApi };
