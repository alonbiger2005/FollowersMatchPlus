'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeUsername } = require('../server/username');

// The same table is run against the page's cleanHandle() in page.test.js,
// so browser and server can't drift apart.
const CASES = require('./helpers/username-cases');

test('server normalizeUsername matches the shared table', () => {
  for (const [input, expected] of CASES) {
    assert.strictEqual(normalizeUsername(input), expected, JSON.stringify(input));
  }
});

test('non-strings are rejected', () => {
  for (const v of [undefined, null, 42, {}, ['demo']]) assert.strictEqual(normalizeUsername(v), null);
});
