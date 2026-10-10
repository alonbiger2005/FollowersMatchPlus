# FollowerMatch+ — Project Handoff

**Attach this file alongside `followermatch-plus.html` when starting work in Claude Code.**

This document is the complete context for a finished, working app. It exists so a new session can continue the work without re-deriving decisions or re-introducing bugs that were already found and fixed. Read it fully before changing anything.

---

## 0. How to use this file

Paste this as your first message in the new Claude Code session:

> I'm continuing work on FollowerMatch+, a single-file web app. I've attached the current build (`followermatch-plus.html`) and a handoff document (`FollowerMatchPlus-HANDOFF.md`). Read the handoff first — it contains the architecture, the design invariants, and a list of bugs that were already fixed and must not be reintroduced. Then confirm you've read it and tell me what you understand the app to be before making any changes.

Then state what you want changed.

---

## 1. What the product is

**FollowerMatch+** is a tool in the Match+ Industries family.

**Core concept: match your following list against your followers list.**

The user exports their own Instagram connections data, drops the two files into the app, and gets back the list of accounts they follow that do not follow them back — each one a direct link to that profile so they can unfollow by hand.

- **Tagline / subheader:** *See the accounts that don't follow you back.*
- **Wordmark:** `FollowerMatch+` — "Follower" white, "Match+" in the Instagram gradient. One continuous word, no space.
- **App tile:** `FM+` on a gradient rounded square.
- **Status:** v1.2.0, feature-complete and working. Accepts the whole Instagram download (`.zip`) in one drop. Deployed with GitHub Pages at https://alonbiger2005.github.io/FollowersMatchPlus/ (`.github/workflows/pages.yml`: tests, then publish).

**The Match+ logic here is literal:** it is a set-difference engine. `following − followers = accounts that don't follow you back`.

---

## 2. Non-negotiable constraints

These are product decisions, not implementation details. Do not change them without being asked.

1. **Single self-contained HTML file.** No build step, no framework, no external JS/CSS. Deploys by dropping one file on any static host. (`package.json` exists only to run the tests.)
2. **Zero network calls.** The app never uploads, never phones home, has no backend, no analytics, no fonts from a CDN. Files, including a dropped `.zip`, are read with `FileReader` and handled in memory. This is a privacy guarantee and a selling point — breaking it breaks the product. A test asserts the page makes no requests.
3. **No bulk unfollow, ever.** Automating unfollows is what gets Instagram accounts flagged/banned. The app deliberately stops at "here is a link to the profile." Do not add automation, do not add an Instagram API integration, do not suggest one.
4. **No login, no account, no signup.** Tool-first, consistent with the Match+ family.
5. **Vanilla ES5-style JS.** `var`, `function`, no arrow functions in the app code, no optional chaining. It runs in in-app browsers (Instagram's, TikTok's) which are not always current. Keep it conservative.
6. **No `localStorage` / `sessionStorage`.** Nothing persists between sessions by design. Close the tab, it's gone.

---

## 3. The comparison engine — how it actually works

### Input formats

Instagram's "Download your information" export delivers connections as either **HTML** or **JSON**. The app accepts both, and accepts multiple files per side (large accounts get split into `followers_1`, `followers_2`, …).

- **HTML path** (`readHtml`): parses with `DOMParser`, selects `a[href*="instagram.com"]`, pulls the handle out of the href. Date is read from the sibling `<div>` after the link's parent, falling back to the grandparent's text.
- **JSON path** (`readJson`): walks the object tree looking for any `string_list_data` array, which is the shape Instagram uses regardless of nesting. Handle comes from `href` or falls back to `value`. Date from `timestamp` (Unix seconds).

### Handle extraction (`handleFromHref`)

Matches `instagram.com/` optionally followed by `_u/` (the following export uses `_u/` deep links, the followers export does not). Rejects anything that isn't `[A-Za-z0-9._]+`, and filters a blocklist of non-profile paths (`p`, `reel`, `stories`, `explore`, `accounts`, …).

### Date parsing (`parseStamp`)

Handles `Aug 06, 2026 2:55 pm` style strings and bare Unix timestamps. Returns `null` when there's no date — the app must work on exports with no dates at all (those group under "Date unknown").

### Merging and comparing

`merge(side)` folds every loaded file for one side into a map **keyed by lowercased handle** — so matching is case-insensitive. Where a handle appears twice, the earliest date wins.

The comparison itself is three lines: for each key in `following`, if it isn't in `followers`, it's a one-way follow. Sorted newest-first by the date *you* followed them, grouped by year.

