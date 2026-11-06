/** Historical target-touch frequencies for StockLens index setups.
 * This is a descriptive 5m spot-index replay, NOT predictive, calibrated
 * probabilities and NOT CE/PE option premium returns.
 */
'use strict';
const {upstoxGet,dateIST}=require('./upstox');
const {indexCandleRows,detectSetups}=require('./nifty-index');
const {evaluateEvents}=require('./rolling-breakouts');
const {getMarket}=require('./markets');
const LOOKBACK_DAYS=112,CHUNK_DAYS=28,AFTER_BARS=6,MIN_SAMPLE=30;
const ALL_GROUPS=[
  ['ROLLING_6','ROLLING BREAKOUT · BULLISH'],
  ['ROLLING_6','ROLLING BREAKDOWN · BEARISH'],
  ['ROLLING_6','FAILED ROLLING BREAKOUT · BEARISH REVERSAL'],
  ['ROLLING_6','FAILED ROLLING BREAKDOWN · BULLISH REVERSAL'],
  ['OPENING_RANGE','BULLISH BREAKOUT'],
  ['OPENING_RANGE','BEARISH BREAKDOWN'],
  ['OPENING_RANGE','FAILED BREAKOUT · BEARISH REVERSAL'],
  ['OPENING_RANGE','FAILED BREAKDOWN · BULLISH REVERSAL']
];
const cache=new Map();
const shiftDate=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const round=x=>Math.round(x*10)/10;
const minuteIST=t=>Math.floor((t+19800)/60)%1440; // Asia/Kolkata fixed UTC+05:30.
const fullDay=session=>session.length===75&&session.every((b,i)=>
  Number.isFinite(b?.t)&&minuteIST(b.t)===555+5*i&&
  [b.o,b.h,b.l,b.c].every(Number.isFinite)&&
  (i===0||b.t-session[i-1].t===300));
