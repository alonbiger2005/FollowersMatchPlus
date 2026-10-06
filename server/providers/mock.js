'use strict';

// Development/test provider. Serves invented accounts whose names all start
// with "demo" so every UI state can be exercised without touching Instagram.
// The API flags its responses `demo: true` and the page labels the results
// as demo data. It is refused under NODE_ENV=production (see ./index.js).
const { LookupError } = require('../errors');

function names(prefix, from, to) {
  const out = [];
  for (let i = from; i < to; i++) out.push(prefix + String(i).padStart(4, '0'));
  return out;
}

const AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#830BFC"/><stop offset=".5" stop-color="#FD019F"/><stop offset="1" stop-color="#FFB801"/>' +
  '</linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="41" font-family="sans-serif" ' +
  'font-size="22" font-weight="700" fill="#fff" text-anchor="middle">D</text></svg>'
);

// Each account: profile, followers/following lists, page size, and an
// optional failure to inject.
function accounts() {
  const base = names('f_', 0, 300);
  return {
    // 300 following, 240 followers → 200 mutual, 100 one-way. Some follower
    // handles come back upper-cased to prove matching ignores case.
    demo: {
      profile: { displayName: 'Demo Account', profilePicture: AVATAR },
      following: base,
      followers: names('f_', 60, 260).map((u, i) => (i % 7 === 0 ? u.toUpperCase() : u)).concat(names('fan_', 0, 40)),
      page: 50
    },
    // Everyone followed follows back.
    'demo.mutual': {
      profile: { displayName: 'All Mutual' },
      following: names('m_', 0, 120),
      followers: names('m_', 0, 120).concat(names('fan_', 0, 30)),
      page: 50
    },
    'demo.private': { profile: { displayName: 'Private Demo', isPrivate: true, followerCount: 500, followingCount: 400 } },
    'demo.large': { profile: { displayName: 'Huge Demo', followerCount: 1200000, followingCount: 900 } },
    // 12,000 followers to exercise long pagination; 300 one-way.
    'demo.big': {
      profile: { displayName: 'Big Demo' },
      following: names('b_', 0, 1500),
      followers: names('b_', 300, 1500).concat(names('bfan_', 0, 10800)),
      page: 200
    },
    // Upstream throttles from the second followers page on.
    'demo.ratelimit': {
      profile: { displayName: 'Throttled Demo' },
      following: names('r_', 0, 100),
      followers: names('r_', 0, 400),
      page: 100,
      fail: { list: 'followers', fromPage: 2, code: 'PROVIDER_RATE_LIMITED' }
    },
    // Upstream stops answering on the second following page.
    'demo.timeout': {
      profile: { displayName: 'Slow Demo' },
      following: names('t_', 0, 200),
      followers: names('t_', 0, 150),
      page: 100,
      fail: { list: 'following', fromPage: 2, code: 'HANG' }
    },
    // Instagram reports 300 followers but only 220 are listed: incomplete.
    'demo.gap': {
      profile: { displayName: 'Gap Demo', followerCount: 300 },
      following: names('g_', 0, 100),
      followers: names('g_', 0, 220),
      page: 100
    },
    // Reports 220, lists 200: small gap, results shown with a caution.
    'demo.drift': {
      profile: { displayName: 'Drift Demo', followerCount: 220 },
      following: names('d_', 0, 150),
      followers: names('d_', 20, 220),
      page: 100
    },
    'demo.down': { profile: {}, fail: { profile: 'PROVIDER_AUTH_ERROR' } },
    'demo.busy': { profile: {}, fail: { profile: 'PROVIDER_RATE_LIMITED' } }
  };
}

function create(env) {
  const delay = Math.max(0, Number(env.FMP_MOCK_DELAY_MS || 150));
  const book = accounts();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function find(username) {
    const a = Object.prototype.hasOwnProperty.call(book, username) ? book[username] : null;
    if (!a) throw new LookupError('ACCOUNT_NOT_FOUND');
    return a;
  }

  async function getProfile(username) {
    await wait(delay);
    const a = find(username);
    if (a.fail && a.fail.profile) throw new LookupError(a.fail.profile);
    const p = a.profile;
    return {
      exists: true,
      username,
      displayName: p.displayName || null,
      profilePicture: p.profilePicture || null,
      isPrivate: !!p.isPrivate,
      followerCount: p.followerCount !== undefined ? p.followerCount : (a.followers || []).length,
      followingCount: p.followingCount !== undefined ? p.followingCount : (a.following || []).length
    };
  }

  function lister(list) {
    return async function (username, cursor) {
      await wait(delay);
      const a = find(username);
      if (a.profile.isPrivate) throw new LookupError('PRIVATE_ACCOUNT');
      const all = a[list] || [];
      const at = cursor ? Number(String(cursor).replace(/^o/, '')) : 0;
      if (!Number.isInteger(at) || at < 0 || at > all.length) throw new Error('mock: bad cursor');
      const pageNo = at / a.page + 1;
      if (a.fail && a.fail.list === list && pageNo >= a.fail.fromPage) {
        // Never resolves in practice; the API's provider timeout fires first.
        if (a.fail.code === 'HANG') await new Promise((r) => setTimeout(r, 10 * 60 * 1000).unref());
        throw new LookupError(a.fail.code);
      }
      const end = Math.min(all.length, at + a.page);
      return {
        users: all.slice(at, end).map((u) => ({ username: u })),
        nextCursor: end < all.length ? 'o' + end : null,
        hasMore: end < all.length
      };
    };
  }

  return {
    id: 'mock',
    demo: true,
    getProfile,
    getFollowers: lister('followers'),
    getFollowing: lister('following')
  };
}

module.exports = { create };