### The one real caveat, surfaced in the UI (`coverage`)

**The export records the date you followed someone. It never records when they unfollowed you.** So the output is "accounts with a one-way follow right now" — a mix of people who unfollowed and people who never followed back. The footer used to say this; that text was removed, but the fact remains true and should not be overstated in any copy you write.

---

## 3b. Username lookup: investigated and removed (v1.1.0 → v1.2.0)

v1.1.0 added a "type your username" mode with a Node backend and a pluggable data-provider layer. It was removed in v1.2.0 because it cannot work without breaking Instagram's terms:

- **Logged-out access:** Instagram serves follower and following lists only to logged-in users. Logged-out requests, even for public accounts, redirect to `/accounts/login/` (verified Oct 2026, including the owner's public account).
- **Official API:** the Instagram Graph API exposes follower counts, never lists, not even for your own account. Basic Display was shut down in Dec 2024.
- **Workarounds:** a bot account, a third-party "followers API" (these run logged-in session pools) or a script in the user's own session all count as automated collection. Instagram's Terms of Use forbid that without Meta's express permission.

The code is in git history at commit `0c25dc3` if Meta ever offers an official route. Do not re-add username lookup on any other basis.

### The `.zip` box (v1.2.0)

The whole Instagram download can be dropped as one `.zip`. The page reads only the archive's index and the `followers_N` / `following` entries (`Blob.slice` + the browser's `DecompressionStream`), never the whole file. A multi-GB download with media therefore still opens on a phone (150 MB in ~0.1 s in Chrome). Archives over 4 GB (ZIP64) are refused with advice to request only Followers and following.

---

## 4. Bugs already found and fixed — DO NOT REINTRODUCE

This is the most important section. Each of these was a real failure discovered in testing.

### 4.1 The mismatched-date-range trap

**Symptom:** first real run returned 2,046 "unfollowers" when the true number was 279.

**Cause:** Instagram lets you request an export for a limited date range. The user's `following` file covered 2017–2026 but the `followers` file covered only the last 12 months. Everyone followed before that window looked like they'd never followed back.

**Fix:** `coverage()` compares the earliest date on each side. If `following` reaches back more than ~30 days further than `followers`, it renders an amber warning naming both start dates and counting exactly how many results fall in the unverifiable period. The step-by-step guide also tells users to pick **All time**.

**Rule:** never remove this warning. A silently wrong count is the worst failure this app can have.

### 4.2 Auto-swap made the tool look hardcoded

**Symptom:** putting the followers file in the Following box and vice versa produced the *same* answer. The app appeared to only work on one specific pair of files.

**Cause:** I'd built "helpful" auto-detection — the export files label themselves internally (`<title>Followers</title>`), so the app silently moved a file to the "correct" box. Flipping the inputs got flipped right back.

**Fix:** **the box the user chooses always wins.** Self-labelling was demoted to a warning: `sniff()` still reads the label, and a mismatch renders an amber `.flag` on the deck plus a status line, but the file is compared as the box the user put it in. Verified: correct order → 279, swapped → 859. A **Swap the two boxes** button was added for convenience.

**Rule:** never restore silent relocation. Warn, don't override.

**Since v1.2.0, the one exception is a `.zip`.** A whole Instagram download holds both lists, so it is split by Instagram's own file names (`followers_N.*` vs `following.*`) wherever it is dropped. The result is visible in both boxes and Swap still works. Single list files still go exactly where the user puts them.

### 4.3 Hash links navigate away in in-app browsers

**Symptom:** the header "Start comparing" button opened an external page instead of scrolling.

**Cause:** it was `<a href="#decks">`. Embedded/in-app browsers frequently treat *any* href as a navigation and hand it to the system browser.

**Fix:** both the CTA and the logo lockup are `<button>` elements with JS scroll handlers (`glide()`). **There are zero `href="#..."` in the file.** Keep it that way.

### 4.6 Handles named like `Object.prototype` keys

**Symptom (found in v1.1.0 testing, present since v1.0.0):** an account called `constructor`, `toString` or `__proto__` was matched wrongly or dropped, because the handle maps and `seen`/`struck` were plain `{}` objects.

**Fix:** all handle-keyed maps are `Object.create(null)`. Keep it that way for any new map keyed by handle.

### 4.4 Stale results after inputs change

**Symptom:** removing a file left the previously generated list on screen, so the results no longer matched the inputs.

**Fix:** `clearResults()` runs at the top of `rebuild()`, which fires on every file add *and* remove. It hides the output, empties `master` and `struck`, clears the filter and the coverage warning. The `wiped` flag makes `ready()` say *"Files changed — generate the list again."*

