# Architecture & How It Works

## Overview

This is a browser automation framework for placing sports bets programmatically across multiple sportsbooks. It replicates the approach used by CheatKode Pro — launching real Chrome browser windows for authentication, then placing bets via direct API calls using harvested session tokens.

**Key insight:** Bets are NOT placed by clicking through the sportsbook UI. Instead, the framework:
1. Opens a real Chrome window per sportsbook (for login & session maintenance)
2. Extracts auth tokens from the browser's localStorage/cookies
3. Places bets by calling the sportsbook's internal REST APIs directly
4. Periodically refreshes the browser to keep sessions alive

This makes bet placement near-instant (no UI navigation delays) and more reliable.

---

## Project Structure

```
browser_automation/
├── src/
│   ├── index.js                    # Entry point — launches browsers, command loop
│   ├── browser-manager.js          # Core browser lifecycle manager (Patchright/Chromium)
│   ├── arb-placer.js               # Fires arb legs simultaneously across books
│   └── sportsbooks/
│       ├── index.js                # Sportsbook registry (URLs, config per book)
│       ├── draftkings.js           # DraftKings API adapter
│       └── fanduel.js              # FanDuel API adapter
├── data/
│   ├── profiles/                   # Per-sportsbook Chromium user data directories
│   │   ├── draftkings/             # DraftKings browser profile (cookies, localStorage, etc.)
│   │   └── fanduel/                # FanDuel browser profile
│   └── cookies/                    # Saved cookie snapshots (JSON)
├── docs/                           # Documentation
├── package.json
└── node_modules/
```

---

## Core Components

### 1. Browser Manager (`src/browser-manager.js`)

Manages the lifecycle of per-sportsbook Chrome browser instances using **Patchright** (a stealth fork of Playwright designed to avoid bot detection).

**Key features:**
- Each sportsbook gets its own isolated Chromium profile directory under `data/profiles/{bookId}/`
- Profiles persist across restarts — once you log in, the session is saved
- Launches headed (visible) Chrome windows so users can log in manually
- Anti-detection flags: disables `AutomationControlled` blink feature, removes `--enable-automation` flag

**API:**
- `launch(bookId)` — Launch a Chrome window for a sportsbook
- `navigateTo(bookId, url)` — Navigate a sportsbook's browser to a URL
- `getPage(bookId)` — Get the Playwright Page object for a sportsbook
- `saveCookies(bookId)` / `loadCookies(bookId)` — Persist/restore cookies
- `close(bookId)` / `closeAll()` — Cleanup

### 2. DraftKings Adapter (`src/sportsbooks/draftkings.js`)

Handles all DraftKings API communication. DraftKings uses **cookie-based authentication** — the browser's HttpOnly cookies are sent automatically with requests.

**Bet placement flow (4 steps):**
1. `getSelectionInfo(selectionId)` — Fetch event/market/odds details
   - `GET /api/sdinfo/dkcaon/v1/selectioninfo`
2. `calculateBets(selectionIds)` — Validate the bet, get a server-signed `token` and `calculationId`
   - `POST /api/wager/v1/calculateBets`
3. `placeBet(...)` — Submit the bet with the token and calculationId
   - `POST /api/wager/v1/placeBets`
4. `waitForConfirmation(waitingBetId)` — Poll until bet status is `Open` (confirmed)
   - `GET /api/wager/v1/getPurchases`

**API hosts:**
- Gaming API: `https://gaming-ca-on.draftkings.com` (bet placement)
- Content API: `https://sportsbook-nash.draftkings.com` (odds, events)
- General API: `https://api.draftkings.com` (balance, account)

**How requests work:** All API calls are made via `page.evaluate(fetch(...))` — this executes `fetch()` inside the browser page context, which automatically includes the HttpOnly session cookies. No explicit token extraction needed.

**Selection ID format:** `0ML{marketId}_{outcomeIndex}` (e.g., `0ML84034728_3`)

### 3. FanDuel Adapter (`src/sportsbooks/fanduel.js`)

Handles all FanDuel API communication. FanDuel uses **header-based authentication** — explicit auth tokens must be sent in request headers.

**Bet placement flow (2 steps):**
1. `implyBets(marketId, selectionId)` — Validate the bet, get a `betReference` token
   - `POST /api/sports/fixedodds/transactional/v1/implyBets`
