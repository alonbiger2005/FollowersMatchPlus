# FollowerMatch+

See the Instagram accounts that don't follow you back.

FollowerMatch+ has two ways in, both feeding one comparison engine
(`following − followers`) and the same results screen:

| | Public account (automatic) | Private / manual (export) |
|---|---|---|
| You provide | a username or profile link | your Instagram download: one `.zip`, or the unzipped list files |
| Data path | browser → this site's `/api` → provider | read in the browser, never uploaded |
| Needs the server | yes | no (works from a static file) |
| Status | **architecture complete; no provider connected** (see below) | complete, v1.0.0 behaviour unchanged |

## Why automatic lookup is off by default

Automatic lookup needs the complete followers and following lists of a public account. As of October 2026 there is no permitted way to get them:

- **Official API.** The Instagram Basic Display API was shut down on 4 December 2024. The remaining Instagram Graph API's [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery) returns follower *counts* for Business/Creator accounts, never the lists. No official endpoint lists any account's followers.
- **Public web.** Instagram does not serve follower lists to logged-out visitors. A plain request for `instagram.com/<user>/followers/` returns `302` to `/accounts/login/` (checked while building this).
- **Third-party "followers API" vendors.** These can only return lists by running logged-in Instagram sessions at scale. That is the login/identity-rotation bypass this project rules out, just done by someone else.

