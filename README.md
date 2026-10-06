# FollowerMatch+

See the Instagram accounts that don't follow you back.

FollowerMatch+ compares your Instagram **following** list against your **followers** list and gives you every one-way follow, each linked to the profile so you can decide for yourself. It is one self-contained HTML file: no server, no login, no network calls. Your data is read in your browser and never leaves your device.

## Using it

1. In Instagram: **Settings and privacy → Accounts Center → Your information and permissions → Download your information**.
2. Choose **Some of your information**, tick **Followers and following**, set the date range to **All time**, and pick HTML or JSON.
3. When Instagram's email arrives, download the `.zip`.
4. Open FollowerMatch+ and drop the `.zip` into the **Instagram download** box. You don't need to unzip it. The list appears straight away.

Already unzipped? Drop the `followers_N` files into **Followers** and `following` into **Following**, then press **Generate the list**.

## Why there is no "type your username" option

Instagram shows follower and following lists only to logged-in users, even for public accounts. Its official API returns follower counts, never lists. Getting the lists automatically would mean running a logged-in Instagram account as a bot (directly or through a third-party "followers API"), and Instagram's Terms of Use forbid automated collection without Meta's permission. A username mode was built and tested in v1.1.0 and removed in v1.2.0 for that reason. The code remains in git history (commit `0c25dc3`).

## Deploy

Upload `followermatch-plus.html` to any static host (rename it `index.html` if the host expects that). Nothing else is needed.

## Development

```sh
npm install   # jsdom, for the tests only
npm test      # 15 tests: the regression set from the handoff, the .zip box, no-network check
```

`test/fixtures/make-zips.py` regenerates the fixture archives. `FollowerMatchPlus-HANDOFF.md` holds the architecture, design rules and the bugs that must not come back. Read it before changing anything.
