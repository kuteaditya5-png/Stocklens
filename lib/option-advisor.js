/** StockLens NIFTY option opportunity screening, read-only. No order placement.
 * Never infer CE/PE premium profit from index points: real option chain, Greeks,
 * contract metadata and complete option candles are required. Scenario is NOT a forecast.
 */
'use strict';
const {upstoxGet,dateIST,candleRows}=require('./upstox');
const {getNiftyIndex,SIGNAL_SIDES}=require('./nifty-index');
const {getMarket}=require('./markets');
const MIN_TARGET_POINTS=35;
const RISK_REWARD_MIN=1.5;
const MAX_SPREAD_PERCENT=3;
const MAX_QUOTE_AGE_MS=15*60000;
const round=(v,n=2)=>Number(v.toFixed(n));
const number=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
function minuteIST(t){return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(t);}
function roundTick(value,tick,dir='nearest'){
  const scale=1/tick;const v=value*scale;
  return round((dir==='up'?Math.ceil(v-1e-8):dir==='down'?Math.floor(v+1e-8):Math.round(v))/scale,2);
}
function trueRangeAverage(bars,n=14){
  if(!Array.isArray(bars)||bars.length<n+1)return null;
  const tr=[];
  for(let i=1;i<bars.length;i++){
    const a=bars[i],prev=bars[i-1];
    if(![a.h,a.l,prev.c].every(Number.isFinite))return null;
    tr.push(Math.max(a.h-a.l,Math.abs(a.h-prev.c),Math.abs(a.l-prev.c)));
  }
  const tail=tr.slice(-n);
  return tail.length===n?tail.reduce((a,b)=>a+b,0)/n:null;
}
const wait=(reason,extra={})=>({status:'WAIT',reason,minTargetPoints:MIN_TARGET_POINTS,...extra});
/** Select only a brand-new completed-bar setup. Rolling six-bar signals take
 * precedence when newer than the original opening-range signal. */
