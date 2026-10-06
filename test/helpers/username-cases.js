'use strict';

// [input, expected normalised username or null]
module.exports = [
  ['demo', 'demo'],
  ['@demo', 'demo'],
  ['  @Demo  ', 'demo'],
  ['DEMO.public_1', 'demo.public_1'],
  ['instagram.com/demo', 'demo'],
  ['https://instagram.com/demo', 'demo'],
  ['https://www.instagram.com/demo/', 'demo'],
  ['http://www.instagram.com/demo/?hl=en', 'demo'],
  ['https://m.instagram.com/demo#top', 'demo'],
  ['https://www.instagram.com/_u/demo', 'demo'],
  ['a', 'a'],
  ['a'.repeat(30), 'a'.repeat(30)],
  ['a'.repeat(31), null],
  ['', null],
  ['   ', null],
  ['@', null],
  ['@@demo', null],
  ['has space', null],
  ['bad..name', null],
  ['trailing.', null],
  ['emoji😀', null],
  ['semi;colon', null],
  ['../../etc/passwd', null],
  ['https://evil.example/demo', null],
  ['https://instagram.com.evil.example/demo', null],
  ['https://www.instagram.com/p/ABC123/', null],
  ['https://www.instagram.com/demo/reels/', null],
  ['explore', null],
  ['x'.repeat(250), null]
];
