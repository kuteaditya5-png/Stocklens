'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/nifty_2026-11-06_5m.json');
const {outcome,wilson,summarizeHistorical,fullDay,historicalTargetOdds,MIN_SAMPLE,shiftDate}=require('../lib/target-odds');
const {evaluateEvents}=require('../lib/rolling-breakouts');
const {detectSetups}=require('../lib/nifty-index');
const api=require('../api/target-stats');
function trade(dir='UP'){
 const sign=dir==='UP'?1:-1;
 return {index:0,direction:dir,entry:100,stop:100-10*sign,target1:100+10*sign,target2:100+20*sign};
}
function barsFrom(vals){
 const t=Date.parse('2026-11-06T09:15:00+05:30')/1000;
 return [{t,o:100,h:101,l:99,c:100},...vals.map((v,i)=>({t:t+(i+1)*300,o:100,h:v[0],l:v[1],c:100}))];
}
function padded(d){
 const first=Date.parse(d+'T09:15:00+05:30')/1000;
 const shift=first-fixture[0].t;
 const copy=fixture.map(b=>({...b,t:b.t+shift}));
 for(let i=copy.length;i<75;i++)copy.push({t:first+i*300,o:24680,h:24681,l:24679,c:24680,v:0});
 return copy;
}
test('T1 reached before stop counts for T1 but not T2',()=>{
 const b=barsFrom([[111,99],[109,89],...Array(4).fill([101,99])]);
 assert.deepEqual(outcome(trade(),b),{t1:true,t2:false,stopped:true});
});
test('T2 target hit alone counts both targets',()=>{
 const b=barsFrom([[121,99],...Array(5).fill([101,99])]);
 assert.deepEqual(outcome(trade(),b),{t1:true,t2:true,stopped:false});
});
test('same five-minute candle hits stop and target: stop first, no credited win',()=>{
 const b=barsFrom([[121,89],...Array(5).fill([101,99])]);
 assert.deepEqual(outcome(trade(),b),{t1:false,t2:false,stopped:true});
});
test('PE breakdown target hit is evaluated in falling direction',()=>{
 const b=barsFrom([[101,79],...Array(5).fill([101,99])]);
 assert.deepEqual(outcome(trade('DOWN'),b),{t1:true,t2:true,stopped:false});
});
test('cannot evaluate a setup unless six later completed candles exist',()=>{
 assert.equal(outcome(trade(),barsFrom([[111,99]])),null);
});
test('Wilson interval is bounded and is not fabricated with no samples',()=>{
 assert.equal(wilson(0,0),null);
 const ci=wilson(15,30);assert.ok(ci[0]>=0&&ci[0]<50&&ci[1]>50&&ci[1]<=100);
});
test('incomplete sessions are skipped, no fake historical target-hit percentages',()=>{
 const r=summarizeHistorical(fixture,{from:'2026-11-06',to:'2026-11-06'});
 assert.equal(r.validSessions,0);assert.equal(r.skippedSessions,1);
 for(const x of Object.values(r.groups)){assert.equal(x.samples,0);assert.equal(x.t1Rate,null);assert.equal(x.t2Rate,null);}
});
test('complete 75-bar day with exact v1.7 signals contributes historical samples',()=>{
 const full=padded('2026-11-06');assert.equal(fullDay(full),true);
 const rolling=evaluateEvents(full),orb=detectSetups(full,24539.2,24388.05);
 assert.ok(rolling.length>=6);assert.ok(orb.length>=1);
 const r=summarizeHistorical(full,{from:'2026-11-06',to:'2026-11-06'});
 assert.equal(r.validSessions,1);
 assert.ok(r.groups['ROLLING_6|ROLLING BREAKOUT · BULLISH'].samples>=1);
 assert.equal(r.groups['ROLLING_6|ROLLING BREAKOUT · BULLISH'].t1Rate,null);
});
test('same setup across 32 independent synthetic sessions crosses minimum sample gate',()=>{
 const all=[];for(let i=1;i<=32;i++)all.push(...padded(shiftDate('2026-11-06',-i)));
 const start=shiftDate('2026-11-06',-32),end=shiftDate('2026-11-06',-1);
 const a=summarizeHistorical(all,{from:start,to:end,marketId:'nifty'});
 const b=summarizeHistorical(all,{from:start,to:end,marketId:'sensex'});
 assert.equal(a.validSessions,32);assert.equal(b.validSessions,32);
 const e=a.groups['ROLLING_6|ROLLING BREAKOUT · BULLISH'];
 assert.ok(e.samples>=MIN_SAMPLE);assert.ok(typeof e.t1Rate==='number');assert.ok(typeof e.t2Rate==='number');
 assert.ok(e.t2Hits<=e.t1Hits);
 assert.equal(a.instrument,'NSE_INDEX|Nifty 50');assert.equal(b.instrument,'BSE_INDEX|SENSEX');
});
test('historical API requests four ≤28-day Upstox V3 windows and caches the response',async()=>{
 const oldToken=process.env.UPSTOX_ACCESS_TOKEN,oldFetch=global.fetch;
 process.env.UPSTOX_ACCESS_TOKEN='offline-token';
 const urls=[];
 global.fetch=async u=>{
   urls.push(String(u));
   return {ok:true,json:async()=>({status:'success',data:{candles:padded('2026-11-06').map(b=>[
     new Date(b.t*1000).toISOString(),b.o,b.h,b.l,b.c,null,0])}})};
 };
 try{
   const now=new Date('2026-11-07T12:00:00+05:30');
   const a=await historicalTargetOdds('nifty',now);
   const b=await historicalTargetOdds('nifty',now);
   assert.equal(urls.length,4);assert.equal(a,b);
   assert.equal(a.validSessions,1);
   for(const url of urls){
     assert.match(url,/\/v3\/historical-candle\/NSE_INDEX%7CNifty%2050\/minutes\/5\//);
     const m=url.match(/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/);
     assert.ok(m);assert.equal((Date.parse(m[1])-Date.parse(m[2]))/86400000,27);
   }
 }finally{
   global.fetch=oldFetch;
   if(oldToken===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=oldToken;
 }
});
test('GET /api/target-stats obeys the same optional private dashboard access key',async()=>{
 const old=process.env.STOCKLENS_ACCESS_KEY;process.env.STOCKLENS_ACCESS_KEY='test-only';
 let response;const res={statusCode:200,setHeader(){},end(s){response=JSON.parse(s)}};
 try{await api({method:'GET',url:'/api/target-stats?market=nifty',headers:{}},res);
   assert.equal(res.statusCode,401);assert.equal(response.code,'STOCKLENS_ACCESS_REQUIRED');}
 finally{if(old===undefined)delete process.env.STOCKLENS_ACCESS_KEY;else process.env.STOCKLENS_ACCESS_KEY=old;}
});
test('new dashboard includes all rolling watch, target percent placeholders and loading assets',()=>{
 const fs=require('fs');const html=fs.readFileSync('public/index.html','utf8');
 for(const id of ['rollingStatus','rollingUp','rollingDown','rollingBanner','rollingLatest','rollingRows',
  'targetT1Pct','targetT2Pct','targetSamples','targetEvidenceNote','targetEvidenceSetup'])
  assert.ok(html.includes(`id="${id}"`),id);
 const build=fs.readFileSync('scripts/build.js','utf8');
 assert.ok(build.includes('api/target-stats.js'));assert.ok(build.includes('lib/target-odds.js'));
});
