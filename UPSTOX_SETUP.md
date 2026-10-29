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
