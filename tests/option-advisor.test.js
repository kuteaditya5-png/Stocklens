const test=require('node:test'),assert=require('node:assert/strict');
const {assessIndex,planChoices,eligibleCandidate,pricePlan,latestCompletedOptionBars,getOptionAdvice,MIN_TARGET_POINTS}=require('../lib/option-advisor');
const api=require('../api/option-advisor');
const date='2026-11-02',now=new Date('2026-11-02T04:10:30Z'); // 09:40:30 IST
const start=Date.parse('2026-11-02T09:15:00+05:30')/1000;
function candle(i,o,h,l,c){return {t:start+i*300,o,h,l,c,v:1000};}
function index(){return {last:25050,marketHours:true,isCurrentSession:true,fresh:true,
 orb:{ready:true,high:25060,low:24960},signal:'BULLISH BREAKOUT',
 setup:{name:'BULLISH BREAKOUT',direction:'UP',isNew:true,state:'NEW',candleTime:new Date((start+4*300)*1000).toISOString()},
 candles:[candle(0,25000,25040,24980,25020),candle(1,25020,25060,25000,25030),
 candle(2,25030,25050,24960,25020),candle(3,25020,25070,25010,25065)]};}
// latest candle at 9:30 closes 9:35; current time 9:40:30.
function optionCandles(){return [candle(0,115,121,111,117),candle(1,117,123,113,119),candle(2,119,124,115,121),candle(3,121,125,117,120)];}
const key='NSE_FO|54321';
function chain(opts={}){return [{expiry:'2026-11-03',strike_price:25050,underlying_spot_price:25050,
 call_options:{instrument_key:key,market_data:{ask_price:120,bid_price:119,ltp:120,volume:50000,oi:250000,bid_qty:1500,ask_qty:1500,...opts.market},
 option_greeks:{delta:.6,gamma:.001,theta:-15,iv:15,...opts.greeks}},
 put_options:{instrument_key:'NSE_FO|98765',market_data:{ask_price:110,bid_price:109,volume:300,oi:1000},option_greeks:{delta:-.5}}}];}
function contracts(){return [{instrument_key:key,instrument_type:'CE',strike_price:25050,lot_size:65,tick_size:5,trading_symbol:'NIFTY 25050 CE 03 NOV 26'}];}
function choose(idx=index(),ch=chain(),history=optionCandles(),t=now){return planChoices(idx,ch,contracts(),{[key]:history},t);}
test('Minimum +35 option points hard-coded, not index points',()=>assert.equal(MIN_TARGET_POINTS,35));
test('Early new 09:35 breakout can be evaluated without 14 completed ATR bars',()=>{
 assert.equal(assessIndex(index(),now),null);
 const d=choose();assert.equal(d.status,'WATCH');assert.equal(d.selected.side,'CE');
 assert.equal(d.selected.expiry,'2026-11-03');assert.equal(d.selected.lotSize,65);
 assert.equal(d.selected.entry,120);assert.equal(d.selected.target1,155);assert.ok(d.selected.rewardRisk>=1.5);
 assert.equal(d.exchangeQuoteTimestampVerified,false);assert.equal(d.selected.limitedHistory,true);
});
test('No new completed breakout -> WAIT',()=>{const i=index();i.setup.isNew=false;assert.match(assessIndex(i,now),/not new/);assert.equal(choose(i).status,'WAIT');});
test('Index stale and market closed -> WAIT',()=>{const i=index();i.fresh=false;assert.equal(choose(i).status,'WAIT');});
test('Only market data with real bid ask greeks liquidity qualifies',()=>{
 assert.equal(eligibleCandidate(chain({greeks:{delta:null}})[0],contracts()[0],'CE',25050),null);
 assert.equal(eligibleCandidate(chain({market:{bid_price:100}})[0],contracts()[0],'CE',25050),null);
 assert.equal(eligibleCandidate(chain({market:{volume:0}})[0],contracts()[0],'CE',25050),null);
 assert.equal(eligibleCandidate(chain()[0],{...contracts()[0],lot_size:0},'CE',25050),null);
});
test('Reject +35 when scenario gain is too small',()=>{
 const x=index();x.orb={ready:true,high:25060,low:25040};x.candles=[
 candle(0,25050,25060,25040,25050),candle(1,25050,25058,25042,25050),
 candle(2,25050,25058,25044,25050),candle(3,25050,25070,25048,25065)];
 const result=choose(x);assert.equal(result.status,'WAIT');assert.match(result.reason,/35/);
});
test('Reject option candle older than fifteen minutes',()=>{
 const t=new Date('2026-11-02T04:28:00Z');const idx=index();
 const c=eligibleCandidate(chain()[0],contracts()[0],'CE',25050);
 assert.equal(pricePlan(c,idx,optionCandles(),t),null);
});
test('Option candle parser requires complete bar and current session',()=>{
 const rows=optionCandles().map(c=>[new Date(c.t*1000).toISOString(),c.o,c.h,c.l,c.c,c.v,0]);
 rows.push(['2026-11-02T04:10:00Z',120,130,120,125,500,0]);
 assert.equal(latestCompletedOptionBars(rows,now).length,4);
});
test('Option advisor endpoint enforces StockLens private access before API',async()=>{
 const old=process.env.STOCKLENS_ACCESS_KEY;process.env.STOCKLENS_ACCESS_KEY='unit-test-secret';
 let sent;const res={statusCode:200,setHeader(){},end(s){sent=JSON.parse(s)}};
 try {await api({method:'GET',url:'/api/option-advisor',headers:{}},res);
 assert.equal(res.statusCode,401);assert.equal(sent.code,'STOCKLENS_ACCESS_REQUIRED');}
 finally{if(old===undefined)delete process.env.STOCKLENS_ACCESS_KEY;else process.env.STOCKLENS_ACCESS_KEY=old;}
});


