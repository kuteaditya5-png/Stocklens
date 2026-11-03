## NEW in v1.6 — NIFTY 50 / SENSEX market dropdown

StockLens uses one shared strategy across **NIFTY 50** and **BSE SENSEX**, with separate underlying prices and option contract data. Select the market from the **INDEX** dropdown on any of the three main pages. Your selection is remembered and preserved between the Intraday, CE/PE Advisor and Backtest pages. URLs accept `?market=nifty` or `?market=sensex`. Invalid index codes receive HTTP 400, not an unintended different market.

- `/` — five-minute completed-candle index chart; 15-minute ORB, breakdown, failed-break bullish/bearish reversals; locked entry/stop/1R/2R index-point overlays and indicators.
- `/backtest.html` — identical original 15-minute ORB backtest for either index. This historical engine **does not yet backtest failed-break reversals or option premium P&L**.
- `/option-advisor.html` — exchange-specific options (NIFTY `NSE_FO`, SENSEX `BSE_FO`) using current-week Upstox option chain, contract metadata and completed option five-minute candles. A +35 **premium-point** target is an unverified scenario screen, **not a guarantee**. The advisor returns WAIT for unqualified/stale inputs.

Official index keys: `NSE_INDEX|Nifty 50` and `BSE_INDEX|SENSEX`. Lot sizes, expiries, strike intervals and quotes come from Upstox, never hard-coded. BSE Sensex data availability depends on your authenticated Upstox permissions and market feed. No real broker credentials have been used in automated tests; connectivity and the BSE options chain must still be verified on your Vercel deployment. There are no automatic orders.

### Updating in Termux

```sh
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_SENSEX_NIFTY_Dropdown_Patch_v1.6.zip -d .
npm test && npm run build
git add -A
git commit -m "Add SENSEX index selector and option research v1.6"
git push origin main
```

Your existing Vercel `UPSTOX_ACCESS_TOKEN` and optional `STOCKLENS_ACCESS_KEY` are unchanged.

---

# StockLens India v1.5 — Breakout, Breakdown & Reversal Signals (+35 CE/PE research)

**This patch upgrades the existing v1.3 GitHub version through the v1.4 option-advisor code.** It is not NIFTY AI and does not place trades.

## Four NIFTY 50 completed-candle scenarios

- **BULLISH BREAKOUT**: 5-minute bullish close crosses above the 09:15–09:30 opening range HIGH → evaluate **CE**.
- **BEARISH BREAKDOWN**: 5-minute bearish close crosses below the opening range LOW → evaluate **PE**.
- **FAILED BREAKDOWN · BULLISH REVERSAL**: previous completed 5-minute CLOSE is below range LOW, followed by a bullish close recovering above range LOW → evaluate **CE**.
- **FAILED BREAKOUT · BEARISH REVERSAL**: previous completed 5-minute CLOSE is above range HIGH, followed by a bearish close returning below range HIGH → evaluate **PE**.

Each event is detected only after the confirmation candle closes. Index **entry/stop/target 1 (1R)/target 2 (2R) are locked** to the event bar and do not drift with every refresh; setup status can be NEW / MONITORING / TARGET 2 HIT / STOP HIT / EXPIRED. Index targets are **spot points**, not option-premium targets or executable orders. Chart shows the OR high/low and locked event levels, with BRK / REV CE/PE markers.

At `/option-advisor.html`, the read-only Upstox V2 option chain / contract metadata and V3 completed option candles are used to screen the appropriate CE or PE. Only the **NEW** confirmation event can produce WATCH, and only when an actual contract passes required bid/ask, volume, OI, delta, spread, ATR, freshness, risk/reward and illustrative **minimum +35 premium-point scenario** conditions. Otherwise WAIT. This is an unverified, hypothetical target screen, **not** a forecast or backtested target-hit rate. Quotes have no separately verifiable exchange timestamp in the V2 chain response. Live Upstox account connectivity is NOT tested with credentials.

**Backtest warning:** `/backtest.html` remains the original spot-index ORB continuation-only backtest. It does **not** simulate failed-break reversals or actual CE/PE premiums. No option profitability claim should be inferred.

### Termux upgrade for existing v1.3

```bash
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_Reversals_CEPE_Patch_v1.5.zip -d .
npm test && npm run build
git add -A
git commit -m "StockLens v1.5 breakout and failed-break reversals"
git push origin main
```

Routes: `/` for NIFTY index chart, `/option-advisor.html` for real option-contract opportunity screening, `/backtest.html` for original historical index strategy.

---

## NEW in v1.4 — NIFTY CE/PE Option Advisor (+35 Premium Points)

