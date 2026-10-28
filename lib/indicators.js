const round = (n, digits=2) => Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
function sma(v, len) { return v.length < len ? null : v.slice(-len).reduce((a,b)=>a+b,0)/len; }
function rsi(closes, period=14) {
  if(closes.length <= period) return null;
  let gain=0, loss=0;
  for(let i=1;i<=period;i++) { const d=closes[i]-closes[i-1]; gain+=Math.max(d,0); loss+=Math.max(-d,0); }
  gain/=period; loss/=period;
  for(let i=period+1;i<closes.length;i++) { const d=closes[i]-closes[i-1]; gain=(gain*(period-1)+Math.max(d,0))/period; loss=(loss*(period-1)+Math.max(-d,0))/period; }
  if(loss===0) return gain===0?50:100;
  return 100-100/(1+gain/loss);
}
function atr(bars, period=14) {
  const tr=[];
  for(let i=1;i<bars.length;i++) {
    const b=bars[i], p=bars[i-1];
    if (![b.h,b.l,p.c].every(Number.isFinite)) continue;
    tr.push(Math.max(b.h-b.l,Math.abs(b.h-p.c),Math.abs(b.l-p.c)));
  }
  if(tr.length<period)return null;
  let a=tr.slice(0,period).reduce((n,x)=>n+x,0)/period;
  for(let i=period;i<tr.length;i++)a=(a*(period-1)+tr[i])/period;
  return a;
}
function todayIST(date) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
function timeIST(date) { return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(date); }
function isIndianCashSession(date=new Date()) {
  const wd=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'short'}).format(date);
  const hm=timeIST(date); return wd!=='Sat'&&wd!=='Sun'&&hm>='09:15'&&hm<'15:30';
}
function completeDailyBars(bars, now=new Date()) {
  if(!bars.length)return [];
  let copy=bars.slice();
  const last=copy[copy.length-1];
  // Only use fully closed daily candles. On exchange holidays this is harmless.
  if(todayIST(new Date(last.t*1000))===todayIST(now) && timeIST(now)<'15:40') copy.pop();
  return copy;
}
function analyzeDaily(symbol, bars, meta={}, now=new Date()) {
  const closed=completeDailyBars(bars,now);
  const close=closed.map(b=>b.c), latest=close.at(-1);
  if(close.length < 30 || !Number.isFinite(latest)) return null;
  const ma20=sma(close,20), ma50=sma(close,50), rv=rsi(close), priorRsi=rsi(close.slice(0,-1));
  const hi20=Math.max(...close.slice(-21,-1));
  const change5=close.length>=6 ? ((latest/close.at(-6)-1)*100) : 0;
  const ret= (meta.regularMarketPrice>0 ? meta.regularMarketPrice : latest);
  const previous=meta.chartPreviousClose || meta.previousClose || close.at(-2);
  const change=(ret/previous-1)*100;
  const breakout=latest>hi20;
  const reclaim=close.length>=21 && close.at(-2)<sma(close.slice(0,-1),20) && latest>ma20;
  const rebound=priorRsi!=null && priorRsi<30 && rv>=30;
  const trending=ma50!=null && latest>ma20 && ma20>ma50;
  let setup='NO SETUP';
  if(breakout) setup='20D BREAKOUT';
  else if(rebound) setup='RSI REBOUND';
  else if(reclaim) setup='MA20 RECLAIM';
  else if(trending) setup='UPTREND';
  const positives=[
    {good:latest>ma20, weight:22, title:'Close above 20-day MA'},
    {good:ma50!=null&&ma20>ma50, weight:18, title:'20-day MA above 50-day'},
    {good:rv>=48&&rv<=72, weight:14, title:'RSI in constructive range'},
    {good:change5>1, weight:12, title:'Positive five-day momentum'},
    {good:breakout, weight:18, title:'Confirmed 20-day closing breakout'},
    {good:reclaim||rebound, weight:12, title:'Reclaim or RSI recovery'},
    {good:latest>close.at(-2), weight:4, title:'Last session positive'}
  ];
  let score=positives.reduce((n,p)=>n+(p.good?p.weight:0),0);
  const signal=score>=70&&setup!=='NO SETUP'?'WATCH':score<35?'WEAK':'WAIT';
  const reasons=positives.filter(p=>p.good).map(p=>p.title);
  return {symbol, price:round(ret), close:round(latest), changePct:round(change), score,
    signal, setup, rsi:round(rv,1), ma20:round(ma20), ma50:round(ma50), change5:round(change5),
    asOf:new Date(closed.at(-1).t*1000).toISOString(), priceTime:meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,
    currency:'INR', reasons, note:'Score uses completed daily closes; current price may be delayed.'};
}
function intradayOrb(bars, now=new Date()) {
  if(!bars.length) return {status:'UNAVAILABLE',message:'No intraday candles'};
  const day=todayIST(new Date(bars.at(-1).t*1000));
  const dayBars=bars.filter(b=>todayIST(new Date(b.t*1000))===day)
    .filter(b=>timeIST(new Date(b.t*1000))>='09:15'&&timeIST(new Date(b.t*1000))<'15:30')
    .filter(b=>Number.isFinite(b.c)&&Number.isFinite(b.h)&&Number.isFinite(b.l))
    .filter(b=>new Date(b.t*1000+5*60*1000)<=now);
  const range=dayBars.filter(b=>timeIST(new Date(b.t*1000))<'09:30');
  if(range.length!==3) return {status:'PENDING',date:day,message:'15-minute opening range not complete or missing bars'};
  const high=Math.max(...range.map(b=>b.h)),low=Math.min(...range.map(b=>b.l));
  const after=dayBars.filter(b=>timeIST(new Date(b.t*1000))>='09:30');
  const hit=after.find(b=>b.c>high);
  return {status:hit?'TRIGGERED': 'WAITING',date:day,high:round(high),low:round(low),
    breakoutPrice:hit?round(hit.c):null, breakoutTime:hit?new Date((hit.t+300)*1000).toISOString():null,
    message:hit?'A completed 5-minute candle closed above opening-range high':'No confirmed close above opening-range high'};
}
function makePlan(dailyBars,intra,quote,capital=100000,riskPct=1) {
  const completed=completeDailyBars(dailyBars), volatility=atr(completed);
  const price=quote?.price || completed.at(-1)?.c;
  if (!volatility || !price || price<=0) return null;
  // Indicative stop, not an exchange order. Uses actual daily OHLC-based ATR.
  const riskUnit=Math.max(volatility*1.25,price*0.004);
  const stop=round(price-riskUnit);
  const risk=price-stop;
  if(risk<=0)return null;
  const qty=Math.max(0,Math.floor(Math.min((capital*0.25)/price,(capital*riskPct/100)/risk)));
  return {entry:round(price),stop,targets:[1.5,2.5,3.5].map(r=>round(price+r*risk)),
    rr:[1.5,2.5,3.5],atr14:round(volatility),riskPerShare:round(risk),riskPct:round(100*risk/price),
    qty,invested:round(qty*price),maxPlannedLoss:round(qty*risk),
    estimatedProfit:[1.5,2.5,3.5].map(r=>round(qty*risk*r)),
    qualified:quote?.score>=70&&intra?.status==='TRIGGERED'&&intra.date===todayIST(new Date())&&isIndianCashSession(),
    caution:'Indicative levels from ATR; no execution, no guarantee of stop fill. Costs, slippage and taxes excluded.'};
}
module.exports={round,sma,rsi,atr,todayIST,timeIST,isIndianCashSession,completeDailyBars,analyzeDaily,intradayOrb,makePlan};