So the server ships with provider `none`. It answers every lookup with `AUTOMATIC_LOOKUP_UNAVAILABLE`, and the page sends people to the export workflow with one tap. Everything else is built and tested, including the provider seam, username UI, confirmation step, paging, progress, failure states, rate limits and caching. A permitted data source can be plugged in without touching the page. See [Adding a provider](#adding-a-provider).

A `mock` provider with invented `demo*` accounts exists for development. Its results are labelled as demo data in the UI, and it refuses to start under `NODE_ENV=production`.

## Architecture

```
followermatch-plus.html            the whole frontend (unchanged single-file app)
  ├─ export reader ─┐                readHtml / readJson / merge → { handle: {u,t} }
  └─ lookup client ─┤                /api pages → { handle: {u, t:null} }
                    ▼
          compareSocialGraph()       one engine, both paths
                    ▼
          show() → existing results UI (tally, list, filter, tick/clear/restore)

server.js                          Node http server, no dependencies
  └─ server/api.js                 /api/profile, /api/followers, /api/following, /api/health
       ├─ server/username.js       username normalisation (mirrors the page's cleanHandle)
       ├─ server/guard.js          rate limiters + TTL cache
       └─ server/providers/        SocialGraphProvider seam
            ├─ index.js            contract + registry (FMP_PROVIDER)
            ├─ none.js             default: "unavailable"
            └─ mock.js             demo accounts for development/tests
```

The browser walks the pages itself, which keeps the server stateless. The steps are:

1. `GET /api/profile?username=…`: the server validates the username, rate-limits it, fetches the profile through the provider (cached for 5 minutes) and reports whether it is private or too large.
2. The page shows the resolved account and waits for **Analyze followers**.
3. `GET /api/followers?username=…&cursor=…` repeats until `hasMore` is false, then the same for following. The server re-checks private/size itself, caches pages for 10 minutes, and validates every record the provider returns.
4. The page builds the same `{u, t}` maps the export reader builds and calls `compareSocialGraph`.

Progress is the browser's own count against the profile's reported totals, so it is never estimated. A list that stops early, repeats a cursor, or ends more than 10% short of the reported count is reported as `FOLLOWERS_PARTIAL` / `FOLLOWING_PARTIAL`, and **no results are shown**. A smaller shortfall (Instagram counts deactivated accounts it doesn't list) shows results with an explicit caution. Transient page failures are retried twice (after 1.5s and 4s).

### API

All endpoints are `GET`, return JSON, and send `Cache-Control: no-store`.

```
/api/profile?username=NAME
  200 { ok, demo, maxAccountSize, profile:{ username, displayName, profilePicture, isPrivate,
                                            followerCount, followingCount, exists, analyzable, reason } }
/api/followers?username=NAME[&cursor=C]     /api/following?…
  200 { ok, users:[{ username }], nextCursor, hasMore }
errors
  { ok:false, error:{ code, message } } with Retry-After on 429
  INVALID_USERNAME 400 · INVALID_REQUEST 400 · ACCOUNT_NOT_FOUND 404 · PRIVATE_ACCOUNT 403
  ACCOUNT_TOO_LARGE 413 · RATE_LIMITED 429 · PROVIDER_RATE_LIMITED 429 · PROVIDER_AUTH_ERROR 502
  AUTOMATIC_LOOKUP_UNAVAILABLE 503 · PROVIDER_TIMEOUT 504 · UNKNOWN_ERROR 500
```

`NETWORK_ERROR`, `FOLLOWERS_PARTIAL` and `FOLLOWING_PARTIAL` are decided in the browser.

## Run locally

Requires Node 20+. There are no runtime dependencies; `npm install` only fetches jsdom for the tests.

```sh
npm install
npm start                                 # http://localhost:3000, provider "none"
FMP_PROVIDER=mock npm start               # demo accounts (macOS/Linux shell syntax)
cp .env.example .env && npm run dev       # or configure through .env
npm test                                  # 39 tests: API, username rules, page (jsdom), .zip box
```

Demo accounts (mock provider):

| username | what it shows |
|---|---|
| `demo` | 300 following / 240 followers → 100 one-way; avatar; mixed-case handles |
| `demo.mutual` | zero one-way |
| `demo.big` | 12,000 followers over 60 pages |
| `demo.private` | private-account state |
| `demo.large` | over the size limit |
| `demo.gap` | list 27% short of the reported count → partial, no results |
| `demo.drift` | list 9% short → results plus a caution |
| `demo.ratelimit` | upstream throttles mid-list → retries, then partial |
| `demo.timeout` | upstream hangs mid-list → timeout, then partial |
| `demo.down` / `demo.busy` | provider auth failure / provider busy |
| anything else | account not found |

## Deploy

- **Static only** (Netlify, GitHub Pages, S3, any host): upload `followermatch-plus.html`, renamed to `index.html` if the host needs it. Export mode works fully. The lookup card detects there is no API and says automatic lookup is unavailable.
- **Node host** (Render, Railway, Fly.io, a VPS): `npm start`. Set `NODE_ENV=production`, `PORT` if the host assigns one, and `FMP_TRUST_PROXY=1` when behind the host's proxy so rate limits see real client addresses. The server serves the page with a strict Content-Security-Policy (`connect-src 'self'`).
- **Serverless:** `server/api.js` exports a `(req, res, url)` handler over Node's `req`/`res`, so it can be wrapped as a function. The in-memory cache and rate limits are then per instance and must move to a shared store (Redis/KV) to mean anything. Not done here, because it isn't needed until a provider exists.

## Adding a provider

1. Confirm the source is **permitted** to serve follower lists for the accounts you'll query. It must not depend on logging in to Instagram, reused sessions, CAPTCHA solving, or identity rotation.
2. Create `server/providers/<name>.js` exporting `create(env)` that returns `{ id, demo:false, getProfile, getFollowers, getFollowing }`, following the contract in `server/providers/index.js`. Throw `LookupError` codes from `server/errors.js`; read keys from `process.env`.
3. Register it in `createProvider()` and set `FMP_PROVIDER=<name>`.
4. Add a case to `test/api.test.js` with the upstream HTTP stubbed.

The page needs no changes.

## Security and privacy

- **Export files never leave the browser.** They are read with `FileReader` and compared in memory. A dropped `.zip` is opened in the browser too (`Blob.slice` + `DecompressionStream`): only its index and the followers/following entries are read, so even a multi-GB download opens on a phone. Automatic mode sends only a username.
- **No Instagram login anywhere.** There are no password, cookie or session-token fields, and none will be added.
- **Input validation.** Usernames are validated on both sides (`[a-z0-9._]{1,30}`, no `..`, no trailing `.`, no reserved paths). Cursors must be ≤512 printable ASCII.
- **No URLs from the client.** The client never supplies a URL; providers build their own upstream requests, so there is no SSRF surface.
- **One file served.** The server serves exactly one file and has no path-based file lookup.
- **Generic errors.** Error bodies are generic, and provider errors and stacks stay in the server log.
- **Minimal logs.** Logs record route, status, error code and duration. They contain no usernames, cursors or client addresses.
- **Rate limits per client.** Profile lookups, list pages, and **distinct accounts analysed per hour** (default 5, the anti-enumeration control). The UI runs one analysis at a time; starting another abandons the first.
- **Size and time limits.** An account-size cap (default 25,000) is enforced server-side, and a per-request upstream timeout applies.

## Limitations

- **No live data source.** Automatic lookup returns real data only once a permitted provider is connected; see above.
- **No follow dates in automatic mode.** Results land in the existing "Date unknown" group, and the date-range check (§4.1 of the handoff) applies only to exports.
- **One-way still means "right now".** As with exports, "one-way" means one-way at the moment of the lookup, not "unfollowed you".
- **Per-process limits.** Rate limits and caches are per process (see Deploy → Serverless).