StockLens now includes `/option-advisor.html` and protected `GET /api/option-advisor`. This is an **independent, read-only research screen** connected to the existing NIFTY 50 intraday opening-range breakout engine. It does NOT change the underlying index signal or historical spot backtest.

When a **new, completed** 5-minute candle closes outside the 09:15–09:30 IST opening range, StockLens uses Upstox authenticated APIs:
- **V2 Put/Call Option Chain**: bid, ask, volume, open interest, option Greeks, strike and expiry (`expiry_date=current_week`).
- **V2 Option Contracts**: identifies the exact exchange instrument and broker-reported lot and tick size, never a hard-coded lot.
- **V3 Intraday Historical Candles**: completed 5-minute candles for the short-listed option contracts, used for the ATR-based hypothetical stop.

The chain must have the same expiry and an underlying spot price consistent with the completed index candle. Candidates require positive bid/ask, reasonable spread, liquidity, appropriate delta, and consistent contract metadata. The proposed reference **entry is the current ask**, reference **premium target 1 >= entry + 35**, and stop is based on option five-minute ATR, spread and a minimum premium percentage. Reward:risk must be at least 1.5:1. Target 2 of +50 is shown only when the same hypothetical scenario supports it.

**Critical limitation:** +35 is a **goal**, not a forecast or a measured probability of success. The candidate viability check uses a **hypothetical** NIFTY movement of the larger of the 15m opening-range width and three 5m spot ATRs, mapped through option delta and gamma, less the current spread and illustrative theta decay. This is NOT a statistical price target or an empirically validated return estimate. The V2 option-chain response does not provide a per-contract exchange quote timestamp; before acting, compare with the current exchange/broker bid and ask. Historical option-price backtesting would be needed to estimate target-hit likelihood. No live trades or paper orders are placed by this module.

It returns **WAIT** for market closure, stale candles, breakout not newly confirmed, bad liquidity, missing Greeks, invalid expiry, missing current option history, or inability to clear the +35 screen. The current `UPSTOX_ACCESS_TOKEN` and optional `STOCKLENS_ACCESS_KEY` still apply. No extra secrets or APIs are needed.

### Update existing Android Termux installation

Download `StockLens_Option_Advisor_Patch_v1.4.zip`, extract **into** your existing `~/stocklens-india` Git repository, and run `npm test && npm run build`. Push the changes to your existing GitHub repo to redeploy via Vercel. The app requires a valid Upstox access token in Vercel server-side environment variables; credentials are not included in this ZIP.

---

## NEW in v1.3 — NIFTY 50 Historical Backtest

Open **`/backtest.html`** to replay historical **NIFTY 50 spot-index** 5-minute candles fetched from Upstox V3. Choose past dates (up to 28 calendar days per request, any window back to January 2022) and LONG / SHORT / BOTH. No demo market candles are substituted.

**Rules:** opening range 09:15–09:30 IST; first subsequent completed 5-minute close above or below the range triggers a hypothetical entry **at next 5-minute candle's open** (before 14:45); stop at the opposite edge of the opening range, target 2R, otherwise close the trade at 15:30. One trade per full regular session. If stop and target touch in the same 5m candle, assume stop first. Missing any of the 75 5-minute bars excludes that session. Report wins, losses, win rate, net R, maximum R drawdown, and a trade journal.

**Limits:** This does not use execution-quality tick data or adjust for fees, spread, or slippage. Most importantly, index spot points **cannot** be treated as NIFTY CE/PE or futures P&L. This is **not** a verified profitable strategy. No historical results can be claimed until actual Upstox data is retrieved with a valid token. Auth protects `/api/backtest` using the existing `STOCKLENS_ACCESS_KEY` when set.

# StockLens India v1.2 — NIFTY 50 Intraday Index Desk

**The home dashboard `/` now analyzes the NIFTY 50 index itself, not its 50 constituent companies.** Uses Upstox V3 five-minute candles for **`NSE_INDEX|Nifty 50`**. The old individual-stock NIFTY 50/SENSEX screener is preserved at **`/stocks.html`** and continues using Upstox V3 authenticated market data.

New features:
- Index spot candles displayed as a five-minute candlestick chart with accurate IST timestamps.
- Opening 15-minute range: 09:15–09:30 IST. Breakout confirmation requires a **completed** five-minute candle closing outside that range.
- High/low, previous close, current session open, nine- and twenty-one-period five-minute EMA, RSI(14), and time of most recent completed bar.
- Long/short bias and a conditional 1R/2R index-point scenario only when data is from a **fresh, current trading session**. After close or on a holiday/weekend, the last available historical session is clearly labeled and **live signals are suppressed**.
- Automatically refreshes visible index data every 60 seconds during weekday trading hours, or manually through Refresh candles. Any upstream errors remain visible; no prices or signals are fabricated.
- Supports the original `UPSTOX_ACCESS_TOKEN` and `STOCKLENS_ACCESS_KEY` Vercel environment variables; no frontend brokerage token.

