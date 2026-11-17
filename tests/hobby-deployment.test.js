'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const status=require('../api/upstox-status');
const project=path.join(__dirname,'..');
function response(){
  const h={};return {headers:h,statusCode:null,body:'',setHeader(k,v){h[k]=v;},end(x){this.body=String(x||'');}};
}
test('Hobby deploy ships no more than 12 actual serverless functions',()=>{
  const files=fs.readdirSync(path.join(project,'api')).filter(x=>x.endsWith('.js'));
  assert.equal(files.length,12);
  assert.ok(files.includes('upstox-status.js'));
  assert.ok(!files.includes('upstox-readiness.js'));
});
test('Existing readiness URL is rewritten into the shared Upstox function',()=>{
  const config=require('../vercel.json');
  assert.equal(config.rewrites.find(x=>x.source==='/api/upstox/readiness')?.destination,
    '/api/upstox-status?view=readiness');
});
test('Readiness and status both remain separate read-only responses in shared handler',async()=>{
  const old=process.env.STOCKLENS_ACCESS_KEY;
  process.env.STOCKLENS_ACCESS_KEY='unit-private-readiness-secret';
  try{
    let r=response();await status({method:'GET',url:'/api/upstox/readiness',headers:{'x-stocklens-access':'unit-private-readiness-secret'}},r);
    assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).mode,'LIVE_EXECUTION_LOCKED');
    r=response();await status({method:'GET',url:'/api/upstox-status?view=readiness',headers:{'x-stocklens-access':'unit-private-readiness-secret'}},r);
    assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).mode,'LIVE_EXECUTION_LOCKED');
    r=response();await status({method:'GET',url:'/api/upstox-status',headers:{}},r);
    assert.ok([200,401].includes(r.statusCode));
    assert.notEqual(JSON.parse(r.body).mode,'LIVE_EXECUTION_LOCKED');
  }finally{if(old===undefined)delete process.env.STOCKLENS_ACCESS_KEY;else process.env.STOCKLENS_ACCESS_KEY=old;}
});
test('Readiness requires private key; no broker connection is exposed to the public',async()=>{
  const old=process.env.STOCKLENS_ACCESS_KEY;
  process.env.STOCKLENS_ACCESS_KEY='unit-private-readiness-secret';
  try{
    const r=response();await status({method:'GET',url:'/api/upstox-status?view=readiness',headers:{}},r);
    assert.equal(r.statusCode,401);
  }finally{if(old===undefined)delete process.env.STOCKLENS_ACCESS_KEY;else process.env.STOCKLENS_ACCESS_KEY=old;}
});
