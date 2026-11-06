'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const bars=require('./fixtures/nifty_2026-11-06_5m.json');
const {reference,evaluateEvents,progress,analyzeRolling}=require('../lib/rolling-breakouts');
const {computeNiftySession}=require('../lib/nifty-index');
const {currentIndexSetup,assessIndex}=require('../lib/option-advisor');
const now=new Date('2026-11-06T12:42:00+05:30');
const names=[
 'ROLLING BREAKOUT · BULLISH',
 'ROLLING BREAKOUT · BULLISH',
 'FAILED ROLLING BREAKOUT · BEARISH REVERSAL',
 'ROLLING BREAKDOWN · BEARISH',
 'FAILED ROLLING BREAKDOWN · BULLISH REVERSAL',
 'ROLLING BREAKOUT · BULLISH'
];
test('Nov 6 user 40-candle export contains six distinct qualifying rolling signals',()=>{
 const ev=evaluateEvents(bars);
 assert.equal(bars.length,40);assert.equal(ev.length,6);
 assert.deepEqual(ev.map(e=>e.name),names);
 assert.deepEqual(ev.map(e=>e.optionSide),['CE','CE','PE','PE','CE','CE']);
 assert.deepEqual(ev.map(e=>e.candleTime),[
  '2026-11-06T04:20:00.000Z','2026-11-06T05:00:00.000Z',
  '2026-11-06T05:10:00.000Z','2026-11-06T05:25:00.000Z',
  '2026-11-06T05:35:00.000Z','2026-11-06T06:45:00.000Z'
 ]);
});
test('rolled six-bars next watch uses six recent completed candles, not all-day opening range',()=>{
 const res=analyzeRolling(bars,{asOf:now,active:true});
 assert.deepEqual(res.watch.bullishCloseAbove,24703.1);
 assert.deepEqual(res.watch.bearishCloseBelow,24589.5);
 assert.equal(res.opportunities,6);
 assert.equal(res.latest.entry,24661.9);
 assert.equal(res.latest.state,'MONITORING');
});
test('past event target analysis does not peek beyond six subsequent bars',()=>{
 const events=evaluateEvents(bars),p=events.map(e=>progress(e,bars));
 assert.equal(p[1].state,'STOP HIT');
 assert.equal(p[2].state,'TARGET 1 TOUCHED');
 assert.equal(p[3].state,'EXPIRED');
 assert.equal(p[4].state,'EXPIRED');
 assert.equal(p[5].state,'MONITORING');
});
test('replaying candle prefixes yields no future events and no pre-close signals',()=>{
 for(let n=7;n<bars.length;n++){
  const prefix=bars.slice(0,n),e=evaluateEvents(prefix);
  assert.ok(e.every(x=>x.index<n));
  assert.ok(e.every(x=>x.candleTime<=new Date((prefix.at(-1).t+300)*1000).toISOString()));
 }
 const future=new Date('2026-11-06T12:32:00+05:30');
 const a=analyzeRolling(bars,{asOf:future,active:true});
 assert.equal(a.watch.bullishCloseAbove,24703.29); // 12:30 bar unfinished: use 12:25 as last
});
test('no live signals when market closed or bar stale; historical journal remains',()=>{
 const old=analyzeRolling(bars,{asOf:new Date('2026-11-06T13:10:00+05:30'),active:true});
 assert.equal(old.watch,null);assert.equal(old.latest,null);assert.equal(old.events.length,6);
 const closed=analyzeRolling(bars,{asOf:now,active:false});
 assert.equal(closed.watch,null);
});
test('rolling scanner rejects missing bars in six-bar lookback',()=>{
 const gap=bars.map(x=>({...x}));gap[5].t+=300;
 assert.equal(reference(gap.slice(0,6)),null);
 assert.ok(evaluateEvents(gap).every(e=>e.index!==6));
});
test('engine returns rolling signals for NIFTY and SENSEX using identical algorithm',()=>{
 const a=computeNiftySession(bars,[],now,'nifty'),b=computeNiftySession(bars,[],now,'sensex');
 assert.equal(a.rolling.opportunities,6);
 assert.deepEqual(a.rolling.watch,b.rolling.watch);
 assert.equal(a.market,'nifty');assert.equal(b.market,'sensex');
 assert.equal(a.rolling.latest.optionSide,'CE');
});
test('option advisor selects only a fresh rolling event and does not require a simultaneous ORB event',()=>{
 const s=computeNiftySession(bars.slice(0,36),[],new Date('2026-11-06T12:17:00+05:30'),'nifty');
 // Last visible bar 12:10 closes at 12:15. It just produced rolling bullish breakout.
 assert.equal(s.rolling.latest.state,'NEW');
 assert.ok(s.setup===null||s.setup.state!=='NEW');
 const current=currentIndexSetup(s);
 assert.equal(current.name,'ROLLING BREAKOUT · BULLISH');
 assert.equal(current.direction,'UP');
 assert.equal(current.source,'ROLLING_6');
 assert.equal(assessIndex(s,new Date('2026-11-06T12:17:00+05:30')),null);
});
test('spot candles are not option prices and no artificial +35 premium target is supplied',()=>{
 const a=analyzeRolling(bars,{asOf:now,active:true});
 assert.equal(a.latest.priceType,'INDEX_SPOT');
 assert.equal(a.latest.execution,'REFERENCE_ONLY');
 assert.equal(a.latest.target1-a.latest.entry>0,true);
 assert.equal(Object.hasOwn(a.latest,'optionPremium'),false);
});
