/** Read-only, historical research. No broker functions or order placement.
 * v1.9: exact StockLens index signals, SIMPLIFIED historical ATM contract selection,
 * premium OHLC backtest (+35/+50) with risk checks. NOT exact v1.8 Option Advisor
 * replay: historical bid/ask, IV, Greeks, spread and live eligibility are unavailable.
 */
'use strict';
const {getMarket}=require('./markets');
const {upstoxGet,dateIST,candleRows}=require('./upstox');
const {indexCandleRows,detectSetups}=require('./nifty-index');
const {evaluateEvents}=require('./rolling-breakouts');
const {groupSessions,fullDay}=require('./target-odds');
const {trueRangeAverage}=require('./option-advisor');
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
const isNum=x=>typeof x==='number'&&Number.isFinite(x);
function weekdays(from,to){const out=[];for(let d=from;d<=to;d=plusDays(d,1)){const w=new Date(d+'T00:00:00Z').getUTCDay();if(w!==0&&w!==6)out.push(d);}return out;}
const plusDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const asIST=t=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t*1000));
const iso=t=>new Date(t*1000).toISOString();
function normalizeOptions(rows){
  return candleRows((rows||[]).map(r=>Array.isArray(r)?[r[0],r[1],r[2],r[3],r[4],r[5]??0,r[6]]:r));
}
function getEvents(bars){
  if(!fullDay(bars))throw Error('Backtest requires all 75 consecutive 5-minute regular-session index candles');
  const orHigh=Math.max(...bars.slice(0,3).map(x=>x.h));
  const orLow=Math.min(...bars.slice(0,3).map(x=>x.l));
  const rolling=evaluateEvents(bars).map(e=>({...e,source:'ROLLING_6'}));
  const opening=detectSetups(bars,orHigh,orLow).map(e=>({...e,source:'OPENING_RANGE'}));
  const byBar=new Map();
  for(const e of [...opening,...rolling]){
    // The live option advisor prioritizes rolling events when simultaneous.
    const old=byBar.get(e.index);
    if(!old||e.source==='ROLLING_6')byBar.set(e.index,e);
  }
  return [...byBar.values()].sort((a,b)=>a.index-b.index).filter(e=>{
    const next=bars[e.index+1];
    return next&&next.t===bars[e.index].t+300&&asIST(next.t)<='14:45';
  });
}
function chooseContract(contracts,spot,side,marketId){
  const market=getMarket(marketId);
  const matches=contracts.filter(c=>c&&c.instrument_type===side&&c.underlying_key===market.underlyingKey&&
    c.segment===market.optionSegment&&isNum(Number(c.strike_price))&&Number(c.lot_size)>0&&
    typeof c.instrument_key==='string'&&c.instrument_key.startsWith(market.optionSegment+'|'));
  return matches.sort((a,b)=>Math.abs(Number(a.strike_price)-spot)-Math.abs(Number(b.strike_price)-spot)||Number(a.strike_price)-Number(b.strike_price))[0]||null;
}
function premiumTrade(event,optionBars,contract,params={}){
  const bars=normalizeBars(optionBars);
  const start=Date.parse(event.candleTime)/1000;
  const entryBarIndex=bars.findIndex(b=>b.t===start);
  if(entryBarIndex<0)return {status:'SKIP',reason:'No option opening candle exactly at next-bar entry time'};
  const entryBar=bars[entryBarIndex];
  const history=bars.slice(0,entryBarIndex); // strictly prior to entry
  if(history.length<4)return {status:'SKIP',reason:'Fewer than four historical option candles to set an ATR-based stop'};
  const prior=history.slice(-Math.min(15,history.length));
  if(prior.some((b,i)=>i>0&&b.t-prior[i-1].t!==300))return {status:'SKIP',reason:'Gaps in prior option candles make ATR uncertain'};
  const atr=trueRangeAverage(history,Math.min(14,history.length-1));
  if(!(atr>0))return {status:'SKIP',reason:'Historical option ATR unavailable'};
  const entry=entryBar.o;
  if(!(entry>0))return {status:'SKIP',reason:'Option entry open is unavailable'};
  const risk=Math.max(1.5*atr,entry*.08); // omitted historical bid/ask spread; must be explicit
  const stop=round(entry-risk),target1=round(entry+35),target2=round(entry+50);
  if(stop<=0||35/risk<1.5)return {status:'SKIP',reason:'Proxy option reward/risk below 1.5 or invalid stop'};
  const window=bars.slice(entryBarIndex,entryBarIndex+6);
  if(window.length!==6||window.some((b,i)=>i>0&&b.t-window[i-1].t!==300))
    return {status:'SKIP',reason:'Six complete consecutive option bars are required to evaluate the 30-minute holding window'};
  const limit=entryBarIndex+6;
  let exit=NaN,exitT=null,exitReason='TIME_EXIT',t1Touched=false,t2Touched=false;
  let last=null;
  for(let i=entryBarIndex;i<limit;i++){
    const b=bars[i],prior=bars[i-1];
    if(i>entryBarIndex && (!prior||b.t-prior.t!==300))return {status:'SKIP',reason:'Option five-minute series has a gap during holding period'};
    // Exit cut-off 15:20 IST, no intraday market-close open position.
    if(asIST(b.t)>'15:20')break;
    last=b;
    const down=b.l<=stop,up=b.h>=target1;
    if(down){exit=Math.min(stop,b.o);exitT=b.t+300;exitReason=up?'STOP_FIRST_AMBIGUOUS':'STOP';break;}
    if(up){exit=target1;exitT=b.t+300;exitReason='TARGET_35';t1Touched=true;t2Touched=b.h>=target2;break;}
  }
  if(!last)return {status:'SKIP',reason:'No valid option candle after entry'};
  if(!Number.isFinite(exit)){exit=last.c;exitT=last.t+300;}
  const lot=Number(contract.lot_size);
  if(!Number.isSafeInteger(lot)||lot<1)return {status:'SKIP',reason:'Invalid historical lot size'};
  const grossPnl=round((exit-entry)*lot);
  const netAfterAssumedFee=isNum(params.fees)?round(grossPnl-params.fees):null;
  return {status:'TRADE',contract:contract.trading_symbol||contract.instrument_key,
    instrumentKey:contract.instrument_key,expiry:contract.expiry,strike:Number(contract.strike_price),
    lot,side:event.optionSide,source:event.source,setup:event.name,
    signalAt:event.candleTime,enteredAt:iso(entryBar.t),exitAt:iso(exitT),
    indexEntry:event.entry,entry:round(entry),stop,target1,target2,atr:round(atr),
    exit:round(exit),exitReason,grossPnl,netAfterAssumedFee,
    pnlPoints:round(exit-entry),t1Touched,t2Touched,assumedFee:isNum(params.fees)?params.fees:null};
}
function normalizeBars(rows){return (rows||[]).filter(b=>isNum(b.t)&&[b.o,b.h,b.l,b.c].every(isNum)).sort((a,b)=>a.t-b.t);}
function summarize(trades,signals,skipped,market,dateRange,options={}){
  const pnl=round(trades.reduce((a,t)=>a+t.grossPnl,0));
  const net= isNum(options.fees)?round(trades.reduce((a,t)=>a+t.netAfterAssumedFee,0)):null;
  return {market,dateRange,signals,simulatedTrades:trades.length,skipped:skipped.length,
    target35Trades:trades.filter(t=>t.exitReason==='TARGET_35').length,
    stoppedTrades:trades.filter(t=>t.exitReason.startsWith('STOP')).length,
    otherExits:trades.filter(t=>t.exitReason==='TIME_EXIT').length,
    grossPnl:pnl,netAfterAssumedFees:net,
    winRate:trades.length?round(trades.filter(t=>t.grossPnl>0).length/trades.length*100):null,
    warning:'OHLC approximation, one-lot ATM proxy, not the exact live Greeks/spread-gated Option Advisor. No real Zerodha fills or guaranteed executable prices. T2 is a reference, exit occurs at T1 (+35) for one lot.'};
}
async function fetchWeeklyIndex(marketId,from,to){
  const market=getMarket(marketId);
  const data=await upstoxGet(`/v3/historical-candle/${encodeURIComponent(market.underlyingKey)}/minutes/5/${to}/${from}`);
  if(!Array.isArray(data?.candles))throw Error('No authenticated five-minute index history');
  return groupSessions(indexCandleRows(data.candles),from,to);
}
function contractCatalog(marketId){
  const market=getMarket(marketId);
  const key=new URLSearchParams({instrument_key:market.underlyingKey});
  const q=key.toString();
  const cache={};
  return {
    async expiries(){
      if(cache.expiries)return cache.expiries;
      const [older,current]=await Promise.all([
        upstoxGet('/v2/expired-instruments/expiries?'+q),
        upstoxGet('/v2/option/contract?'+q)]);
      const curr=Array.isArray(current)?current:[];
      cache.currentAll=curr;
      cache.expiries=[...new Set([...(Array.isArray(older)?older:[]),...curr.map(c=>c.expiry).filter(Boolean)])].sort();
      return cache.expiries;
    },
    async contracts(expiry,nowDay){
      if(cache['contracts|'+expiry])return cache['contracts|'+expiry];
      const useExpired=expiry<nowDay;
      const path=useExpired?'/v2/expired-instruments/option/contract':'/v2/option/contract';
      const qs=new URLSearchParams({instrument_key:market.underlyingKey,expiry_date:expiry});
      const contracts=await upstoxGet(path+'?'+qs.toString());
      if(!Array.isArray(contracts))throw Error(`No option metadata for ${expiry}`);
      cache['contracts|'+expiry]=contracts;
      return contracts;
    },
    async candles(contract,expiry,nowDay,date){
      const key='bars|'+contract.instrument_key+'|'+date;
      if(cache[key])return cache[key];
      const expired=expiry<nowDay;
      const path=expired?`/v2/expired-instruments/historical-candle/${encodeURIComponent(contract.instrument_key)}/5minute/${date}/${date}`:
        `/v3/historical-candle/${encodeURIComponent(contract.instrument_key)}/minutes/5/${date}/${date}`;
      const res=await upstoxGet(path);
      if(!Array.isArray(res?.candles))throw Error('No option OHLC returned');
      return (cache[key]=normalizeOptions(res.candles));
    }
  };
}
async function executeWeek({marketId='nifty',from='2026-11-02',to='2026-11-06',fees=null,maxTradesPerDay=3,now=new Date(),provider=null}={}){
  const market=getMarket(marketId);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||
    (Date.parse(to)-Date.parse(from))>10*86400000)throw Error('Provide a date window of up to 11 calendar days');
  const days=provider?await provider.sessions(marketId,from,to):await fetchWeeklyIndex(marketId,from,to);
  if(!Array.isArray(days)||!days.length)throw Error('No historical index sessions returned; backtest cannot calculate any result');
  const api=provider||contractCatalog(marketId);
  const nowDay=dateIST(now),completeDays=[],skippedDays=[],skipped=[],trades=[];
  const expiries=await api.expiries();
  let signals=0;
  for(const day of days){
    if(!fullDay(day.bars)){skippedDays.push({date:day.date,reason:`Incomplete session (${day.bars.length}/75 candles)`});continue;}
    completeDays.push(day.date);
    const events=getEvents(day.bars);signals+=events.length;
    let busyUntil=0,count=0;
    for(const e of events){
      const stamp=Date.parse(e.candleTime)/1000;
      if(stamp<busyUntil){skipped.push({date:day.date,time:e.candleTime,reason:'Another one-lot position was still open'});continue;}
      if(count>=maxTradesPerDay){skipped.push({date:day.date,time:e.candleTime,reason:`Maximum ${maxTradesPerDay} trades per day`});continue;}
      const expiry=expiries.find(d=>d>=day.date);
      if(!expiry){skipped.push({date:day.date,time:e.candleTime,reason:'No historical expiry known for trade date'});continue;}
      try{
        const contracts=await api.contracts(expiry,nowDay);
        const contract=chooseContract(contracts,e.entry,e.optionSide,marketId);
        if(!contract){skipped.push({date:day.date,time:e.candleTime,reason:'No correct-exchange ATM contract metadata'});continue;}
        const bars=await api.candles(contract,expiry,nowDay,day.date);
        const result=premiumTrade(e,bars,contract,{fees});
        if(result.status==='SKIP'){skipped.push({date:day.date,time:e.candleTime,reason:result.reason});continue;}
        trades.push({...result,date:day.date,indexMarket:market.name});
        count++;busyUntil=Date.parse(result.exitAt)/1000;
      }catch(err){skipped.push({date:day.date,time:e.candleTime,reason:String(err.message).slice(0,170)});}
    }
  }
  const expectedWeekdays=weekdays(from,to);
  const missingDays=expectedWeekdays.filter(d=>!days.some(x=>x.date===d));
  const summary=summarize(trades,signals,skipped,market.name,{from,to}, {fees});
  return {...summary,completeDays,skippedDays,missingDays,expectedWeekdays,
    reportStatus:missingDays.length||skippedDays.length||!trades.length?'INCOMPLETE_OR_UNVERIFIED':'SIMULATED_COMPLETE',
    trades,skippedDetails:skipped,
    dataSource:'Upstox V3 underlying + Upstox historical/expired option candles (when accessible)',
    mode:'RESEARCH_ONLY',ordersPlaced:0,
    assumptions:{strike:'Nearest ATM available contract, as-of index signal price',expiry:'Nearest known expiry on/after signal date',
    entry:'Next five-minute option candle OPEN',target:'One lot exits entirely at entry+35 option premium points',
    target2:'Entry+50 option premium points is only a reference, not an additional take-profit for one lot',
    stop:'max(1.5 × prior option 5-minute ATR, 8% of entry); historical spread unavailable',
    rr:'At least 1.5 based on +35 target',hold:'At most six option candles, no later than 15:20 IST',
    sameBar:'Stop wins if stop and target both occur within one five-minute candle',
    concurrency:'One open one-lot trade at a time, maximum '+maxTradesPerDay+' per trading day',
    costs:fees===null?'Gross only, taxes/brokerage/slippage NOT deducted':`A manually assumed ₹${fees} round trip per trade is deducted; actual charges may differ`,
    limitations:'Index breaks use genuine v1.8 logic; actual historical bid/ask, Greeks and liquidity gate were not reproducible; ATM proxy only.'}};
}
module.exports={normalizeOptions,getEvents,chooseContract,premiumTrade,summarize,fetchWeeklyIndex,contractCatalog,executeWeek,plusDays,weekdays};
