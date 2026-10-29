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
