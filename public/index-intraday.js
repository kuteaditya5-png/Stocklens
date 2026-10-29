(() => {
'use strict';
const $=id=>document.getElementById(id);
const f=new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const n=x=>typeof x==='number'&&Number.isFinite(x)?f.format(x):'—';
const istDate=t=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(t));
function localClock() {
  const now=new Date();$('clock').textContent=istDate(now);
  const d=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'short'}).format(now);
  const hm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  const active=!['Sat','Sun'].includes(d)&&hm>='09:15'&&hm<'15:30';
  $('marketBadge').textContent=active?'TRADING HOURS':'OUTSIDE TRADING HOURS';
  $('marketBadge').className='market-pill'+(active?'':' closed');
  return active;
}
function note(message,ok=false) {const el=$('notice');el.hidden=!message;el.className='notice'+(ok?' ok':'');el.textContent=message||'';}
async function loadJson(){
  let key='';try{key=sessionStorage.getItem('stocklens_access_key')||''}catch{}
  for(let attempt=0;attempt<2;attempt++){
    const headers=key?{'x-stocklens-access':key}:{};
    const response=await fetch('/api/index',{headers,cache:'no-store'});
    let doc;
    try{doc=await response.json()}catch{throw Error('Index service returned an unreadable response');}
    if(response.status===401&&doc?.code==='STOCKLENS_ACCESS_REQUIRED'){
      if(attempt)throw Error('Incorrect StockLens access key');
      const userKey=window.prompt('Enter your private StockLens scanner access key:');
      if(!userKey)throw Error('Private StockLens access key is required');
      key=userKey;try{sessionStorage.setItem('stocklens_access_key',key)}catch{}
      continue;
    }
    if(!response.ok)throw Error(doc?.message||'API HTTP '+response.status);
    return doc.data;
  }
  throw Error('StockLens access key rejected');
}
function chartSvg(bars,orb){
  const list=(bars||[]).filter(b=>[b.o,b.h,b.l,b.c].every(Number.isFinite));
  if(!list.length)return '<div class="chart-placeholder">No completed index candles available.</div>';
  const barsShow=list.slice(-75);
  const W=950,H=370,left=14,right=82,top=14,bottom=32;
  const plotW=W-left-right,plotH=H-top-bottom;
  const extra=[orb?.high,orb?.low].filter(Number.isFinite);
  const vals=[...barsShow.flatMap(b=>[b.h,b.l]),...extra];
  const lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max(6,(hi-lo)*.075);
  const min=lo-pad,max=hi+pad,span=Math.max(1,max-min);
  const y=v=>top+(max-v)/span*plotH;
  const step=plotW/barsShow.length,barW=Math.max(2,Math.min(13,step*.64));
  const elements=[];
  for(let j=0;j<=5;j++){
    const value=min+span*(5-j)/5,yy=top+plotH*j/5;
    elements.push(`<line x1="${left}" y1="${yy}" x2="${W-right+2}" y2="${yy}" stroke="#294057" stroke-width=".75" stroke-dasharray="3 5"/>`);
    elements.push(`<text x="${W-right+11}" y="${yy+4}" fill="#849ab5" font-size="12">${value.toFixed(1)}</text>`);
  }
  barsShow.forEach((b,i)=>{
    const x=left+step*(i+.5),color=b.c>=b.o?'#49d6ad':'#ed8897';
    elements.push(`<line x1="${x.toFixed(2)}" y1="${y(b.h).toFixed(2)}" x2="${x.toFixed(2)}" y2="${y(b.l).toFixed(2)}" stroke="${color}" stroke-width="1.8"/>`);
    const yy=Math.min(y(b.o),y(b.c)),hh=Math.max(1.8,Math.abs(y(b.c)-y(b.o)));
    elements.push(`<rect x="${(x-barW/2).toFixed(2)}" y="${yy.toFixed(2)}" width="${barW.toFixed(2)}" height="${hh.toFixed(2)}" rx=".8" fill="${color}"/>`);
  });
  for(const [value,label] of [[orb?.high,'OR HIGH'],[orb?.low,'OR LOW']]){
    if(!Number.isFinite(value))continue;
    const yy=y(value);elements.push(`<line x1="${left}" y1="${yy.toFixed(2)}" x2="${W-right}" y2="${yy.toFixed(2)}" stroke="#58b5f4" stroke-width="1.7" stroke-dasharray="7 5"/>`);
    elements.push(`<text x="${W-right-7}" y="${Math.max(13,yy-5).toFixed(2)}" text-anchor="end" fill="#7dc6fb" font-size="10" font-weight="700">${label}</text>`);
  }
  const stamp=t=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t*1000));
  [0,.25,.5,.75,1].forEach(p=>{const i=Math.min(barsShow.length-1,Math.round((barsShow.length-1)*p));const x=left+step*(i+.5);elements.push(`<text x="${x.toFixed(2)}" y="${H-8}" text-anchor="middle" font-size="11" fill="#7890aa">${stamp(barsShow[i].t)}</text>`)});
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="NIFTY 50 5-minute OHLC candles, green means close at or above open, red means close below open">${elements.join('')}</svg>`;
}
function render(d){
  $('lastPrice').textContent=n(d.last);
  $('priceChange').textContent=d.change==null?'Prior-day change unavailable':`${d.change>=0?'+':''}${n(d.change)} (${d.changePct>=0?'+':''}${n(d.changePct)}%) vs prior close`;
  $('priceChange').className='price-delta'+(d.change>0?' positive':d.change<0?' negative':'');
  $('asOf').textContent=d.asOf?`Last completed candle: ${istDate(d.asOf)}`:'No completed candles';
  $('sessionHigh').textContent=n(d.high);$('sessionLow').textContent=n(d.low);
  $('sessionOpen').textContent=n(d.open);$('prevClose').textContent=n(d.previousClose);
  $('sessionDate').textContent=d.tradingDate||'—';
  $('bias').textContent=d.orb.status;
  $('orHigh').textContent=n(d.orb.high);$('orLow').textContent=n(d.orb.low);
  $('orbStatus').textContent=d.orb.status;
  $('signal').textContent=d.signal;
  $('signal').className='signal-pill'+(d.signal==='BULLISH BREAKOUT'?' up':d.signal==='BEARISH BREAKDOWN'?' down':'');
  const signalMap={
    'BULLISH BREAKOUT':'Latest completed 5m close is above the first 15-minute range. Validate current market prices before acting.',
    'BEARISH BREAKDOWN':'Latest completed 5m close is below the first 15-minute range. This is a spot-index observation.',
    'WAIT':'The opening range is not currently broken by a completed candle.',
    'NO LIVE SIGNAL':'No intraday signal: market is closed, session is old, or the most recent candle is stale.'
  };
  $('orbExplain').textContent=signalMap[d.signal]||'Waiting for 09:15–09:30 completed candles.';
  $('ema9').textContent=n(d.indicators.ema9);$('ema21').textContent=n(d.indicators.ema21);
  $('rsi14').textContent=d.indicators.rsi14!=null?n(d.indicators.rsi14):'—';
  $('chart').innerHTML=chartSvg(d.candles,d.orb);
  $('candlesCount').textContent=String(d.candleCount);
  $('freshness').textContent=d.fresh?'Fresh completed bar':d.isCurrentSession?'Delayed / stale':'Previous session';
  $('freshness').className=d.fresh?'positive':'negative';
  $('feedNote').textContent=d.note||'Quotes are based on completed 5-minute candles; not streaming or guaranteed executable prices.';
  const p=d.levels;
  $('entryLevel').textContent=n(p?.entry);$('stopLevel').textContent=n(p?.stop);
  $('targetOne').textContent=n(p?.target1);$('targetTwo').textContent=n(p?.target2);
  $('scenarioTag').textContent=p?(p.direction==='UP'?'UPSIDE SCENARIO':'DOWNSIDE SCENARIO'):'NO ACTIVE SETUP';
  if(d.warnings?.length)note(d.warnings.join(' '));
  else if(!d.isCurrentSession)note('Displaying the last available NIFTY 50 trading session. These are historical candles, not a live intraday signal.',true);
  else if(!d.fresh)note('The latest completed candle is not fresh. Index signals are disabled until newer candles arrive.',true);
  else note('');
}
let busy=false;
async function refresh(){if(busy)return;busy=true;$('refreshBtn').disabled=true;$('refreshSymbol').textContent='◌';
  try{render(await loadJson())}catch(e){note('Unable to load NIFTY 50 index candles: '+e.message);$('chart').innerHTML='<div class="chart-placeholder">No verified candle data available. Check your Upstox token in Vercel and refresh.</div>';$('signal').textContent='DATA UNAVAILABLE';}
  finally{busy=false;$('refreshBtn').disabled=false;$('refreshSymbol').textContent='↻';}
}
$('refreshBtn').addEventListener('click',refresh);
localClock();setInterval(localClock,30000);
setInterval(()=>{if(localClock()&&!document.hidden)refresh()},60000);
refresh();
})();