function groupSessions(bars,from,to){
  const days=new Map();
  for(const b of bars){
    if(!Number.isFinite(b?.t)||minuteIST(b.t)<555||minuteIST(b.t)>925)continue;
    const d=dateIST(new Date(b.t*1000));
    if(d<from||d>to)continue;
    if(!days.has(d))days.set(d,[]);
    days.get(d).push(b);
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b))
    .map(([date,rows])=>({date,bars:rows.sort((a,b)=>a.t-b.t)}));
}
function outcome(event,bars){
  if(!event||!['UP','DOWN'].includes(event.direction)||!Number.isInteger(event.index)||
    ![event.entry,event.stop,event.target1,event.target2].every(Number.isFinite)||
    event.index<0||event.index+AFTER_BARS>=bars.length)return null;
  const up=event.direction==='UP';
  if(up?!(event.stop<event.entry&&event.entry<event.target1&&event.target1<event.target2):
       !(event.stop>event.entry&&event.entry>event.target1&&event.target1>event.target2))return null;
  let t1=false,t2=false,stopped=false;
  for(let i=event.index+1;i<=event.index+AFTER_BARS;i++){
    const b=bars[i],prev=bars[i-1];
    if(!b||!prev||b.t-prev.t!==300||![b.h,b.l].every(Number.isFinite))return null;
    const stop=up?b.l<=event.stop:b.h>=event.stop;
    // Conservative: same 5m bar stop and target -> STOP first, regardless of order.
    if(stop){stopped=true;break;}
    if(up?b.h>=event.target1:b.l<=event.target1)t1=true;
    if(up?b.h>=event.target2:b.l<=event.target2){t1=true;t2=true;break;}
  }
  return {t1,t2,stopped};
}
function wilson(success,n){
  if(n<1)return null;
  const z=1.96,p=success/n,z2=z*z,den=1+z2/n;
  const center=(p+z2/(2*n))/den;
  const error=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/den;
  return [round(Math.max(0,(center-error)*100)),round(Math.min(100,(center+error)*100))];
}
function summarizeHistorical(bars,{from,to,marketId='nifty'}={}){
  const market=getMarket(marketId);
  const sessionRows=groupSessions(bars,from,to);
  const hits=new Map(ALL_GROUPS.map(([src,name])=>[`${src}|${name}`,{sample:0,t1:0,t2:0,stopFirst:0}]));
  let validSessions=0,skippedSessions=0,skippedHorizon=0;
  for(const {bars:session} of sessionRows){
    if(!fullDay(session)){skippedSessions++;continue;}
    validSessions++;
    const orHigh=Math.max(...session.slice(0,3).map(b=>b.h));
    const orLow=Math.min(...session.slice(0,3).map(b=>b.l));
    const events=[...evaluateEvents(session).map(e=>({...e,source:'ROLLING_6'})),
      ...detectSetups(session,orHigh,orLow).map(e=>({...e,source:'OPENING_RANGE'}))];
    for(const e of events){
      const key=`${e.source}|${e.name}`,entry=hits.get(key);
      if(!entry)continue;
      const result=outcome(e,session);
      if(!result){skippedHorizon++;continue;}
      entry.sample++;
      if(result.t1)entry.t1++;
      if(result.t2)entry.t2++;
      if(result.stopped)entry.stopFirst++;
    }
  }
  const groups={};
  for(const [key,h] of hits){
    const sufficient=h.sample>=MIN_SAMPLE;
    groups[key]={source:key.split('|')[0],setup:key.split('|').slice(1).join('|'),
      samples:h.sample,t1Hits:h.t1,t2Hits:h.t2,
      t1Rate:sufficient?round(h.t1/h.sample*100):null,
      t2Rate:sufficient?round(h.t2/h.sample*100):null,
      t1Wilson95:sufficient?wilson(h.t1,h.sample):null,
      t2Wilson95:sufficient?wilson(h.t2,h.sample):null,
      minSamples:MIN_SAMPLE,sufficient};
  }
  return {market:market.id,instrument:market.underlyingKey,from,to,
    lookbackCalendarDays:LOOKBACK_DAYS,validSessions,skippedSessions,skippedHorizon,
    evaluationBars:AFTER_BARS,minSamples:MIN_SAMPLE,groups,
    methodology:'Same confirmed setup, historical completed index candles. T1/T2 touched within 6 subsequent 5m bars before the stop; stop-first on an ambiguous candle. Only complete 75-bar sessions.',
    warning:'These are historical spot-index hit rates, NOT calibrated chances or CE/PE option premium probabilities. Overlapping events and market regimes create uncertainty; Wilson intervals are approximate. No fills, fees or slippage modeled.'};
}
async function historicalTargetOdds(marketId='nifty',now=new Date()){
  const market=getMarket(marketId),end=shiftDate(dateIST(now),-1);
  const key=market.id+'|'+end;
  const cached=cache.get(key);
  if(cached&&cached.expires>Date.now())return cached.data;
  const periods=[];
  for(let i=0;i<LOOKBACK_DAYS/CHUNK_DAYS;i++){
    const to=shiftDate(end,-i*CHUNK_DAYS),from=shiftDate(to,-(CHUNK_DAYS-1));
    periods.push({from,to});
  }
  const instrument=encodeURIComponent(market.underlyingKey);
  const rows=[];
  // Two requests at once: smaller bursts, bounded 10-second individual timeout.
  for(let i=0;i<periods.length;i+=2){
    const batch=await Promise.all(periods.slice(i,i+2).map(async p=>{
      const data=await upstoxGet(`/v3/historical-candle/${instrument}/minutes/5/${p.to}/${p.from}`);
      if(!Array.isArray(data?.candles))throw new Error('Historical index candles were not returned');
      return indexCandleRows(data.candles);
    }));
    rows.push(...batch.flat());
  }
  if(!rows.length)throw new Error('Historical index candles unavailable; no target hit rates can be calculated');
  const distinct=[...new Map(rows.map(b=>[b.t,b])).values()].sort((a,b)=>a.t-b.t);
  const summary=summarizeHistorical(distinct,{from:periods.at(-1).from,to:end,marketId});
  const data={...summary,source:'Upstox Historical Candle V3 (authenticated)',retrievedAt:new Date().toISOString()};
  cache.set(key,{expires:Date.now()+6*3600000,data});
  return data;
}
module.exports={LOOKBACK_DAYS,CHUNK_DAYS,AFTER_BARS,MIN_SAMPLE,
  ALL_GROUPS,fullDay,groupSessions,outcome,wilson,summarizeHistorical,historicalTargetOdds,shiftDate};