2. `placeBet(...)` — Submit with the betReference, odds, and stake
   - `POST /api/sports/fixedodds/transactional/v1/placeBet`

**Auth tokens (extracted from browser localStorage):**
- `x-authentication` — JWT auth token (from `session-sportsbook.authToken.jwt` in localStorage)
- `x-geo-packet` — Geolocation proof JWT (from `location_token.jwt` in localStorage)
- `x-px-context` — PerimeterX bot protection token (from browser cookies `_px3`, `_pxvid`, `pxcts`)
- `x-application` — Static app key: `FhMFpcPWXMeyZxOx`

**API hosts (Ontario region):**
| Subdomain | Purpose |
|-----------|---------|
| `sib.on.sportsbook.fanduel.ca` | implyBets (bet validation) |
| `spb.on.sportsbook.fanduel.ca` | placeBet (bet submission) |
| `smp.on.sportsbook.fanduel.ca` | getMarketPrices (live odds) |

**How requests work:**
- `implyBets` and `getMarketPrices` use Patchright's `context.request` (Node-side HTTP, bypasses CORS)
- `placeBet` uses `page.evaluate(fetch(...))` (browser-side, sends cookies automatically)
- Auth tokens are extracted from localStorage on every request via `page.evaluate()`
- PX cookies are read via `context.cookies()` (can read HttpOnly cookies)

**Selection ID format:** `{marketId}:{selectionId}` (e.g., `801.161028546:7017906`)

**Important:** FanDuel always requires `handicap` in the runner object — `0` for moneylines, actual value for spreads/totals.

### 4. Arb Placer (`src/arb-placer.js`)

Coordinates simultaneous bet placement across multiple sportsbooks for arbitrage.

- Accepts an array of legs: `[{ bookId, selectionId, stake }, ...]`
- Fires all legs in parallel via `Promise.allSettled()`
- Reports success/failure per leg
- Warns on partial fills (some legs succeed, some fail)

### 5. Entry Point (`src/index.js`)

Orchestrates everything:
1. Launches Chrome windows for all configured sportsbooks
2. Initializes adapters and registers them with the arb placer
3. Verifies sessions by checking balances
4. Starts a session keepalive timer (refreshes pages every 5 minutes)
5. Runs an interactive command loop for manual testing

---

## Technology

- **Patchright** (v1.57.0) — Stealth fork of Playwright. Specifically designed to avoid bot detection by sportsbooks. Uses real Chromium with anti-fingerprinting patches.
- **Node.js** — Runtime for the automation framework
- **Persistent Chromium profiles** — Each sportsbook gets its own user data directory, preserving cookies, localStorage, IndexedDB across restarts

---

## Session Management

- Browser profiles in `data/profiles/{bookId}/` persist login sessions across restarts
- First run: user must log in manually in each Chrome window
- Subsequent runs: sessions are automatically restored from the profile
- Keepalive: pages are refreshed every 5 minutes to prevent session timeout
- FanDuel auth tokens expire (~13 min for auth, ~20 min for geo) but are refreshed by the site's own JavaScript running in the browser

---

## Data Flow for a Bet

```
User provides: selectionId + stake
        │
        ▼
┌─── Adapter (DK or FD) ────────────────────────────┐
│                                                     │
│  1. Fetch current odds from sportsbook API          │
│  2. Validate bet & get server-signed token          │
│  3. Submit bet with token + stake + odds            │
│  4. Poll for confirmation (DK) or check response    │
│                                                     │
│  All API calls use the browser's auth session       │
└─────────────────────────────────────────────────────┘
        │
        ▼
  Bet confirmed (or error reported)
```

## Data Flow for an Arb

```
User provides: leg1 (book + selectionId + stake) + leg2 (book + selectionId + stake)
        │
        ▼
┌─── ArbPlacer ──────────────────────┐
│                                     │
│  Promise.allSettled([               │
│    adapter1.executeBet(sel1, stake1) │  ← fires simultaneously
│    adapter2.executeBet(sel2, stake2) │  ← fires simultaneously
│  ])                                 │
│                                     │
└─────────────────────────────────────┘
        │
        ▼
  Results: both succeed / partial fill / both fail
```
