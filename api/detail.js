const {getUniverse}=require('../lib/universe');
const {chart}=require('../lib/yahoo');
const {analyzeDaily,intradayOrb,makePlan,atr,isIndianCashSession}=require('../lib/indicators');
const {send,onlyGet,params}=require('../lib/http');
module.exports=async (req,res)=>{
  if(!onlyGet(req,res))return;
  const p=params(req),symbol=String(p.get('symbol')||'').toUpperCase();
  const capital=Number(p.get('capital')||100000),risk=Number(p.get('risk')||1);
  if(!/^[A-Z0-9&-]{2,20}$/.test(symbol)||!Number.isFinite(capital)||capital<1000||capital>1e9||!Number.isFinite(risk)||risk<0.1||risk>3) return send(res,400,{status:'error',message:'Invalid symbol/capital/risk'});
  try {
    const universe=await getUniverse();
    const stock=universe.stocks.find(s=>s.symbol===symbol);
    if(!stock)return send(res,404,{status:'error',message:'Ticker is not in the current NIFTY 50/SENSEX universe'});
    const [daily,intraday]=await Promise.allSettled([chart(symbol+'.NS','3mo','1d'),chart(symbol+'.NS','5d','5m')]);
    if(daily.status==='rejected') return send(res,503,{status:'error',message:'Daily market data unavailable: '+daily.reason.message});
    const dailyBars=daily.value.bars;
    const score=analyzeDaily(symbol,dailyBars,daily.value.meta);
    const intradayBars=intraday.status==='fulfilled'?intraday.value.bars:[];
    const orb=intradayOrb(intradayBars);
    const plan=makePlan(dailyBars,orb,score,capital,risk);
    send(res,200,{status:intraday.status==='rejected'?'partial':'success',data:{stock,score,
      orb,plan,atr14:atr(dailyBars),marketOpen:isIndianCashSession(),
      daily:dailyBars.slice(-65),intraday:intradayBars.slice(-78),
      warning:intraday.status==='rejected'?intraday.reason.message:null,
      note:'Unofficial data may be delayed and occasionally unavailable. All trade levels are educational and illustrative.'}});
  } catch(e){send(res,503,{status:'error',message:e.message});}
};
