const test=require('node:test'),assert=require('node:assert/strict');
const scan=require('../api/scan'),detail=require('../api/detail'),universe=require('../api/universe');
function req(url,method='GET'){return {url,method};}
function response(){const headers={};let done;const closed=new Promise(r=>done=r);return {statusCode:200,setHeader:(key,val)=>headers[key]=val,end:(data)=>{done({statusCode:this.statusCode,body:JSON.parse(data),headers});},closed};}
async function call(fn,url,method='GET') {let done;const p=new Promise(r=>done=r);const r={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(data){done({status:this.statusCode,json:JSON.parse(data),headers:this.headers});}};await fn(req(url,method),r);return p;}
test('invalid market, unsupported methods, and malicious symbol are rejected before external calls',async()=>{
  let r=await call(scan,'/api/scan?market=nasdaq');assert.equal(r.status,400);
  r=await call(detail,'/api/detail?symbol=../../etc/passwd');assert.equal(r.status,400);
  r=await call(universe,'/api/universe','POST');assert.equal(r.status,405);
  assert.equal(r.json.status,'error');
});
test('scan safely handles Upstox rate limiting without synthetic candles',async()=>{
  const original=global.fetch, originalToken=process.env.UPSTOX_ACCESS_TOKEN;
  process.env.UPSTOX_ACCESS_TOKEN='fake-test-token';
  const names=require('../lib/universe').NIFTY_SEED;
  global.fetch=async url=>{
    if(String(url).endsWith('.csv')) return {ok:true,text:async()=>['Company Name,Industry,Symbol,Series,ISIN Code',...names.map(x=>`Example,Finance,${x},EQ,ISI`) ].join('\n')};
    return {ok:false,status:429};
  };
  try{
    const r=await call(scan,'/api/scan?market=nifty&batch=0');
    assert.equal(r.status,200);
    assert.equal(r.json.status,'partial');
    assert.equal(r.json.data.scanned,12);
    assert.equal(r.json.data.stocks.length,0);
    assert.equal(r.json.data.errors.length,12);
    assert.ok(r.json.data.errors.every(e=>e.message.includes('Upstox HTTP 429')));
  }finally{global.fetch=original;if(originalToken===undefined)delete process.env.UPSTOX_ACCESS_TOKEN;else process.env.UPSTOX_ACCESS_TOKEN=originalToken;}
});

test('private scan access key protects API while leaving public membership readable',async()=>{
  const old=process.env.STOCKLENS_ACCESS_KEY;process.env.STOCKLENS_ACCESS_KEY='very-private-demo-key';
  try{const r=await call(scan,'/api/scan?market=nifty&batch=0');assert.equal(r.status,401);assert.equal(r.json.code,'STOCKLENS_ACCESS_REQUIRED');assert.equal(r.headers['Cache-Control'],'private, no-store');}
  finally{if(old===undefined)delete process.env.STOCKLENS_ACCESS_KEY;else process.env.STOCKLENS_ACCESS_KEY=old;}
});
