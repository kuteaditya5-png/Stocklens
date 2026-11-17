# StockLens Upstox OAuth Connection v1.10

This release fixes the missing browser callback URL and adds a **read-only Upstox OAuth connection screen** to StockLens's existing NIFTY 50 and SENSEX dashboard. No live orders are implemented, and no trading access token is put in client-side JavaScript, localStorage, query strings, GitHub, or publicly accessible API JSON.

## Exact OAuth Redirect URL

Use this URL **verbatim** when Upstox asks for a Redirect URL:

```
https://stocklensapi-2040.vercel.app/api/upstox/callback
```

Do not open it manually to initiate login. Opening it directly (without a `code` and signed `state` in a valid login session) returns a helpful 400 rather than the old 404.

The application has four public (but guarded where appropriate) API paths:

- `POST /api/upstox/connect` — requires private StockLens access-key header; issues a short-lived signed OAuth state cookie and returns the official Upstox authorization URL. This is triggered by the Connect button.
- `GET /api/upstox/callback` — verifies OAuth state and exchanges a single-use authorization code server-to-server; stores the token in an encrypted HttpOnly Secure SameSite=Lax cookie for **the current browser only**.
- `GET /api/upstox/status` — requires the private StockLens key and a broker session cookie; verifies a read-only Upstox user-profile request without returning the token.
- `POST /api/upstox/disconnect` — clears this browser's connection cookie; this **does not revoke** the access token at Upstox.

Vercel uses flat `api/upstox-*.js` serverless files, with `vercel.json` rewrites providing the `/api/upstox/...` URLs. This preserves compatibility with the original `"api/*.js"` function configuration. `npm run dev` supports the same paths.

## Mandatory Vercel variables

Go to Vercel > StockLens project > Settings > Environment Variables > **Production**:

| Variable | Value |
| --- | --- |
| `UPSTOX_API_KEY` | API key from your **Algo Trading App** — keep private. |
| `UPSTOX_API_SECRET` | API secret from that app — keep private. |
| `UPSTOX_REDIRECT_URI` | `https://stocklensapi-2040.vercel.app/api/upstox/callback` |
| `STOCKLENS_OAUTH_SECRET` | Newly generated random secret of at least 32 characters. Run `openssl rand -hex 32` in Termux; use the resulting value as a private Vercel env variable. |
| `STOCKLENS_ACCESS_KEY` | Existing private StockLens dashboard key. Required to initiate login. |

`UPSTOX_ACCESS_TOKEN` is the **older market-data variable**. Leave it as-is; it is separate from the browser-scoped Algo App OAuth session.

After saving, **redeploy the Production deployment**. A fresh deployment is necessary for Vercel functions to see new env variables.

## App registration and workflow

1. Deploy this patch or full project first. Test the registered callback without code. A 400 with a clear message means the route is present.
2. Create the Upstox Algo Trading App. Set its Redirect URL exactly to the URL above. The app creation screen also has optional Postback/Notifier fields: leave them empty until verified server endpoints are implemented.
3. Complete the API key / secret env variables, generate a new OAuth secret, and redeploy.
4. Visit `https://stocklensapi-2040.vercel.app/upstox-connect.html` on the **same production domain**. Click Connect with Upstox and enter your private **StockLens access key**, not your Upstox credentials.
5. Approve using **Upstox's official login page**. The callback will redirect to the connection page. Click Check status to verify that the access token works for the user-profile API.
6. The session is encrypted into an HttpOnly browser cookie. It expires at the applicable Upstox daily cutoff, and other browsers or background workers **are not connected**. If you clear cookies, you must connect again.

## Important security and execution limits

- **No broker order placement, GTT modification, trailing stop-loss, quantity splitting, webhook receiver or automatic trading is implemented in v1.10.** Connection ≠ order execution.
- This browser-session prototype is not suitable for unattended trading. Broker execution requires a **separate backend with registered static outbound IP**, persistent encrypted tokens, authenticated event ingestion, durable position/order state, reconciliation of partial fills, kill switch, daily loss limits, broker sandbox checks and logs. Do not run real orders on the Vercel serverless backend.
- OAuth login uses a random state, a signed 10-minute HttpOnly state cookie, and strict SameSite=Lax, Secure cookies. The token is encrypted server-side with AES-256-GCM and is never returned to frontend JS.
- Protect your private `STOCKLENS_ACCESS_KEY`. The existing scanner stores this access key in per-tab `sessionStorage`; it is not your Upstox key. Only connect from a device you trust.
- For personal use, this setup allows only the initiating browser to view its connection status. It has no shared always-on token vault and no remote broker revoke endpoint.
- Upstox authorization codes are single-use. If login fails, restart from the Connect page.

Official docs:
- https://upstox.com/developer/api-documentation/authentication/
- https://upstox.com/developer/api-documentation/get-token/
- https://upstox.com/developer/api-documentation/appendix/my-apps-support-for-algo-trading-circular/

## Termux deployment

```sh
cd ~/stocklens-india
unzip -o ~/storage/downloads/StockLens_v1.10_Upstox_OAuth_Patch.zip -d .
npm test
npm run build
git add -A
git commit -m "Add secure Upstox OAuth login and callback (read only)"
git push origin main
```

If your ZIP has a different filename, replace only the filename above. The patch upgrades the existing v1.8 or v1.9 file layout without deleting the older screens.
