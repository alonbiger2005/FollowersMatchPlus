'use strict';

// Every failure the API can report. Providers throw LookupError with one of
// the provider-facing codes; anything else they throw becomes UNKNOWN_ERROR.
// FOLLOWERS_PARTIAL, FOLLOWING_PARTIAL and NETWORK_ERROR are decided in the
// browser, which is the only place that knows a list stopped part-way.
const STATUS = {
  INVALID_USERNAME: 400,
  INVALID_REQUEST: 400,
  ACCOUNT_NOT_FOUND: 404,
  NOT_FOUND: 404,
  PRIVATE_ACCOUNT: 403,
  METHOD_NOT_ALLOWED: 405,
  ACCOUNT_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  PROVIDER_RATE_LIMITED: 429,
  UNKNOWN_ERROR: 500,
  PROVIDER_AUTH_ERROR: 502,
  AUTOMATIC_LOOKUP_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504
};

// Deliberately generic: the frontend has its own wording, and nothing from a
// provider's raw error ever reaches the client.
const MESSAGES = {
  INVALID_USERNAME: 'That is not a valid Instagram username.',
  INVALID_REQUEST: 'The request was not valid.',
  ACCOUNT_NOT_FOUND: 'Account not found.',
  NOT_FOUND: 'Not found.',
  PRIVATE_ACCOUNT: 'This account is private.',
  METHOD_NOT_ALLOWED: 'Method not allowed.',
  ACCOUNT_TOO_LARGE: 'This account is too large for automatic lookup.',
  RATE_LIMITED: 'Too many lookups. Try again later.',
  PROVIDER_RATE_LIMITED: 'Automatic lookup is busy. Try again later.',
  UNKNOWN_ERROR: 'Something went wrong.',
  PROVIDER_AUTH_ERROR: 'Automatic lookup is unavailable.',
  AUTOMATIC_LOOKUP_UNAVAILABLE: 'Automatic lookup is unavailable.',
  PROVIDER_TIMEOUT: 'Automatic lookup timed out.'
};

class LookupError extends Error {
  constructor(code, options) {
    const opts = options || {};
    super(opts.detail || code);
    this.code = Object.prototype.hasOwnProperty.call(STATUS, code) ? code : 'UNKNOWN_ERROR';
    this.retryAfter = opts.retryAfter;
  }
}

module.exports = { LookupError, STATUS, MESSAGES };
