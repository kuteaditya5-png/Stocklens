/** Index spot analytics: no derivative premium or trade execution. */
const {dateIST,candleRows,upstoxGet}=require('./upstox');
const {rsi,round,isIndianCashSession}=require('./indicators');
const INSTRUMENT_KEY='NSE_INDEX|Nifty 50';
const PERIOD_MS=5*60*1000;
const KEY=encodeURIComponent(INSTRUMENT_KEY);
const sameSession=(bar,day)=>dateIST(new Date(bar.t*1000))===day;
function indexCandleRows(raw) {
  // Index spot volume/OI may be null: volume is not a criterion for index candle validity.
  const candles=(raw||[]).map(r=>Array.isArray(r)?[r[0],r[1],r[2],r[3],r[4],r[5]??0]:r);
  return candleRows(candles).filter(b=>[b.o,b.h,b.l,b.c].every(Number.isFinite)&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c));
}
function ema(series,n) {
  if(series.length<n)return null;
  const k=2/(n+1);
  let value=series.slice(0,n).reduce((a,b)=>a+b,0)/n;
  for(let i=n;i<series.length;i++)value=(series[i]-value)*k+value;
  return value;
}
const iso=t=>new Date(t*1000).toISOString();

/** Closed-candle ORB continuation and failed-break reversal detection.
 * All references are NIFTY *spot* points, not option premiums or filled trades.
 * A failure requires a prior CLOSE beyond the range and a later CLOSE reclaim.
 */
