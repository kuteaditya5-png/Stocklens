const test=require('node:test'),assert=require('node:assert/strict');
const {validateRange,evaluate,runBacktest,dayOffset}=require('../lib/backtest');
const api=require('../api/backtest');
const day='2026-10-13';
function session(date,dir='UP',exitKind='TARGET'){
  const rows=[];let price=100;
  for(let i=0;i<75;i++){
    let o=100,h=102,l=98,c=100;
    if(i===3){o=100;h=dir==='UP'?104:101;l=dir==='UP'?99:96;c=dir==='UP'?103:97;}
    if(i===4){o=dir==='UP'?103:97;h=dir==='UP'?104:98;l=dir==='UP'?102:96;c=o;}
    if(i===5){o=dir==='UP'?103:97;
      if(exitKind==='TARGET'){h=dir==='UP'?114:98;l=dir==='UP'?102:86;c=dir==='UP'?112:88;}
      else if(exitKind==='STOP'){h=dir==='UP'?104:103;l=dir==='UP'?97:96;c=dir==='UP'?98:102;}
      else if(exitKind==='AMBIGUOUS'){h=dir==='UP'?114:103;l=dir==='UP'?97:86;c=100;}
      else {h=103;l=97;c=100;}
    }
    if(i>=6){o=c=100;h=101;l=99;}
    const ts=Date.parse(date+'T09:15:00+05:30')+i*300000;
    rows.push({t:ts/1000,o,h,l,c,v:0});
  }
  return rows;
}
test('date boundaries restrict to historic 28 days and exclude current date',()=>{
 assert.equal(validateRange('2026-10-01','2026-10-28',new Date('2026-10-29T10:00:00+05:30')).calendarDays,28);
 assert.throws(()=>validateRange('2026-10-01','2026-10-29',new Date('2026-10-29T10:00:00+05:30')));
 assert.throws(()=>validateRange('2026-09-01','2026-10-28',new Date('2026-10-29T10:00:00+05:30')));
 assert.throws(()=>validateRange('2026-02-31','2026-03-01',new Date('2026-10-29T10:00:00+05:30')));
});
test('long breakout enters at NEXT five-minute open and exits at 2R',()=>{
 const e=evaluate(session(day),{from:day,to:day});assert.equal(e.summary.trades,1);
 const t=e.trades[0];assert.equal(t.side,'LONG');assert.equal(t.entry,103);assert.equal(t.stop,98);assert.equal(t.target2,113);assert.equal(t.pnlPoints,10);assert.equal(t.r,2);assert.equal(t.result,'WIN');assert.equal(t.entryTime,'2026-10-13T04:05:00.000Z');
});
test('short breakdown enters next bar and scores target, not options P&L',()=>{
 const e=evaluate(session(day,'DOWN'),{from:day,to:day});assert.equal(e.trades[0].side,'SHORT');assert.equal(e.trades[0].entry,97);assert.equal(e.trades[0].stop,102);assert.equal(e.trades[0].target2,87);assert.equal(e.trades[0].r,2);
});
test('ambiguous same candle uses stop first to avoid inflated wins',()=>{
 const e=evaluate(session(day,'UP','AMBIGUOUS'),{from:day,to:day});assert.equal(e.summary.losses,1);assert.equal(e.trades[0].exitReason,'STOP (SAME BAR AMBIGUITY)');assert.equal(e.trades[0].r,-1);
});
test('partial sessions are excluded rather than invented',()=>{
 const e=evaluate(session(day).slice(0,50),{from:day,to:day});assert.equal(e.validSessions,0);assert.equal(e.summary.trades,0);assert.equal(e.skipped.missingCandles,1);
});
test('only one breakout per day, future-bar lookahead not used',()=>{
 const e=evaluate(session(day,'UP','STOP'),{from:day,to:day});assert.equal(e.summary.trades,1);assert.equal(e.summary.losses,1);
});
test('backtest api enforces private access key before historical fetch',async()=>{
 const prev=process.env.STOCKLENS_ACCESS_KEY;process.env.STOCKLENS_ACCESS_KEY='test-secret';
 let result;const res={statusCode:200,setHeader(){},end(s){result=JSON.parse(s)}};
 try{await api({method:'GET',url:'/api/backtest?from=2026-10-01&to=2026-10-10',headers:{}},res);assert.equal(res.statusCode,401);assert.equal(result.code,'STOCKLENS_ACCESS_REQUIRED');}
 finally{if(prev===undefined)delete process.env.STOCKLENS_ACCESS_KEY;else process.env.STOCKLENS_ACCESS_KEY=prev;}
});
test('historical route requests Nifty index V3 5m with date bounds',async()=>{
 const old=process.env.UPSTOX_ACCESS_TOKEN,oldFetch=global.fetch;process.env.UPSTOX_ACCESS_TOKEN='test';let url='';
 global.fetch=async u=>{url=String(u);return {ok:true,json:async()=>({status:'success',data:{candles:session(day).map(b=>[new Date(b.t*1000).toISOString(),b.o,b.h,b.l,b.c,null,0])}})}};
 try{const d=await runBacktest('2026-10-10','2026-10-20','both',new Date('2026-10-29T10:00:00+05:30'));assert.match(url,/\/v3\/historical-candle\/NSE_INDEX%7CNifty%2050\/minutes\/5\/2026-10-20\/2026-10-10/);assert.equal(d.trades.length,1);}
 finally{global.fetch=oldFetch;if(old===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=old;}
});
