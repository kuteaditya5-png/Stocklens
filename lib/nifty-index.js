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
  const signal=!active?'NO LIVE SIGNAL':!openingReady?'WAIT':lastAbove?'BULLISH BREAKOUT':lastBelow?'BEARISH BREAKDOWN':'WAIT';
  const closes=candles.map(b=>b.c);
  const ema9=ema(closes,9),ema21=ema(closes,21),rsi14=rsi(closes,14);
  const riskPoints=openingReady&&(lastAbove||lastBelow)?Math.abs(lastClose-(lastAbove?orLow:orHigh)):null;
  const levels=(active&&Number.isFinite(riskPoints)&&riskPoints>0)?{
    direction:lastAbove?'UP':'DOWN',entry:round(lastClose),stop:round(lastAbove?orLow:orHigh),
    target1:round(lastClose+(lastAbove?1:-1)*riskPoints),
    target2:round(lastClose+(lastAbove?2:-2)*riskPoints),riskPoints:round(riskPoints)
  }:null;
  return {
    instrumentKey:INSTRUMENT_KEY, name:'NIFTY 50',type:'INDEX_SPOT',timeframe:'5m',
    tradingDate:session,isCurrentSession:isToday,fresh,marketHours:isIndianCashSession(now),
    asOf:recent?iso(recent.t+300):null,previousClose:priorClose,
    open:round(open),high:round(high),low:round(low),last:round(lastClose),
    change,changePct,candleCount:candles.length,
    orb:{high:round(orHigh),low:round(orLow),status:direction,ready:openingReady},
    indicators:{ema9:round(ema9),ema21:round(ema21),rsi14:round(rsi14,1)},
    signal,levels, candles:candles.map(b=>({t:b.t,o:b.o,h:b.h,l:b.l,c:b.c})),
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
module.exports={INSTRUMENT_KEY,indexCandleRows,ema,computeNiftySession,getNiftyIndex};
