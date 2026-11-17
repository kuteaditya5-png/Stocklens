# StockLens 1.11.2 — Fix Vercel Hobby deployment failure

Vercel Hobby rejected the prior deployment: **No more than 12 Serverless Functions can be added to a Deployment**. StockLens 1.11.1 had 13 `api/*.js` handlers.

This patch preserves the public paths `/api/upstox/status` and `/api/upstox/readiness` but routes both to the single `api/upstox-status.js` serverless function. Their handlers remain logically separate; the readiness business logic now resides in `lib/upstox-readiness-handler.js`. **No real broker orders are enabled.**

## IMPORTANT: remove the obsolete API file after unzipping

```sh
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_v1.11.2_Vercel_Hobby_Fix_Patch.zip -d .
rm -f api/upstox-readiness.js
npm test
npm run build
find api -maxdepth 1 -name '*.js' | wc -l  # expect 12
git add -A
git commit -m 'StockLens v1.11.2 fix Vercel Hobby 12-function limit'
git push origin main
```

For **full** ZIP, use the same extraction but the filename `StockLens_v1.11.2_Vercel_Hobby_Fix_Full.zip` and still run the `rm` command if updating an existing checkout. Unzipping **never removes files** already present.

The version remains otherwise identical to 1.11.1; default 3 lots on blank, risk caps, read-only Upstox OAuth and paper order plans are retained. The application is NOT enabled for real-money execution.

`engines.node >=20` in package.json can cause Vercel to choose Node 26 instead of configured Node 24; this is separate from the 12-function failure. You can pin `node: 24.x` later if that warning matters, subject to Vercel supported runtime versions.
