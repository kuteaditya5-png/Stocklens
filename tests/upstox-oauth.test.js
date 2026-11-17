'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const oauth=require('../lib/upstox-oauth');
const connect=require('../api/upstox-connect');
const callback=require('../api/upstox-callback');
const status=require('../api/upstox-status');
const disconnect=require('../api/upstox-disconnect');
const fs=require('node:fs');
const path=require('node:path');
const saved={};
const names=['UPSTOX_API_KEY','UPSTOX_API_SECRET','UPSTOX_REDIRECT_URI','STOCKLENS_OAUTH_SECRET','STOCKLENS_ACCESS_KEY'];
function setup(){for(const n of names)saved[n]=process.env[n];Object.assign(process.env,{
  UPSTOX_API_KEY:'test-client-id',UPSTOX_API_SECRET:'test-secret-value',
  UPSTOX_REDIRECT_URI:'https://stocklensapi-2040.vercel.app/api/upstox/callback',
  STOCKLENS_OAUTH_SECRET:'test-private-key-material-minimum-32-characters-long',
  STOCKLENS_ACCESS_KEY:'my-private-stocklens-key'
 });}
function restore(){for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}}
function response(){return {statusCode:200,headers:{},text:'',setHeader(k,v){this.headers[k.toLowerCase()]=v},getHeader(k){return this.headers[k.toLowerCase()]},end(s){this.text=s||''}};}
function req(method,url='/',headers={}){return {method,url,headers};}
const origin='https://stocklensapi-2040.vercel.app';
const header={origin,'x-stocklens-access':'my-private-stocklens-key'};
function cookies(res){return (res.getHeader('Set-Cookie')||[]).map(x=>x.split(';')[0]);}