const SIGNAL_SIDES={
  'BULLISH BREAKOUT':'UP',
  'BEARISH BREAKDOWN':'DOWN',
  'FAILED BREAKDOWN · BULLISH REVERSAL':'UP',
  'FAILED BREAKOUT · BEARISH REVERSAL':'DOWN'
};
function detectSetups(candles,orHigh,orLow){
  if(!Array.isArray(candles)||candles.length<4||![orHigh,orLow].every(Number.isFinite)||orHigh<=orLow)return [];
  const out=[];
  for(let i=3;i<candles.length;i++){
    const b=candles[i],prev=candles[i-1];
    if(b.t-prev.t!==300)continue; // a missing bar is not a proven crossover
    const up=b.c>b.o&&b.c>prev.c,down=b.c<b.o&&b.c<prev.c;
    let name=null,stop=null,breakLevel=null;
    if(prev.c<orLow&&b.c>orLow&&up){
      name='FAILED BREAKDOWN · BULLISH REVERSAL';
      stop=Math.min(prev.l,b.l);breakLevel=orLow;
    }else if(prev.c>orHigh&&b.c<orHigh&&down){
      name='FAILED BREAKOUT · BEARISH REVERSAL';
      stop=Math.max(prev.h,b.h);breakLevel=orHigh;
    }else if(prev.c<=orHigh&&b.c>orHigh&&up){
      name='BULLISH BREAKOUT';stop=orLow;breakLevel=orHigh;
    }else if(prev.c>=orLow&&b.c<orLow&&down){
      name='BEARISH BREAKDOWN';stop=orHigh;breakLevel=orLow;
    }
    if(!name)continue;
    const direction=SIGNAL_SIDES[name],entry=b.c;
    const risk=direction==='UP'?entry-stop:stop-entry;
    if(!(risk>0))continue;
    const sign=direction==='UP'?1:-1;
    out.push({name,direction,optionSide:direction==='UP'?'CE':'PE',index:i,
      candleTime:iso(b.t+300),barStart:iso(b.t),breakLevel:round(breakLevel),
      entry:round(entry),stop:round(stop),target1:round(entry+sign*risk),
      target2:round(entry+sign*2*risk),riskPoints:round(risk)});
  }
  return out;
}
function setupProgress(setup,candles){
  if(!setup)return null;
  const barsSince=candles.length-1-setup.index;
  let state=barsSince===0?'NEW':'MONITORING';
  let exitPrice=null,exitAt=null;
  for(let j=setup.index+1;j<candles.length;j++){
    const bar=candles[j],up=setup.direction==='UP';
    const stopHit=up?bar.l<=setup.stop:bar.h>=setup.stop;
    const targetHit=up?bar.h>=setup.target2:bar.l<=setup.target2;
    if(stopHit){state='STOP HIT';exitPrice=setup.stop;exitAt=iso(bar.t+300);break;}
    if(targetHit){state='TARGET 2 HIT';exitPrice=setup.target2;exitAt=iso(bar.t+300);break;}
  }
  if(state==='MONITORING'&&barsSince>6)state='EXPIRED';
  return {...setup,barsSince,state,exitPrice,exitAt,isNew:barsSince===0};
}
function computeNiftySession(bars,dailyBars,now=new Date()) {
  const currentDay=dateIST(now);
  const complete=bars.filter(b=>b.t*1000+PERIOD_MS<=now.getTime());
  const session=complete.length?dateIST(new Date(complete.at(-1).t*1000)):null;
  const all=complete.filter(b=>sameSession(b,session));
  const candles=all.filter(b=>{
    const hm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(b.t*1000));
    return hm>='09:15'&&hm<'15:30';
  });
  const recent=candles.at(-1);
  const open=candles[0]?.o??null;
  const high=candles.length?Math.max(...candles.map(b=>b.h)):null;
  const low=candles.length?Math.min(...candles.map(b=>b.l)):null;
  const closedDaily=dailyBars.filter(b=>b.t*1000<=now.getTime()).filter(b=>dateIST(new Date(b.t*1000))!==currentDay);
  const priorClose=closedDaily.at(-1)?.c??null;
  const lastClose=recent?.c??null;
  const change=priorClose&&lastClose?round(lastClose-priorClose):null;
  const changePct=priorClose&&lastClose?round((lastClose/priorClose-1)*100):null;
  const range=candles.slice(0,3);
  const openingReady=range.length===3 && range[0].t+300===range[1].t && range[1].t+300===range[2].t
    && new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(range[0].t*1000))==='09:15';
  const orHigh=openingReady?Math.max(...range.map(b=>b.h)):null;
  const orLow=openingReady?Math.min(...range.map(b=>b.l)):null;
  const isToday=session===currentDay;
  const fresh=Boolean(isToday&&recent&&now.getTime()-(recent.t*1000+PERIOD_MS)<=12*60*1000);
  const active=isIndianCashSession(now)&&fresh;
  const lastAbove=openingReady&&lastClose>orHigh;
  const lastBelow=openingReady&&lastClose<orLow;
  const direction=!openingReady?'FORMING':lastAbove?'ABOVE RANGE':lastBelow?'BELOW RANGE':'INSIDE RANGE';
  const closes=candles.map(b=>b.c);
  const ema9=ema(closes,9),ema21=ema(closes,21),rsi14=rsi(closes,14);
  const events=openingReady?detectSetups(candles,orHigh,orLow):[];
  const lastSetup=events.length?setupProgress(events.at(-1),candles):null;
  const signal=!active?'NO LIVE SIGNAL':lastSetup?lastSetup.name:'WAIT';
  // Lock entry/stop/targets at the CONFIRMATION candle, not latest moving price.
  const levels=active&&lastSetup?{
    direction:lastSetup.direction,optionSide:lastSetup.optionSide,
    entry:lastSetup.entry,stop:lastSetup.stop,target1:lastSetup.target1,
    target2:lastSetup.target2,riskPoints:lastSetup.riskPoints,
    candleTime:lastSetup.candleTime,state:lastSetup.state
  }:null;
  return {
    instrumentKey:INSTRUMENT_KEY, name:'NIFTY 50',type:'INDEX_SPOT',timeframe:'5m',
    tradingDate:session,isCurrentSession:isToday,fresh,marketHours:isIndianCashSession(now),
    asOf:recent?iso(recent.t+300):null,previousClose:priorClose,
    open:round(open),high:round(high),low:round(low),last:round(lastClose),
    change,changePct,candleCount:candles.length,
    orb:{high:round(orHigh),low:round(orLow),status:direction,ready:openingReady},
    indicators:{ema9:round(ema9),ema21:round(ema21),rsi14:round(rsi14,1)},
    signal,levels,setup:active?lastSetup:null,events:events.slice(-8), candles:candles.map(b=>({t:b.t,o:b.o,h:b.h,l:b.l,c:b.c})),
    note:!isToday?'Last available session only — not a current-day signal.':!fresh?'Latest completed five-minute candle is not fresh.':null,
    disclaimer:'These are NIFTY 50 spot index points, not tradable NIFTY futures or CE/PE premiums. No orders are placed.'
  };
}
async function getNiftyIndex(now=new Date()) {
  const to=dateIST(now);
  const from=dateIST(new Date(now.getTime()-100*86400000));
  const [rawDaily,rawIntra]=await Promise.allSettled([
    upstoxGet(`/v3/historical-candle/${KEY}/days/1/${to}/${from}`),
    upstoxGet(`/v3/historical-candle/intraday/${KEY}/minutes/5`)
  ]);
  if(rawDaily.status==='rejected'&&rawIntra.status==='rejected')throw new Error('Upstox index data unavailable: '+rawIntra.reason.message);
  const daily=rawDaily.status==='fulfilled'?indexCandleRows(rawDaily.value.candles):[];
  let intraday=rawIntra.status==='fulfilled'?indexCandleRows(rawIntra.value.candles):[];
  const warnings=[];
  if(rawDaily.status==='rejected') warnings.push('Previous-close history unavailable: '+rawDaily.reason.message);
  if(rawIntra.status==='rejected') warnings.push('Current intraday feed unavailable: '+rawIntra.reason.message);
  if(!intraday.length){
    const histFrom=dateIST(new Date(now.getTime()-8*86400000));
    try {const old=await upstoxGet(`/v3/historical-candle/${KEY}/minutes/5/${to}/${histFrom}`);intraday=indexCandleRows(old.candles);}
    catch(e){warnings.push('Historical five-minute feed unavailable: '+e.message);}
  }
  if(!intraday.length)throw new Error('No NIFTY 50 five-minute candles were returned. '+warnings.join(' '));
  const result=computeNiftySession(intraday,daily,now);
  return {...result,provider:'Upstox V3',warnings};
}
module.exports={INSTRUMENT_KEY,indexCandleRows,ema,computeNiftySession,getNiftyIndex,detectSetups,setupProgress,SIGNAL_SIDES};
