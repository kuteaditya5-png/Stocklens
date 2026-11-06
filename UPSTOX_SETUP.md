## v1.7 rolling-six-bar scanning

Rolling watch levels come only from completed five-minute Upstox index candles when live. User-provided Yahoo export is used in offline testing and audit only. Stale candles or expired `UPSTOX_ACCESS_TOKEN` suppress fresh signals. The option advisor now allows a NEW rolling-six-bar event only after actual exchange-specific option chain, option candle, spread, Greeks and hypothetical +35 premium-point checks. WAIT is common. No order execution or background notifications; do not commit tokens.

---

# v1.2 index intraday setup (Upstox)

NIFTY 50 **index spot**, not member stocks, is the default page (`/`). The old stock scanner is `/stocks.html`. To fetch index candles Upstox V3 uses instrument key `NSE_INDEX|Nifty 50` (shown in Upstox's official instrument search documentation). No stock instrument lookup is needed for the index page.

1. Confirm your Upstox app token is active and that Vercel Project Settings → Environment Variables has `UPSTOX_ACCESS_TOKEN` set for Production.
2. Set a long random `STOCKLENS_ACCESS_KEY` in Vercel to restrict use of your personal data quota. This is an application passphrase, not the Upstox token, app secret, password or trading PIN.
3. After updating a token, redeploy Vercel → Deployments → latest → Redeploy. Upstox normal tokens expire daily around 03:30 IST.
4. Open `/` and enter the StockLens passphrase if prompted. The frontend calls `/api/index` with the private header; opening `/api/index` directly in the browser address bar normally returns HTTP 401 when the private key is configured.
5. In Termux run `npm test && npm run build` before pushing to GitHub. Keep secrets out of the repository.

**Analysis timing:** NIFTY index session is 09:15–15:30 IST, but the market-hours badge does not check the NSE holiday calendar. The API filters for current-day five-minute candles and only accepts complete bars. Opening range is 09:15–09:30. If today's feed is empty (holidays/weekends/early morning), the API attempts historical five-minute candles and labels stale sessions; it never produces a live breakout signal from them.

**Caution:** Index spot cannot be traded. The displayed spot-point levels are indicative and **not valid entry/stop/targets for NIFTY call or put options**. No automated trades are placed. Upstox's intraday endpoint may delay candles and is not an exchange tick stream.

**Docs:** https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/ and https://upstox.com/developer/api-documentation/instrument-search/

## v1.4 — Option Advisor

`/option-advisor.html` reads current NIFTY CE/PE options via the same server-only `UPSTOX_ACCESS_TOKEN`. The protected endpoint is `GET /api/option-advisor`; if `STOCKLENS_ACCESS_KEY` is configured the browser asks for the private scanner access key, as elsewhere in StockLens.

The advisor additionally calls the documented authenticated Upstox API paths:

- `GET /v2/option/chain?instrument_key=NSE_INDEX%7CNifty+50&expiry_date=current_week`
- `GET /v2/option/contract?instrument_key=NSE_INDEX%7CNifty+50&expiry_date=<returned-expiry>`
- `GET /v3/historical-candle/intraday/<encoded-option-key>/minutes/5`

Errors, expiries, broker-reported lot sizes, wide spreads, missing data, and insufficient target scenarios all lead to an explicit WAIT/ERROR instead of invented quotes. See README.md for the limitations of the +35 premium-point objective. Live authenticated integration was NOT run with an account token during offline testing.

## v1.5 — Reversal-aware signals

The four NEW index events are bullish ORB breakout (CE direction), bearish ORB breakdown (PE), failed breakdown with bullish support reclaim (CE), and failed breakout with bearish resistance loss (PE). Index levels are frozen at the confirming completed candle. The Upstox option advisor only screens on that NEW bar; when the index event is old, WAIT is expected. A +35 premium-point screen is a hypothetical selection rule, not a guaranteed or statistically measured result. The existing spot-only backtest does not evaluate reversals or option premiums.
