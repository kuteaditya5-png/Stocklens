'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {preview,splitLots,validateCandidate,resolveLots,DEFAULT_LOTS}=require('../lib/trading-plan');
const {start,mark,register}=require('../lib/paper-position-manager');
function advice(overrides={}){
  return {status:'WATCH',market:'nifty',side:'CE',indexSetup:{candleTime:'2026-11-17T04:30:00.000Z'},
    selected:{side:'CE',instrumentKey:'NSE_FO|1234',expiry:'2026-11-24',lotSize:75,
      tradingSymbol:'NIFTY 25000 CE',entry:100,stop:85,target1:135,target2:150,
      ask:100,bid:99,spreadPct:1},...overrides};
}
const cfg={maxRiskRupees:10000,maxPremiumCostRupees:100000,maxLots:5};
test('one lot cannot be split into fractional-lot exits',()=>{
 const p=preview(advice(),{lots:1,...cfg});
 assert.equal(p.status,'PLAN_ONLY');assert.equal(p.units,75);
 assert.equal(p.exitSplits.length,1);assert.equal(p.exitSplits[0].units,75);
 assert.equal(p.exitSplits[0].targetPremium,135);
 assert.equal(p.maxGrossLossRupees,1125);
 assert.equal(p.liveOrdersEnabled,false);assert.equal(p.ordersPlaced,0);
});
test('two lots permit one lot per target; three lots support paper trailing remainder',()=>{
 const two=preview(advice(),{lots:2,...cfg});
 assert.deepEqual(two.exitSplits.map(s=>s.lots),[1,1]);
 assert.deepEqual(two.exitSplits.map(s=>s.targetPremium),[135,150]);
 const three=preview(advice(),{lots:3,...cfg});
 assert.deepEqual(three.exitSplits.map(s=>s.lots),[1,1,1]);
 assert.deepEqual(three.exitSplits.map(s=>s.units),[75,75,75]);
 assert.equal(three.exitSplits.at(-1).action,'REQUIRES_ALWAYS_ON_WORKER');
});
test('missing secondary target sends every lot to T1, never invent +50 target',()=>{
 const p=preview(advice({selected:{...advice().selected,target2:null}}),{lots:4,...cfg});
 assert.equal(p.status,'PLAN_ONLY');assert.deepEqual(p.exitSplits.map(s=>s.step),['TARGET_1']);
 assert.equal(p.exitSplits[0].units,300);
});
test('invalid signal, premium stop and +35 condition all fail safely',()=>{
 assert.equal(preview({...advice(),status:'WAIT'},{lots:1,...cfg}).status,'WAIT');
 assert.equal(preview(advice({selected:{...advice().selected,target1:120}}),{lots:1,...cfg}).status,'WAIT');
 assert.equal(preview(advice({selected:{...advice().selected,stop:104}}),{lots:1,...cfg}).status,'WAIT');
 assert.equal(preview(advice({market:'sensex'}),{lots:1,...cfg}).status,'WAIT');
});
test('risk cap, investment cap, lots limits reject rather than scale silently',()=>{
 assert.equal(preview(advice(),{lots:3,maxRiskRupees:2500,maxPremiumCostRupees:100000}).status,'WAIT');
 assert.equal(preview(advice(),{lots:2,maxRiskRupees:10000,maxPremiumCostRupees:10000}).status,'WAIT');
 assert.equal(preview(advice(),{lots:1.5,...cfg}).status,'WAIT');
 assert.equal(preview(advice(),{lots:0,...cfg}).status,'WAIT');
});
test('SENSEX option contracts must have BSE_FO instrument',()=>{
 const p=advice({market:'sensex',selected:{...advice().selected,instrumentKey:'BSE_FO|456'}});
 assert.equal(validateCandidate(p),null);
 assert.equal(preview(p,{lots:1,...cfg}).status,'PLAN_ONLY');
});
test('paper trade advances T1 → breakeven stop → T2 → trailing remainder → stop',()=>{
 const plan=preview(advice(),{lots:3,...cfg});
 let state=start(plan,{key:'signal-123',now:new Date('2026-11-17T04:31:00Z')});
 state=mark(state,136,{now:new Date('2026-11-17T04:36:00Z')});
 assert.equal(state.remainingUnits,150);assert.equal(state.stop,100);
 assert.equal(state.events.filter(x=>x.type==='PAPER_SELL').length,1);
 state=mark(state,151,{now:new Date('2026-11-17T04:41:00Z'),trailingGap:10});
 assert.equal(state.remainingUnits,75);assert.ok(state.stop>=141);
 state=mark(state,139,{now:new Date('2026-11-17T04:46:00Z')});
 assert.equal(state.remainingUnits,0);assert.equal(state.open,false);
 assert.equal(state.events.filter(x=>x.type==='PAPER_SELL').length,3);
 assert.equal(mark(state,140,{now:new Date('2026-11-17T04:51:00Z')}).events.length,state.events.length);
});
test('paper stop before target closes entire remaining quantity and never submits orders',()=>{
 const plan=preview(advice(),{lots:2,...cfg});
 let state=start(plan,{key:'s',now:new Date('2026-11-17T04:31:00Z')});
 state=mark(state,81,{now:new Date('2026-11-17T04:36:00Z')});
 assert.equal(state.remainingUnits,0);assert.equal(state.events.at(-1).reason,'STOP_OR_TRAILING_STOP');
 assert.equal(state.execution,'PAPER_ONLY');
});
test('paper session cutoff closes all remaining units; no duplicate signals',()=>{
 const plan=preview(advice(),{lots:2,...cfg});
 const book=new Map();let state=register(book,plan,'one',{now:new Date('2026-11-17T04:31:00Z')});
 assert.throws(()=>register(book,plan,'one'),/Duplicate/);
 state=mark(state,105,{now:new Date('2026-11-17T09:45:00Z')}); // 15:15 IST
 assert.equal(state.open,false);assert.equal(state.remainingUnits,0);
 assert.equal(state.events.at(-1).reason,'SESSION_CUTOFF');
});
test('no real broker-order integration in safety modules',()=>{
 const fs=require('node:fs');
 for(const path of ['../lib/trading-plan.js','../lib/paper-position-manager.js','../api/trading-preview.js','../api/upstox-readiness.js']){
   const src=fs.readFileSync(require.resolve(path),'utf8');
   assert.doesNotMatch(src,/api-hft\.upstox\.com|\/order\/place|\/order\/modify|\/order\/cancel/);
 }
});