// Keep environment tests non-concurrent, as other repo tests might reference env vars.
test('configuration rejects missing secrets, permits exact HTTPS callback', {concurrency:false},()=>{
 setup();try{assert.equal(oauth.configuration().ready,true);
  process.env.UPSTOX_REDIRECT_URI='http://insecure.test/api/upstox/callback';
  assert.equal(oauth.configuration().ready,false);
  process.env.UPSTOX_REDIRECT_URI='https://stocklensapi-2040.vercel.app/api/upstox/callback';
  process.env.STOCKLENS_OAUTH_SECRET='too-short';assert.equal(oauth.configuration().ready,false);
 }finally{restore()}
});
test('OAuth state is signed, single browser bounded to ten minutes and tamper-resistant',{concurrency:false},()=>{
 setup();try{
  const now=Date.parse('2026-11-17T13:20:00.000Z');const s=oauth.makeState(now);
  assert.equal(oauth.verifyState(s.state,s.cookie,now+120000),true);
  assert.equal(oauth.verifyState(s.state,s.cookie,now+601000),false);
  assert.equal(oauth.verifyState('x'.repeat(32),s.cookie,now+120000),false);
  assert.equal(oauth.verifyState(s.state,s.cookie.slice(0,-2)+'AA',now),false);
 }finally{restore()}
});
test('AES-GCM session never stores plain token and rejects altered ciphertext',{concurrency:false},()=>{
 setup();try{
  const item={accessToken:'live-but-fake-abcdefg',connectedAt:Date.now(),expiresAt:Date.now()+300000};
  const v=oauth.encrypt(item);assert.equal(v.includes(item.accessToken),false);
  assert.deepEqual(oauth.decrypt(v),item);assert.equal(oauth.decrypt(v.slice(0,-2)+'AA'),null);
  const r=req('GET','/api/upstox/status',{cookie:`${oauth.SESSION_COOKIE}=${v}`});
  assert.deepEqual(oauth.readSession(r),item);
  assert.equal(oauth.readSession(r,Date.now()+350000),null);
 }finally{restore()}
});
test('daily token expires at next 03:30 IST or same-day 03:30 if minted before cutoff',()=>{
 assert.equal(new Date(oauth.tokenExpiry(new Date('2026-11-17T14:00:00Z'))).toISOString(),'2026-11-17T22:00:00.000Z');
 assert.equal(new Date(oauth.tokenExpiry(new Date('2026-11-16T21:00:00Z'))).toISOString(),'2026-11-16T22:00:00.000Z');
});
test('connect requires private key, same origin and POST; returns official URL, never secret',{concurrency:false},async()=>{
 setup();try{
  let res=response();await connect(req('POST','/api/upstox/connect',{origin}),res);assert.equal(res.statusCode,401);
  res=response();await connect(req('POST','/api/upstox/connect',{...header,origin:'https://evil.com'}),res);assert.equal(res.statusCode,403);
  res=response();await connect(req('GET','/api/upstox/connect',header),res);assert.equal(res.statusCode,405);
  res=response();await connect(req('POST','/api/upstox/connect',header),res);
  assert.equal(res.statusCode,200);const body=JSON.parse(res.text);
  const u=new URL(body.authorizationUrl);
  assert.equal(u.origin,'https://api.upstox.com');assert.equal(u.pathname,'/v2/login/authorization/dialog');
  assert.equal(u.searchParams.get('redirect_uri'),process.env.UPSTOX_REDIRECT_URI);
  assert.equal(u.searchParams.get('response_type'),'code');
  assert.ok(u.searchParams.get('state'));
  assert.equal(res.text.includes(process.env.UPSTOX_API_SECRET),false);
  assert.ok(cookies(res)[0].startsWith(oauth.STATE_COOKIE+'='));
  assert.ok(res.getHeader('Set-Cookie')[0].includes('HttpOnly; Secure; SameSite=Lax'));
 }finally{restore()}
});
test('callback without authorization code returns informative 400 instead of 404',{concurrency:false},async()=>{
 setup();try{const res=response();await callback(req('GET','/api/upstox/callback'),res);
  assert.equal(res.statusCode,400);assert.match(res.text,/Start from \/upstox-connect.html/);
 }finally{restore()}
});
test('successful end-to-end callback sets opaque session and status checks broker without exposing token',{concurrency:false},async()=>{
 setup();const oldFetch=global.fetch;try{
  const loginRes=response();await connect(req('POST','/api/upstox/connect',header),loginRes);
  const state=new URL(JSON.parse(loginRes.text).authorizationUrl).searchParams.get('state');
  const stateCookie=cookies(loginRes)[0];
  let exchanged=false,profileChecked=false;
  global.fetch=async(url,opts)=>{
    if(url===oauth.TOKEN_URL){exchanged=true;
      assert.equal(opts.method,'POST');assert.equal(new URLSearchParams(opts.body).get('redirect_uri'),process.env.UPSTOX_REDIRECT_URI);
      return {ok:true,json:async()=>({access_token:'sensitive-test-oauth-access-token'})};}
    if(url==='https://api.upstox.com/v2/user/profile'){
      profileChecked=true;assert.equal(opts.headers.Authorization,'Bearer sensitive-test-oauth-access-token');
      return {ok:true,status:200,json:async()=>({status:'success',data:{user_id:'private-id'}})};
    }
    throw new Error('Unexpected network call: '+url);
  };
  const cbRes=response();await callback(req('GET',`/api/upstox/callback?code=fake-code-123&state=${state}`,{cookie:stateCookie}),cbRes);
  assert.equal(cbRes.statusCode,303);assert.equal(cbRes.getHeader('Location'),'/upstox-connect.html?result=connected');
  assert.equal(exchanged,true);assert.equal(cbRes.text.includes('sensitive-test-oauth-access-token'),false);
  const sessionCookie=cookies(cbRes).find(c=>c.startsWith(oauth.SESSION_COOKIE+'='));assert.ok(sessionCookie);
  const statusRes=response();await status(req('GET','/api/upstox/status',{...header,cookie:sessionCookie}),statusRes);
  assert.equal(statusRes.statusCode,200);const b=JSON.parse(statusRes.text);
  assert.equal(b.connected,true);assert.equal(b.liveTradingEnabled,false);assert.equal(profileChecked,true);
  assert.equal(statusRes.text.includes('sensitive-test-oauth-access-token'),false);
  const disconnectRes=response();await disconnect(req('POST','/api/upstox/disconnect',{...header,cookie:sessionCookie}),disconnectRes);
  assert.equal(disconnectRes.statusCode,200);assert.match(disconnectRes.text,/not revoked/);
  assert.ok(disconnectRes.getHeader('Set-Cookie').some(c=>c.includes('Max-Age=0')));
 }finally{global.fetch=oldFetch;restore()}
});
test('callback rejects forged state, does not exchange code',{concurrency:false},async()=>{
 setup();const oldFetch=global.fetch;let requests=0;global.fetch=async()=>{requests++;throw new Error('should not fetch')};
 try{const res=response();await callback(req('GET','/api/upstox/callback?code=x&state='+('x'.repeat(32))),res);
   assert.equal(res.statusCode,403);assert.equal(requests,0);
 }finally{global.fetch=oldFetch;restore()}
});
test('Vercel rewrite exposes the requested /api/upstox/callback URL using a flat serverless function',()=>{
 const vercel=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
 assert.equal(vercel.rewrites.find(x=>x.source==='/api/upstox/callback')?.destination,'/api/upstox-callback');
 for(const p of ['connect','callback','status','disconnect'])assert.ok(fs.existsSync(path.join(__dirname,'..','api',`upstox-${p}.js`)));
 assert.ok(fs.readFileSync(path.join(__dirname,'..','public','upstox-connect.html'),'utf8').includes('LIVE ORDERS DISABLED'));
});
