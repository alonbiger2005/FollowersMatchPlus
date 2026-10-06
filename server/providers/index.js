'use strict';

/*
 * SocialGraphProvider: the one seam between FollowerMatch+ and any source of
 * public Instagram follower data.
 *
 *   id        short name, shown in logs
 *   demo      true only for the mock provider; the UI then labels results
 *             as demo data so they can never pass for a real account
 *
 *   getProfile(username) → {
 *     exists, username, displayName, profilePicture,
 *     isPrivate, followerCount, followingCount
 *   }
 *   getFollowers(username, cursor) → { users:[{ username, displayName? }], nextCursor, hasMore }
 *   getFollowing(username, cursor) → same shape
 *
 * Rules every provider must follow:
 *   - `username` arrives validated and lowercased; `cursor` is null for the
 *     first page, otherwise a cursor this provider issued earlier (opaque,
 *     ≤ 512 printable ASCII). Build upstream URLs yourself; nothing from the
 *     client is ever a URL.
 *   - Throw LookupError (../errors) with ACCOUNT_NOT_FOUND, PRIVATE_ACCOUNT,
 *     AUTOMATIC_LOOKUP_UNAVAILABLE, PROVIDER_AUTH_ERROR,
 *     PROVIDER_RATE_LIMITED or PROVIDER_TIMEOUT. Anything else is reported
 *     to the client as UNKNOWN_ERROR.
 *   - Read credentials from process.env inside the provider. Never put them
 *     in an error message.
 *   - Never log in to Instagram, reuse anyone's session, solve CAPTCHAs,
 *     rotate identities or otherwise get around Instagram's access controls.
 *     Follower lists sit behind Instagram's login wall; a provider is only
 *     acceptable if it is permitted to serve them.
 *
 * The API layer (../api.js) validates and trims everything a provider returns,
 * so a provider bug cannot push malformed data into the page.
 */

const none = require('./none');
const mock = require('./mock');

function createProvider(env) {
  const name = String(env.FMP_PROVIDER || 'none').trim().toLowerCase();
  if (name === 'none') return none.create(env);
  if (name === 'mock') {
    if (env.NODE_ENV === 'production' && env.FMP_ALLOW_MOCK !== '1') {
      throw new Error('FMP_PROVIDER=mock is refused when NODE_ENV=production (set FMP_ALLOW_MOCK=1 to override for a demo).');
    }
    return mock.create(env);
  }
  // Register a real provider here, e.g.:
  //   if (name === 'acme') return require('./acme').create(env);
  throw new Error('Unknown FMP_PROVIDER "' + name + '". Known: none, mock.');
}

module.exports = { createProvider };
