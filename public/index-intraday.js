(() => {
'use strict';
const $=id=>document.getElementById(id);
const Market=window.StockLensMarket;
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
    const response=await fetch('/api/index?market='+encodeURIComponent(Market.id()),{headers,cache:'no-store'});
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
function chartSvg(bars,orb,levels,events=[]){
  const list=(bars||[]).filter(b=>[b.o,b.h,b.l,b.c].every(Number.isFinite));
  if(!list.length)return '<div class="chart-placeholder">No completed index candles available.</div>';
  const barsShow=list.slice(-75);
  const W=950,H=370,left=14,right=82,top=14,bottom=32;
  const plotW=W-left-right,plotH=H-top-bottom;
  const extra=[orb?.high,orb?.low,levels?.entry,levels?.stop,levels?.target1,levels?.target2].filter(Number.isFinite);
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
  // Level overlays are NIFTY spot-index points only, never option premiums.
  if(levels){
    const fromTime=Date.parse(levels.candleTime||'')/1000-300;
    const firstVisible=barsShow[0]?.t;
    const n0=Number.isFinite(fromTime)&&firstVisible!=null?Math.max(0,Math.floor((fromTime-firstVisible)/300)):0;
    const xStart=left+step*(Math.min(barsShow.length-1,n0)+.5);
    for(const [value,label,color] of [[levels.entry,'ENTRY','#f6c46e'],[levels.stop,'STOP','#fa8b9d'],[levels.target1,'T1','#5bddae'],[levels.target2,'T2','#37bda9']]){
      if(!Number.isFinite(value))continue;
      const yy=y(value);
      elements.push(`<line x1="${xStart.toFixed(1)}" y1="${yy.toFixed(2)}" x2="${W-right}" y2="${yy.toFixed(2)}" stroke="${color}" stroke-width="1.6" stroke-dasharray="4 4"/>`);
      elements.push(`<text x="${W-right-7}" y="${Math.max(13,yy-5).toFixed(2)}" text-anchor="end" fill="${color}" font-size="10" font-weight="800">${label} ${value.toFixed(1)}</text>`);
    }
  }
  const firstVisible=barsShow[0]?.t;
  for(const ev of events||[]){
    const time=Date.parse(ev.barStart||'')/1000;
    if(!Number.isFinite(time)||time<firstVisible||time>barsShow.at(-1)?.t)continue;
    const i=Math.round((time-firstVisible)/300),b=barsShow[i];if(!b)continue;
    const xx=left+step*(i+.5),bull=ev.direction==='UP';
    const label=ev.name.startsWith('FAILED')?(bull?'REV CE':'REV PE'):(bull?'BRK CE':'BRK PE');
    const yy=Math.max(top+15,Math.min(top+plotH-14,bull?y(b.l)+20:y(b.h)-12));
    elements.push(`<text x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" text-anchor="middle" fill="${bull?'#5bddae':'#fa98a0'}" font-size="9" font-weight="800">${label}</text>`);
  }
  const stamp=t=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t*1000));
  [0,.25,.5,.75,1].forEach(p=>{const i=Math.min(barsShow.length-1,Math.round((barsShow.length-1)*p));const x=left+step*(i+.5);elements.push(`<text x="${x.toFixed(2)}" y="${H-8}" text-anchor="middle" font-size="11" fill="#7890aa">${stamp(barsShow[i].t)}</text>`)});
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Selected index five-minute OHLC candles, green means close at or above open, red means close below open">${elements.join('')}</svg>`;
}
function render(d){
  $('lastPrice').textContent=n(d.last);document.title='StockLens — '+Market.name()+' Intraday';
  $('priceChange').textContent=d.change==null?'Prior-day change unavailable':`${d.change>=0?'+':''}${n(d.change)} (${d.changePct>=0?'+':''}${n(d.changePct)}%) vs prior close`;
  $('priceChange').className='price-delta'+(d.change>0?' positive':d.change<0?' negative':'');
  $('asOf').textContent=d.asOf?`Last completed candle: ${istDate(d.asOf)}`:'No completed candles';
  $('sessionHigh').textContent=n(d.high);$('sessionLow').textContent=n(d.low);
  $('sessionOpen').textContent=n(d.open);$('prevClose').textContent=n(d.previousClose);
  $('sessionDate').textContent=d.tradingDate||'—';
  $('bias').textContent=d.orb.status;
  $('orHigh').textContent=n(d.orb.high);$('orLow').textContent=n(d.orb.low);
  $('orbStatus').textContent=d.orb.status;
  $('signal').textContent=d.setup?(d.signal+' · '+d.setup.state):d.signal;
  $('signal').className='signal-pill'+(d.setup?.direction==='UP'?' up':d.setup?.direction==='DOWN'?' down':'');
  const signalMap={
    'BULLISH BREAKOUT':'A completed 5m candle broke above the opening range; reference levels are locked at confirmation.',
    'BEARISH BREAKDOWN':'A completed 5m candle broke below the opening range; reference levels are locked at confirmation.',
    'FAILED BREAKDOWN · BULLISH REVERSAL':'A prior close broke support, then a bullish 5m candle reclaimed it: potential bear trap / CE direction.',
    'FAILED BREAKOUT · BEARISH REVERSAL':'A prior close broke resistance, then a bearish 5m candle lost it: potential bull trap / PE direction.',
    'WAIT':'The opening range is not currently broken by a completed candle.',
    'NO LIVE SIGNAL':'No intraday signal: market is closed, session is old, or the most recent candle is stale.'
  };
  $('orbExplain').textContent=signalMap[d.signal]||'Waiting for 09:15–09:30 completed candles.';
  $('ema9').textContent=n(d.indicators.ema9);$('ema21').textContent=n(d.indicators.ema21);
  $('rsi14').textContent=d.indicators.rsi14!=null?n(d.indicators.rsi14):'—';
  $('chart').innerHTML=chartSvg(d.candles,d.orb,d.levels,d.events);
  $('candlesCount').textContent=String(d.candleCount);
  $('freshness').textContent=d.fresh?'Fresh completed bar':d.isCurrentSession?'Delayed / stale':'Previous session';
  $('freshness').className=d.fresh?'positive':'negative';
  $('feedNote').textContent=d.note||'Quotes are based on completed 5-minute candles; not streaming or guaranteed executable prices.';
  const p=d.levels;
  $('entryLevel').textContent=n(p?.entry);$('stopLevel').textContent=n(p?.stop);
  $('targetOne').textContent=n(p?.target1);$('targetTwo').textContent=n(p?.target2);
  $('scenarioTag').textContent=p?((d.setup?.optionSide||'')+' · '+(d.setup?.state||'LOCKED')):'NO ACTIVE SETUP';
  $('setupStatus').textContent=d.setup?`${d.setup.optionSide} direction · ${d.setup.state} · ${istDate(d.setup.candleTime)}`:'No active completed-candle setup';
  $('optionSideHint').textContent=d.setup?`Index ${d.setup.direction==='UP'?'bullish':'bearish'}: evaluate ${d.setup.optionSide} option separately, not an automatic BUY.`:'Option contract requires independent chain confirmation.';
  if(d.warnings?.length)note(d.warnings.join(' '));
  else if(!d.isCurrentSession)note('Displaying the last available '+Market.name()+' trading session. These are historical candles, not a live intraday signal.',true);
  else if(!d.fresh)note('The latest completed candle is not fresh. Index signals are disabled until newer candles arrive.',true);
  else note('');
}
let generation=0;
async function refresh(){const g=++generation,selected=Market.id();$('refreshBtn').disabled=true;$('refreshSymbol').textContent='◌';
  $('chart').innerHTML='<div class="chart-placeholder">Loading '+Market.name()+' completed candles…</div>';
  $('signal').textContent='LOADING';
  try{const data=await loadJson();if(g===generation&&selected===Market.id())render(data);}
  catch(e){if(g===generation){note('Unable to load '+Market.name()+' index candles: '+e.message);$('chart').innerHTML='<div class="chart-placeholder">No verified candle data available. Check your Upstox token in Vercel and refresh.</div>';$('signal').textContent='DATA UNAVAILABLE';}}
  finally{if(g===generation){$('refreshBtn').disabled=false;$('refreshSymbol').textContent='↻';}}
}

Market.init(()=>{
  document.title='StockLens — '+Market.name()+' Intraday';
  // Hide all previous-index values immediately, before the new API responds.
  for(const id of ['lastPrice','sessionHigh','sessionLow','sessionOpen','prevClose','sessionDate',
    'bias','orHigh','orLow','orbStatus','ema9','ema21','rsi14','entryLevel','stopLevel','targetOne','targetTwo','candlesCount'])$(id).textContent='—';
  $('priceChange').textContent='Loading '+Market.name()+'…';
  $('setupStatus').textContent='Loading '+Market.name()+' confirmed setups…';
  $('scenarioTag').textContent='AWAITING CONFIRMATION';
  $('optionSideHint').textContent='Option contract requires independent chain confirmation.';
  $('asOf').textContent='Waiting for completed '+Market.name()+' candles';
  $('feedNote').textContent='Switching to '+Market.name()+' verified Upstox data.';
  $('orbExplain').textContent='Opening range pending.';
  refresh();
});
$('refreshBtn').addEventListener('click',refresh);
localClock();setInterval(localClock,30000);
setInterval(()=>{if(localClock()&&!document.hidden)refresh()},60000);
refresh();
})();
