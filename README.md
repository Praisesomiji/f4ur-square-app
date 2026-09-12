# Four Square — Mealtime Mission Control

A small, mostly-static web app that gamifies eating four square meals (and taking medication) on time. It's built as a handful of plain files — no framework, no build step, no server code to run — but it syncs real scores across devices for a small group of players via Firebase, and it installs on a phone like a native app.

---

## 1. Quick start

```bash
# Local preview (no build step)
open index.html          # macOS
# or double-click it, or run any static file server:
npx serve .
```

There's no `package.json` and nothing to install to *look* at the app locally. But two features only work once it's served over the internet (not opened as a bare local file):

- **Cross-device sync / leaderboard** — needs your own free Firebase project (see [§5](#5-firebase-setup-cross-device-sync)).
- **Installing it as an app (PWA)** — needs HTTPS, which a local file doesn't have (see [§7](#7-installable-app-pwa)).

The live deployment for this project runs on **GitHub Pages**, which gives both of those for free. See [§6](#6-deploying-updates).

---

## 2. What it does

- **Accounts** — sign up with a display name + passcode. Accounts sync through Firebase, so the *same* account can log in from multiple devices (phone, laptop, a friend's browser) — not just the device it was created on.
- **Clock-in** — four meals (Breakfast, Brunch, Lunch, Dinner) and two medication check-ins (Started meds, Completed meds), each loggable once per day.
- **Scoring** — meals score 100% on time, 50% if logged late (before midnight), 0% after midnight. A daily bonus is *added* on top of your meal points based on how many meals you completed.
- **Breakdown** — today's and all-time points, a "performance" percentage (actual ÷ potential), and an **average GPA** across every day since you started.
- **Grading** — every day gets a letter grade (A–F) and a smooth, continuous grade point (not just a flat number per letter — see [§8](#8-grading--gpa)).
- **Leaderboard** — today's real points, ranked against every other registered player, pulled live from Firebase and refreshed every 30 seconds. (Falls back to a few simulated names for a moment on first load, before real data arrives.)
- **Calendar** — a month-view, color-graded history of every day on record, switchable between raw score / percentage / letter grade / grade point.
- **Back-log** — log a missed meal or medication from a past day for record-keeping; it always scores 0 and never affects that day's bonus.
- **Installable app** — add it to your phone's home screen and it opens full-screen, no browser bar, with its own icon.

---

## 3. Architecture

```
index.html   — everything: markup, styles, and app logic (inline <style>/<script>)
manifest.json — PWA metadata (name, icons, colors, launch behavior)
sw.js         — service worker; caches this app's own files for fast/offline loading
icons/        — app icons at the sizes each platform needs
```

`index.html` intentionally stays a single file for the markup/styles/logic — that's the part that's copy-pasteable and easy to read top-to-bottom. `manifest.json` and `sw.js` can't be inlined into it; browsers require them to be separate, real files at their own URLs for installability to work at all. If the project grows further, the natural next step is splitting `index.html` into `index.html` / `style.css` / `app.js`, but nothing currently assumes that split.

### Screens (`[data-screen]`)
Three top-level screens toggle via `showScreen(name)`:
- `signup` — create an account
- `login` — log in (works for accounts created on *this* device **or** any other device, since it falls back to a Firebase lookup)
- `app` — the main console

### The console
A CSS grid of "panels" (bezel-styled cards), each containing a "screen" (the glass/CRT-styled content area):
- Leaderboard (collapsible, real cross-device data)
- Status (today's local time + each meal's current window state)
- Clock-in (4 meal cards)
- Medication (2 med cards)
- Today's Breakdown (points, performance meters, average GPA)
- Back-log a missed entry
- Calendar (collapsible)

### Rendering model
Still no framework, no virtual DOM. `render(username)` re-reads state from the local cache, recomputes everything, and re-writes `innerHTML` for each panel. It runs on login/signup, every 30 seconds (which now also re-syncs from Firebase first — see below), and after every state-changing action.

---

## 4. Data model

Reads stay **synchronous and instant** — every `getAccount()` / `getLogs()` call reads from `localStorage`, exactly as before, so none of the rendering code had to change. Writes update that local cache immediately *and* push to Firebase in the background, so other devices pick up the change on their next refresh.

| Local cache key | Shape | Notes |
|---|---|---|
| `foursquare_account` | `{ username, hash, createdAt }` | `hash` is a **non-cryptographic** rolling hash — good enough to gate casual use among trusted players, not real security. |
| `foursquare_logs_<username>` | `{ "YYYY-MM-DD": { mealId_or_medId: { pct, points, loggedAt } } }` | |

| Firebase Realtime Database path | Shape | Notes |
|---|---|---|
| `accounts/<username>` | `{ username, hash, createdAt }` | One entry per registered player, across all devices. Readable by anyone with the app (needed for the leaderboard and cross-device login) — see [§5](#5-firebase-setup-cross-device-sync) for the security trade-off this implies. |
| `logs/<username>` | Same shape as the local logs cache | Source of truth for a player's history; local cache is refreshed from this on login and every 30 seconds. |

Usernames double as Firebase keys, so signup restricts names to letters, numbers, spaces, `-`, and `_` (Firebase keys can't contain `.`, `#`, `$`, `[`, `]`).

**Sync points:**
- `boot()` — pulls the current user's logs from Firebase before entering the app.
- `handleLogin()` — if no matching local account exists (a new device), looks the account up directly in Firebase, enabling true cross-device login.
- `handleSignup()` — checks Firebase first so two players can't claim the same name.
- Every 30 seconds while the app is open — re-pulls this user's logs and refreshes the leaderboard cache, so meals logged on another device show up here without a manual refresh.

---

## 5. Firebase setup (cross-device sync)

The app needs a free Firebase Realtime Database project to sync across devices. High level (see the project's setup thread for the full walkthrough):

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Build → Realtime Database → Create Database.
3. Rules tab → paste and publish:
   ```json
   {
     "rules": {
       "accounts": { ".read": true, "$username": { ".write": true } },
       "logs":     { ".read": true, "$username": { ".write": true } }
     }
   }
   ```
4. Project settings → General → "Your apps" → register a **web** app → copy the `firebaseConfig` object.
5. Paste that object into the `firebaseConfig` constant near the top of `index.html`'s `<script>` block.

**On those rules:** they're intentionally open (any player can read all accounts/logs, and write to any username) because there's no real login system behind the passcode — same trust model the local passcode always had. This is a reasonable trade-off for a small group of known players, but it means:
- Don't publicize the live URL beyond your actual players.
- A determined player could technically overwrite someone else's scores. There's no protection against that beyond trust.
- The Firebase free ("Spark") tier comfortably covers a handful of players (1 GB storage, generous read/write limits) — check [Firebase's current pricing page](https://firebase.google.com/pricing) if the player count grows a lot.

---

## 6. Deploying updates

The live app runs on **GitHub Pages**. To ship a change:

1. Edit `index.html` (or `manifest.json` / `sw.js` / an icon) locally.
2. In the GitHub repo, open the file → pencil (✏️) "Edit this file" → select all → paste the new version → commit to `main`.
3. GitHub Pages redeploys automatically within about a minute — no separate build/deploy step.

**Cache note:** the service worker caches `index.html` for speed. After deploying a change, an already-*installed* copy of the app may need to be closed and reopened once (or have its site data cleared) before the update shows up — a normal browser tab picks up changes on refresh as usual.

---

## 7. Installable app (PWA)

The app meets the three requirements to be installable: served over HTTPS (GitHub Pages), a valid `manifest.json` (name, icons, `display: standalone`), and a registered service worker (`sw.js`).

The service worker only caches this app's **own** files (`index.html`, `manifest.json`, icons) for fast/offline loading. It deliberately does **not** cache Firebase requests or Google Fonts — those always go straight to the network, since scores need to be live, not stale.

- **Android/Chrome** — shows an automatic "Install" prompt, or find it in the browser's ⋮ menu.
- **iOS/Safari** — no automatic prompt (Apple doesn't support one); tap Share → "Add to Home Screen".

Icons live in `icons/` — a 2×2-square mark on the app's amber brand color, matching the in-app logo, at the sizes each platform expects (192px, 512px, a 512px "maskable" version for Android's adaptive icon shapes, and a 180px flat version for iOS).

---

## 8. Grading & GPA

`GRADE_BANDS` defines six letter-grade tiers:

```js
const GRADE_BANDS = [
  { min: 70, letter:'A', gpa:5.0, color:'#6FCF97', text:'#0D1015' },
  { min: 60, letter:'B', gpa:4.0, color:'#4FB6C9', text:'#0D1015' },
  { min: 50, letter:'C', gpa:3.0, color:'#E8A33D', text:'#0D1015' },
  { min: 45, letter:'D', gpa:2.0, color:'#C97456', text:'#0D1015' },
  { min: 40, letter:'E', gpa:1.0, color:'#BF5F4A', text:'#F2EAD3' },
  { min: 0,  letter:'F', gpa:0.0, color:'#B3494A', text:'#F2EAD3' },
];
```

`gradeFor(pct)` — returns the first band a percentage clears. Used for the letter grade and the calendar cell's **color**, which is always flat per band (a day at 71% and a day at 99% are both "A green").

`gpaFor(pct)` — a *separate*, continuous function. Instead of snapping to a flat per-band number, it linearly interpolates between each band's floor and the next one's, so e.g. 47% (mid-D) lands around `2.4`, not a flat `2.0`. It caps at `0.0` below the lowest band and at `5.0` once a score reaches A's floor (can't exceed the max). This is what powers the calendar's "Grade point" mode and the day-detail popup.

**Average GPA** — `allTimeBreakdown()` also computes a running average: one `gpaFor(pct)` value per calendar day since the account was created (a day with nothing logged counts as `0.0`, same as it already counts against all-time potential), averaged across every one of those days. Shown in the breakdown panel and the all-time info popup.

To change the cutoffs, colors, or GPA weights: edit `GRADE_BANDS` only — `gradeFor`, `gpaFor`, the calendar, the legend, and both popups all read from it dynamically.

---

## 9. Leaderboard

`refreshLeaderboardCache()` pulls every registered account from Firebase, computes each one's *today* score from their logs, and caches the ranked result. `render()` merges that cache with the current player's own freshest local score (so your own row is never stale by up to 30 seconds) and re-sorts.

Before that first fetch resolves (e.g. the very first render after opening the app), `botScoresForToday()` falls back to a few seeded, deterministic simulated names so the panel isn't empty for a moment — this is cosmetic only and disappears once real data loads.

---

## 10. Extending the app

| Want to… | Touch this |
|---|---|
| Change meal windows/times | `MEALS` array (minutes since midnight) |
| Add a new meal or medication category | Add an entry to `MEALS` or `MEDS` — the clock-in grid, back-log dropdown, and unlog flow all iterate these automatically |
| Change point values | `POINTS_FULL` (affects future logs only; past logs already baked in their points) |
| Change bonus tiers | The `bonusRate` if/else block in `computeDay` |
| Change grading cutoffs, colors, or GPA weights | `GRADE_BANDS` only |
| Change how GPA interpolates between bands | `gpaFor()` |
| Change app icon / colors | Regenerate `icons/*.png` and update `theme_color`/`background_color` in `manifest.json` |
| Change what the service worker caches | `SHELL_ASSETS` in `sw.js` |
| Support more players / higher traffic | Watch Firebase's Spark (free tier) limits; upgrade to Blaze (pay-as-you-go) if needed |

---

## 11. Known limitations

- **The passcode hash is not cryptographic.** `simpleHash` is a fast rolling hash meant to gate casual use among trusted players, not to resist real attackers. Don't reuse this pattern anywhere with real security requirements.
- **Firebase rules are intentionally open.** Any player can read all accounts/logs (needed for the leaderboard) and write to any username (no real per-user auth exists). Fine for a small trusted group; don't publicize the live URL beyond your players.
- **The leaderboard briefly shows simulated names on first load**, until the first real Firebase fetch resolves (usually well under a second).
- **Usernames are restricted** to letters, numbers, spaces, `-`, and `_`, since they double as Firebase database keys.
- **No password recovery.** If a player forgets their passcode, there's no way to reset it — a new account is the only option.
- **Installed-app updates can lag.** The service worker caches the app shell, so an already-installed copy may need to be closed and reopened (or have site data cleared) to pick up a newly deployed version.

---

## 12. Browser support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge) on both desktop and mobile. Uses `localStorage`, `sessionStorage`, CSS Grid, `Intl`/`toLocaleDateString`, the Firebase JS SDK, and (for installability) the Web App Manifest and Service Worker APIs — all broadly supported on any browser from the last several years. No polyfills included.