function currentIndexSetup(index){
  const choices=[];
  const o=index?.setup;
  if(SIGNAL_SIDES[index?.signal]&&o&&o.name===index.signal&&o.direction===SIGNAL_SIDES[index.signal]
    &&o.isNew&&o.state==='NEW') choices.push({name:o.name,direction:o.direction,setup:o,source:'OPENING_RANGE'});
  const r=index?.rolling?.latest;
  if(r&&r.source==='ROLLING_6'&&r.barsSince===0&&r.state==='NEW'
    &&['UP','DOWN'].includes(r.direction)&&r.optionSide===(r.direction==='UP'?'CE':'PE'))
    choices.push({name:r.name,direction:r.direction,setup:r,source:'ROLLING_6'});
  return choices.sort((a,b)=>Date.parse(b.setup.candleTime)-Date.parse(a.setup.candleTime)||
    (b.source==='ROLLING_6'?1:-1))[0]||null;
}
function assessIndex(index,now=new Date()){
  if(!index?.isCurrentSession||!index?.marketHours||!index?.fresh)return `${index?.name||'Index'} session is closed or its completed candles are stale`;
  if(minuteIST(now)>'14:45')return 'No new option entries after 14:45 IST';
  if(!index.orb?.ready)return 'Opening range is incomplete';
  const current=currentIndexSetup(index);
  if(!current)return 'The most recent confirmed event is not new on the latest completed five-minute candle';
  const setup=current.setup;
  const bars=index.candles||[];
  if(bars.length<4)return 'Not enough completed index candles for volatility assessment';
  const latest=bars.at(-1),prior=bars.at(-2);
  if(!latest||!prior||latest.t-prior.t!==300)return 'Two consecutive completed candles are required';
  if(setup.candleTime!==new Date((latest.t+300)*1000).toISOString())return 'Latest completed index candle does not match signal timestamp';
  const atr=trueRangeAverage(bars,Math.min(14,bars.length-1));
  if(!(atr>0))return 'Index five-minute ATR is unavailable';
  return null;
}
function eligibleCandidate(row,contract,side,spot,marketId='nifty'){
  const market=getMarket(marketId);
  const option=side==='CE'?row.call_options:row.put_options;
  const quote=option?.market_data||{},greeks=option?.option_greeks||{};
  if(!option?.instrument_key||!contract||contract.instrument_key!==option.instrument_key||contract.instrument_type!==side)return null;
  if(!option.instrument_key.startsWith(market.optionSegment+'|'))return null;
  if(contract.segment && contract.segment!==market.optionSegment)return null;
  if(contract.underlying_key && contract.underlying_key!==market.underlyingKey)return null;
  if(row.underlying_key && row.underlying_key!==market.underlyingKey)return null;
  const strike=number(row.strike_price),ask=number(quote.ask_price),bid=number(quote.bid_price);
  const delta=number(greeks.delta),gamma=number(greeks.gamma),theta=number(greeks.theta);
  const volume=number(quote.volume),oi=number(quote.oi);
  const tick=number(contract.tick_size),lot=number(contract.lot_size);
  // Tick size may be reported in exchange paise; do not accept implausible values.
  const tickRupees=tick!=null&&tick>=1?tick/100:tick;
  if(![ask,bid,delta,strike,volume,oi,lot,tickRupees].every(Number.isFinite))return null;
  if(!(ask>0&&bid>0&&ask>=bid&&volume>0&&oi>0&&lot>0&&tickRupees>0&&tickRupees<=1))return null;
  if(ask<45||ask>market.maxOptionAsk||Math.abs(strike-spot)>market.maxStrikeDistance)return null;
  if(side==='CE' && !(delta>=0.4&&delta<=0.8))return null;
  if(side==='PE' && !(delta<=-0.4&&delta>=-0.8))return null;
  const spread=ask-bid;
  if(spread/ask*100>MAX_SPREAD_PERCENT)return null;
  if(!Number.isInteger(lot))return null;
  return {strike,side,expiry:row.expiry,instrumentKey:option.instrument_key,
    tradingSymbol:contract.trading_symbol||`${market.short} ${strike} ${side}`,lotSize:lot,
    ask,bid,ltp:number(quote.ltp),spread,spreadPct:round(spread/ask*100),
    delta,gamma:gamma!=null&&gamma>=0?gamma:0,theta:theta!=null&&theta<0?theta:0,
    greeksPartial:gamma==null||theta==null,iv:number(greeks.iv),volume,oi,tick:tickRupees};
}
function latestCompletedOptionBars(rows,now=new Date()){
  const parsed=candleRows(rows);
  const day=dateIST(now);
  return parsed.filter(b=>dateIST(new Date(b.t*1000))===day&&b.t*1000+300000<=now.getTime());
}
function pricePlan(candidate,index,optionBars,now=new Date()){
  if(!Array.isArray(optionBars)||optionBars.length<4)return null;
  const latest=optionBars.at(-1);
  if(!latest||now.getTime()-(latest.t*1000+300000)>MAX_QUOTE_AGE_MS)return null;
  const optionAtr=trueRangeAverage(optionBars,Math.min(14,optionBars.length-1)),spotAtr=trueRangeAverage(index.candles,Math.min(14,index.candles.length-1));
  if(!(optionAtr>0&&spotAtr>0))return null;
  // Reject a chain snapshot grossly inconsistent with the recent option candle.
  if(Math.abs(latest.c-candidate.ask)>Math.max(3*optionAtr,candidate.ask*.12))return null;
  const current=currentIndexSetup(index);
  const width=index.orb.high-index.orb.low;
  if(!(width>0))return null;
  // HYPOTHETICAL market movement. For rolling events, cap at 3x ATR so
  // an extreme opening-range wick cannot inflate a +35 premium scenario.
  const extent=current?.source==='ROLLING_6'?Math.abs(current.setup.entry-current.setup.breakLevel):null;
  const underlyingScenario=current?.source==='ROLLING_6'?
    Math.min(3*spotAtr,Math.max(2*spotAtr,extent||0)):Math.max(width,3*spotAtr);
  const signedMove=candidate.side==='CE'?underlyingScenario:-underlyingScenario;
  const grossMove=candidate.delta*signedMove+0.5*candidate.gamma*signedMove*signedMove;
  // Decay over an illustrative 20-minute holding period, theta in premium points/day.
  const timeDrag=Math.abs(Math.min(0,candidate.theta))*20/1440;
  // Conservative entry at ask, hypothetical sale at bid (one current spread deducted).
  const estimatedNetMove=grossMove-timeDrag-candidate.spread;
  if(!Number.isFinite(estimatedNetMove)||estimatedNetMove<MIN_TARGET_POINTS)return null;
  const entry=roundTick(candidate.ask,candidate.tick,'up');
  const risk=Math.max(1.5*optionAtr,2*candidate.spread,entry*.08);
  const stop=roundTick(entry-risk,candidate.tick,'down');
  const target1=roundTick(entry+MIN_TARGET_POINTS,candidate.tick,'up');
  if(!(stop>candidate.tick&&target1>entry))return null;
  const rewardRisk=(target1-entry)/(entry-stop);
  if(rewardRisk<RISK_REWARD_MIN)return null;
  const target2=estimatedNetMove>=50?roundTick(entry+50,candidate.tick,'up'):null;
  return {...candidate,entry,stop,target1,target2,
    riskPoints:round(entry-stop),rewardRisk:round(rewardRisk,2),
    optionAtr5m:round(optionAtr),spotAtr5m:round(spotAtr),limitedHistory:optionBars.length<15||index.candles.length<15,
    scenarioSpotMove:round(underlyingScenario),scenarioNetPremiumMove:round(estimatedNetMove),
    candleAsOf:new Date((latest.t+300)*1000).toISOString(),
    scenarioNote:'Illustrative delta/gamma scenario (rolling setups: 2–3× spot ATR; opening range: existing ORB model), less spread and 20m estimated theta decay. NOT a forecast, probability or verified target.'};
}
function planChoices(index,chain,contracts,optionHistory,now=new Date(),marketId='nifty'){
  const market=getMarket(marketId);
  const why=assessIndex(index,now);if(why)return wait(why);
  const current=currentIndexSetup(index);
  const side=current.direction==='UP'?'CE':'PE';
  if(!Array.isArray(chain)||!chain.length)return wait(`Upstox returned no current ${market.name} option chain`);
  const spot=number(index.last),expiry=chain[0]?.expiry;
  if(!Number.isFinite(spot)||typeof expiry!=='string'||!/^\d{4}-\d\d-\d\d$/.test(expiry)||expiry<dateIST(now))return wait('Current option expiry or index reference price is unavailable');
  if(chain.some(x=>x.expiry!==expiry))return wait('Upstox chain returned mixed expiry dates');
  const chainSpot=number(chain[0].underlying_spot_price);
  if(!Number.isFinite(chainSpot)||Math.abs(chainSpot-spot)>Math.max(market.spotTolerance,spot*.003))return wait('Index candle and option-chain underlying prices are inconsistent or stale');
  const byKey=new Map((contracts||[]).filter(c=>c?.instrument_key).map(c=>[c.instrument_key,c]));
  const candidates=chain.map(r=>eligibleCandidate(r,byKey.get((side==='CE'?r.call_options:r.put_options)?.instrument_key),side,spot,marketId)).filter(Boolean)
    .sort((a,b)=>Math.abs(a.strike-spot)-Math.abs(b.strike-spot)||b.oi-a.oi).slice(0,5);
  if(!candidates.length)return wait('No nearby liquid CE/PE contract with valid delta, spread, expiry and lot size');
  const valid=candidates.map(c=>pricePlan(c,index,optionHistory[c.instrumentKey],now)).filter(Boolean);
  if(!valid.length)return wait('No contract passed +35 premium-point scenario, option-candle freshness and 1.5R risk tests',
    {evaluatedCandidates:candidates.length,expiry,side});
  const selected=valid.sort((a,b)=>Math.abs(a.strike-spot)-Math.abs(b.strike-spot)||b.scenarioNetPremiumMove-a.scenarioNetPremiumMove)[0];
  return {status:'WATCH',side,reason:'New completed five-minute '+current.name.toLowerCase()+' and contract passed the hypothetical +35 premium-point scenario screen.',
    source:'Upstox V2 option chain + contracts, V3 index/option completed five-minute candles',market:market.id,name:market.name,underlyingKey:market.underlyingKey,
    snapshotReceivedAt:now.toISOString(),exchangeQuoteTimestampVerified:false,
    minTargetPoints:MIN_TARGET_POINTS,spot:round(spot),indexSignal:current.name,indexSetup:current.setup,indexSignalSource:current.source,
    expiry,selected,alternatives:valid.filter(c=>c.instrumentKey!==selected.instrumentKey).slice(0,2),
    warnings:['WATCH is a research filter, not BUY advice or an executable quote.','Upstox V2 chain response does not provide per-contract exchange quote timestamps; verify live bid/ask before any action.','Historical target-hit probability has not been established; +35 is a goal, not an expected result.','Price movement, IV, theta, fills, slippage, spreads and brokerage may invalidate this scenario. Early-session volatility estimates use fewer bars and are less reliable.','No orders are placed.']};
}
async function getOptionAdvice(now=new Date(),marketId='nifty'){
  const market=getMarket(marketId);
  const index=await getNiftyIndex(now,marketId);
  const reason=assessIndex(index,now);
  if(reason)return wait(reason,{market:market.id,name:market.name,indexSignal:index.signal,spot:index.last,asOf:index.asOf});
  const key=new URLSearchParams({instrument_key:market.underlyingKey,expiry_date:'current_week'});
  const chain=await upstoxGet('/v2/option/chain?'+key.toString());
  if(!Array.isArray(chain)||!chain.length)return wait(`Upstox returned no current-week ${market.name} option chain`,{market:market.id,name:market.name});
  const expiry=chain[0]?.expiry;
  if(!/^\d{4}-\d\d-\d\d$/.test(expiry||'')||expiry<dateIST(now))return wait('Upstox returned an expired or invalid contract expiry');
  const contractParams=new URLSearchParams({instrument_key:market.underlyingKey,expiry_date:expiry});
  const contracts=await upstoxGet('/v2/option/contract?'+contractParams.toString());
  if(!Array.isArray(contracts))return wait('Option contract metadata unavailable');
  const current=currentIndexSetup(index);
  const side=current.direction==='UP'?'CE':'PE';
  const contractMap=new Map(contracts.map(c=>[c.instrument_key,c]));
  const candidates=chain.map(r=>eligibleCandidate(r,contractMap.get((side==='CE'?r.call_options:r.put_options)?.instrument_key),side,index.last,marketId))
    .filter(Boolean).sort((a,b)=>Math.abs(a.strike-index.last)-Math.abs(b.strike-index.last)).slice(0,5);
  const histories={};
  await Promise.all(candidates.map(async c=>{
    try {const data=await upstoxGet('/v3/historical-candle/intraday/'+encodeURIComponent(c.instrumentKey)+'/minutes/5');
      histories[c.instrumentKey]=latestCompletedOptionBars(data.candles,now);
    }catch{histories[c.instrumentKey]=[];}
  }));
  return planChoices(index,chain,contracts,histories,now,marketId);
}
module.exports={MIN_TARGET_POINTS,currentIndexSetup,assessIndex,eligibleCandidate,latestCompletedOptionBars,pricePlan,planChoices,getOptionAdvice,trueRangeAverage};