> NIFTY 50 **spot index cannot be traded directly**. A spot breakout is **not** a NIFTY CE/PE option trade recommendation; options require current option premium, strike, expiry, spread, contract size and independent risk analysis. No order placement, backtested strategy edge, or live tick streaming is included.

## Upgrade existing Termux → GitHub → Vercel

1. Save the **StockLens_India_Nifty50_Intraday_v1.2.zip** file to Android Downloads.
2. In Termux run:

```sh
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_India_Nifty50_Intraday_v1.2.zip -d .
npm test && npm run build
git add -A
git commit -m "StockLens v1.2 NIFTY 50 index intraday"
git push origin main
```

3. Vercel redeploys automatically through GitHub integration. Visit **`/`** to see the index and **`/stocks.html`** for the stock scanner. Keep `UPSTOX_ACCESS_TOKEN` fresh in Vercel, and retain `STOCKLENS_ACCESS_KEY` as a private server-side passphrase. If no new Git commit was created, check `git status` and confirm the ZIP was extracted into the repository root.

The read-only index API is **`GET /api/index`**, with the same `x-stocklens-access` private header when enabled. Do not put the Upstox access token or your private passphrase in URL query parameters or Git files. Since Upstox access tokens typically expire at 03:30 IST the next day, update the token in Vercel and redeploy after replacement.

Live Upstox connectivity has **not** been verified using your account; automated tests mock the Upstox responses. See `UPSTOX_SETUP.md`.

---

## Previous v1.1 feature documentation

# StockLens India — Day Trader v1.1

