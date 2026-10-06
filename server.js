'use strict';

// FollowerMatch+ server: serves the single-page app and the automatic-lookup
// API. No dependencies beyond Node itself.
//
//   node server.js                       (provider "none": lookup reports unavailable)
//   FMP_PROVIDER=mock node server.js     (demo accounts for development)
//
// The page still works with no server at all: open or statically host
// followermatch-plus.html and the export workflow runs entirely in the browser.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createProvider } = require('./server/providers');
const { createApi } = require('./server/api');

const PAGE = path.join(__dirname, 'followermatch-plus.html');

// connect-src 'self' means the page can only ever talk to this server, and
// export files never leave the browser at all (they are read with FileReader).
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-cache',
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src https: data:',
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; '),
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

function createServer(env) {
  const provider = createProvider(env);
  const api = createApi(provider, env);
  const page = fs.readFileSync(PAGE);

  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (e) {
      res.writeHead(400).end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      api(req, res, url).catch((err) => {
        console.error('[server] api crash', err);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    // Exactly one file is served; there is no path-based file lookup to abuse.
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/followermatch-plus.html') {
      res.writeHead(200, PAGE_HEADERS);
      res.end(req.method === 'HEAD' ? undefined : page);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  });
  server.provider = provider;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const server = createServer(process.env);
  server.listen(port, host, () => {
    const p = server.provider;
    console.log('FollowerMatch+ on http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + port + ' (provider: ' + p.id + ')');
    if (p.demo) console.warn('!! Mock provider active: automatic lookup serves invented demo accounts only.');
  });
}

module.exports = { createServer };