**Rule:** results must always correspond to the currently loaded files.

### 4.5 Scroll overshoot

`glide()` centers the decks in the viewport rather than aligning them to the top. It falls back to a 24px top offset when the decks are taller than the viewport (mobile, stacked) and clamps to max scroll near the document end.

---

## 5. Code map

Single file. Order: `<style>` → markup → one IIFE.

### State (top of the IIFE)

```
store    = { followers: map|null, following: map|null }   // merged, keyed by lowercase handle
files    = { followers: [], following: [] }               // per-file raw rows + metadata
master   = []        // the generated one-way list; not mutated after a run
struck   = {}        // handles removed from view by "Clear ticked"
wiped    = false     // results were discarded because inputs changed
```

### Functions

| Function | Role |
|---|---|
| `say(msg, bad)` | writes the status pill |
| `handleFromHref` / `parseStamp` / `sniff` | extraction primitives |
| `readHtml` / `readJson` / `readFile` | format parsers; `readFile` sniffs JSON vs HTML by extension and first chars |
| `wire(side)` | binds click, keyboard, and drag/drop on one deck |
| `take(side, list)` | reads dropped files, appends to `files[side]`, flags mismatches |
| `merge(side)` | folds all files on one side into the deduped map |
| `clearResults()` | discards a generated list; returns whether anything was discarded |
| `rebuild()` | re-derives `store`, repaints both decks, enables/disables buttons |
| `ready()` | picks the right status message for the current state |
| `coverage()` | the date-range warning (§4.1) |
| `live()` | `master` minus `struck` |
| `render()` / `apply()` | builds the grouped list; `apply` handles filtering |
| `ticked()` / `syncButtons()` | selection state → button enablement |
| `gauge()` | measures the sticky toolbar into `--barh` so year headers clear it |
| `glide(target)` | in-page scrolling (§4.3) |
| `compareSocialGraph(f, F)` | **the** engine: returns `{ followerCount, followingCount, mutualCount, oneWayCount, oneWayAccounts }` |
| `show(res, f, F)` | paints a comparison into the results UI |
| `parseText(text, name)` | JSON-vs-HTML sniff + parse, shared by single files and `.zip` entries |
| `route(side, list)` | sends `.zip` files to `openZips`, list files to `take` |
| `openZips` / `zipIndex` / `zipEntries` / `zipText` / `paintZip` | the Instagram download box: reads the archive's index and only the list entries (`Blob.slice` + `DecompressionStream`), never the whole file |

### Element IDs

`run` `swap` `jump` `home` `status` `out` `verdict` `tally` `caution` `q` `count` `roll` `none` `strike` `restore` `decks` `deck-zip` `deck-followers` `deck-following` `top`

