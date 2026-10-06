'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { boot } = require('./helpers/harness');
const { createProvider } = require('../server/providers');

async function get(base, path, init) {
  const res = await fetch(base + path, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: res.status, headers: res.headers, body, text };
}

async function walk(base, list, username) {
  const users = [];
  let cursor = '';
  for (let i = 0; i < 500; i++) {
    const r = await get(base, '/api/' + list + '?username=' + username + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    users.push(...r.body.users.map((u) => u.username));
    if (!r.body.hasMore) return users;
    cursor = r.body.nextCursor;
  }
  throw new Error('runaway pagination');
}

test('mock provider: profile, pagination and every failure code', async (t) => {
  const s = await boot({ FMP_PROVIDER_TIMEOUT_MS: '200' });
  t.after(s.close);

  await t.test('public profile normalises input and reports demo', async () => {
    const r = await get(s.base, '/api/profile?username=' + encodeURIComponent('https://www.instagram.com/Demo/'));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.demo, true);
    assert.deepStrictEqual(
      { u: r.body.profile.username, fr: r.body.profile.followerCount, fw: r.body.profile.followingCount, a: r.body.profile.analyzable },
      { u: 'demo', fr: 240, fw: 300, a: true });
    assert.match(r.headers.get('cache-control'), /no-store/);
  });

  await t.test('full pagination returns every record exactly once', async () => {
    const followers = await walk(s.base, 'followers', 'demo');
    const following = await walk(s.base, 'following', 'demo');
    assert.strictEqual(followers.length, 240);
    assert.strictEqual(following.length, 300);
    assert.strictEqual(new Set(followers.map((u) => u.toLowerCase())).size, 240);
    assert.ok(followers.includes('F_0060'), 'case preserved from provider');
  });

  await t.test('error codes and statuses', async () => {
    const cases = [
      ['/api/profile?username=nobody_here', 404, 'ACCOUNT_NOT_FOUND'],
      ['/api/profile?username=bad..name', 400, 'INVALID_USERNAME'],
      ['/api/profile', 400, 'INVALID_USERNAME'],
      ['/api/followers?username=demo.private', 403, 'PRIVATE_ACCOUNT'],
      ['/api/following?username=demo.large', 413, 'ACCOUNT_TOO_LARGE'],
      ['/api/profile?username=demo.down', 502, 'PROVIDER_AUTH_ERROR'],
      ['/api/profile?username=demo.busy', 429, 'PROVIDER_RATE_LIMITED'],
      ['/api/followers?username=demo&cursor=' + encodeURIComponent('a b'), 400, 'INVALID_REQUEST'],
      ['/api/followers?username=demo&cursor=' + encodeURIComponent('é'), 400, 'INVALID_REQUEST'],
      ['/api/followers?username=demo&cursor=' + 'x'.repeat(600), 400, 'INVALID_REQUEST'],
      ['/api/followers?username=demo&cursor=junk', 500, 'UNKNOWN_ERROR'],
      ['/api/nope', 404, 'NOT_FOUND']
    ];
    for (const [path, status, code] of cases) {
      const r = await get(s.base, path);
      assert.strictEqual(r.status, status, path);
      assert.strictEqual(r.body.error.code, code, path);
      assert.ok(!/stack|Error:|mock:/.test(r.text), 'no internals leaked for ' + path);
    }
    const priv = await get(s.base, '/api/profile?username=demo.private');
    assert.deepStrictEqual([priv.body.profile.isPrivate, priv.body.profile.analyzable, priv.body.profile.reason], [true, false, 'PRIVATE_ACCOUNT']);
    const big = await get(s.base, '/api/profile?username=demo.large');
    assert.deepStrictEqual([big.body.profile.analyzable, big.body.profile.reason], [false, 'ACCOUNT_TOO_LARGE']);
  });

  await t.test('rate-limited page and timed-out page', async () => {
    const first = await get(s.base, '/api/followers?username=demo.ratelimit');
    assert.strictEqual(first.status, 200);
    const second = await get(s.base, '/api/followers?username=demo.ratelimit&cursor=' + first.body.nextCursor);
    assert.strictEqual(second.body.error.code, 'PROVIDER_RATE_LIMITED');

    const ok = await get(s.base, '/api/following?username=demo.timeout');
    const started = Date.now();
    const slow = await get(s.base, '/api/following?username=demo.timeout&cursor=' + ok.body.nextCursor);
    assert.strictEqual(slow.status, 504);
    assert.strictEqual(slow.body.error.code, 'PROVIDER_TIMEOUT');
    assert.ok(Date.now() - started < 2000);
  });

  await t.test('only GET/HEAD, only the one page is served', async () => {
    const post = await get(s.base, '/api/profile?username=demo', { method: 'POST' });
    assert.strictEqual(post.status, 405);
    for (const p of ['/server.js', '/package.json', '/%2e%2e/server.js', '/.env']) {
      assert.strictEqual((await get(s.base, p)).status, 404, p);
    }
    const page = await get(s.base, '/');
    assert.strictEqual(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.match(page.text, /FollowerMatch\+/);
  });
});

test('rate limits: lookups per client and distinct accounts per client', async (t) => {
  const s = await boot({ FMP_RATE_PROFILE: '3', FMP_RATE_ACCOUNTS: '2' });
  t.after(s.close);
  for (let i = 0; i < 3; i++) assert.strictEqual((await get(s.base, '/api/profile?username=demo')).status, 200);
  const over = await get(s.base, '/api/profile?username=demo');
  assert.strictEqual(over.status, 429);
  assert.strictEqual(over.body.error.code, 'RATE_LIMITED');
  assert.ok(Number(over.headers.get('retry-after')) > 0);

  assert.strictEqual((await get(s.base, '/api/followers?username=demo')).status, 200);
  assert.strictEqual((await get(s.base, '/api/following?username=demo')).status, 200, 'same account again is fine');
  assert.strictEqual((await get(s.base, '/api/followers?username=demo.mutual')).status, 200);
  const third = await get(s.base, '/api/followers?username=demo.big');
  assert.strictEqual(third.status, 429, 'a third distinct account is refused');
});

test('provider "none" reports automatic lookup as unavailable', async (t) => {
  const s = await boot({ FMP_PROVIDER: 'none' });
  t.after(s.close);
  for (const p of ['/api/profile?username=instagram', '/api/followers?username=instagram']) {
    const r = await get(s.base, p);
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.body.error.code, 'AUTOMATIC_LOOKUP_UNAVAILABLE');
  }
  assert.strictEqual((await get(s.base, '/api/health')).body.ok, true);
});

test('mock provider is refused in production; unknown providers fail loudly', () => {
  assert.throws(() => createProvider({ FMP_PROVIDER: 'mock', NODE_ENV: 'production' }), /refused/);
  assert.ok(createProvider({ FMP_PROVIDER: 'mock', NODE_ENV: 'production', FMP_ALLOW_MOCK: '1' }).demo);
  assert.throws(() => createProvider({ FMP_PROVIDER: 'scraper' }), /Unknown FMP_PROVIDER/);
  assert.strictEqual(createProvider({}).id, 'none');
});
