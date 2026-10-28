/**
 * Index membership:
 * NIFTY 50 official CSV is fetched first, with an explicitly marked seed fallback.
 * SENSEX seed cross-checked with the 2026-10-27 constituent list; override with
 * SENSEX_SYMBOLS=comma,separated,symbols when the composition changes.
 * Quote ticker suffix .NS uses NSE prices for dual-listed equities.
 */
const NSE_CSV = 'https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv';
// Snapshot based on October 2026 membership (BSE added, WIPRO removed Sep 30).
// NSE official CSV takes precedence when available.
const NIFTY_SEED = (`ADANIENT ADANIPORTS APOLLOHOSP ASIANPAINT AXISBANK BAJAJ-AUTO BAJAJFINSV BAJFINANCE BEL BHARTIARTL BSE CIPLA COALINDIA DRREDDY EICHERMOT ETERNAL GRASIM HCLTECH HDFCBANK HDFCLIFE HINDALCO HINDUNILVR ICICIBANK INDIGO INFY ITC JIOFIN JSWSTEEL KOTAKBANK LT M&M MARUTI MAXHEALTH NESTLEIND NTPC ONGC POWERGRID RELIANCE SBILIFE SBIN SHRIRAMFIN SUNPHARMA TATACONSUM TMPV TATASTEEL TCS TECHM TITAN TRENT ULTRACEMCO`).split(' ');
const SENSEX_SEED = (`RELIANCE BHARTIARTL HDFCBANK ICICIBANK TCS SBIN BAJFINANCE LT INFY KOTAKBANK HINDUNILVR SUNPHARMA ADANIPORTS TITAN HCLTECH AXISBANK MARUTI M&M ULTRACEMCO ITC ETERNAL NTPC BEL BAJAJFINSV POWERGRID ASIANPAINT TATASTEEL INDIGO TECHM TRENT`).split(' ');
const NIFTY_SOURCE = 'NSE official constituent CSV';
const SENSEX_SOURCE = 'Oct 27, 2026 seed list; update when index rebalances';
let cache = null;
let cacheUntil = 0;
function cleanSymbol(s) { return String(s || '').trim().toUpperCase().replace(/^\"|\"$/g,''); }
function parseCsvLine(line) {
  const cells=[]; let cell='', quoted=false;
  for(let i=0;i<line.length;i++) {
    const c=line[i];
    if(c==='"') { if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){cells.push(cell.trim());cell='';}
    else cell+=c;
  }
  cells.push(cell.trim());
  return cells;
}
function symbolsFromCsv(csv) {
  // Official CSV columns: Company Name,Industry,Symbol,Series,ISIN Code.
  const lines = String(csv || '').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift()||'').map(x=>x.toLowerCase());
  const idx = headers.indexOf('symbol');
  if (idx < 0) throw new Error('NSE CSV has no Symbol column');
  const symbols = [...new Set(lines.map(line => cleanSymbol(parseCsvLine(line)[idx])).filter(s => /^[A-Z0-9&-]{2,20}$/.test(s)))];
  if (symbols.length < 45 || symbols.length > 55) throw new Error('NSE CSV member count outside expected range');
  return symbols;
}
function parseSensexOverride(input) {
  const items = String(input || '').split(/[\s,]+/).map(cleanSymbol).filter(s=>/^[A-Z0-9&-]{2,20}$/.test(s));
  return [...new Set(items)];
}
async function getUniverse({ forceFallback = false } = {}) {
  if (!forceFallback && cache && Date.now() < cacheUntil) return cache;
  let nifty = NIFTY_SEED;
  let niftySource = 'Fallback seed (verify NSE composition)';
  if (!forceFallback) {
    try {
      const r = await fetch(NSE_CSV, { headers: { 'User-Agent':'Mozilla/5.0', 'Accept':'text/csv,*/*' }, signal: AbortSignal.timeout(6500) });
      if (!r.ok) throw new Error('NSE HTTP '+r.status);
      nifty = symbolsFromCsv(await r.text());
      niftySource = NIFTY_SOURCE;
    } catch (e) { /* explicit seed source reported to the client */ }
  }
  const override = parseSensexOverride(process.env.SENSEX_SYMBOLS);
  const sensex = override.length === 30 ? override : SENSEX_SEED;
  const sensexSource = override.length === 30 ? 'SENSEX_SYMBOLS environment override' : SENSEX_SOURCE;
  const niftySet = new Set(nifty), sensexSet = new Set(sensex);
  const stocks = [...new Set([...nifty, ...sensex])].map(symbol => ({
    symbol, ticker: symbol + '.NS', nifty: niftySet.has(symbol), sensex: sensexSet.has(symbol)
  }));
  const result = {
    stocks, count: { nifty: nifty.length, sensex: sensex.length, unique: stocks.length },
    source: { nifty: niftySource, sensex: sensexSource },
    updatedAt: new Date().toISOString(),
  };
  if (!forceFallback) { cache = result; cacheUntil = Date.now() + 12*60*60*1000; }
  return result;
}
module.exports = { getUniverse, symbolsFromCsv, cleanSymbol, NIFTY_SEED, SENSEX_SEED };
