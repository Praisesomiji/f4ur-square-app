# Four Square — Mealtime Mission Control

A small, mostly-static web app that gamifies eating four square meals (and taking medication) on time. It's built as a handful of plain files — no framework, no build step, no server code to run — but it syncs real scores across devices for a small group of players via Firebase, installs on a phone like a native app, can nudge players before a meal window closes, and includes a read-only dashboard for monitoring everyone's progress.

---

## 1. Quick start

```bash
# Local preview (no build step)
open index.html          # macOS
# or double-click it, or run any static file server:
npx serve .
```

There's no `package.json` and nothing to install to *look* at the app locally. But several features only work once it's served over the internet (not opened as a bare local file):

- **Cross-device sync / leaderboard / admin dashboard** — needs your own free Firebase project (see [§5](#5-firebase-setup-cross-device-sync)).
- **Installing it as an app (PWA) / meal reminders** — needs HTTPS, which a local file doesn't have (see [§7](#7-installable-app-pwa) and [§14](#14-meal-deadline-reminders)).

The live deployment for this project runs on **GitHub Pages**, which gives both of those for free. See [§6](#6-deploying-updates).

---

## 2. What it does

- **Accounts** — sign up with a display name + passcode. Accounts sync through Firebase, so the *same* account can log in from multiple devices (phone, laptop, a friend's browser) — not just the device it was created on. Before first use, every player agrees to a plain-language data notice explaining how open the data model is (see [§12](#12-data-notice--consent)). Players can also permanently delete their own account (see [§11](#11-account-deletion)).
- **Clock-in** — four meals (Breakfast, Brunch, Lunch, Dinner) and two medication check-ins (Started meds, Completed meds), each loggable once per day.
- **Scoring** — meals score 100% on time, 50% if logged late (before midnight), 0% after midnight. A daily bonus is *added* on top of your meal points based on how many meals you completed.
- **Breakdown** — today's and all-time points, a "performance" percentage (actual ÷ potential), and an **average GPA** across every day since you started.
- **Grading** — every day gets a letter grade (A–F) and a smooth, continuous grade point (not just a flat number per letter — see [§8](#8-grading--gpa)).
- **Leaderboard** — today's real points, ranked against every other registered player, pulled live from Firebase and refreshed every 30 seconds. (Falls back to a few simulated names for a moment on first load, before real data arrives.)
- **Calendar** — a month-view, color-graded history of every day on record, switchable between raw score / percentage / letter grade / grade point. Click any graded day for a full breakdown, including exactly which meals/meds earned points and which were missed (see [§10](#10-calendar--day-detail)).
- **Back-log** — log a missed meal or medication from a past day for record-keeping; it always scores 0 and never affects that day's bonus.
- **Installable app** — add it to your phone's home screen and it opens full-screen, no browser bar, with its own icon.
- **Meal reminders** — opt in to a notification 1 hour and 10 minutes before each meal's full-points deadline, while the app is open (see [§14](#14-meal-deadline-reminders)).
- **Admin dashboard** — a separate, read-only monitoring view listing every player ranked by all-time GPA, with the same expandable calendar and day-detail popup (see [§13](#13-admin-dashboard)).

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
Four top-level screens toggle via `showScreen(name)`:
- `signup` — create an account (the name `admin` is reserved and can't be taken)
- `login` — log in (works for accounts created on *this* device **or** any other device, since it falls back to a Firebase lookup; also handles the hardcoded admin login — see [§13](#13-admin-dashboard))
- `app` — the main player console
- `admin` — the read-only monitoring dashboard

### The player console
A CSS grid of "panels" (bezel-styled cards), each containing a "screen" (the glass/CRT-styled content area):
- Leaderboard (collapsible, real cross-device data)
- Status (today's local time + each meal's current window state)
- Clock-in (4 meal cards)
- Medication (2 med cards)
- Today's Breakdown (points, performance meters, average GPA)
- Back-log a missed entry
- Calendar (collapsible, click-to-expand day detail)
- Delete account link (deliberately muted, separated from the frequently-used Log out button)

### Mobile topbar
Below a 760px viewport width, the topbar's button row (Enable reminders, How to play, Log out — or, on the admin screen, How to play, Log out) hides behind a **☰ hamburger button** and opens as a dropdown card instead, so it doesn't wrap awkwardly on narrow phones. `toggleWhoMenu(id)` toggles a `mobile-open` class on that topbar's `.who` element (`who-player` or `who-admin` — each topbar has its own, so the player and admin menus never interfere). `closeWhoMenus()` auto-closes it when "How to play" opens or on logout.

### Rendering model
Still no framework, no virtual DOM. `render(username)` re-reads state from the local cache, recomputes everything, and re-writes `innerHTML` for each panel. It runs on login/signup, every 30 seconds (which now also re-syncs from Firebase, checks meal reminders, and refreshes the leaderboard cache), and after every state-changing action.

Calendar rendering and the day-detail popup are factored into shared, parameterized functions (`renderCalendarCore`, `renderDayInfoModal`) so the player's own calendar and the admin dashboard's per-player calendar reuse identical logic instead of duplicating it.

---

## 4. Data model

Reads stay **synchronous and instant** — every `getAccount()` / `getLogs()` call reads from `localStorage`, exactly as before, so none of the rendering code had to change. Writes update that local cache immediately *and* push to Firebase in the background, so other devices pick up the change on their next refresh.

| Local cache key | Shape | Notes |
|---|---|---|
| `foursquare_account` | `{ username, hash, createdAt }` | `hash` is a **non-cryptographic** rolling hash — good enough to gate casual use among trusted players, not real security. Never set for the admin login (see [§13](#13-admin-dashboard)). |
| `foursquare_logs_<username>` | `{ "YYYY-MM-DD": { mealId_or_medId: { pct, points, loggedAt } } }` | |
| `foursquare_notif_enabled_<username>` | `'1'` or `'0'` | Per-device meal-reminder opt-in — see [§14](#14-meal-deadline-reminders). |
| `foursquare_notified_<username>_<YYYY-MM-DD>` | Array of `mealId_tag` strings already notified today | Prevents duplicate reminders; a fresh key each day. |

| Firebase Realtime Database path | Shape | Notes |
|---|---|---|
| `accounts/<username>` | `{ username, hash, createdAt, consentedAt?, consentedVersion? }` | One entry per registered **player**, across all devices. Readable by anyone with the app (needed for the leaderboard, cross-device login, and the admin dashboard) — see [§5](#5-firebase-setup-cross-device-sync) for the security trade-off this implies. The admin login is deliberately never written here. `consentedAt`/`consentedVersion` are absent until the player agrees to the data notice — see [§12](#12-data-notice--consent). |
| `logs/<username>` | Same shape as the local logs cache | Source of truth for a player's history; local cache is refreshed from this on login and every 30 seconds. |

Usernames double as Firebase keys, so signup restricts names to letters, numbers, spaces, `-`, and `_` (Firebase keys can't contain `.`, `#`, `$`, `[`, `]`), and additionally blocks the reserved name `admin`.

**Sync points:**
- `boot()` — routes to the admin dashboard if an admin session is active; otherwise pulls the current player's logs from Firebase before entering the app.
- `handleLogin()` — checks for the hardcoded admin credential first; otherwise, if no matching local account exists (a new device), looks the account up directly in Firebase, enabling true cross-device login.
- `handleSignup()` — checks Firebase first so two players can't claim the same name (and blocks `admin`).
- Every 30 seconds while the player app is open — re-pulls this user's logs, refreshes the leaderboard cache, and checks meal reminders.
- Every 30 seconds while the admin dashboard is open — refreshes every player's data independently (see [§13](#13-admin-dashboard)).

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
- A determined player could technically overwrite someone else's scores, or delete another account by calling Firebase directly (see [§11](#11-account-deletion)). There's no protection against that beyond trust.
- Anyone who guesses the admin credential (see [§13](#13-admin-dashboard)) gets a ready-made UI over the same data these open rules already expose to direct API calls.
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
- **iOS/Safari** — no automatic prompt (Apple doesn't support one); tap Share → "Add to Home Screen". This step is also required for meal reminders to work at all on iOS (see [§14](#14-meal-deadline-reminders)).

Icons live in `icons/` — a 2×2-square mark on the app's amber brand color, matching the in-app logo, at the sizes each platform expects (192px, 512px, a 512px "maskable" version for Android's adaptive icon shapes, and a 180px flat version for iOS).

---

## 8. Grading & GPA

`GRADE_BANDS` defines six letter-grade tiers, used for the **letter grade** and the calendar cell's **color** only:

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

`gradeFor(pct)` — returns the first band a percentage clears. Drives the letter grade and the calendar cell's color, which is always flat per band (a day at 71% and a day at 99% are both "A green"). The `gpa` field on each band is only a display label for that band in the legend/how-to-play table (e.g. "A · 5.0") — it is **not** used to calculate anyone's actual GPA.

`gpaFor(pct)` — a completely separate, **purely linear** calculation, deliberately decoupled from `GRADE_BANDS`:

```js
function gpaFor(pct){
  const clamped = Math.min(100, Math.max(0, pct));
  return (clamped / 100) * 5;
}
```

A day's grade point is simply that day's percentage out of 5.0 — 57% is `2.85`, 90% is `4.5`, 100% is `5.0`. There's no interpolation between bands and no snapping to the letter-grade cutoffs; the letter and the GPA are two independent readings of the same percentage.

**Display formatting** — `formatGpa(gpa)` rounds to 2 decimal places, then drops to 1 decimal if the hundredths digit is `0` (so `4.50` shows as `4.5`, but `2.85` stays `2.85`). Every GPA shown anywhere in the app (calendar, day-detail popup, breakdown panel, admin player list) goes through this formatter.

**Average GPA** — `allTimeBreakdown(username, logs, createdAt)` computes a running average: one `gpaFor(pct)` value per calendar day since `createdAt` (a day with nothing logged counts as `0.0`, same as it already counts against all-time potential), averaged across every one of those days. `createdAt` is passed in explicitly (rather than read from whichever account happens to be cached on the current device) specifically so this function works correctly for *any* player — the admin dashboard calls it once per player it displays.

The "How to play" modal's grading table is **generated from `GRADE_BANDS` at page load**, not hand-typed, so the letter/color cutoffs it shows can never silently drift out of sync with the real ones again.

To change letter-grade cutoffs or colors: edit `GRADE_BANDS`. To change the GPA scale itself (e.g. a 0–4.0 scale instead of 0–5.0): edit the `5` in `gpaFor()` — it's intentionally independent of `GRADE_BANDS` now.

---

## 9. Leaderboard

`refreshLeaderboardCache()` pulls every registered account from Firebase, computes each one's *today* score from their logs, and caches the ranked result. `render()` merges that cache with the current player's own freshest local score (so your own row is never stale by up to 30 seconds) and re-sorts.

Before that first fetch resolves (e.g. the very first render after opening the app), `botScoresForToday()` falls back to a few seeded, deterministic simulated names so the panel isn't empty for a moment — this is cosmetic only and disappears once real data loads. The admin login is never written to `accounts/`, so it never appears here.

---

## 10. Calendar & day detail

Clicking any graded calendar day opens a popup with the day's point breakdown *and* a category-by-category table — one row per meal/medication, showing exactly whether it was logged on time, logged late, back-logged for 0, or not logged at all. This applies to both the player's own calendar and the admin dashboard's per-player calendar, since both call the same `renderDayInfoModal(dateKey, logs)`.

- `renderCalendarCore(ids, logs, createdAt, monthDate, mode, onDayClickFn)` draws one month's grid + legend into whatever DOM element ids it's given — this is what lets the player screen and the admin screen have two independent calendars without duplicating the rendering logic.
- `categoryBreakdownRows(logs, dateKey)` builds the per-meal/med status rows shown in the popup.

---

## 11. Account deletion

A muted "Delete account" link sits at the bottom of the player console, visually separated from "Log out" to reduce accidental clicks. Deleting requires **re-entering your passcode** — a stronger confirmation than any other destructive action in the app (like unlogging a meal), since this one can't be undone.

`deleteAccount(username)` removes `accounts/<username>` and `logs/<username>` from Firebase, clears everything cached locally on that device, and returns to the signup screen.

**Note on the security model:** this doesn't change the app's actual exposure. The Firebase rules (see [§5](#5-firebase-setup-cross-device-sync)) already allow any client to write/delete any account directly via the Firebase API — the in-app button only adds a *safe, deliberate* way to do it through the UI, with a passcode check to guard against accidental clicks. It doesn't add a new capability that wasn't already technically possible.

---

## 12. Data notice & consent

Given how open the data model is (see [§5](#5-firebase-setup-cross-device-sync)), every player is shown a one-time **data & privacy notice** before they can use the app — plain-language, not a formal legal document — covering: what's stored, that names and full history are visible to every other player (not private), that there's an admin monitoring view, that the passcode isn't strongly encrypted, and that account deletion is available any time.

**How it's tracked:** `accounts/<username>` gains two fields once agreed to — `consentedAt` (a timestamp) and `consentedVersion` (an integer, currently `NOTICE_VERSION = 1`). Storing this on the Firebase account record (not just locally) means consent follows the *account*, not the device — a player who agreed on their phone won't be re-prompted on their laptop.

**When it's shown:** `hasCurrentConsent(acc)` gates entry to the app (not the admin dashboard, which isn't a player account) at all three entry points — `boot()`, `handleSignup()`, and `handleLogin()`. New signups always see it once; existing players (whose accounts predate this feature and have no `consentedVersion` at all) are prompted the next time they log in, then never again unless the notice changes.

**Versioning:** if the notice's wording ever materially changes, bump `NOTICE_VERSION` — every account's stored version will then be stale, and everyone is automatically re-prompted once, the same way real terms-of-service versioning works.

**Declining:** doesn't delete anything. `declineDataNotice()` just logs the player out — their account and any existing history stay exactly as they were, and they can log back in and agree at any time.

**This isn't legal advice.** The notice text is an honest, specific description of what this app actually does, written for a small group of trusted players — it is not a substitute for a real privacy policy or terms of service if this project is ever opened up beyond that.

---

## 13. Admin dashboard

A separate, read-only monitoring screen for viewing every player's progress in one place.

**Login:** typing `admin` at the login screen (not signup — that name is reserved) checks a **hardcoded local credential** (`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH`, both near the top of the script), not a real Firebase account. It's never written to `accounts/`, so it never clocks in meals and never appears on the leaderboard.

**What it shows:**
- Every registered player, ranked best-to-worst by all-time GPA (with all-time performance % alongside), computed via `refreshAdminPlayers()` pulling each player's `accounts/` and `logs/` entries directly from Firebase.
- Clicking a player expands their full calendar below the list (click again to collapse) — reusing `renderCalendarCore` with that player's own data, entirely independent of whatever's cached on the admin's device.
- Clicking a calendar day opens the same day-detail popup (with category breakdown) the player screens use.
- A "How to play" button in the admin topbar opens the same rules modal players see, so the admin can reference the scoring/grading rules without needing a separate player account.
- Refreshes automatically every 30 seconds while open.

**Security note — read this before deploying:** `admin`/`admin` is a guessable, published credential (visible to anyone who views the page source). Because the Firebase rules are already open, the dashboard doesn't expose any *data* an attacker couldn't already pull directly from Firebase — but it does hand out a ready-made browsing UI for all player data to anyone who tries that login. **Consider changing `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` to something less obvious** — everything else works identically regardless of what the credential is.

---

## 14. Meal-deadline reminders

An opt-in **"Enable reminders"** button in the player topbar requests notification permission (must be a real user tap — browsers block auto-prompting), then notifies once per meal at two points: 1 hour and 10 minutes before that meal's full-points deadline — but only for meals not yet logged, and never more than once per meal per day.

**Important limitation:** these are **local, on-device notifications**, scheduled entirely client-side — not server-sent push. `checkMealReminders(username)` runs on app entry and on the existing 30-second sync tick, so it only fires **while the app is actually open or running in the background on this device.** If the app is fully closed, nothing arrives. Reliable delivery to a fully closed app would require real push notifications — a server (e.g. Firebase Cloud Messaging + a scheduled Cloud Function) that sends the push at the right moment, which needs Firebase's paid Blaze plan (a card on file, even if usage stays free) and isn't implemented here.

On iOS specifically, notifications only work at all if the app has been **installed to the home screen** first (see [§7](#7-installable-app-pwa)) — a browser tab, even a "PWA-ready" one, can't request notification permission on iOS.

Key pieces:
- `REMINDER_OFFSETS` — the two thresholds (60 and 10 minutes before deadline) and their message text; add more entries here to add more reminder points.
- `remindersEnabled(username)` / `toggleMealReminders()` — per-device opt-in state and the permission-request flow.
- `checkMealReminders(username)` — the actual threshold check, using each meal's `.deadline` from `MEALS`.
- `fireReminder(title, body)` — displays via the service worker's `showNotification()` (falls back to the plain `Notification` constructor if no service worker is available).

---

## 15. Extending the app

| Want to… | Touch this |
|---|---|
| Change meal windows/times | `MEALS` array (minutes since midnight) |
| Add a new meal or medication category | Add an entry to `MEALS` or `MEDS` — the clock-in grid, back-log dropdown, unlog flow, and category breakdown all iterate these automatically |
| Change point values | `POINTS_FULL` (affects future logs only; past logs already baked in their points) |
| Change bonus tiers | The `bonusRate` if/else block in `computeDay` |
| Change grading cutoffs or colors (letter grade) | `GRADE_BANDS` |
| Change the GPA scale (e.g. 0–4.0 instead of 0–5.0) | `gpaFor()` — deliberately independent of `GRADE_BANDS` |
| Change reminder timing or wording | `REMINDER_OFFSETS` |
| Change the data notice's wording | The `<ul>` inside the `data-screen="consent"` block in the HTML |
| Re-prompt everyone for a changed notice | Bump `NOTICE_VERSION` |
| Change the mobile hamburger breakpoint | The `@media (max-width: 760px)` block in `<style>` |
| Change the admin credential | `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` near the top of the script |
| Change app icon / colors | Regenerate `icons/*.png` and update `theme_color`/`background_color` in `manifest.json` |
| Change what the service worker caches | `SHELL_ASSETS` in `sw.js` |
| Support more players / higher traffic | Watch Firebase's Spark (free tier) limits; upgrade to Blaze (pay-as-you-go) if needed |
| Add real push notifications (works when app is closed) | Requires Firebase Cloud Messaging + a scheduled Cloud Function (Blaze plan) — not implemented, see [§14](#14-meal-deadline-reminders) |

---

## 16. Known limitations

- **The passcode hash is not cryptographic.** `simpleHash` is a fast rolling hash meant to gate casual use among trusted players, not to resist real attackers. Don't reuse this pattern anywhere with real security requirements.
- **Firebase rules are intentionally open.** Any player can read all accounts/logs (needed for the leaderboard and admin dashboard) and write to any username (no real per-user auth exists). Fine for a small trusted group; don't publicize the live URL beyond your players.
- **Declining the data notice on a brand-new signup still leaves the account (with no logs) in Firebase**, since decline doesn't delete anything (by design, to protect existing players who decline a newer notice — see [§12](#12-data-notice--consent)). That username stays "claimed" until someone logs back in and agrees, or the account is deleted manually.
- **The data notice is a plain-language disclosure, not a reviewed legal document.** See [§12](#12-data-notice--consent) for what it covers and doesn't.
- **The admin credential is hardcoded and guessable** (`admin`/`admin` by default). Change it before relying on it for anything sensitive — see [§13](#13-admin-dashboard).
- **Meal reminders only fire while the app is open or running in the background.** A fully closed app sends nothing — see [§14](#14-meal-deadline-reminders).
- **The leaderboard briefly shows simulated names on first load**, until the first real Firebase fetch resolves (usually well under a second).
- **Usernames are restricted** to letters, numbers, spaces, `-`, and `_` (Firebase key constraints), and `admin` is reserved.
- **No password recovery.** If a player forgets their passcode, there's no way to reset it — a new account is the only option.
- **Account deletion is permanent and immediate.** There's no undo, no recovery window, and no export-before-delete step.
- **Installed-app updates can lag.** The service worker caches the app shell, so an already-installed copy may need to be closed and reopened (or have site data cleared) to pick up a newly deployed version.

---

## 17. Browser support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge) on both desktop and mobile. Uses `localStorage`, `sessionStorage`, CSS Grid, `Intl`/`toLocaleDateString`, the Firebase JS SDK, and (for installability and reminders) the Web App Manifest, Service Worker, and Notification APIs — all broadly supported on any browser from the last several years, with the iOS-specific caveats noted in [§7](#7-installable-app-pwa) and [§14](#14-meal-deadline-reminders). No polyfills included.
