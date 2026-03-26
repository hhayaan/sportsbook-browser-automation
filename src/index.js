const readline = require("readline");
const { BrowserManager } = require("./browser-manager");
const { SPORTSBOOKS } = require("./sportsbooks");
const { DraftKingsAdapter } = require("./sportsbooks/draftkings");
const { FanDuelAdapter } = require("./sportsbooks/fanduel");
const { ArbPlacer } = require("./arb-placer");

const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000;

async function main() {
  const manager = new BrowserManager();
  const arbPlacer = new ArbPlacer();
  const adapters = {};

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  // --- Launch sportsbooks ---
  // DraftKings
  console.log("Launching DraftKings...");
  await manager.launch("draftkings");
  await manager.navigateTo("draftkings", SPORTSBOOKS.draftkings.url);

  console.log("Launching FanDuel...");
  await manager.launch("fanduel");
  await manager.navigateTo("fanduel", SPORTSBOOKS.fanduel.url);

  // Don't wait — go straight to command loop

  // Initialize adapters
  const dk = new DraftKingsAdapter(manager);
  adapters.draftkings = dk;
  arbPlacer.registerAdapter("draftkings", dk);

  const fd = new FanDuelAdapter(manager);
  adapters.fanduel = fd;
  arbPlacer.registerAdapter("fanduel", fd);

  // Verify sessions
  for (const [bookId, adapter] of Object.entries(adapters)) {
    try {
      const balance = await adapter.getBalance();
      console.log(`[${bookId}] Logged in as: ${balance.username}`);
      for (const acct of balance.accounts) {
        if (acct.balance > 0) {
          console.log(`  ${acct.currencyCode}: $${acct.balance.toFixed(2)}`);
        }
      }
    } catch (err) {
      console.error(`[${bookId}] Session check failed: ${err.message}`);
    }
  }

  // Session keepalive for all browsers
  const keepaliveTimer = setInterval(async () => {
    for (const bookId of manager.listRunning()) {
      try {
        const page = manager.getPage(bookId);
        await page.reload({ waitUntil: "domcontentloaded" });
        console.log(`[keepalive] ${bookId} refreshed`);
      } catch (err) {
        console.error(`[keepalive] ${bookId} failed: ${err.message}`);
      }
    }
  }, KEEPALIVE_INTERVAL_MS);

  // --- Command loop ---
  console.log("\n--- Commands ---");
  console.log("  balance [book]                        — Check balance (default: all)");
  console.log("  info <book> <selectionId>             — Get selection/odds info");
  console.log("  bet <book> <selectionId> <stake>      — Place a single bet (no confirmation)");
  console.log("  arb <book1> <sel1> <stake1> <book2> <sel2> <stake2> — Place arb (both legs)");
  console.log("  quit\n");

  let running = true;
  while (running) {
    const input = await ask("> ");
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    try {
      switch (cmd) {
        case "balance": {
          const bookId = parts[1];
          const books = bookId ? [bookId] : Object.keys(adapters);
          for (const id of books) {
            const bal = await adapters[id].getBalance();
            console.log(`[${id}] ${bal.username}`);
            for (const acct of bal.accounts) {
              if (acct.balance > 0) {
                console.log(`  ${acct.currencyCode}: $${acct.balance.toFixed(2)}`);
              }
            }
          }
          break;
        }

        case "info": {
          const [, bookId, selId] = parts;
          if (!bookId || !selId) {
            console.log("Usage: info <book> <selectionId>");
            break;
          }
          const adapter = adapters[bookId];
          if (!adapter) { console.log(`Unknown book: ${bookId}`); break; }
          const info = await adapter.getSelectionInfo(selId);
          for (const sel of info.selections) {
            const market = info.markets?.find((m) => m.id === sel.marketId);
            const event = info.events?.[0];
            console.log(`  Event: ${event?.betSlipLine}`);
            console.log(`  Market: ${market?.betSlipLine}`);
            console.log(`  Selection: ${sel.betSlipLine}`);
            console.log(`  Odds: ${sel.displayOdds?.american} (decimal: ${sel.trueOdds})`);
          }
          break;
        }

        case "bet": {
          const [, bookId, selId, stakeStr] = parts;
          if (!bookId || !selId || !stakeStr) {
            console.log("Usage: bet <book> <selectionId> <stake>");
            break;
          }
          const adapter = adapters[bookId];
          if (!adapter) { console.log(`Unknown book: ${bookId}`); break; }
          const result = await adapter.executeBet(selId, parseFloat(stakeStr));
          const bet = result.bets?.[0];
          console.log(`Placed: $${bet?.stake} @ ${bet?.displayOdds} → $${bet?.potentialReturns} | Status: ${result.status}`);
          break;
        }

        case "arb": {
          // arb <book1> <sel1> <stake1> <book2> <sel2> <stake2>
          if (parts.length < 7) {
            console.log("Usage: arb <book1> <sel1> <stake1> <book2> <sel2> <stake2>");
            break;
          }
          const legs = [
            { bookId: parts[1], selectionId: parts[2], stake: parseFloat(parts[3]) },
            { bookId: parts[4], selectionId: parts[5], stake: parseFloat(parts[6]) },
          ];
          await arbPlacer.placeArb(legs);
          break;
        }

        case "quit":
        case "exit":
          running = false;
          break;

        default:
          if (cmd) console.log(`Unknown command: ${cmd}`);
          break;
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  }

  clearInterval(keepaliveTimer);
  for (const [bookId, adapter] of Object.entries(adapters)) {
    await adapter.saveCookies();
  }
  rl.close();
  await manager.closeAll();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
