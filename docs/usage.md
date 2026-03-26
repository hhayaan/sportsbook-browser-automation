# Usage Guide

## Prerequisites

- **Node.js** (v20+) installed and in PATH
- **npm** (comes with Node.js)

## Setup

```bash
# Install dependencies
npm install

# Install Patchright's Chromium browser (first time only)
npx patchright install chromium
```

## Starting the Automation

```bash
node src/index.js
```

This will:
1. Launch a Chrome window for DraftKings
2. Launch a Chrome window for FanDuel
3. Drop you into an interactive command prompt

**First run:** You need to log into both sportsbooks manually in the Chrome windows that open. Your sessions will be saved in `data/profiles/` and persist across restarts.

**Subsequent runs:** Sessions are restored automatically from the saved browser profiles. No login needed unless your session has expired.

---

## Commands

### Check Balance
```
balance                  # All sportsbooks
balance draftkings       # DraftKings only
balance fanduel          # FanDuel only
```

### Get Selection/Odds Info
```
info draftkings 0ML84034728_3
info fanduel 801.161028546:7017906
```

### Place a Single Bet
```
bet draftkings <selectionId> <stake>
bet fanduel <marketId>:<selectionId> <stake>
```

Examples:
```
bet draftkings 0ML84034728_3 5
bet fanduel 801.160292978:29162 1
```

### Place an Arb (Both Legs Simultaneously)
```
arb <book1> <sel1> <stake1> <book2> <sel2> <stake2>
```

Example:
```
arb draftkings 0ML84034728_3 50 fanduel 801.161028546:7017906 45
```

This fires both bets at the same time via `Promise.allSettled()`.

### Exit
```
quit
```

---

## How to Find Selection IDs

### DraftKings

DraftKings selection IDs look like: `0ML84034728_3`

**Method: DevTools Network Tab**

1. Open the DraftKings sportsbook in the Chrome window
2. Open DevTools (F12) > **Network** tab
3. Filter by **"selectioninfo"**
4. Click on any odds button on the DraftKings site
5. A network request will appear like:
   ```
   GET /api/sdinfo/dkcaon/v1/selectioninfo?siteName=dkcaon&selectionIds=0ML84034728_3
   ```
6. The value after `selectionIds=` is your selection ID

**Selection ID format breakdown:**
- `0ML` — prefix (likely means "MoneyLine" or similar)
- `84034728` — numeric market ID
- `_3` — outcome index within the market

### FanDuel

FanDuel selection IDs use the format: `{marketId}:{selectionId}` (e.g., `801.160292978:29162`)

**Method: DevTools Network Tab**

1. Open the FanDuel sportsbook in the Chrome window
2. Open DevTools (F12) > **Network** tab
3. Filter by **"implyBets"**
4. Click on any odds button on the FanDuel site (click a **single** odds button, not a parlay)
5. A network request will appear: `POST .../implyBets`
6. Click the request, go to the **Payload** tab
7. Look for:
   ```json
   "betRunners": [{
     "runner": {
       "marketId": "801.160292978",
       "selectionId": 29162
     }
   }]
   ```
8. Combine them as: `801.160292978:29162`

**Important:** Make sure you click a **single** odds button, not a parlay combo. If you see multiple entries in `betLegs`, that's a parlay — use just the first leg's marketId:selectionId, or click a different single bet.

**FanDuel ID format breakdown:**
- `801.` — prefix for all market IDs
- `160292978` — numeric market identifier
- `:` — separator (our format, not FanDuel's)
- `29162` — runner/selection identifier

---

## Example: Placing an Arbitrage Bet

### Step 1: Find the Same Game on Both Books

Find a game that's available on both DraftKings and FanDuel. For example, a baseball game: NY Mets vs. CHI Cubs.

### Step 2: Get Selection IDs for Opposite Sides

On **DraftKings**, get the selection ID for Team A (e.g., NY Mets moneyline):
- Follow the DraftKings method above
- Example result: `0ML84034719_1`

On **FanDuel**, get the selection ID for Team B (e.g., CHI Cubs moneyline):
- Follow the FanDuel method above
- Example result: `801.160292978:29162`

### Step 3: Calculate Stakes

Use an arbitrage calculator to determine the optimal stake for each side based on the odds. The stakes will differ per side to guarantee profit regardless of outcome.

### Step 4: Place the Arb

```
arb draftkings 0ML84034719_1 55 fanduel 801.160292978:29162 45
```

Both bets fire simultaneously. The output will show:
```
[ARB] Placing 2-leg arb...
[ARB] Leg: draftkings | 0ML84034719_1 | $55
[ARB] Leg: fanduel | 801.160292978:29162 | $45

[ARB] === Results ===
  draftkings: OK — $55 @ +150 → potential $82.50
  fanduel: OK — $45 @ -130 → potential $79.62

[ARB] All legs placed successfully.
```

---

## Troubleshooting

### "Session check failed" on startup
- Your login session has expired. Log in again manually in the Chrome window.
- FanDuel sessions expire faster (~13 min for auth tokens). The browser's own JS refreshes them, but only while the page is loaded.

### "Selection not found"
- The market may have closed or the game has ended. Get a fresh selection ID.

### "calculateBets failed" (DraftKings)
- The selection may be suspended or the market closed. Try a different selection.

### "INVALID_BET_DEFINITION" (FanDuel)
- Likely a handicap issue. FanDuel requires `handicap: 0` even for moneyline bets. This is handled automatically, but if you see this error, the market format may not be supported yet.

### Browser doesn't open / crashes
- Make sure Patchright's Chromium is installed: `npx patchright install chromium`
- Check that no other automation tool is using the same profile directory
