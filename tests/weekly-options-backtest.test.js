'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('./fixtures/nifty_2026-11-06_5m.json');
const {getEvents,chooseContract,premiumTrade,executeWeek}=require('../lib/weekly-options-backtest');
const {evaluateEvents}=require('../lib/rolling-breakouts');
const contract={instrument_type:'CE',underlying_key:'NSE_INDEX|Nifty 50',segment:'NSE_FO',
  instrument_key:'NSE_FO|123',trading_symbol:'NIFTY ATM CE',strike_price:25000,lot_size:65,expiry:'2026-11-10'};
function fakeBars(t,mode){const a=[];for(let i=0;i<22;i++){
 let o=100,h=103,l=98,c=100;
 if(mode==='win'&&i===16){h=142;l=99;c=135;}
 if(mode==='loss'&&i===16){h=101;l=88;c=91;}
 if(mode==='ambig'&&i===16){h=142;l=88;c=100;}
 a.push({t:t+(i-15)*300,o,h,l,c});
 }return a;
}
const ev={candleTime:new Date(1762419600*1000).toISOString(),entry:25000,optionSide:'CE',source:'ROLLING_6',name:'ROLLING BREAKOUT · BULLISH'};
// Use another realistic timestamp exact index 2026-11-06 12:15 IST.
ev.candleTime='2026-11-06T06:45:00.000Z';
const ts=Date.parse(ev.candleTime)/1000;
test('user Nov 6 fixture has six rolling signals; not a full one-week options backtest',()=>{
 assert.equal(f.length,40);assert.equal(evaluateEvents(f).length,6);
 assert.throws(()=>getEvents(f),/75 consecutive/);
});
test('chooses the same exchange, matching underlying, side and nearest ATM contract',()=>{
 const c=chooseContract([contract,{...contract,strike_price:25100}, {...contract,segment:'BSE_FO',strike_price:25001}],25004,'CE','nifty');
 assert.equal(c.strike_price,25000);
 assert.equal(chooseContract([contract],25000,'PE','nifty'),null);
});
test('one-lot option target +35 pays ₹2275 gross with lot 65, not index-point P&L',()=>{
 const r=premiumTrade(ev,fakeBars(ts,'win'),contract);
 assert.equal(r.status,'TRADE');assert.equal(r.entry,100);assert.equal(r.target1,135);
 assert.equal(r.exitReason,'TARGET_35');assert.equal(r.grossPnl,2275);
 assert.equal(r.netAfterAssumedFee,null);
});
test('STOP first if five-minute bar touches target and stop; never fake a win',()=>{
 const r=premiumTrade(ev,fakeBars(ts,'ambig'),contract);
 assert.equal(r.status,'TRADE');assert.equal(r.exitReason,'STOP_FIRST_AMBIGUOUS');assert.ok(r.grossPnl<0);
});
test('option stop uses only prior bars; date and side metadata stay intact',()=>{
 const r=premiumTrade(ev,fakeBars(ts,'loss'),contract,{fees:100});
 assert.equal(r.status,'TRADE');assert.equal(r.netAfterAssumedFee,r.grossPnl-100);
 assert.equal(r.side,'CE');assert.equal(r.expiry,'2026-11-10');
});
test('invalid premium time series skips rather than fabricates prices',()=>{
 const r=premiumTrade(ev,fakeBars(ts+37,'win'),contract);assert.equal(r.status,'SKIP');
});
test('full mocked one-week fetch distinguishes unavailable option historical data',async()=>{
 const days=[];
 const bars=[];const base=Date.parse('2026-11-06T09:15:00+05:30')/1000;
 for(let i=0;i<75;i++){
   const ix=i<f.length?f[i]:f.at(-1);
   bars.push({t:base+i*300,o:ix.o,h:ix.h,l:ix.l,c:ix.c});
 }
 days.push({date:'2026-11-06',bars});
 const provider={sessions:async()=>days,expiries:async()=>['2026-11-10'],contracts:async()=>[contract],
   candles:async()=>[]};
 const a=await executeWeek({marketId:'nifty',from:'2026-11-02',to:'2026-11-06',provider});
 assert.equal(a.completeDays.length,1);assert.ok(a.signals>0);assert.equal(a.simulatedTrades,0);
 assert.ok(a.skippedDetails.some(x=>x.reason.includes('No option')));
 assert.equal(a.ordersPlaced,0);
});
