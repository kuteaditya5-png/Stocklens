/** Rolling six-completed-candle price-action scanner, spot-index points only.
 * No future data at signal time. Entries are confirmation-close references,
 * NOT executable fills, and options require independent contract quotes.
 */
'use strict';
const LOOKBACK=6,COOLDOWN_BARS=3,REVERSAL_WINDOW=4,ACTIVE_BARS=6;
const round=x=>Math.round(x*100)/100;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2};
const iso=t=>new Date(t*1000).toISOString();
function candleQuality(c){return c&&[c.t,c.o,c.h,c.l,c.c].every(finite)&&c.h>=Math.max(c.o,c.c)&&c.l<=Math.min(c.o,c.c)&&c.l>0;}
function reference(prev){
  if(prev.length!==LOOKBACK||!prev.every(candleQuality))return null;
  for(let i=1;i<prev.length;i++)if(prev[i].t-prev[i-1].t!==300)return null;
  const ranges=prev.map(b=>b.h-b.l);
  const typicalRange=median(ranges);
  if(!(typicalRange>0))return null;
  const high=Math.max(...prev.map(b=>b.h)),low=Math.min(...prev.map(b=>b.l));
  const buffer=Math.max(2,round(typicalRange*.12));
  const minBody=Math.max(5,round(typicalRange*.25));
  return {high:round(high),low:round(low),buffer,minBody,typicalRange:round(typicalRange),
    upTrigger:round(high+buffer),downTrigger:round(low-buffer)};
}
function makeEvent(name,direction,b,i,breakLevel,stop,r,origin){
  const entry=b.c,risk=direction==='UP'?entry-stop:stop-entry;
  if(!finite(risk)||risk<Math.max(r.typicalRange*.25,2))return null;
  const sign=direction==='UP'?1:-1;
  return {id:`${b.t}-${name}`,source:'ROLLING_6',name,direction,optionSide:direction==='UP'?'CE':'PE',
    index:i,barStart:iso(b.t),candleTime:iso(b.t+300),breakLevel:round(breakLevel),
    entry:round(entry),stop:round(stop),riskPoints:round(risk),
    target1:round(entry+sign*risk),target2:round(entry+sign*2*risk),
    originId:origin?.id??null,reference:r,priceType:'INDEX_SPOT',execution:'REFERENCE_ONLY'};
}
function evaluateEvents(candles){
  if(!Array.isArray(candles))return [];
  const events=[];
  for(let i=LOOKBACK;i<candles.length;i++){
    const b=candles[i],prev=candles[i-1];
    if(!candleQuality(b)||!candleQuality(prev)||b.t-prev.t!==300)continue;
    const r=reference(candles.slice(i-LOOKBACK,i));if(!r)continue;
    const body=Math.abs(b.c-b.o),position=(b.c-b.l)/Math.max(.01,b.h-b.l);
    const up=b.c>b.o&&body>=r.minBody&&position>=.65&&b.c>prev.c;
    const down=b.c<b.o&&body>=r.minBody&&position<=.35&&b.c<prev.c;
    // A reversal is a new completed close across an earlier broken level.
    // It is not a mere bearish/green candle inside the range.
    let event=null;
    const original=[...events].reverse().find(e=>i-e.index<=REVERSAL_WINDOW && i>e.index
      && /ROLLING BREAKOUT|ROLLING BREAKDOWN/.test(e.name));
    if(original?.direction==='UP'&&down&&b.c<original.breakLevel-original.reference.buffer/2){
      const stop=Math.max(b.h,prev.h,candles[original.index].h)+r.buffer;
      event=makeEvent('FAILED ROLLING BREAKOUT · BEARISH REVERSAL','DOWN',b,i,original.breakLevel,stop,r,original);
    }else if(original?.direction==='DOWN'&&up&&b.c>original.breakLevel+original.reference.buffer/2){
      const stop=Math.min(b.l,prev.l,candles[original.index].l)-r.buffer;
      event=makeEvent('FAILED ROLLING BREAKDOWN · BULLISH REVERSAL','UP',b,i,original.breakLevel,stop,r,original);
    }else if(up&&b.c>r.upTrigger){
      event=makeEvent('ROLLING BREAKOUT · BULLISH','UP',b,i,r.high,Math.min(b.l,r.high)-r.buffer,r);
    }else if(down&&b.c<r.downTrigger){
      event=makeEvent('ROLLING BREAKDOWN · BEARISH','DOWN',b,i,r.low,Math.max(b.h,r.low)+r.buffer,r);
    }
    if(!event)continue;
    // One idea per 15 minutes: suppress consecutive candles that simply
    // extend the same move. Reversals can replace continuation after 2 bars.
    const last=events.at(-1);
    if(last && i-last.index<COOLDOWN_BARS && !(event.originId&&i-last.index>=2))continue;
    events.push(event);
  }
  return events;
}
function progress(event,candles){
  if(!event)return null;
  const barsSince=candles.length-1-event.index;
  let state=barsSince===0?'NEW':'MONITORING',hitT1=false,exitTime=null,ambiguous=false;
  for(let j=event.index+1;j<candles.length&&j<=event.index+ACTIVE_BARS;j++){ 
    const b=candles[j],up=event.direction==='UP';if(!candleQuality(b))continue;
    const stop=up?b.l<=event.stop:b.h>=event.stop;
    const target2=up?b.h>=event.target2:b.l<=event.target2;
    const target1=up?b.h>=event.target1:b.l<=event.target1;
    if(target1)hitT1=true;
    // OHLC cannot establish intrabar touch order; conservative STOP-first.
    if(stop){state='STOP HIT';ambiguous=target2;exitTime=iso(b.t+300);break;}
    if(target2){state='TARGET 2 TOUCHED';exitTime=iso(b.t+300);break;}
  }
  if(state==='MONITORING'&&barsSince>ACTIVE_BARS)state=hitT1?'TARGET 1 TOUCHED':'EXPIRED';
  return {...event,barsSince,state,hitT1,ambiguous,exitTime};
}
function analyzeRolling(candles,{asOf=new Date(),active=false}={}){
  const completed=(Array.isArray(candles)?candles:[]).filter(b=>candleQuality(b)&&b.t*1000+300000<=asOf.getTime());
  const events=evaluateEvents(completed);
  const latest=events.length?progress(events.at(-1),completed):null;
  const lookback=completed.slice(-LOOKBACK);
  const levels=reference(lookback);
  const last=completed.at(-1);
  // No signal without fresh trading-session data. Neither NEXT LEVEL is a prediction.
  const canWatch=Boolean(active&&last&&levels&&asOf.getTime()-(last.t*1000+300000)<=12*60000);
  return {lookback:LOOKBACK,levels:levels?{...levels,asOf:iso(last.t+300)}:null,
    status:!canWatch?'NOT LIVE':latest?.state==='NEW'?'NEW SETUP':'WATCHING',
    latest:canWatch?latest:null,events:events.map(e=>progress(e,completed)).slice(-12),
    opportunities:events.length,watch:canWatch?{
      bullishCloseAbove:levels.upTrigger,bearishCloseBelow:levels.downTrigger,
      minimumCandleBody:levels.minBody,condition:'Completed 5m candle, strong close and 6-bar breakout. No breakout is guaranteed.'}:null,
    note:'Rolling 6-bar levels change after every completed candle. Index points only; CE/PE +35 premium-point screening remains separate.'};
}
module.exports={LOOKBACK,COOLDOWN_BARS,reference,evaluateEvents,progress,analyzeRolling};
