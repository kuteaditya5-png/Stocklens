/** Unofficial Yahoo chart/spark transport; never invents replacement prices. */
const HOSTS=['https://query2.finance.yahoo.com','https://query1.finance.yahoo.com'];
const HEADERS={ 'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36', 'Accept':'application/json' };
async function yahooJson(path,timeout=9000) {
  let last;
  for(const host of HOSTS) {
    try {
      const res=await fetch(host+path,{headers:HEADERS,signal:AbortSignal.timeout(timeout)});
      if(!res.ok) throw new Error('Yahoo HTTP '+res.status);
      const data=await res.json();
      if(!data || typeof data!=='object') throw new Error('Invalid market data payload');
      return data;
    } catch(e) { last=e; }
  }
  throw new Error(last?.message || 'Market data unavailable');
}
function barRows(row) {
  const q=row?.indicators?.quote?.[0]||{},ts=row?.timestamp||[];
  return ts.map((t,i)=>({t,c:q.close?.[i],o:q.open?.[i],h:q.high?.[i],l:q.low?.[i],v:q.volume?.[i]}))
    .filter(x=>Number.isFinite(x.c)&&x.c>0);
}
async function chart(symbol,range='3mo',interval='1d') {
  if(!/^[A-Z0-9&-]{2,20}\.NS$/.test(symbol)) throw new Error('Invalid NSE ticker');
  const result=await yahooJson('/v8/finance/chart/'+encodeURIComponent(symbol)+'?range='+range+'&interval='+interval);
  const row=result?.chart?.result?.[0];
  if(!row) throw new Error(result?.chart?.error?.description || 'No chart returned');
  return { bars:barRows(row), meta:row.meta||{} };
}
async function spark(symbols) {
  if(!symbols.length)return {};
  const path='/v7/finance/spark?symbols='+encodeURIComponent(symbols.map(s=>s+'.NS').join(','))+'&range=3mo&interval=1d';
  const data=await yahooJson(path);
  const results=data?.spark?.result;
  if(!Array.isArray(results)) throw new Error(data?.spark?.error?.description || 'Spark feed unavailable');
  const out={};
  for(const item of results) {
    const row=item?.response?.[0];
    if(!row)continue;
    const symbol=String(item.symbol||row.meta?.symbol||'').toUpperCase().replace(/\.NS$/,'');
    out[symbol]={bars:barRows(row),meta:row.meta||{}};
  }
  return out;
}
async function batchDaily(symbols) {
  let data={}, mode='spark', error=null;
  try { data=await spark(symbols); } catch(e) { mode='chart fallback'; error=e.message; }
  const missing=symbols.filter(s=>!data[s]||data[s].bars.length<30);
  // Backstop for blocked / missing batched data. Concurrency limited to 4.
  for(let i=0;i<missing.length;i+=4) {
    const chunk=missing.slice(i,i+4);
    await Promise.all(chunk.map(async symbol=>{
      try { data[symbol]=await chart(symbol+'.NS'); } catch(e){ data[symbol]={error:e.message,bars:[],meta:{}}; }
    }));
  }
  return {data,mode,error};
}
module.exports={barRows,chart,spark,batchDaily};
