/** Upstox authenticated market-data adapter (read-only, NSE cash equities).
 * v2 instrument search -> v3 historical daily / current-day 5 minute candles.
 * Secrets are read ONLY from server environment variables.
 */
const BASE = 'https://api.upstox.com';
const SYMBOL_RE = /^[A-Z0-9&-]{2,20}$/;
const INSTRUMENT_RE = /^NSE_EQ\|[A-Z0-9]{12}$/;
const keyCache = new Map();
const CACHE_MS = 12 * 60 * 60 * 1000;

function accessToken() {
  const t = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!t) throw new Error('Upstox is not configured: add UPSTOX_ACCESS_TOKEN in Vercel Environment Variables and redeploy.');
  return t;
}

async function upstoxGet(path) {
  const token = accessToken();
  let response;
  try {
    response = await fetch(BASE + path, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    throw new Error('Upstox request failed: ' + (err.name === 'TimeoutError' ? 'request timed out' : 'network unavailable'));
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Upstox authorization failed (HTTP ' + response.status + '). Generate a fresh daily token and update UPSTOX_ACCESS_TOKEN.');
    if (response.status === 429) throw new Error('Upstox HTTP 429: API rate limit reached, retry later.');
    throw new Error('Upstox HTTP ' + response.status);
  }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Upstox returned invalid JSON'); }
  if (payload?.status !== 'success' || payload?.data == null) throw new Error('Upstox returned an unsuccessful market-data response');
  return payload.data;
}

function nseSymbol(ticker) {
  const symbol = String(ticker || '').toUpperCase().replace(/\.NS$/, '');
  if (!SYMBOL_RE.test(symbol)) throw new Error('Invalid NSE cash-equity symbol');
  return symbol;
}

async function instrumentKey(ticker) {
  const symbol = nseSymbol(ticker);
  const entry = keyCache.get(symbol);
  if (entry && entry.expires > Date.now()) return entry.key;
  const q = new URLSearchParams({ query: symbol, exchanges: 'NSE', segments: 'EQ', records: '30' });
  const matches = await upstoxGet('/v2/instruments/search?' + q.toString());
  if (!Array.isArray(matches)) throw new Error('Upstox instrument search returned unexpected results');
  const match = matches.find(item => item?.segment === 'NSE_EQ' &&
    String(item.trading_symbol || '').toUpperCase() === symbol &&
    item.instrument_type === 'EQ' && INSTRUMENT_RE.test(item.instrument_key || ''));
  if (!match) throw new Error('No exact NSE_EQ instrument key returned by Upstox for ' + symbol);
  keyCache.set(symbol, {key: match.instrument_key, expires: Date.now() + CACHE_MS});
  return match.instrument_key;
}

function candleRows(candles) {
  if (!Array.isArray(candles)) throw new Error('Upstox candle payload is missing');
  const valid = [];
  for (const row of candles) {
    if (!Array.isArray(row) || row.length < 6 || row.slice(0,6).some(x=>x==null || x==='')) continue;
    const t = Date.parse(row[0]) / 1000;
    const [o,h,l,c,v] = row.slice(1,6).map(Number);
    if (![t,o,h,l,c,v].every(Number.isFinite) || t <= 0 || c <= 0 || h < l || v < 0) continue;
    valid.push({t,o,h,l,c,v});
  }
  valid.sort((a,b)=>a.t-b.t);
  return valid.filter((r,i)=>i===0 || r.t!==valid[i-1].t);
}

function dateIST(d) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get = type => parts.find(p => p.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

async function chart(ticker, range='3mo', interval='1d') {
  const symbol = nseSymbol(ticker);
  const key = encodeURIComponent(await instrumentKey(symbol));
  let path;
  if (interval === '1d' && range === '3mo') {
    const to = dateIST(new Date());
    const from = dateIST(new Date(Date.now() - 140 * 86400000));
    path = '/v3/historical-candle/' + key + '/days/1/' + to + '/' + from;
  } else if (interval === '5m' && range === '5d') {
    // V3 intraday delivers the *current trading day*, not five days of history.
    path = '/v3/historical-candle/intraday/' + key + '/minutes/5';
  } else throw new Error('Unsupported Upstox history period/interval');
  const data = await upstoxGet(path);
  return {bars: candleRows(data.candles), meta: {provider:'Upstox V3'}};
}

function recentIntradayQuote(bars, now=new Date()) {
  const complete=(bars||[]).filter(b=>b && Number.isFinite(b.c) && Number.isFinite(b.t)
    && b.t*1000 + 300000 <= now.getTime()
    && dateIST(new Date(b.t*1000))===dateIST(now));
  const last=complete.at(-1);
  if (!last || now.getTime()-(last.t*1000+300000)>20*60000) return null;
  return {price:last.c, priceTime:new Date(last.t*1000+300000).toISOString()};
}

async function batchDaily(symbols) {
  accessToken(); // Fail once, immediately, when environment configuration is missing.
  const data = {};
  // A bounded pool of six, to avoid bursts while keeping a scan within serverless timeouts.
  for (let i=0; i<symbols.length; i+=6) {
    await Promise.all(symbols.slice(i,i+6).map(async (symbol)=>{
      try { data[symbol] = await chart(symbol+'.NS','3mo','1d'); }
      catch (e) { data[symbol] = {error:e.message,bars:[],meta:{}}; }
    }));
  }
  return {data,mode:'Upstox V3',error:null};
}

module.exports = {accessToken,upstoxGet,nseSymbol,instrumentKey,candleRows,dateIST,recentIntradayQuote,chart,batchDaily};
