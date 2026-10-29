/** Deterministic historical NIFTY 50 5-minute opening-range backtest.
 * Spot index points only; cannot be converted into option premium P&L.
 * Signal on completed bar CLOSE; entry on next bar OPEN; never same-bar signal fill.
 * Conservative same-candle stop/target ambiguity => stop; no fees or slippage.
 */
const {upstoxGet,dateIST}=require('./upstox');
const {INSTRUMENT_KEY,indexCandleRows}=require('./nifty-index');
const FIVE=300;
const START=9*60+15, END=15*60+25, ENTRY_CUTOFF=14*60+45;
const isoDate=/^\d{4}-\d{2}-\d{2}$/;
const isValidDate=s=>isoDate.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const dayOffset=(str,d)=>new Date(Date.parse(str+'T00:00:00Z')+d*86400000).toISOString().slice(0,10);
const minuteIST=ts=>{const v=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts*1000));const [h,m]=v.split(':').map(Number);return h*60+m;};
const round=(n,places=2)=>Number(n.toFixed(places));
function validateRange(from,to,now=new Date()) {
  const yesterday=dayOffset(dateIST(now),-1);
  if(!isValidDate(from)||!isValidDate(to))throw new Error('Use valid YYYY-MM-DD dates');
  if(from<'2022-01-01')throw new Error('Upstox V3 five-minute history begins in January 2022');
  if(to>yesterday)throw new Error('Historical testing ends yesterday; current session is excluded');
  const count=Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000)+1;
  if(count<1||count>28)throw new Error('Select 1–28 calendar days per request to respect Upstox limits');
  return {from,to,calendarDays:count};
}
function groupBySession(bars,from,to) {
  const days=new Map();
  for(const b of bars){
    if(!b||![b.t,b.o,b.h,b.l,b.c].every(Number.isFinite))continue;
    const d=dateIST(new Date(b.t*1000)); if(d<from||d>to)continue;
    const m=minuteIST(b.t); if(m<START||m>END||(m-START)%5!==0)continue;
    if(!days.has(d))days.set(d,[]);
    days.get(d).push(b);
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,bars:rows.sort((a,b)=>a.t-b.t)}));
}
function validSession(rows) {
  if(rows.length!==75)return false;
  const unique=new Set(rows.map(b=>b.t));if(unique.size!==75)return false;
  for(let i=0;i<75;i++)if(minuteIST(rows[i].t)!==START+5*i)return false;
  return true;
}
function selectEntry(bars,mode) {
  const orHigh=Math.max(...bars.slice(0,3).map(b=>b.h));
  const orLow=Math.min(...bars.slice(0,3).map(b=>b.l));
  for(let i=3;i+1<bars.length;i++) {
    if(minuteIST(bars[i+1].t)>ENTRY_CUTOFF)break;
    // Use the first eligible close, never a wick and never the triggering bar's open.
    const up=bars[i].c>orHigh,down=bars[i].c<orLow;
    if(!(up||down))continue;
    const side=up?'LONG':'SHORT';
    if(mode!=='both' && (mode==='long'?'LONG':'SHORT')!==side) continue;
    const entry=bars[i+1].o;
    const stop=up?orLow:orHigh;
    const risk=up?entry-stop:stop-entry;
    // A next-candle gap through the opposite opening-range boundary is invalidated.
    if(risk<=0 || !Number.isFinite(risk))return {rejected:true};
    return {side,signalTime:bars[i].t+FIVE,entryTime:bars[i+1].t,entry,stop,risk,
      target1:entry+(up?1:-1)*risk,target2:entry+(up?2:-2)*risk,entryIndex:i+1,
      orHigh,orLow};
  }
  return null;
}
function closeTrade(bars,chosen,date) {
  const long=chosen.side==='LONG',target=chosen.target2,stop=chosen.stop;
  let exit,exitTime,reason='SESSION CLOSE',hitT1=false;
  for(let j=chosen.entryIndex;j<bars.length;j++){
    const b=bars[j];
    // Favorable target fill is at limit; adverse stop gaps use actual bar open.
    const gapStop=long?b.o<=stop:b.o>=stop;
    const gapTarget=long?b.o>=target:b.o<=target;
    const stopHit=long?b.l<=stop:b.h>=stop;
    const targetHit=long?b.h>=target:b.l<=target;
    if(long?b.h>=chosen.target1:b.l<=chosen.target1) hitT1=true;
    if(gapStop){exit=b.o;reason='STOP GAP';}
    else if(gapTarget){exit=target;reason='TARGET 2R';}
    else if(stopHit){exit=stop;reason=targetHit?'STOP (SAME BAR AMBIGUITY)':'STOP';}
    else if(targetHit){exit=target;reason='TARGET 2R';}
    if(exit!==undefined){exitTime=b.t+FIVE;break;}
  }
  if(exit===undefined){exit=bars.at(-1).c;exitTime=bars.at(-1).t+FIVE;}
  const pnlPoints=(long?1:-1)*(exit-chosen.entry),r=pnlPoints/chosen.risk;
  return {date,side:chosen.side,signalTime:new Date(chosen.signalTime*1000).toISOString(),
    entryTime:new Date(chosen.entryTime*1000).toISOString(),exitTime:new Date(exitTime*1000).toISOString(),
    entry:round(chosen.entry),stop:round(chosen.stop),target1:round(chosen.target1),
    target2:round(chosen.target2),exit:round(exit),riskPoints:round(chosen.risk),
    pnlPoints:round(pnlPoints),r:round(r,4),result:pnlPoints>0?'WIN':pnlPoints<0?'LOSS':'FLAT',
    exitReason:reason,hitTarget1:hitT1};
}
function evaluate(bars,{from,to,mode='both'}) {
  if(!['both','long','short'].includes(mode))throw new Error('Invalid direction');
  const grouped=groupBySession(bars,from,to);
  if(!grouped.length)throw new Error('Upstox returned no index candles for the chosen historical dates');
  const trades=[];
  const skipped={missingCandles:0,noBreakout:0,invalidEntry:0};
  for(const {date,bars:session} of grouped){
    if(!validSession(session)){skipped.missingCandles++;continue;}
    const entry=selectEntry(session,mode);
    if(!entry){skipped.noBreakout++;continue;}
    if(entry.rejected){skipped.invalidEntry++;continue;}
    trades.push(closeTrade(session,entry,date));
  }
  const wins=trades.filter(t=>t.pnlPoints>0),losses=trades.filter(t=>t.pnlPoints<0);
  let equity=0,peak=0,drawdown=0;
  const equityCurve=trades.map(t=>{equity+=t.r;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);return {date:t.date,cumulativeR:round(equity,3)};});
  const grossWin=wins.reduce((n,t)=>n+t.r,0),grossLoss=Math.abs(losses.reduce((n,t)=>n+t.r,0));
  return {instrument:'NSE_INDEX|Nifty 50',strategy:'First 15m ORB (09:15–09:30); 5m close confirms; next open entry; opposite OR stop; 2R target; session exit',
    from,to,mode,sessionCount:grouped.length,validSessions:grouped.length-skipped.missingCandles,skipped,
    summary:{trades:trades.length,wins:wins.length,losses:losses.length,flat:trades.length-wins.length-losses.length,
      winRate:trades.length?round(wins.length/trades.length*100,1):null,
      netR:round(equity,3),avgR:trades.length?round(equity/trades.length,3):null,
      maxDrawdownR:round(drawdown,3),profitFactor:grossLoss?round(grossWin/grossLoss,2):null,
      grossIndexPoints:round(trades.reduce((n,t)=>n+t.pnlPoints,0))},
    equityCurve,trades,
    assumptions:['Historical NIFTY 50 spot-index 5-minute candles, not executable NIFTY or CE/PE prices.',
      'First qualifying close after the opening range; next 5-minute candle OPEN entry; one trade maximum per complete day.',
      'Conservative stop-first if stop and target hit inside the same 5-minute candle; adverse gap exit at bar open.',
      'Stops and targets are hypothetical; no brokerage, taxes, spreads, slippage or realistic intrabar tick sequence.',
      'Only full regular sessions with all 75 completed 5-minute candles are counted; missing sessions are skipped.',
      'Backtested performance is not a forecast or a guarantee.']};
}
async function runBacktest(from,to,mode='both',now=new Date()) {
  validateRange(from,to,now);
  const key=encodeURIComponent(INSTRUMENT_KEY);
  const data=await upstoxGet(`/v3/historical-candle/${key}/minutes/5/${to}/${from}`);
  const bars=indexCandleRows(data.candles);
  return {...evaluate(bars,{from,to,mode}),provider:'Upstox V3',retrievedAt:new Date().toISOString()};
}
module.exports={validateRange,groupBySession,validSession,selectEntry,closeTrade,evaluate,runBacktest,dayOffset};
