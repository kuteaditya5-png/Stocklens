const test=require('node:test'),assert=require('node:assert/strict');
const {indexCandleRows,ema,computeNiftySession,INSTRUMENT_KEY,getNiftyIndex}=require('../lib/nifty-index');
const indexApi=require('../api/index');
const at=t=>Date.parse('2026-10-29T'+t+':00+05:30')/1000;
const line=(t,o,h,l,c)=>({t:at(t),o,h,l,c,v:0});
const daily=[{t:Date.parse('2026-10-28T15:30:00+05:30')/1000,o:24500,h:24600,l:24400,c:24550,v:0}];
const mock=[line('09:15',24555,24580,24540,24575),line('09:20',24575,24590,24565,24588),line('09:25',24588,24600,24580,24592),line('09:30',24592,24620,24590,24610)];
test('Upstox uses verified NIFTY 50 index instrument, not constituent equities',()=>assert.equal(INSTRUMENT_KEY,'NSE_INDEX|Nifty 50'));
test('index spot candles allow null or zero volume, sort by start time',()=>{const rows=indexCandleRows([
 ['2026-10-29T09:20:00+05:30',24500,24510,24490,24505,null,0],
 ['2026-10-29T09:15:00+05:30',24490,24500,24480,24499,0,0]]);
 assert.equal(rows.length,2);assert.equal(rows[0].o,24490);assert.equal(rows[1].v,0);
});
test('opening range is exactly 09:15-09:30 IST',()=>{const r=computeNiftySession(mock,daily,new Date('2026-10-29T09:36:00+05:30'));assert.equal(r.orb.high,24600);assert.equal(r.orb.low,24540);assert.equal(r.signal,'BULLISH BREAKOUT');assert.equal(r.levels.entry,24610);assert.equal(r.levels.stop,24540);assert.equal(r.levels.target1,24680);assert.equal(r.levels.target2,24750);assert.equal(r.previousClose,24550);});
test('ignore unfinished candle and avoid bullish breakout before 09:35',()=>{const r=computeNiftySession(mock,daily,new Date('2026-10-29T09:33:00+05:30'));assert.equal(r.candleCount,3);assert.equal(r.orb.ready,true);assert.equal(r.signal,'WAIT');});
test('old session never shows live buy or sell signal even with breakout',()=>{const r=computeNiftySession(mock,daily,new Date('2026-10-30T11:00:00+05:30'));assert.equal(r.signal,'NO LIVE SIGNAL');assert.equal(r.levels,null);assert.equal(r.fresh,false);});
test('missing 09:15 bar does not invent ORB',()=>{const r=computeNiftySession(mock.slice(1),daily,new Date('2026-10-29T09:36:00+05:30'));assert.equal(r.orb.ready,false);assert.equal(r.signal,'WAIT');});
test('recent completed close can confirm downside breakdown',()=>{const rows=[...mock.slice(0,3),line('09:30',24590,24590,24515,24520)];const r=computeNiftySession(rows,daily,new Date('2026-10-29T09:36:00+05:30'));assert.equal(r.signal,'BEARISH BREAKDOWN');assert.equal(r.levels.direction,'DOWN');assert.equal(r.levels.stop,24600);});
test('technical indicators are computed from intraday completed closes, no synthetic',()=>{assert.equal(ema(Array.from({length:9},()=>100),9),100);assert.equal(ema([1,2,3],9),null);const r=computeNiftySession(mock,daily,new Date('2026-10-29T09:36:00+05:30'));assert.equal(r.indicators.rsi14,null);});
test('index endpoint rejects unsupported method and protects data route',async()=>{
 let done;const res={statusCode:200,setHeader(){},end(v){done=JSON.parse(v)}};
 await indexApi({method:'POST',url:'/api/index',headers:{}},res);assert.equal(res.statusCode,405);
 const old=process.env.STOCKLENS_ACCESS_KEY;process.env.STOCKLENS_ACCESS_KEY='test-only-access-key';
 try{await indexApi({method:'GET',url:'/api/index',headers:{}},res);assert.equal(res.statusCode,401);assert.equal(done.code,'STOCKLENS_ACCESS_REQUIRED');}
 finally{if(old===undefined)delete process.env.STOCKLENS_ACCESS_KEY;else process.env.STOCKLENS_ACCESS_KEY=old;}
});
test('index provider calls NSE_INDEX directly and never asks for NSE_EQ instruments',async()=>{
 const old=process.env.UPSTOX_ACCESS_TOKEN,fetchOld=global.fetch;
 process.env.UPSTOX_ACCESS_TOKEN='test-token';
 const calls=[];global.fetch=async (url,opts)=>{calls.push(String(url));return {ok:true,json:async()=>({status:'success',data:{candles:String(url).includes('days')?[
 ['2026-10-28T15:30:00+05:30',24500,24600,24400,24550,0,0]]:mock.map(b=>[new Date(b.t*1000).toISOString(),b.o,b.h,b.l,b.c,null,0])}})};};
 try{const r=await getNiftyIndex(new Date('2026-10-29T09:36:00+05:30'));assert.equal(r.signal,'BULLISH BREAKOUT');assert.equal(calls.length,2);assert.ok(calls.every(u=>u.includes('NSE_INDEX%7CNifty%2050')));}
 finally{global.fetch=fetchOld;if(old===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=old;}
});