test('null, blank, and omitted lots default to three without fractional positions',()=>{
  assert.equal(DEFAULT_LOTS,3);
  for(const value of [null,undefined,'','   ','null','NULL']){
    const resolved=resolveLots(value,5);
    assert.deepEqual(resolved,{lots:3,usedDefault:true});
    const p=preview(advice(),{lots:value,...cfg});
    assert.equal(p.status,'PLAN_ONLY');
    assert.equal(p.lots,3);
    assert.equal(p.lotsSource,'DEFAULT_3');
    assert.equal(p.units,3*p.lotSize);
    assert.deepEqual(p.exitSplits.map(s=>s.lots),[1,1,1]);
  }
  const omitted=preview(advice(),cfg);
  assert.equal(omitted.lots,3);
  assert.equal(omitted.lotsSource,'DEFAULT_3');
});

test('explicit lot selection overrides three-lot default; invalid inputs are rejected',()=>{
  for(const selected of [1,'2',3,'4',5]){
    const x=resolveLots(selected,5);
    assert.equal(x.lots,Number(selected));
    assert.equal(x.usedDefault,false);
    const p=preview(advice(),{lots:selected,...cfg});
    assert.equal(p.status,'PLAN_ONLY');
    assert.equal(p.lots,Number(selected));
    assert.equal(p.lotsSource,'SELECTED');
  }
  for(const invalid of [0,'0',6,'6',1.5,'1.5','three','3abc',-1,NaN,Infinity,true,{},[]]){
    assert.throws(()=>resolveLots(invalid,5),/Choose/);
    assert.equal(preview(advice(),{lots:invalid,...cfg}).status,'WAIT');
  }
});

test('default three lots still obey cost and max risk limits without silent downsizing',()=>{
  const p=preview(advice(),{lots:null,maxRiskRupees:2000,maxPremiumCostRupees:100000,maxLots:5});
  assert.equal(p.status,'WAIT');
  assert.match(p.reason,/risk/);
  const q=preview(advice(),{lots:null,maxRiskRupees:10000,maxPremiumCostRupees:15000,maxLots:5});
  assert.equal(q.status,'WAIT');
  assert.match(q.reason,/Premium cost/);
});

test('lot selection UI exposes a blank three-lot default and server shares resolver',()=>{
  const fs=require('node:fs');
  const page=fs.readFileSync(require.resolve('../public/trading-setup.html'),'utf8');
  const api=fs.readFileSync(require.resolve('../api/trading-preview.js'),'utf8');
  assert.match(page,/<select id="lots" name="lots">/);
  assert.match(page,/<option value="" selected>Default — 3 lots<\/option>/);
  assert.match(api,/resolveLots\(suppliedLots,5\)/);
});