Files that came out of a `.zip` carry a `zip` property (the archive's name), so the download box can list and remove them together.

---

## 6. Design system — the look is final

The visual design went through many rounds and is settled. **Treat it as authoritative.** Do not redesign, do not "modernize," do not swap the palette.

### Palette — eyedropped from the actual Instagram glyph

```
--violet #830BFC   --purple #C906E8   --pink  #FD019F
--rose   #FF0067   --flame  #FE7004   --amber #FFB801
```

- `--sheet` — the full-viewport fixed gradient. **The page background *is* the logo gradient**, all six stops visible at once, violet at top through amber at bottom.
- `--grad` / `--mark` — the same run at different angles, for the wordmark, step numbers, and app tile.
- `--glass: rgba(24,2,33,.62)` — dark smoked panels. Everything that holds text sits on one.

### Why things are the colors they are

- **Panels are dark, not light.** On a saturated gradient, light glass leaves text at ~3:1. Dark glass keeps every text tier at **4.5:1 minimum** across all six stops; most sit above 8:1. Verified numerically. If you add a surface, check it against the amber end — that's the worst case.
- **The Generate button is white with dark text.** A gradient button on a gradient background disappears.
- **The drop decks are white outlines** — that's the Instagram camera glyph. White ring, white flash dot, dark interior that fills with a deeper version of the gradient when a file loads (`#33075F→#5B2A08` idle, `#5A0CB0→#8F3D04` armed).
- **Headline type is white with a hard dark outline** (`--outline: #16001F`) plus drop shadow — gradient text on a gradient background is unreadable, so the masthead, subheader, and verdict all use the sticker treatment.
- **Deck typography has three tiers doing three jobs:** the count (big, in the aperture, tabular figures), the label (small uppercase, wide tracking, with a rule beneath that grows when armed), the detail line (quiet).

### Layout

- 840px max width, 20px gutters.
- `.appbar` (64px) and `.appfoot` are full-bleed smoked-glass bars with the FM+ lockup; the footer has the copyright right-aligned on the same row.
- Masthead `clamp(40px, 11.5vw, 86px)` — the 40px floor exists because `FollowerMatch+` has no space and cannot wrap; at 46px it overflowed a 320px viewport.
- Below 400px the footer copyright shortens to `© 2026 · v1.2.0` (`.longname` hidden) to stay on one line.
- Two-level sticky: the results toolbar at `top:0`, year headers at `top:var(--barh)`, measured by `ResizeObserver`.

---

## 7. Testing

Since v1.1.0 the suite lives in `test/` and runs with **`npm test`** (15 tests, jsdom): the eight cases below, the `Object.prototype`-name case, six for the `.zip` box against fixture archives built by `test/fixtures/make-zips.py`, and a check that the page makes no network requests. The original harness pattern, kept for reference:

```js
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync('followermatch-plus.html','utf8'),
                      { runScripts:'dangerously', pretendToBeVisual:true });
const { window } = dom, D = window.document;
window.HTMLElement.prototype.scrollIntoView = function(){};

// stub FileReader so drops resolve to fixture contents
window.FileReader = class {
  readAsText(f){ this.result = FIXTURES[f.name]; setTimeout(()=>this.onload&&this.onload(), 0); }
};

// synthesize a drop
const drop = (deckId, names) => {
  const d = D.getElementById(deckId);
  const l = names.map(n => ({ name:n })); l.item = i => l[i];
  const e = new window.Event('drop', { bubbles:true });
  Object.defineProperty(e, 'dataTransfer', { value:{ files:l } });
  d.dispatchEvent(e);
};
```

**The cases that must pass:**

1. Known pair → known count (real data: 2,260 following / 2,840 followers → **279**).
2. **Swapped** inputs → **different** count (**859**). This is the §4.2 regression test.
3. A different synthetic account, JSON followers + HTML following, uppercase handles, no dates → correct count, grouped under "Date unknown".
4. Mismatched date ranges → `#caution` visible with the right count.
5. Remove one file / remove both / add a third → `#out` hidden, `master` empty.
6. Tick 3 → Clear ticked → 3 rows gone; Restore → all back, ticks cleared, filter cleared.
7. Filter narrows the count and the per-year headers.
8. CTA and logo call scroll, not navigation.

Build synthetic fixtures rather than relying on real exports — the parsers must survive shapes the author's own account doesn't produce.

---

## 8. Known gaps / possible next work

Not bugs. Open options, roughly in order of value.

- **Share tags point at the GitHub Pages address.** `og:url` / `og:image` in `<head>` hardcode https://alonbiger2005.github.io/FollowersMatchPlus/; update them if the site moves. The favicon is an inline SVG data URI (no request).
- **Version string is hardcoded** as `v1.0.0` in the footer markup.
- **"Follows you that you don't follow back"** is never shown. (The unused `inbound` count was removed when the engine was extracted; it is one line to add to `compareSocialGraph`.) Could be a second tab.
- **Mutual-follow export** — currently no way to get the mutuals list out.
- **The guide's menu path** (Settings → Accounts Center → Your information and permissions → Download your information) was verified in 2026 but Instagram moves these. Re-check before launch.

---

## 9. Working style for this project

- **Preserve working functionality.** Don't refactor the parsing, rename state variables, or restructure the IIFE unless asked. The code is deliberately plain.
- **Small diffs.** Changes have been surgical throughout — a `diff` against the previous build should show only the lines the request touches. Report the diff.
- **Verify before claiming.** Every change above was re-run through the jsdom harness before being handed over. Do the same.
- **Explain the reasoning briefly, then give the result.** Don't over-narrate the steps.

---

## 10. Family context

FollowerMatch+ is one product in **Match+ Industries** — a family of tools built on "match X with the right Y." Siblings: **CoachMatch+** (athletes ↔ private coaches), **ExamMatch+** (class materials ↔ study prep, black/orange identity).

The shared conventions FollowerMatch+ follows: `+` is the literal symbol; the brand splits into a white word and a gradient word; there's an app-tile lockup in a header bar and a matching footer bar with a copyright; tool-first with no forced signup; modern and premium without generic-AI-app styling.

Each product's palette is its own — ExamMatch+ is orange/black, FollowerMatch+ is the Instagram spectrum. Only the *structure* is shared.
