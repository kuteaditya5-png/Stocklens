# StockLens India 1.1 — Upstox setup (Termux + GitHub + Vercel)

## What changed

StockLens uses authenticated **Upstox** market data instead of Yahoo Finance. `api/scan` loads **historical daily OHLCV** from the Upstox V3 historical-candle API and `api/detail` also requests **current-session five-minute candles** for an opening-range check. `lib/upstox.js` first searches Upstox for the **exact** NSE_EQ stock `instrument_key` (never guesses symbols). The app does not place orders or access your Upstox portfolio.

**This is historical candle data, NOT live streaming:** reference prices and ATR plans may be stale. The details panel can use a recent completed five-minute candle as the reference price during market hours; it cannot guarantee the current executable price. The scanner's technical score uses completed daily candles only.

## 1. Get an Upstox personal API token

1. Go to [Upstox Developer Apps](https://account.upstox.com/developer/apps) and sign into **your own** Upstox account. Create a developer app if needed.
2. Open that app and choose **Generate** access token (manual method documented by Upstox). Treat the access token as a password.
3. Tokens expire at **03:30 AM IST the following day**; generate a fresh token for each new trading day.

Never enter the token into ChatGPT, GitHub files, the browser console, a public URL, or a source file.

## 2. Set server-side secrets in Vercel

In Vercel → **stocklensapi-2040** → **Settings → Environment Variables** add:

| Name | Value | Environments |
| --- | --- | --- |
| `UPSTOX_ACCESS_TOKEN` | Fresh token from your Upstox developer app | Production (and Preview only if needed) |
| `STOCKLENS_ACCESS_KEY` | Random, long, private passphrase of your choice | Production (and Preview only if needed) |

**Strongly recommended:** Set `STOCKLENS_ACCESS_KEY`. Your website is public, and without a private access key any visitor can cause scans to consume your personal Upstox API quota. With it set, the scanner prompts you for the passphrase on the first request; the key is stored only in that browser tab session. Do **not** set the key to your Upstox password, trading PIN, access token or API secret.

After adding or changing the Vercel variables, select **Deployments → latest deployment → Redeploy** so the Vercel functions use the new environment. Repeat whenever you update `UPSTOX_ACCESS_TOKEN`.

## 3. Deploy the v1.1 ZIP through Termux

Download the ZIP into Android Downloads. In Termux:

```bash
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_India_Upstox_v1.1.zip -d .
npm test && npm run build
git add -A
git commit -m "Use Upstox for NSE candle data"
git push origin main
```

Existing Vercel Git integration automatically deploys after the GitHub push. No new GitHub repository is needed.

## 4. Verify the running API

- `https://stocklensapi-2040.vercel.app/api/universe` — index membership (works without a token).
- `https://stocklensapi-2040.vercel.app/` — click **Scan market**; a private passphrase prompt appears if `STOCKLENS_ACCESS_KEY` is set.
- `/api/scan?market=nifty&batch=0` — JSON market scan; with `STOCKLENS_ACCESS_KEY`, opening this route directly in Chrome returns 401 because the browser URL does not attach the private `x-stocklens-access` header. This is expected.

If you see:

- `Upstox is not configured`: set `UPSTOX_ACCESS_TOKEN` and redeploy.
- `Upstox authorization failed (HTTP 401/403)`: generate a fresh token and redeploy.
- `No exact NSE_EQ instrument key`: verify symbol availability/Upstox search response.
- `Upstox HTTP 429`: API rate limited; retry after cooldown.

## Notes

- The adapter makes one instrument search for each symbol per warm serverless instance, caches keys in memory for 12 hours, and reads one history per stock. A complete NIFTY 50 scan may make more than 100 calls across cold instances, subject to Upstox API quotas and function runtime limits.
- NIFTY membership remains from NSE's official CSV with an explicit fallback. SENSEX membership remains a documented 30-company snapshot (not auto-updated).
- This is **cash-equity analytical/paper trading**; no options, live order execution, broker holdings, or websocket streaming.
- No actual authenticated Upstox requests were made as part of the offline tests; final data integration must be checked after you provide the token in Vercel.

Documentation: [Upstox Authentication](https://upstox.com/developer/api-documentation/authentication/), [Instrument Search](https://upstox.com/developer/api-documentation/instrument-search/), [V3 Historical Candles](https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/), [V3 Intraday Candles](https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/).
