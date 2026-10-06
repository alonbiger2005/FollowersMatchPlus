'use strict';

// Mirrors cleanHandle() in followermatch-plus.html. The browser normalises
// first; the server repeats it because it never trusts the client.
const PROFILE_LINK = /^(?:https?:\/\/)?(?:(?:www|m)\.)?instagram\.com\/(?:_u\/)?([^/?#\s]+)\/?(?:[?#].*)?$/i;
const SHAPE = /^[a-z0-9._]{1,30}$/;
const RESERVED = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'legal', 'about', '_u', 'tv', 'web'
]);

function normalizeUsername(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s || s.length > 200) return null;
  const link = s.match(PROFILE_LINK);
  if (link) s = link[1];
  s = s.replace(/^@/, '').toLowerCase();
  if (!SHAPE.test(s) || s.indexOf('..') > -1 || s.endsWith('.') || RESERVED.has(s)) return null;
  return s;
}

// Usernames that come back from a provider: same character rules, case kept.
function isListedUsername(s) {
  return typeof s === 'string' && /^[A-Za-z0-9._]{1,30}$/.test(s);
}

module.exports = { normalizeUsername, isListedUsername };
