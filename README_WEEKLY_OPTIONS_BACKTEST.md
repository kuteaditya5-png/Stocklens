# StockLens v1.9 — one-week CE/PE **research backtest**

**Requested date range: Monday 2 November to Friday 6 November 2026 (IST).** This add-on doesn't trade, link, or place any Zerodha order. It reads **Upstox historical data** already used by StockLens. Run locally in Termux with **your own** current Upstox API token; never commit, paste, or screenshot that token. Expires/permissions depend on your account.

## What this backtest actually models

- Uses the existing StockLens **rolling-six-candle breakout/breakdown/reversal** and 15-minute **opening-range event** code, with rolling events taking precedence if both trigger on the same candle.
- Loads genuine 5-minute index bars separately for **NIFTY 50 and SENSEX**, checks 75 consecutive market-session bars each day, and skips an incomplete session.
- Generates a signal **only after the confirming 5-minute candle closes**. Stops taking entries after **14:45 IST**. At most three sequential one-lot hypothetical trades per day; signals while another position is open are ignored.
- For each signal, chooses the **nearest-expiry at-the-money contract** of the corresponding exchange and CE/PE side using the historical contract catalog. Uses the contract's **actual historical lot size**, not a guessed current size.
- Uses real historical option **5-minute OHLC**: next candle *open* as hypothetical entry; **+35 premium points** as take-profit for the entire one lot; **entry +50** as an *unexecuted reference* only. Proxy stop = max(1.5 × past option 5-minute ATR, 8% of entry). Rejects a proposed trade with less than 1.5:1 reward/risk. Exits within six consecutive five-minute candles (~30 minutes). Uses stop-first when the stop and target were both touched in one candle. Shows gross one-lot ₹ outcome.
- Includes separate CSV for simulated trades and any skipped signals (such as missing real contract candles). Does **not** substitute fabricated prices. Provides per-index complete-day coverage and status.

## Extremely important limits

**This is a simplified historical ATM options strategy, not an exact replay of the live StockLens Option Advisor.** Upstox historical option candle history does not supply point-in-time bid/ask spreads, IV, option Greeks, intrabar tick chronology or order-book liquidity. The original live Option Advisor requires these. We cannot claim those historical filters passed. Actual Zerodha fills, latency, slippage, taxation, charges, target queue priority, cash margins, spreads and stop execution are NOT reconstructed. Without a user-supplied `--fees` override, monetary returns are **gross only**. Even if `--fees` is set, the output is still a scenario, not an actual net trading ledger.

Upstox **Expired Instruments** API requires an appropriate account/API entitlement (Upstox Plus per current public docs); newly expired contracts may be unavailable due to provider data timing. If a contract or candle history cannot be verified, the program outputs a **skip with reason**. It does not quietly fill it with NIFTY points or another synthetic premium. A full-week claim requires sufficiently complete index and contract datasets for the dates shown.

Historical contract metadata can be selected without hindsight by nearest listed strike, but **ATM selection differs from the live advisor's delta- and spread-based selection**. This is a necessary research proxy, not performance for your exact intended Zerodha algo. A live-trading decision requires much more out-of-sample data than a week.

## Installation (for existing v1.8 StockLens repository)

Download and extract `StockLens_v1.9_OneWeek_Backtest_Patch.zip` into `~/stocklens-india`.

```bash
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_v1.9_OneWeek_Backtest_Patch.zip -d .
npm test
npm run build
```

You must use your own active Upstox access token. Enter it **silently** into Termux (the value will not echo or appear in shell history):

```bash
read -rsp 'Enter Upstox access token privately: ' UPSTOX_ACCESS_TOKEN; echo
export UPSTOX_ACCESS_TOKEN
npm run backtest:week -- --from=2026-11-02 --to=2026-11-06 --market=both
unset UPSTOX_ACCESS_TOKEN
```

For one index, use `--market=nifty` or `--market=sensex`. If you wish to estimate transaction fees, add `--fees=100` (example amount **only**; not an actual Zerodha tariff). The program writes:

- `weekly-backtest-results/results.json` — full assumptions, results, source and coverage.
- `weekly-backtest-results/trades.csv` — each executed hypothetical trade with strike, contract, expiry, entry, stop, +35 target, exit, 1-lot size and gross ₹ outcome.
- `weekly-backtest-results/skipped.csv` — why other signals were not tradable/simulatable.

Output folder is added to `.gitignore` so private analysis outputs are not accidentally published. **There is no automatic order placement.** The `Zerodha` broker is not connected by this patch.

### API documentation

- Upstox index 5-minute V3: https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/
- Expired option contracts: https://upstox.com/developer/api-documentation/get-expired-option-contracts/
- Expired option candles: https://upstox.com/developer/api-documentation/get-expired-historical-candle-data/
- Zerodha expired options limitation: https://support.zerodha.com/category/trading-and-markets/charts-and-orders/charts/articles/historical-data-for-expired-f-o-contract