**Deployable web application** for scanning *constituent equities* of **NIFTY 50** and **SENSEX 30**. Inspired by [Jake Schincariol's day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill), re-designed for **Indian cash equities, NSE quote tickers, IST time and ₹ risk calculations**. This is **not** a port of all 11 upstream Claude skills.

## What works in this build

- Professional responsive dark dashboard with **All / NIFTY 50 / SENSEX / saved watchlist** tabs; common constituents are **de-duplicated** across indices.
- Fetches current NIFTY 50 members from **NSE's official CSV**; uses a clearly marked **October 2026 50-stock fallback** if it is unreachable.
- Ships with a **30-stock SENSEX snapshot as of October 27, 2026**; replace it with `SENSEX_SYMBOLS` (30 comma-separated NSE tickers) after membership changes.
- **Real market data or clear errors**: server-side authenticated Upstox V3 daily and five-minute candles; exact NSE instrument-key lookup. It **never fabricates a quote**, and reports partial/failed symbol coverage.
- Rules-based **daily scanner**: closing-high breakout, moving average reclaim, RSI rebound, 20/50-day trend, five-day momentum, 0–100 explainable score, Watch/Wait/Weak flags. Only **completed daily candles** feed the technical score.
- **Entry verification**: a completed five-minute candle must close above the first 15-minute opening range (09:15–09:30 IST). Uses actual OHLC data, not intraday tick guesses.
- **Exit/risk plan**: entry reference, indicative stop based on Wilder **ATR(14)** at 1.25×, and spaced **1.5R/2.5R/3.5R** targets; displays quantity, total planned investment, maximum loss, projected position value **at each target**, and estimated profit **before fees/taxes**.
- **Position sizing**: max 0.5%, 1%, or 2% planned capital loss per trade, AND max 25% capital invested per plan. No leverage, short sales or derivatives.
- **Local watchlist, local paper tickets, and CSV export**. Stored in the current browser's localStorage, with **no live order execution** and **no claims of a simulated fill**.
- Node 20+ with **no external npm dependencies**. Vercel API functions, local dev server, automated offline tests and GitHub Actions CI.

> Market prices come from **Upstox authenticated historical candles**, not a live quote stream. Upstox tokens expire daily; prices can be delayed, unavailable, or rate-limited. Index memberships can change. A "WATCH" flag is a technical filter, **not an instruction to buy**.

See [UPSTOX_SETUP.md](UPSTOX_SETUP.md) for safe setup on Vercel and Termux, including the optional private access key.

## Quick start (local)

```bash
UPSTOX_ACCESS_TOKEN=your_daily_token npm run dev
```

Open **http://localhost:3000**. Press **Scan market** to retrieve verified quotes. A first scan can take time because it covers the whole unique universe in batches, with free-provider throttling/timeout safeguards.

```bash
npm test        # Offline indicator, breakout and sizing tests
npm run build   # Validate deployment assets
```

An Upstox app access token is required. See [UPSTOX_SETUP.md](UPSTOX_SETUP.md). `PORT=4000 npm run dev` chooses a different local port.

## Deploy: GitHub → Vercel (automatic on every push)

1. Unzip and push **the contents of this directory** (not the containing parent directory) to a new GitHub repository. For example:

   ```bash
   git init
   git add .
   git commit -m "StockLens India v1: NIFTY/SENSEX scanner"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/stocklens-india-daytrader.git
   git push -u origin main
   ```

2. Sign in to [Vercel](https://vercel.com/new) → **Add New → Project** → import the GitHub repository.
3. If Vercel prompts for settings, use **Framework Preset: Other**, **Build Command: `npm run build`**, **Output Directory: `public`**. `vercel.json` already contains these defaults and configures `api/*.js` serverless functions.
4. Click **Deploy**. Check `/api/universe`, then load `/` and run a scan. The app needs internet access from Vercel functions to NSE and Upstox plus a valid `UPSTOX_ACCESS_TOKEN`.
5. With the Vercel Git integration enabled, subsequent commits to `main` trigger new deployments automatically. A workflow in `.github/workflows/ci.yml` tests each push/PR; there are no credentials or private endpoints embedded in source.

### Updating SENSEX membership

In **Vercel → Project → Settings → Environment Variables**, define:

```dotenv
SENSEX_SYMBOLS=RELIANCE,BHARTIARTL,HDFCBANK,...
```

Supply **exactly 30 NSE equity tickers** (without `.NS`); otherwise the app deliberately uses its documented snapshot. Redeploy after updating an environment variable. The NIFTY 50 list is already fetched from NSE at runtime and cached in a warm function for 12 hours.

### API routes

| Route | Description |
| --- | --- |
| `GET /api/universe` | Membership, counts, freshness and exact sources |
| `GET /api/scan?market=all&batch=0` | 12 candidates per batch, signals and partial errors; `market=nifty` or `market=sensex` supported |
| `GET /api/detail?symbol=RELIANCE&capital=100000&risk=1` | Validates NSE constituent; returns daily/intraday bars, breakout confirmation, and illustrative position plan |

Responses include `status: success`, `partial`, or `error`, with the data and failure messages.

## Design and risk notes

**Daily scores are not intraday entry signals.** The scanner uses confirmed daily closes and may show the last known delayed market price in a separate field. A candidate is considered "qualified" only if (i) its daily score ≥ 70, (ii) the intraday five-minute ORB is confirmed, **and** (iii) the session is currently within the weekday 09:15–15:30 IST window. The market-hours badge checks weekday/time **but not holiday/exchange schedule**; always verify NSE trading holidays and live broker data.

**ATR calculation** uses actual daily high/low/previous close and Wilder smoothing; stops are illustrative, not guaranteed fills. Targets depend on ATR and can be far away in ₹ terms. Paper tickets record a proposed plan, never a live order. The account buffer and daily P/L guard of the upstream skill are **not implemented** in this MVP.

**Feed availability:** Upstox V3 requires a valid personal access token. The adapter resolves an exact NSE_EQ stock instrument by symbol and reads daily and current-session five-minute candles. Upstox tokens expire at 03:30 IST the next day. Missing/expired tokens, inaccessible symbols and upstream throttling are surfaced as errors; no prices are fabricated. This is a historical candle scanner, not live broker streaming.

**Scope exclusions (roadmap):** No live broker/order placement, notifications outside an open browser, continuous background monitoring, news feed, earnings interpretation, options/futures, quantitative Monte Carlo Time Machine, extensive trade journal/backtesting, or alerts. Those were in parts of the upstream repository, but are not represented as working features here. See [THIRD_PARTY.md](THIRD_PARTY.md) for attribution and membership/data provenance.

## Project tree

```text
api/             Vercel serverless handlers (universe, scan, detail)
lib/             Membership, Upstox transport, technical indicators, HTTP helpers
public/          Static responsive dashboard (no JS build tool)
tests/           Offline tests
scripts/         Build validation
.github/workflows/ci.yml
vercel.json      Vercel presets, route rewrites, function duration
```

**Disclaimer:** This is educational research software, not personalized investment advice. Day trading is risky. Verify live prices, liquidity and index composition independently with your broker or registered professional.

## Navigation fix (v1.2.1)

The constituent stock workspace (`/stocks.html`) now includes a permanent **NIFTY 50 Intraday** link in its sidebar, a back link in the top breadcrumb (including mobile where the sidebar is hidden), and an **Index Intraday** button beside the stock scan controls. All links point to `/`. No market-data code or Upstox credentials have changed.
