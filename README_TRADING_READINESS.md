# StockLens v1.11 — Auto Trading Setup (LIVE ORDERS LOCKED)

This package is **the first deployable engineering stage** of the requested Upstox live auto-trading system. It is **not** a live-trading release and cannot place, modify, or cancel any order.

## New page

- `/trading-setup.html` — NIFTY/SENSEX dropdown, browser OAuth readiness, Upstox static-IP registration check, CE/PE paper trade plan with whole-lot quantity splits.
- `GET /api/upstox/readiness` — requires the browser's encrypted Upstox session AND the private `x-stocklens-access` key; reads `/v2/user/ip` to check if a static primary IP is registered. **This does not prove the future trading worker uses that IP.**
- `GET /api/trading-preview?market=nifty&lots=1` — requires `x-stocklens-access`. Calls the existing read-only Option Advisor. Returns `WAIT` unless a **NEW** completed five-minute breakout/reversal with a valid option contract meets its premium, liquidity and risk screening. A valid result is `PLAN_ONLY` and includes exact exchange-lot splits. **No orders are sent**.
- `lib/trading-plan.js` — strict +35 option-premium-point minimum goal, cap on max planned gross loss and invested premium, no fractional lots, target splits.
- `lib/paper-position-manager.js` — pure deterministic simulation of paper fills, target exits, stop movement and trailing remainder, with duplicate-signal prevention and 15:15 IST cutoff. This is only an offline-tested function library; it has no persistent database and no live feed and is **not yet an always-on paper executor**.

## Quantities

**Lot selector:** Choose 1, 2, 3, 4, or 5 complete lots on `/trading-setup.html`. The default selector choice is **Default — 3 lots**. If the lot field is omitted, empty or null (including serialized `lots=null`), both the API and planner use exactly **3 lots**. Explicit valid selections override it; malformed or out-of-range values fail validation. Three lots are never silently reduced when risk/cost caps would be exceeded, and this does not execute orders.


For 1 lot, the complete lot exits at T1 (+35 premium pts). For 2 lots with a valid T2, sell 1 lot at T1 and 1 lot at T2. For 3+ lots with T2, allocate 1 lot at T1, 1 at T2, and remaining lots to a simulated trailing plan. If T2 is NOT supported by option price logic, all lots are allocated to T1. Never split a single exchange lot.

The original StockLens target evidence refers to underlying **index targets**, and its +35 screening is a **hypothetical delta/gamma scenario**, not a calibrated probability of success. This preview does not transform that screening into proven profitability.

## Optional Vercel risk configuration

- `STOCKLENS_PAPER_MAX_RISK_RUPEES=2500` (default) — limits **planned gross** per-trade loss before costs, gaps and slippage.
- `STOCKLENS_PAPER_MAX_PREMIUM_COST_RUPEES=75000` (default) — limits indicative investment premium.

These controls only apply to previews; there is **no real order API** in this release. Changing env variables requires redeployment.

## Why live orders are intentionally locked

Your existing v1.10 OAuth connection stores the Upstox token in a **browser-scoped encrypted HttpOnly cookie**. The Vercel dashboard cannot reliably execute, monitor and protect orders after the browser closes, and its outgoing IP is not guaranteed to match Upstox's registered static IP.

Upstox requires a user-registered static IP for **place/modify/cancel/GTT** calls. Its broker order operations should be sent from a separately deployed, hardened, always-on server. Broker rules, rate limits and specific order types must be rechecked immediately before going live.

The subsequent trading worker must implement, test and validate all of:

1. A server with a dedicated fixed public outbound IP, registered to your Upstox account, with egress verification.
2. Broker OAuth/token vault securely managed on that same server (daily reauthorization). **Never copy the browser cookie or put broker secrets in frontend code.**
3. Broker order/position reconciliation, audit database and idempotency across restarts and concurrent signals.
4. Filling a complete-lot entry, protecting the **actual filled quantity**, managing pending/partial/rejected orders, and never selling more than the open position.
5. Broker-supported protective stop architecture, T1 +35, T2 +50 where justified, optional trailing remainder; cancel/replace logic without overselling. Stops may slip.
6. Market-hours cutoffs, max daily loss, maximum positions/trades, order rate limiting, emergency kill switch, disconnect recovery and alerting.
7. Upstox sandbox acceptance, then live one-lot **manual approval** before any unattended order execution.

## Deployment

Download `StockLens_v1.11_Trading_Readiness_Patch.zip` into Android Downloads, then in Termux:

```sh
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_v1.11_Trading_Readiness_Patch.zip -d .
npm test
npm run build
git add -A
git commit -m "StockLens v1.11 auto trading readiness and quantity plan"
git push origin main
```

After Vercel finishes deploying, open `https://stocklensapi-2040.vercel.app/trading-setup.html`.

The Upstox access token, API key and private StockLens secrets **must never be pasted into ChatGPT or committed to Git**.

### Official Upstox documentation
- https://upstox.com/developer/api-documentation/announcements/algo-trading-circular/
- https://upstox.com/developer/api-documentation/get-app-static-ips/
- https://upstox.com/developer/api-documentation/v3/place-order/
- https://upstox.com/developer/api-documentation/place-gtt-order/
