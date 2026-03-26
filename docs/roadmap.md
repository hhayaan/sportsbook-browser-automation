# Roadmap & Next Steps

## Ultimate Goal

Build an automated sports arbitrage betting system that:
1. Receives arbitrage opportunities from an external engine (selection IDs + stakes for both sides)
2. Instantly places bets on both sides of the arb across different sportsbooks simultaneously
3. Handles multiple sportsbooks (DraftKings, FanDuel, Pinnacle, and more)
4. Runs autonomously — no manual intervention once sessions are established

The engine (which finds arb opportunities) is a separate project. This framework handles only the **browser automation and bet placement** side.

---

## Current Status

### Working
- [x] Browser manager with persistent Chromium profiles per sportsbook (Patchright)
- [x] DraftKings adapter — full bet placement flow (calculateBets -> placeBets -> confirm)
- [x] FanDuel adapter — full bet placement flow (implyBets -> placeBet)
- [x] Arb placer — simultaneous multi-book bet placement via Promise.allSettled()
- [x] Session keepalive (periodic page refresh)
- [x] Interactive CLI for manual testing
- [x] DraftKings balance check via API
- [x] FanDuel balance check via page scraping

### Not Yet Implemented
- [ ] Pinnacle adapter
- [ ] Engine integration (receiving arb instructions programmatically)
- [ ] Spread/total bet support (handicap handling — partially working on FanDuel)
- [ ] Player props support
- [ ] Parlay support
- [ ] Error recovery / hedge placement when one leg fails
- [ ] Balance tracking across sessions
- [ ] Bet history logging
- [ ] Auto-retry on transient failures
- [ ] Token refresh handling (FanDuel tokens expire every ~13 min)

---

## Phase 1: Add Pinnacle (Next)

### What We Know (from CheatKode decompilation)
- Pinnacle uses **API key-based auth** (not session cookies or JWTs)
- Hardcoded API key from CheatKode: `CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R`
- Auth tokens: `apiKey`, `deviceUUID`, `session`
- Chromium profile: `chrome/pinnacle/`
- URL: `https://www.pinnacle.com`

### Steps
1. Log into Pinnacle in a browser with DevTools Network tab open
2. Place a test bet and capture the HAR file
3. Analyze the HAR to find:
   - Bet placement endpoint(s) and request/response format
   - Auth mechanism (API key header? Cookie? Bearer token?)
   - Selection ID format
   - Balance endpoint
4. Build `src/sportsbooks/pinnacle.js` adapter
5. Register it in `src/index.js` and `arb-placer.js`
6. Test single bets, then test arb with Pinnacle as one leg

### Why Pinnacle Matters
Pinnacle is commonly used as one side of an arb because they:
- Have the sharpest odds in the market
- Don't limit or ban winning bettors
- Are in both Filter Group 1 (with DK + FD) and Filter Group 2 in CheatKode's config

---

## Phase 2: Engine Integration

### Current State
Bets are placed manually via CLI commands with selection IDs. The goal is to receive instructions programmatically from an arb-finding engine.

### Planned Interface
The engine will send bet instructions in a format like:
```json
{
  "arbKey": "unique-arb-id",
  "legs": [
    { "bookId": "draftkings", "selectionId": "0ML84034728_3", "stake": 50 },
    { "bookId": "fanduel", "selectionId": "801.161028546:7017906", "stake": 45 }
  ]
}
```

### Integration Options
1. **WebSocket server** — Framework listens for bet instructions from the engine
2. **HTTP API** — Framework exposes a REST endpoint for the engine to POST to
3. **Redis pub/sub** — Same pattern CheatKode uses (engine publishes, framework subscribes)
4. **Direct function call** — If engine and framework run in the same process

### IPC Events to Implement (matching CheatKode's protocol)
- `arb-process-start` — New arb opportunity received
- `arb-placement-start` — Starting bet placement
- `leg-verification-update` — Bet leg verified (odds still valid)
- `bet-placement-update` — Bet placed on a leg
- `recovery-started` — Recovery/hedge initiated if a leg fails
- `arb-activity-log` — Arb completed, log entry
- `arb-final-result` — Final P&L for the arb
- `balance-update` — Balance changes after bets

---

## Phase 3: Reliability & Recovery

### Error Handling
- **Odds changed** — Re-fetch odds, recalculate, retry if still profitable
- **Session expired** — Detect 401 errors, prompt for re-login or auto-refresh
- **Partial fill** — One leg placed, other failed. Need to hedge the exposed leg
- **Rate limiting** — Back off and retry with exponential delay
- **Market closed** — Skip and report

### Hedge/Recovery
When one leg of an arb fails after the other succeeds, the system needs to:
1. Detect the partial fill
2. Find a hedge bet on the same or different sportsbook
3. Place the hedge to limit exposure
4. Report the adjusted P&L

### Monitoring
- Log all bets with timestamps, odds, stakes, results
- Track cumulative P&L per sportsbook and overall
- Alert on session expiry or repeated failures

---

## Phase 4: Additional Sportsbooks

From CheatKode's supported list:
- [ ] **Pinnacle** (Phase 1 — next)
- [ ] **BetMGM** — Uses vnauth + SSO + XSRF token auth
- [ ] **ESPN BET / TheScore** — GraphQL API at `sportsbook.ca-on.thescore.bet/graphql`
- [ ] **PointsBet**
- [ ] **Betano**

Each new sportsbook requires:
1. HAR capture of a bet placement session
2. API reverse engineering (endpoints, auth, payload format)
3. Adapter implementation following the same pattern as DK/FD
4. Registration in the arb placer

---

## Phase 5: Market Type Coverage

### Currently Supported
- Moneyline bets (both DK and FD)
- Spread/total bets (FanDuel — handicap is passed through)

### To Add
- Spread bets on DraftKings
- Player props (both books)
- Alternate lines
- Same-game parlays (SGP)
- Live/in-play bets (need to handle bet delays)
