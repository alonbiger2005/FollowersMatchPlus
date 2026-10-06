'use strict';

// The real page in jsdom: the handoff's regression set (§7), the shared
// engine, and the one-drop .zip import.

const test = require('node:test');
const assert = require('node:assert');
const { load, dropper, until } = require('./helpers/harness');
const F = require('./helpers/fixtures');

const NO_SERVER = 'http://127.0.0.1:9';

const $ = (D, id) => D.getElementById(id);
const tally = (D) => Array.from(D.querySelectorAll('#tally dd')).map((d) => d.textContent);
const shown = (D) => Array.from(D.querySelectorAll('#roll li')).filter((li) => !li.hidden);
const years = (D) => Array.from(D.querySelectorAll('#roll .yr')).filter((h) => !h.hidden).map((h) => h.firstChild.textContent);

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

test('manual 8 (§4.3): header CTA and logo scroll; nothing navigates', () => {
  const { D, scrolls, w } = manualPage({});
  const before = w.location.href;
  $(D, 'jump').click();
  $(D, 'home').click();
  assert.strictEqual(scrolls.length, 2);
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

/* ---------------- one-step export (.zip) ---------------- */

const fs = require('node:fs');
const path = require('node:path');
const ZIPS = {};
for (const f of fs.readdirSync(path.join(__dirname, 'fixtures'))) {
  if (f.endsWith('.zip')) ZIPS[f] = fs.readFileSync(path.join(__dirname, 'fixtures', f));
}
const chips = (D, deck) => Array.from(D.querySelectorAll('#' + deck + ' .files li span')).map((s) => s.textContent);

test('zip: one drop finds both lists, ignores decoys, and generates the list', async () => {
  const { D, drop } = manualPage(ZIPS);
  drop('deck-zip', ['instagram-html.zip']);
  await until(() => !$(D, 'out').hidden, 3000, 'auto-generated results');
  assert.deepStrictEqual(tally(D), ['30', '25', '20', '10']);
  assert.deepStrictEqual(chips(D, 'deck-followers'), ['followers_1.html', 'followers_2.html']);
  assert.deepStrictEqual(chips(D, 'deck-following'), ['following.html']);
  assert.deepStrictEqual(chips(D, 'deck-zip'), ['instagram-html.zip']);
  assert.match(D.querySelector('#deck-zip .hint').textContent, /3 lists found inside/);
  assert.ok(D.getElementById('deck-zip').classList.contains('armed'));
  assert.deepStrictEqual(years(D), ['2026', '2025', '2024'], 'dates survive the archive');
  assert.strictEqual(D.querySelectorAll('.flag:not([hidden])').length, 0);
});

test('zip: JSON export, stored (uncompressed), inside a top-level folder', async () => {
  const { D, drop } = manualPage(ZIPS);
  drop('deck-zip', ['instagram-json-stored.zip']);
  await until(() => !$(D, 'out').hidden, 3000);
  assert.deepStrictEqual(tally(D), ['30', '25', '20', '10']);
  assert.deepStrictEqual(chips(D, 'deck-followers'), ['followers_1.json']);
});

test('zip: streamed archive with data descriptors', async () => {
  const { D, drop } = manualPage(ZIPS);
  drop('deck-zip', ['instagram-streamed.zip']);
  await until(() => !$(D, 'out').hidden, 3000);
  assert.deepStrictEqual(tally(D), ['30', '25', '20', '10']);
});

test('zip: dropped on a list box it is still split by file name', async () => {
  const { D, drop } = manualPage(ZIPS);
  drop('deck-followers', ['instagram-html.zip']);
  await until(() => !$(D, 'out').hidden, 3000);
  assert.deepStrictEqual(tally(D), ['30', '25', '20', '10']);
  assert.deepStrictEqual(chips(D, 'deck-following'), ['following.html']);
});

test('zip: removing the download clears both boxes and the results (§4.4)', async () => {
  const { D, drop } = manualPage(ZIPS);
  drop('deck-zip', ['instagram-html.zip']);
  await until(() => !$(D, 'out').hidden, 3000);
  D.querySelector('#deck-zip .files button').click();
  assert.strictEqual($(D, 'out').hidden, true);
  assert.deepStrictEqual([chips(D, 'deck-followers'), chips(D, 'deck-following'), chips(D, 'deck-zip')], [[], [], []]);
  assert.strictEqual($(D, 'run').disabled, true);
  assert.match($(D, 'status').textContent, /List cleared\. Add both lists/);
});

test('zip: bad archives, missing lists, wrong files and old browsers explain themselves', async () => {
  const p = manualPage(Object.assign({ 'followers_1.html': PAIR_A['followers_1.html'] }, ZIPS));
  p.drop('deck-zip', ['not-really.zip']);
  await until(() => /isn't a \.zip archive/.test($(p.D, 'status').textContent), 3000);
  assert.ok($(p.D, 'status').classList.contains('bad'));

  p.drop('deck-zip', ['instagram-no-lists.zip']);
  await until(() => /has no followers or following list in it/.test($(p.D, 'status').textContent), 3000);

  p.drop('deck-zip', ['followers_1.html']);
  await until(() => /That box takes the \.zip download/.test($(p.D, 'status').textContent), 3000);
  assert.strictEqual($(p.D, 'out').hidden, true);

  delete p.w.DecompressionStream;
  p.drop('deck-zip', ['instagram-html.zip']);
  await until(() => /can't open \.zip files\. Unzip the download/.test($(p.D, 'status').textContent), 3000);
});

test('the page makes no network requests', async () => {
  const p = manualPage(ZIPS);
  p.drop('deck-zip', ['instagram-html.zip']);
  await until(() => !$(p.D, 'out').hidden, 3000);
  $(p.D, 'jump').click();
  assert.deepStrictEqual(p.calls, []);
});
