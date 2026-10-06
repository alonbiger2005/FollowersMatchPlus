'use strict';

// Shared test plumbing: boot the real server on a free port, and load the
// real page into jsdom wired to that server.

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createServer } = require('../../server');

const PAGE = fs.readFileSync(path.join(__dirname, '..', '..', 'followermatch-plus.html'), 'utf8');

async function boot(env) {
  const server = createServer(Object.assign({ FMP_PROVIDER: 'mock', FMP_MOCK_DELAY_MS: '0', FMP_QUIET: '1' }, env));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

// Loads the page. `base` decides the page's origin; `fetchImpl` replaces the
// network (defaults to real fetch against `base`). Every request path is
// recorded in `calls`.
function load(base, fetchImpl) {
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
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.fetch = function (u, opts) {
    const abs = new URL(u, base + '/');
    calls.push(abs.pathname + abs.search);
    const o = Object.assign({}, opts);
    delete o.signal; // jsdom's AbortSignal isn't Node's
    return (fetchImpl || fetch)(abs.href, o);
  };
  // Run the page's own script now that the stubs exist.
  const src = PAGE.slice(PAGE.indexOf('<script>') + 8, PAGE.indexOf('</script>'));
  w.eval(src);
  return { dom, w, D: w.document, calls, scrolls };
}

// Synthesised drop of fixture files on a deck (as in the handoff harness).
function dropper(w, fixtures) {
  w.FileReader = class {
    readAsText(f) {
      this.result = fixtures[f.name];
      setTimeout(() => this.onload && this.onload(), 0);
    }
  };
  return function drop(deckId, names) {
    const d = w.document.getElementById(deckId);
    const l = names.map((n) => ({ name: n }));
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

module.exports = { boot, load, dropper, sleep, until };
