const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {getMarket}=require('../lib/markets');
const {computeNiftySession,getNiftyIndex}=require('../lib/nifty-index');
const {evaluate,runBacktest}=require('../lib/backtest');
const {eligibleCandidate,planChoices,getOptionAdvice}=require('../lib/option-advisor');
const indexApi=require('../api/index'),backtestApi=require('../api/backtest'),optionApi=require('../api/option-advisor');
const day='2026-11-02',now=new Date('2026-11-02T09:40:30+05:30');
const stamp=i=>Date.parse(day+'T09:15:00+05:30')/1000+i*300;
const bar=(i,o,h,l,c,v=0)=>({t:stamp(i),o,h,l,c,v});
const candles=[bar(0,80000,80100,79870,80010),bar(1,80010,80200,79950,80150),bar(2,80150,80300,80020,80200),bar(3,80200,80360,80190,80320)];
const past=[{t:Date.parse('2026-10-30T09:15:00+05:30')/1000,o:79700,h:80000,l:79000,c:79500,v:0}];
const raw=bars=>bars.map(x=>[new Date(x.t*1000).toISOString(),x.o,x.h,x.l,x.c,x.v,0]);
const key='BSE_FO|11111';
function idx(){return computeNiftySession(candles,past,now,'sensex');}
function chain(){return [{expiry:'2026-11-06',underlying_key:'BSE_INDEX|SENSEX',underlying_spot_price:80320,strike_price:80300,
  call_options:{instrument_key:key,market_data:{ask_price:220,bid_price:219,ltp:219,volume:10000,oi:65000},option_greeks:{delta:.55,gamma:.0004,theta:-20,iv:18}}}];}
const contracts=[{instrument_key:key,instrument_type:'CE',underlying_key:'BSE_INDEX|SENSEX',segment:'BSE_FO',strike_price:80300,tick_size:5,lot_size:20,trading_symbol:'SENSEX 80300 CE'}];
const optionBars=[bar(0,216,220,214,217,10),bar(1,217,221,215,219,20),bar(2,219,223,218,220,10),bar(3,220,224,219,220,10)];

test('Index registry resolves official NSE and BSE index keys and rejects unsafe choices',()=>{
 assert.equal(getMarket('nifty').underlyingKey,'NSE_INDEX|Nifty 50');
 assert.equal(getMarket('sensex').underlyingKey,'BSE_INDEX|SENSEX');
 assert.equal(getMarket('sensex').optionSegment,'BSE_FO');
 for(const value of ['NIFTY50','BSE_INDEX|SENSEX','__proto__',undefined === 0 ? null : 'foo']) assert.throws(()=>getMarket(value));
});

test('SENSEX uses identical ORB continuation and locked index targets',()=>{
 const d=idx();assert.equal(d.market,'sensex');assert.equal(d.name,'SENSEX');assert.equal(d.exchange,'BSE');
 assert.equal(d.signal,'BULLISH BREAKOUT');assert.equal(d.orb.high,80300);assert.equal(d.orb.low,79870);
 assert.equal(d.levels.entry,80320);assert.equal(d.levels.target1,80770);assert.equal(d.levels.target2,81220);
 assert.equal(d.indicators.ema9,null);
});

test('SENSEX failed breakdown can become bullish CE reversal and failed breakout PE reversal',()=>{
 const falling=[bar(0,80000,80200,79950,80100),bar(1,80100,80250,80000,80120),bar(2,80120,80300,79930,80000),bar(3,80000,80040,79800,79850),bar(4,79850,80150,79790,80060)];
 const recover=computeNiftySession(falling,past,new Date('2026-11-02T09:41:00+05:30'),'sensex');
 assert.equal(recover.signal,'FAILED BREAKDOWN · BULLISH REVERSAL');assert.equal(recover.setup.optionSide,'CE');
 const trap=[...candles,bar(4,80320,80370,80230,80250)];
 const reverse=computeNiftySession(trap,past,new Date('2026-11-02T09:41:00+05:30'),'sensex');
 assert.equal(reverse.signal,'FAILED BREAKOUT · BEARISH REVERSAL');assert.equal(reverse.setup.optionSide,'PE');
});

