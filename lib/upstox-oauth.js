/**
 * StockLens Upstox OAuth connection — browser-scoped and READ ONLY.
 * No orders, order modification, or automated trading APIs are implemented here.
 * No authentication tokens are returned to browser JavaScript.
 */
'use strict';
const crypto=require('node:crypto');
const AUTH_URL='https://api.upstox.com/v2/login/authorization/dialog';
const TOKEN_URL='https://api.upstox.com/v2/login/authorization/token';
const PROFILE_URL='https://api.upstox.com/v2/user/profile';
const STATE_COOKIE='sl_upstox_oauth_state';
const SESSION_COOKIE='sl_upstox_session';
const AAD=Buffer.from('stocklens-upstox-cookie-v1');
const TIMEOUT_MS=12000;

function configuration(){
  const missing=['UPSTOX_API_KEY','UPSTOX_API_SECRET','UPSTOX_REDIRECT_URI','STOCKLENS_OAUTH_SECRET','STOCKLENS_ACCESS_KEY']
    .filter(k=>!String(process.env[k]||'').trim());
  if(missing.length)return {ready:false,missing};
  if(process.env.STOCKLENS_OAUTH_SECRET.length<32)return {ready:false,missing:['STOCKLENS_OAUTH_SECRET (minimum 32 characters)']};
  const url=process.env.UPSTOX_REDIRECT_URI;
  try{
    const u=new URL(url);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/api/upstox/callback')
      return {ready:false,missing:['UPSTOX_REDIRECT_URI (must be a clean HTTPS /api/upstox/callback URL)']};
  }catch{return {ready:false,missing:['UPSTOX_REDIRECT_URI (valid HTTPS URL required)']};}
  return {ready:true,missing:[]};
}
function cookieHeader(req){return String(req.headers?.cookie||'');}
function getCookie(req,name){
  const item=cookieHeader(req).split(';').map(s=>s.trim()).find(v=>v.startsWith(name+'='));
  return item?item.slice(name.length+1):null;
}
function setCookie(name,value,maxAge){
  if(![STATE_COOKIE,SESSION_COOKIE].includes(name))throw new Error('Unknown cookie');
  return `${name}=${value}; Path=/api/upstox; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(maxAge))}`;
}
function appendCookie(res,cookie){
  const prev=res.getHeader?.('Set-Cookie');
  res.setHeader('Set-Cookie',[...(Array.isArray(prev)?prev:prev?[prev]:[]),cookie]);
}
function secretKey(){
  const raw=String(process.env.STOCKLENS_OAUTH_SECRET||'');
  if(raw.length<32)throw new Error('STOCKLENS_OAUTH_SECRET not configured');
  return crypto.createHash('sha256').update('stocklens.upstox.session.v1:').update(raw).digest();
}
function mac(text){return crypto.createHmac('sha256',secretKey()).update('upstox-state.v1:').update(text).digest('base64url');}
function secureEqual(a,b){
  const x=Buffer.from(String(a||''));const y=Buffer.from(String(b||''));
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function makeState(now=Date.now()){
  const random=crypto.randomBytes(24).toString('base64url');
  const payload=`${random}.${Math.floor(now/1000)}`;
  return {state:random,cookie:`${payload}.${mac(payload)}`};
}
function verifyState(state,cookie,now=Date.now()){
  if(typeof state!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(state)||typeof cookie!=='string')return false;
  const parts=cookie.split('.');
  if(parts.length!==3||parts[0]!==state||!/^[0-9]{10,11}$/.test(parts[1]))return false;
  const issued=Number(parts[1])*1000;
  if(!Number.isFinite(issued)||issued>now+30000||issued<now-600000)return false;
  return secureEqual(parts[2],mac(`${parts[0]}.${parts[1]}`));
}
function authorizationUrl(state){
  const url=new URL(AUTH_URL);
  url.search=new URLSearchParams({response_type:'code',client_id:process.env.UPSTOX_API_KEY,
    redirect_uri:process.env.UPSTOX_REDIRECT_URI,state}).toString();
  return url.toString();
}
function encrypt(data){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',secretKey(),iv);
  cipher.setAAD(AAD);
  const buf=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),buf]).toString('base64url');
}
function decrypt(ciphertext){
  if(typeof ciphertext!=='string'||ciphertext.length>4000)return null;
  try{
    const blob=Buffer.from(ciphertext,'base64url');if(blob.length<29)return null;
    const decipher=crypto.createDecipheriv('aes-256-gcm',secretKey(),blob.subarray(0,12));
    decipher.setAAD(AAD);decipher.setAuthTag(blob.subarray(12,28));
    const info=JSON.parse(Buffer.concat([decipher.update(blob.subarray(28)),decipher.final()]).toString('utf8'));
    if(!info||typeof info.accessToken!=='string'||info.accessToken.length>3000||!Number.isFinite(info.expiresAt))return null;
    return info;
  }catch{return null;}
}
function readSession(req,now=Date.now()){
  const info=decrypt(getCookie(req,SESSION_COOKIE));
  return info&&info.expiresAt>now?info:null;
}
function tokenExpiry(now=new Date()){
  const dtf=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const parts=dtf.formatToParts(now);const part=t=>parts.find(x=>x.type===t).value;
  const y=Number(part('year')),m=Number(part('month')),d=Number(part('day'));
  const h=Number(part('hour')),min=Number(part('minute'));
  // 22:00 UTC on the current IST calendar date is 03:30 IST the next morning.
  // Before 03:30 IST, a newly generated token expires at 03:30 TODAY.
  const candidate=Date.UTC(y,m-1,d,22,0,0);
  return candidate-((h<3||(h===3&&min<30))?86400000:0);
}
function sendJson(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(data));
}
function redirect(res,result){
  res.statusCode=303;res.setHeader('Location','/upstox-connect.html?result='+encodeURIComponent(result));
  res.setHeader('Cache-Control','no-store');res.end('Redirecting to StockLens connection status');
}
function rejectMethod(req,res,method){
  if(req.method===method)return false;
  res.setHeader('Allow',method);sendJson(res,405,{status:'error',message:method+' only'});return true;
}
function requireOwner(req,res){
  const expected=String(process.env.STOCKLENS_ACCESS_KEY||'');
  const supplied=String(req.headers?.['x-stocklens-access']||'');
  if(!expected||!secureEqual(expected,supplied)){
    sendJson(res,401,{status:'error',message:'Private StockLens access key required'});return false;
  }
  return true;
}
function requireOrigin(req,res){
  const expected=new URL(process.env.UPSTOX_REDIRECT_URI).origin;
  if(req.headers?.origin!==expected){sendJson(res,403,{status:'error',message:'Origin validation failed'});return false;}
  return true;
}
async function exchangeToken(code){
  const body=new URLSearchParams({code,client_id:process.env.UPSTOX_API_KEY,
    client_secret:process.env.UPSTOX_API_SECRET,redirect_uri:process.env.UPSTOX_REDIRECT_URI,
    grant_type:'authorization_code'});
  const response=await fetch(TOKEN_URL,{method:'POST',headers:{Accept:'application/json',
    'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),
    signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(!response.ok)throw new Error('Upstox token exchange rejected');
  const data=await response.json();
  if(!data||typeof data.access_token!=='string'||data.access_token.length<8||data.access_token.length>3000)
    throw new Error('Upstox returned no usable access token');
  return data.access_token;
}
async function verifyProfile(token){
  const response=await fetch(PROFILE_URL,{headers:{Accept:'application/json',Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(response.status===401||response.status===403)return {valid:false,reason:'Broker authorization has expired or was revoked'};
  if(!response.ok)return {valid:null,reason:'Upstox profile could not be verified currently'};
  const p=await response.json();
  return {valid:p?.status==='success'&&!!p?.data,
    reason:p?.status==='success'?'':'Broker profile response was unsuccessful'};
}
module.exports={configuration,getCookie,setCookie,appendCookie,makeState,verifyState,authorizationUrl,
  encrypt,decrypt,readSession,tokenExpiry,sendJson,redirect,rejectMethod,requireOwner,requireOrigin,
  exchangeToken,verifyProfile,STATE_COOKIE,SESSION_COOKIE,AUTH_URL,TOKEN_URL};
