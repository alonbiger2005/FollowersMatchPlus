'use strict';

// The default. No permitted source of Instagram follower lists exists today
// (see README → "Why automatic lookup is off"), so this provider says so
// honestly and the page sends people to the export workflow.
const { LookupError } = require('../errors');

function create() {
  const off = () => Promise.reject(new LookupError('AUTOMATIC_LOOKUP_UNAVAILABLE'));
  return { id: 'none', demo: false, getProfile: off, getFollowers: off, getFollowing: off };
}

module.exports = { create };