test('SENSEX option advisor accepts genuine BSE_FO contracts, never mixes NSE_FO option keys',()=>{
 const d=eligibleCandidate(chain()[0],contracts[0],'CE',80320,'sensex');assert.ok(d);assert.equal(d.tradingSymbol,'SENSEX 80300 CE');
 const mismatch={...contracts[0],instrument_key:'NSE_FO|11111'};
 assert.equal(eligibleCandidate(chain()[0],mismatch,'CE',80320,'sensex'),null);
 const mismatch2={...contracts[0],underlying_key:'NSE_INDEX|Nifty 50'};
 assert.equal(eligibleCandidate(chain()[0],mismatch2,'CE',80320,'sensex'),null);
 const p=planChoices(idx(),chain(),contracts,{[key]:optionBars},now,'sensex');
 assert.equal(p.status,'WATCH');assert.equal(p.market,'sensex');assert.equal(p.side,'CE');
 assert.equal(p.selected.target1,p.selected.entry+35);
 assert.equal(p.selected.lotSize,20);
});

test('SENSEX historical engine has separate market metadata and identical calculations',()=>{
 const rows=[];
 for(let i=0;i<75;i++)rows.push(bar(i,80000,i===3?80330:80100,79900,i===3?80320:80000));
 const r=evaluate(rows,{from:day,to:day,market:'sensex'});
 assert.equal(r.market,'sensex');assert.equal(r.instrument,'BSE_INDEX|SENSEX');
 assert.match(r.assumptions[0],/SENSEX/);
});

test('Upstox candle and historical routes choose BSE_INDEX for SENSEX without reading NIFTY',async()=>{
 const oldFetch=global.fetch,oldToken=process.env.UPSTOX_ACCESS_TOKEN;
 process.env.UPSTOX_ACCESS_TOKEN='mock-only';const urls=[];
 global.fetch=async u=>{const url=String(u);urls.push(url);return {ok:true,json:async()=>({status:'success',data:{candles:url.includes('/days/1/')?raw(past):url.includes('/minutes/5/2026-11-01')?raw(candles):raw(candles)}})}};
 try{
  const d=await getNiftyIndex(now,'sensex');assert.equal(d.market,'sensex');
  await runBacktest('2026-11-01','2026-11-02','both',new Date('2026-11-03T09:00:00+05:30'),'sensex');
  assert.ok(urls.length>=3);assert.ok(urls.every(u=>u.includes('BSE_INDEX%7CSENSEX')));
 }finally{global.fetch=oldFetch;if(oldToken===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=oldToken;}
});

test('SENSEX option advisor uses BSE_INDEX option chain and BSE_FO candles end-to-end',async()=>{
 const oldFetch=global.fetch,oldToken=process.env.UPSTOX_ACCESS_TOKEN;
 process.env.UPSTOX_ACCESS_TOKEN='mock-only';const urls=[];
 global.fetch=async u=>{
  const url=String(u);urls.push(url);let data;
  if(url.includes('/v2/option/chain'))data=chain();
  else if(url.includes('/v2/option/contract'))data=contracts;
  else if(url.includes('/intraday/BSE_FO'))data={candles:raw(optionBars)};
  else if(url.includes('/days/1/'))data={candles:raw(past)};
  else if(url.includes('/intraday/BSE_INDEX'))data={candles:raw(candles)};
  else throw Error('unexpected Upstox call '+url);
  return {ok:true,json:async()=>({status:'success',data})};
 };
 try {const r=await getOptionAdvice(now,'sensex');assert.equal(r.status,'WATCH');assert.equal(r.market,'sensex');
  assert.ok(urls.some(x=>x.includes('instrument_key=BSE_INDEX%7CSENSEX')));
  assert.ok(urls.some(x=>x.includes('/intraday/BSE_FO%7C11111')));
  assert.ok(!urls.some(x=>x.includes('NSE_INDEX')||x.includes('NSE_FO')));
 }finally{global.fetch=oldFetch;if(oldToken===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=oldToken;}
});

test('All three market-data endpoints reject unknown market ids with no network calls',async()=>{
 const old=process.env.STOCKLENS_ACCESS_KEY;delete process.env.STOCKLENS_ACCESS_KEY;
 try{for(const fn of [indexApi,backtestApi,optionApi]){
  const res={statusCode:200,setHeader(){},end(s){this.body=JSON.parse(s)}};
  await fn({method:'GET',url:'/api/test?market=banknifty',headers:{}},res);
  assert.equal(res.statusCode,400);assert.match(res.body.message,/Unsupported index/);
 }}finally{if(old!==undefined)process.env.STOCKLENS_ACCESS_KEY=old;}
});

test('Dropdown is present on index, backtest and option advisor; URLs are market aware',()=>{
 for(const name of ['index','backtest','option-advisor']){
  const html=fs.readFileSync(`public/${name}.html`,'utf8');
  assert.match(html,/id="marketSelect"/);assert.match(html,/value="sensex"/);assert.match(html,/market-selector\.js/);
 }
 for(const name of ['index-intraday','backtest','option-advisor'])assert.match(fs.readFileSync(`public/${name}.js`,'utf8'),/Market\.id\(\)/);
});
