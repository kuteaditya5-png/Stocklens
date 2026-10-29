const test=require('node:test'),assert=require('node:assert/strict');
const {nseSymbol,dateIST,candleRows,chart,accessToken} = require('../lib/upstox');
test('rejects malformed stock symbols and missing tokens',()=>{
  assert.equal(nseSymbol('reliance.ns'),'RELIANCE');
  assert.throws(()=>nseSymbol('../bank'),/Invalid NSE/);
  const old=process.env.UPSTOX_ACCESS_TOKEN;
  delete process.env.UPSTOX_ACCESS_TOKEN;
  try{assert.throws(()=>accessToken(),/UPSTOX_ACCESS_TOKEN/);}finally{if(old!==undefined)process.env.UPSTOX_ACCESS_TOKEN=old;}
});
test('reads descending V3 OHLCV correctly in ascending time order',()=>{
  const x=candleRows([
    ['2026-10-28T09:20:00+05:30',110,112,108,111,900,0],
    ['2026-10-28T09:15:00+05:30',100,110,98,109,800,0],
    ['2026-10-28T09:25:00+05:30',null,100,90,99,100,0],
    ['bad',100,110,90,100,100,0]
  ]);
  assert.equal(x.length,2);assert.equal(x[0].c,109);assert.equal(x[1].v,900);
});
test('uses NSE exact instrument search and authenticated V3 history',async()=>{
  const old=process.env.UPSTOX_ACCESS_TOKEN,original=global.fetch;
  process.env.UPSTOX_ACCESS_TOKEN='fake-test-token';
  const calls=[];
  global.fetch=async (u,opts)=>{
    calls.push({url:String(u),authorization:opts.headers.Authorization});
    if(String(u).includes('/v2/instruments/search'))return {ok:true,json:async()=>({status:'success',data:[
      {segment:'BSE_EQ',instrument_type:'EQ',trading_symbol:'DEMO',instrument_key:'BSE_EQ|INE001A01011'},
      {segment:'NSE_EQ',instrument_type:'EQ',trading_symbol:'DEMO',instrument_key:'NSE_EQ|INE001A01011'}]})};
    return {ok:true,json:async()=>({status:'success',data:{candles:[
      ['2026-10-28T09:20:00+05:30',110,112,108,111,900,0],
      ['2026-10-28T09:15:00+05:30',100,110,98,109,800,0]]}})};
  };
  try {
    const daily=await chart('DEMO.NS','3mo','1d');
    const intraday=await chart('DEMO.NS','5d','5m');
    assert.equal(daily.bars[0].o,100);assert.equal(intraday.bars[1].c,111);
    assert.equal(calls.filter(x=>x.url.includes('/instruments/search')).length,1);
    assert.ok(calls.some(x=>x.url.includes('/v3/historical-candle/NSE_EQ%7CINE001A01011/days/1/')));
    assert.ok(calls.some(x=>x.url.includes('/v3/historical-candle/intraday/NSE_EQ%7CINE001A01011/minutes/5')));
    assert.ok(calls.every(x=>x.authorization==='Bearer fake-test-token'));
  } finally{global.fetch=original;if(old===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=old;}
});
test('IST date conversion is independent of server timezone',()=>assert.equal(dateIST(new Date('2026-10-28T20:00:00Z')),'2026-10-29'));
test('dated intraday reference is used only after candle close and when fresh',()=>{
  const {recentIntradayQuote}=require('../lib/upstox');
  const bar={t:Date.parse('2026-10-29T04:00:00Z')/1000,c:200};
  assert.equal(recentIntradayQuote([bar],new Date('2026-10-29T04:04:59Z')),null);
  const p=recentIntradayQuote([bar],new Date('2026-10-29T04:10:00Z'));
  assert.equal(p.price,200);
  assert.equal(recentIntradayQuote([bar],new Date('2026-10-29T05:00:00Z')),null);
});
