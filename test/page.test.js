'use strict';

// The real page in jsdom. Part 1 is the handoff's manual-mode regression set
// (§7); part 2 drives automatic mode end to end against the real server with
// the mock provider.

const test = require('node:test');
const assert = require('node:assert');
const { boot, load, dropper, sleep, until } = require('./helpers/harness');
const F = require('./helpers/fixtures');
const CASES = require('./helpers/username-cases');

const NO_SERVER = 'http://127.0.0.1:9';

const $ = (D, id) => D.getElementById(id);
const tally = (D) => Array.from(D.querySelectorAll('#tally dd')).map((d) => d.textContent);
const shown = (D) => Array.from(D.querySelectorAll('#roll li')).filter((li) => !li.hidden);
const years = (D) => Array.from(D.querySelectorAll('#roll .yr')).filter((h) => !h.hidden).map((h) => h.firstChild.textContent);
const probeText = (D) => $(D, 'probe').textContent;
function button(D, label) {
  return Array.from(D.querySelectorAll('#probe button')).find((b) => b.textContent.trim() === label);
}

function manualPage(fixtures) {
  const p = load(NO_SERVER);
  p.drop = dropper(p.w, fixtures);
  return p;
}

const PAIR_A = {
  'followers_1.html': F.html('Followers', F.followersA),
  'following.html': F.html('Following', F.followingA, true)
};

/* ---------------- manual mode (export files) ---------------- */

