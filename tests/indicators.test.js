const test=require('node:test'),assert=require('node:assert/strict');
const {sma,rsi,atr,analyzeDaily,intradayOrb,makePlan,completeDailyBars}=require('../lib/indicators');
const {symbolsFromCsv,getUniverse,SENSEX_SEED}=require('../lib/universe');
const {barRows}=require('../lib/yahoo');
const t=Date.parse('2026-10-26T10:00:00Z')/1000;
function days(n=65) {return Array.from({length:n},(_,i)=>({t:t-(n-i)*86400,c:100+i,h:101+i,l:99+i,o:100+i,v:1000+i}));}
test('moving average & RSI range',()=>{assert.equal(sma([1,2,3],2),2.5);assert.ok(rsi(days().map(b=>b.c))>99);});
test('ATR calculations from actual OHLC',()=>assert.ok(atr(days())>0));
test('daily scan does not recommend arbitrary prices',()=>{const a=analyzeDaily('TEST',days(),{regularMarketPrice:158,chartPreviousClose:157},new Date('2026-10-29T04:00:00Z'));assert.ok(a);assert.equal(a.symbol,'TEST');assert.equal(a.price,158);assert.equal(a.setup,'20D BREAKOUT');});
test('insufficient data returns no signal',()=>assert.equal(analyzeDaily('TEST',days(10)),null));
test('drops incomplete session',()=>{const b=[{t:Date.parse('2026-10-28T05:00:00Z')/1000,c:1},{t:Date.parse('2026-10-29T05:00:00Z')/1000,c:2}];assert.equal(completeDailyBars(b,new Date('2026-10-29T06:00:00Z')).length,1)});
test('orb uses only completed 5-minute bars',()=>{
  const dates=['03:45','03:50','03:55','04:00'].map(x=>Date.parse('2026-10-28T'+x+':00Z')/1000);
  const bars=dates.map((t,i)=>({t,c:100+i*2,h:101+i*2,l:99+i*2}));
  const early=intradayOrb(bars,new Date('2026-10-28T04:03:00Z'));assert.equal(early.status,'WAITING');
  const later=intradayOrb(bars,new Date('2026-10-28T04:06:00Z'));assert.equal(later.status,'TRIGGERED');
});
test('risk sizing limited by cash cap and loss cap',()=>{const p=makePlan(days(),{status:'TRIGGERED'},{price:164,score:80},100000,1);assert.ok(p.qty*164<=25000);assert.ok(p.maxPlannedLoss<=1000.01);assert.equal(p.qualified,false);assert.ok(p.targets[2]>p.targets[1]);});
test('NSE CSV parse & invalid member counts',()=>{const csv='Company Name,Industry,Symbol,Series,ISIN Code\n'+Array.from({length:50},(_,i)=>'"Firm, Ltd",Tech,SYM'+i+',EQ,IN000').join('\n');assert.equal(symbolsFromCsv(csv).length,50);});
test('SENSEX list is exactly 30 and merged without duplicates',async()=>{assert.equal(SENSEX_SEED.length,30);assert.equal(require('../lib/universe').NIFTY_SEED.length,50);const x=await getUniverse({forceFallback:true});assert.equal(x.count.sensex,30);assert.equal(new Set(x.stocks.map(s=>s.symbol)).size,x.stocks.length);});
test('Yahoo result maps OHLCV accurately',()=>{const r=barRows({timestamp:[1,2],indicators:{quote:[{close:[2,null],open:[1,2],high:[3,3],low:[1,2],volume:[10,20]}]}});assert.equal(r.length,1);assert.equal(r[0].v,10);});