test('End-to-end option advisor obtains real Upstox index, option chain, contracts and option candles',async()=>{
 const original=global.fetch,oldToken=process.env.UPSTOX_ACCESS_TOKEN,urls=[];
 process.env.UPSTOX_ACCESS_TOKEN='unit-test-token';
 const i=index(),op=optionCandles();
 const rows=items=>items.map(b=>[new Date(b.t*1000).toISOString(),b.o,b.h,b.l,b.c,b.v,0]);
 global.fetch=async u=>{
   const url=String(u);urls.push(url);
   let payload;
   if(url.includes('/v2/option/chain'))payload=chain();
   else if(url.includes('/v2/option/contract'))payload=contracts();
   else if(url.includes('/intraday/NSE_INDEX'))payload={candles:rows(i.candles)};
   else if(url.includes('/intraday/NSE_FO'))payload={candles:rows(op)};
   else if(url.includes('/days/1/'))payload={candles:[['2026-10-30T09:15:00+05:30',25000,25100,24900,25000,0,0]]};
   else throw Error('Unexpected Upstox URL '+url);
   return {ok:true,json:async()=>({status:'success',data:payload})};
 };
 try {const result=await getOptionAdvice(now);
   assert.equal(result.status,'WATCH');assert.equal(result.selected.target1,155);
   assert.ok(urls.some(u=>u.includes('/v2/option/chain?')));
   assert.ok(urls.some(u=>u.includes('/v2/option/contract?')));
   assert.ok(urls.some(u=>u.includes('/v3/historical-candle/intraday/NSE_FO')));
 }finally{global.fetch=original;if(oldToken===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=oldToken;}
});

test('bullish failed breakdown maps to CE and does not get mislabeled bearish',()=>{
 const i=index();i.signal='FAILED BREAKDOWN · BULLISH REVERSAL';
 i.setup.name=i.signal;i.setup.direction='UP';
 assert.equal(assessIndex(i,now),null);
 const d=choose(i);assert.equal(d.status,'WATCH');assert.equal(d.side,'CE');
 assert.equal(d.indexSignal,'FAILED BREAKDOWN · BULLISH REVERSAL');
});
test('bearish failed breakout maps to PE without treating it as bullish breakout',()=>{
 const i=index();i.signal='FAILED BREAKOUT · BEARISH REVERSAL';i.setup.name=i.signal;i.setup.direction='DOWN';
 // Choose the PE whose metadata, premium and Greeks are independently checked.
 const c=chain()[0],pk='NSE_FO|98765';
 c.put_options.market_data={ask_price:120,bid_price:119,ltp:120,volume:40000,oi:200000,bid_qty:1500,ask_qty:1500};
 c.put_options.option_greeks={delta:-0.6,gamma:0.001,theta:-15,iv:15};
 const cs=[{instrument_key:pk,instrument_type:'PE',strike_price:25050,lot_size:65,tick_size:5,trading_symbol:'NIFTY 25050 PE 03 NOV 26'}];
 const d=planChoices(i,[c],cs,{[pk]:optionCandles()},now);
 assert.equal(d.status,'WATCH');assert.equal(d.side,'PE');assert.equal(d.selected.target1,155);
});
test('previous signal with non-new confirmation stays WAIT for option advisor',()=>{
 const i=index();i.setup.isNew=false;i.setup.state='MONITORING';
 const d=choose(i);assert.equal(d.status,'WAIT');assert.match(d.reason,/not new/);
});