test('manual 1: known pair gives the known count, through the shared engine', async () => {
  const { D, drop } = manualPage(PAIR_A);
  drop('deck-followers', ['followers_1.html']);
  drop('deck-following', ['following.html']);
  await until(() => !$(D, 'run').disabled, 2000, 'run enabled');
  $(D, 'run').click();
  assert.strictEqual($(D, 'out').hidden, false);
  assert.deepStrictEqual(tally(D), ['30', '25', '20', '10']);
  assert.match($(D, 'verdict').textContent, /You follow 10 accounts that don't follow you back/);
  assert.strictEqual($(D, 'source').textContent, 'Analyzed from Instagram export');
  assert.strictEqual(shown(D).length, 10);
  assert.deepStrictEqual(years(D), ['2026', '2025', '2024'], 'grouped by year, newest first');
  const a = shown(D)[0].querySelector('a');
  assert.match(a.href, /^https:\/\/www\.instagram\.com\/acct\d+\/$/);
  assert.strictEqual(a.target, '_blank');
  assert.strictEqual($(D, 'caution').hidden, true);
});

test('manual 2 (§4.2): swapped inputs give a different count; the box wins; Swap restores', async () => {
  const { D, drop } = manualPage(PAIR_A);
  drop('deck-followers', ['following.html']);
  drop('deck-following', ['followers_1.html']);
  await until(() => !$(D, 'run').disabled);
  assert.strictEqual(D.querySelector('#deck-followers .flag').hidden, false, 'mismatch is flagged');
  $(D, 'run').click();
  assert.deepStrictEqual(tally(D), ['25', '30', '20', '5']);
  $(D, 'swap').click();
  assert.strictEqual($(D, 'out').hidden, true, 'swap discards stale results');
  assert.strictEqual(D.querySelector('#deck-followers .flag').hidden, true);
  $(D, 'run').click();
  assert.deepStrictEqual(tally(D), ['30', '25', '20', '10']);
});

test('manual 3: JSON followers + HTML following, mixed case, no dates → "Date unknown"', async () => {
  const fx = {
    'followers_1.json': F.followersJson(['Alpha', 'BETA', 'gamma', 'zeta'].map((u) => ({ u }))),
    'following.html': F.html('Following', ['alpha', 'beta', 'Gamma', 'delta', 'EPS'].map((u) => ({ u })), true)
  };
  const { D, drop } = manualPage(fx);
  drop('deck-followers', ['followers_1.json']);
  drop('deck-following', ['following.html']);
  await until(() => !$(D, 'run').disabled);
  $(D, 'run').click();
  assert.deepStrictEqual(tally(D), ['5', '4', '3', '2']);
  assert.deepStrictEqual(years(D), ['Date unknown']);
  assert.deepStrictEqual(shown(D).map((li) => li.dataset.u), ['delta', 'eps']);
});

test('manual 4 (§4.1): mismatched date ranges raise the caution with the right count', async () => {
  const following = F.range('old', 10, (i) => F.day(2020, 1 + i, 5));
  const followers = following.slice(0, 5).map((r) => ({ u: r.u, t: F.day(2026, 2, 1) }));
  const fx = { 'followers_1.html': F.html('Followers', followers), 'following.html': F.html('Following', following, true) };
  const { D, drop } = manualPage(fx);
  drop('deck-followers', ['followers_1.html']);
  drop('deck-following', ['following.html']);
  await until(() => !$(D, 'run').disabled);
  $(D, 'run').click();
  assert.strictEqual($(D, 'caution').hidden, false);
  assert.match($(D, 'caution').textContent, /cover different periods/);
  assert.match($(D, 'caution').textContent, /\b5 of the results below were followed before/);
});

test('manual 5 (§4.4): removing or adding files discards the results', async () => {
  const fx = Object.assign({ 'followers_2.json': F.followersJson([{ u: 'extra1' }]) }, PAIR_A);
  const { D, drop } = manualPage(fx);
  drop('deck-followers', ['followers_1.html']);
  drop('deck-following', ['following.html']);
  await until(() => !$(D, 'run').disabled);

  $(D, 'run').click();
  D.querySelector('#deck-following .files button').click();
  assert.strictEqual($(D, 'out').hidden, true);
  assert.strictEqual(D.querySelectorAll('#roll li').length, 0);
  assert.match($(D, 'status').textContent, /List cleared\. Add your following list/);

  drop('deck-following', ['following.html']);
  await until(() => !$(D, 'run').disabled);
  $(D, 'run').click();
  drop('deck-followers', ['followers_2.json']);
  await until(() => $(D, 'out').hidden, 2000, 'third file clears');
  assert.match($(D, 'status').textContent, /Files changed — generate the list again/);

  $(D, 'run').click();
  assert.deepStrictEqual(tally(D), ['30', '26', '20', '10'], 'multiple follower files merge');
  D.querySelector('#deck-followers .files button').click();
  D.querySelector('#deck-followers .files button').click();
  assert.strictEqual($(D, 'out').hidden, true);
  assert.strictEqual($(D, 'run').disabled, true);
});

test('manual 6 + 7: tick/clear/restore and filtering', async () => {
  const { D, drop } = manualPage(PAIR_A);
  drop('deck-followers', ['followers_1.html']);
  drop('deck-following', ['following.html']);
  await until(() => !$(D, 'run').disabled);
  $(D, 'run').click();

  const w = D.defaultView;
  shown(D).slice(0, 3).forEach((li) => {
    const cb = li.querySelector('.tick');
    cb.checked = true;
    cb.dispatchEvent(new w.Event('change'));
  });
  assert.strictEqual($(D, 'strike').disabled, false);
  $(D, 'strike').click();
  assert.strictEqual(shown(D).length, 7);
  assert.strictEqual($(D, 'restore').textContent, 'Restore full list (3)');

  const q = $(D, 'q');
  const pick = shown(D)[4].dataset.u;
  q.value = '@' + pick.toUpperCase();
  q.dispatchEvent(new w.Event('input'));
  const n = shown(D).length;
  assert.strictEqual(n, 1);
  assert.strictEqual(shown(D)[0].dataset.u, pick);
  assert.strictEqual($(D, 'count').textContent, '1 of 7');
  const perYear = Array.from(D.querySelectorAll('#roll .yr')).filter((h) => !h.hidden)
    .reduce((s, h) => s + Number(h.lastChild.textContent), 0);
  assert.strictEqual(perYear, n, 'year headers count only matching rows');

  $(D, 'restore').click();
  assert.strictEqual(shown(D).length, 10);
  assert.strictEqual(q.value, '');
  assert.strictEqual(D.querySelectorAll('.tick:checked').length, 0);
});

test('manual 8 (§4.3): header CTA, logo and export link scroll; nothing navigates', () => {
  const { D, scrolls, w } = manualPage({});
  const before = w.location.href;
  $(D, 'jump').click();
  $(D, 'home').click();
  $(D, 'manual').click();
  assert.strictEqual(scrolls.length, 3);
  assert.strictEqual(scrolls[1].top, 0);
  assert.strictEqual(w.location.href, before);
  assert.strictEqual(D.querySelectorAll('a[href^="#"]').length, 0);
});

test('shared engine: handles named like Object.prototype keys are compared like any other', async () => {
  const fx = {
    'followers_1.json': F.followersJson(['toString', 'friend'].map((u) => ({ u }))),
    'following.json': F.followingJson(['constructor', '__proto__', 'toString', 'friend', 'hasOwnProperty'].map((u) => ({ u })))
  };
  const { D, drop } = manualPage(fx);
  drop('deck-followers', ['followers_1.json']);
  drop('deck-following', ['following.json']);
  await until(() => !$(D, 'run').disabled);
  $(D, 'run').click();
  assert.deepStrictEqual(tally(D), ['5', '2', '2', '3']);
  assert.deepStrictEqual(shown(D).map((li) => li.dataset.u).sort(), ['__proto__', 'constructor', 'hasownproperty']);
});

/* ---------------- automatic mode (username) ---------------- */

async function check(p, value) {
  $(p.D, 'handle').value = value;
  $(p.D, 'lookup-form').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
}

async function settle(p) {
  await until(() => !$(p.D, 'check').disabled && !/Finding @/.test(probeText(p.D)), 3000, 'lookup settles');
}

async function analyze(p, user) {
  await check(p, user);
  await until(() => button(p.D, 'Analyze followers'), 3000, 'profile card');
  button(p.D, 'Analyze followers').click();
}

test('automatic mode against the real server (mock provider)', async (t) => {
  const s = await boot({ FMP_RATE_PROFILE: '1000', FMP_RATE_ACCOUNTS: '1000', FMP_PROVIDER_TIMEOUT_MS: '200' });
  t.after(s.close);

  await t.test('username / @username / profile URL all normalise; invalid input never hits the network', async () => {
    const p = load(s.base);
    for (const [input, expected] of CASES) {
      p.calls.length = 0;
      await check(p, input);
      if (expected === null) {
        await sleep(5);
        assert.match(probeText(p.D), /doesn't look like an Instagram username/, JSON.stringify(input));
        assert.strictEqual(p.calls.length, 0, 'no request for ' + JSON.stringify(input));
        assert.strictEqual(button(p.D, 'Use Instagram export instead'), undefined);
      } else {
        assert.strictEqual(p.calls[0], '/api/profile?username=' + encodeURIComponent(expected), JSON.stringify(input));
        assert.strictEqual($(p.D, 'handle').value, expected);
        await settle(p);
      }
    }
  });

  await t.test('public account: confirm, analyse, results in the existing UI', async () => {
    const p = load(s.base);
    await check(p, 'https://www.instagram.com/demo/');
    await until(() => button(p.D, 'Analyze followers'));
    assert.match(probeText(p.D), /@demo/);
    assert.match(probeText(p.D), /Public account/);
    assert.match(probeText(p.D), /Followers240Following300/);
    assert.match(probeText(p.D), /Demo data/);
    assert.ok(p.D.querySelector('#probe img.face'), 'avatar shown when provided');
    assert.ok(p.calls.every((c) => c.startsWith('/api/profile')), 'no lists fetched before confirmation');

    button(p.D, 'Analyze followers').click();
    await until(() => !$(p.D, 'out').hidden, 3000, 'results');
    assert.deepStrictEqual(tally(p.D), ['300', '240', '200', '100']);
    assert.match($(p.D, 'verdict').textContent, /You follow 100 accounts that don't follow you back/);
    assert.match($(p.D, 'source').textContent, /Analyzed automatically from @demo · demo data/);
    assert.deepStrictEqual(years(p.D), ['Date unknown']);
    assert.strictEqual(shown(p.D).length, 100);
    assert.ok(!shown(p.D).some((li) => /^f_00(6\d|[7-9]\d)$/.test(li.dataset.u)), 'upper-cased followers still matched');
    assert.match(shown(p.D)[0].querySelector('a').href, /^https:\/\/www\.instagram\.com\/[^/]+\/$/);
    assert.match(probeText(p.D), /Account found.*Loading followers….*240 \/ 240.*Loading following….*300 \/ 300.*Comparing accounts….*Done\./);
    assert.ok(p.calls.filter((c) => c.startsWith('/api/followers')).length === 5, '240 followers in pages of 50');
    assert.strictEqual($(p.D, 'caution').hidden, true);

    // the same result tools work on automatic results
    const q = $(p.D, 'q');
    q.value = 'fan_000';
    q.dispatchEvent(new p.w.Event('input'));
    assert.strictEqual(shown(p.D).length, 0, 'fans follow you; they are not one-way');
    q.value = 'f_005';
    q.dispatchEvent(new p.w.Event('input'));
    assert.strictEqual(shown(p.D).length, 10);
  });

  await t.test('zero one-way relationships', async () => {
    const p = load(s.base);
    await analyze(p, 'demo.mutual');
    await until(() => !$(p.D, 'out').hidden);
    assert.strictEqual($(p.D, 'verdict').textContent, 'Every account you follow follows you back.');
    assert.deepStrictEqual(tally(p.D), ['120', '150', '120', '0']);
  });

  await t.test('large account: 12,000 followers over 60 pages', async () => {
    const p = load(s.base);
    await analyze(p, 'demo.big');
    await until(() => !$(p.D, 'out').hidden, 10000);
    assert.deepStrictEqual(tally(p.D), ['1,500', '12,000', '1,200', '300']);
    assert.match(probeText(p.D), /12,000 \/ 12,000/);
  });

  await t.test('nonexistent, private and oversized accounts', async () => {
    const p = load(s.base);
    await check(p, 'nobody_here');
    await settle(p);
    assert.match(probeText(p.D), /We couldn't find that Instagram account\./);
    assert.ok(button(p.D, 'Use Instagram export instead'));

    await check(p, '@demo.private');
    await settle(p);
    assert.match(probeText(p.D), /This account is private\..*Automatic comparison works with accessible public accounts/);
    assert.match(probeText(p.D), /Private account/);
    assert.strictEqual(button(p.D, 'Analyze followers'), undefined);
    assert.ok(button(p.D, 'Use Instagram export instead'));
    assert.ok(!p.calls.some((c) => /^\/api\/follow/.test(c)), 'no list requested for a private account');

    await check(p, 'demo.large');
    await settle(p);
    assert.match(probeText(p.D), /too large for automatic lookup.*up to 25,000 followers/);
    assert.strictEqual(button(p.D, 'Analyze followers'), undefined);
  });

  await t.test('provider auth failure and provider rate limit, with retry', async () => {
    const p = load(s.base);
    await check(p, 'demo.down');
    await settle(p);
    assert.match(probeText(p.D), /Automatic lookup is currently unavailable\./);
    assert.strictEqual(button(p.D, 'Try again'), undefined);

    await check(p, 'demo.busy');
    await settle(p);
    assert.match(probeText(p.D), /Automatic lookup is busy right now\./);
    const before = p.calls.length;
    button(p.D, 'Try again').click();
    await settle(p);
    assert.strictEqual(p.calls.length, before + 1, 'retry re-requests');
    assert.match(probeText(p.D), /busy right now/);
  });

  await t.test('incomplete lists never produce a result', async () => {
    const p = load(s.base);

    await analyze(p, 'demo.gap');
    await until(() => /Only part of the followers list/.test(probeText(p.D)));
    assert.match(probeText(p.D), /Instagram reports 300 followers, but only 220 could be listed/);
    assert.strictEqual($(p.D, 'out').hidden, true);

    await analyze(p, 'demo.ratelimit');
    await until(() => /Only part of the followers list/.test(probeText(p.D)), 9000, 'rate-limit partial');
    assert.match(probeText(p.D), /100 of 400 followers loaded before automatic lookup was rate-limited/);
    assert.strictEqual(p.calls.filter((c) => /followers\?username=demo\.ratelimit&cursor=/.test(c)).length, 3, 'two retries');
    assert.strictEqual($(p.D, 'out').hidden, true);
    assert.ok(button(p.D, 'Try again') && button(p.D, 'Use Instagram export instead'));
  });

  await t.test('timeout mid-list → following partial', async () => {
    const p = load(s.base);
    await analyze(p, 'demo.timeout');
    await until(() => /Only part of the following list/.test(probeText(p.D)), 9000, 'timeout partial');
    assert.match(probeText(p.D), /100 of 200 accounts you follow loaded before the lookup timed out/);
    assert.strictEqual($(p.D, 'out').hidden, true);
  });

  await t.test('small count gap: results shown, with an explicit caution', async () => {
    const p = load(s.base);
    await analyze(p, 'demo.drift');
    await until(() => !$(p.D, 'out').hidden);
    assert.strictEqual($(p.D, 'caution').hidden, false);
    assert.match($(p.D, 'caution').textContent, /Instagram reports 220 followers but listed 200/);
  });

  await t.test('automatic and export results share one results area', async () => {
    const p = load(s.base);
    p.drop = dropper(p.w, PAIR_A);
    await analyze(p, 'demo');
    await until(() => !$(p.D, 'out').hidden);
    p.drop('deck-followers', ['followers_1.html']);
    await sleep(30);
    assert.strictEqual($(p.D, 'out').hidden, false, 'adding an export file does not wipe automatic results');
    p.drop('deck-following', ['following.html']);
    await until(() => !$(p.D, 'run').disabled);
    $(p.D, 'run').click();
    assert.deepStrictEqual(tally(p.D), ['30', '25', '20', '10']);
    assert.strictEqual($(p.D, 'source').textContent, 'Analyzed from Instagram export');
    D_removeFirstFile(p.D);
    assert.strictEqual($(p.D, 'out').hidden, true, 'export results still follow §4.4');
  });
});

function D_removeFirstFile(D) {
  D.querySelector('#deck-following .files button').click();
}

test('cancel stops loading and returns to the confirmed account', async (t) => {
  const s = await boot({ FMP_MOCK_DELAY_MS: '40' });
  t.after(s.close);
  const p = load(s.base);
  await check(p, 'demo.big');
  await until(() => button(p.D, 'Analyze followers'), 3000);
  button(p.D, 'Analyze followers').click();
  await until(() => p.calls.filter((c) => c.startsWith('/api/followers')).length >= 3, 5000);
  button(p.D, 'Cancel').click();
  assert.ok(button(p.D, 'Analyze followers'), 'back to the confirmation card');
  const n = p.calls.length;
  await sleep(250);
  assert.ok(p.calls.length <= n + 1, 'no further pages requested after cancel');
  assert.strictEqual($(p.D, 'out').hidden, true);
});

test('own rate limit is reported, not crashed on', async (t) => {
  const s = await boot({ FMP_RATE_PROFILE: '2' });
  t.after(s.close);
  const p = load(s.base);
  for (let i = 0; i < 3; i++) {
    await check(p, 'demo');
    await settle(p);
  }
  assert.match(probeText(p.D), /You've run several lookups in a short time\./);
  assert.ok(button(p.D, 'Use Instagram export instead'));
});

test('no backend: static hosting, file://, network down, provider "none"', async (t) => {
  const s = await boot({ FMP_PROVIDER: 'none' });
  t.after(s.close);
  const unavailable = /Automatic lookup is currently unavailable\..*export/;

  const off = load(s.base);
  await check(off, 'instagram');
  await settle(off);
  assert.match(probeText(off.D), unavailable);

  const staticHost = load(NO_SERVER, () => Promise.resolve(new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'Content-Type': 'text/html' } })));
  await check(staticHost, 'instagram');
  await settle(staticHost);
  assert.match(probeText(staticHost.D), unavailable);

  const spa = load(NO_SERVER, () => Promise.resolve(new Response('<!doctype html><p>app</p>', { status: 200 })));
  await check(spa, 'instagram');
  await settle(spa);
  assert.match(probeText(spa.D), unavailable);

  const file = load('file:///tmp/fm');
  await check(file, 'instagram');
  await settle(file);
  assert.match(probeText(file.D), unavailable);
  assert.strictEqual(file.calls.length, 0);

  const down = load(NO_SERVER, () => Promise.reject(new TypeError('Failed to fetch')));
  await check(down, 'instagram');
  await settle(down);
  assert.match(probeText(down.D), /Couldn't reach FollowerMatch\+\..*Try again/);
});
