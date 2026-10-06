'use strict';

// Shared test plumbing: load the real page into jsdom with file drops stubbed.

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PAGE = fs.readFileSync(path.join(__dirname, '..', '..', 'followermatch-plus.html'), 'utf8');

// Loads the page. Any network request it makes is recorded in `calls` and
// refused: the app must never need one.
function load(base) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) console.error(e); });
  const dom = new JSDOM(PAGE, {
    url: base + '/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  const calls = [];
  const scrolls = [];
  w.scrollTo = function (a) { scrolls.push(a); };
  // Browser APIs jsdom lacks; Node's own implementations stand in.
  w.DecompressionStream = DecompressionStream;
  w.Response = Response;
  w.TextDecoder = TextDecoder;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.fetch = function (u) {
    calls.push(String(u));
    return Promise.reject(new TypeError('network disabled in tests'));
  };
  // Run the page's own script now that the stubs exist.
  const src = PAGE.slice(PAGE.indexOf('<script>') + 8, PAGE.indexOf('</script>'));
  w.eval(src);
  return { dom, w, D: w.document, calls, scrolls };
}

// Synthesised drop of fixture files on a deck (as in the handoff harness).
// A Buffer fixture becomes a slice-able binary file, like a real .zip.
function dropper(w, fixtures) {
  w.FileReader = class {
    readAsText(f) {
      this.result = fixtures[f.name];
      setTimeout(() => this.onload && this.onload(), 0);
    }
    readAsArrayBuffer(blob) {
      const b = blob.bytes;
      this.result = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      setTimeout(() => this.onload && this.onload(), 0);
    }
  };
  const file = (n) => {
    const data = fixtures[n];
    if (!Buffer.isBuffer(data)) return { name: n };
    return { name: n, size: data.length, type: 'application/zip', slice: (a, b) => ({ bytes: data.subarray(a, b) }) };
  };
  return function drop(deckId, names) {
    const d = w.document.getElementById(deckId);
    const l = names.map(file);
    l.item = (i) => l[i];
    const e = new w.Event('drop', { bubbles: true });
    Object.defineProperty(e, 'dataTransfer', { value: { files: l } });
    d.dispatchEvent(e);
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, ms, label) {
  const end = Date.now() + (ms || 3000);
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for ' + (label || fn.toString()));
    await sleep(15);
  }
}

module.exports = { load, dropper, sleep, until };
