(()=>{'use strict';
const $=id=>document.getElementById(id);
let inFlight=false;
function getKey(){
  let key='';try{key=sessionStorage.getItem('stocklens_access_key')||'';}catch{}
  if(!key){key=window.prompt('Enter your private StockLens access key (NOT an Upstox token):')||'';
    if(key)try{sessionStorage.setItem('stocklens_access_key',key);}catch{}}
  return key;
}
function forgetKey(){try{sessionStorage.removeItem('stocklens_access_key');}catch{}}
function setStatus(message,type='neutral',heading='Connection status'){
  $('message').textContent=message;$('statusTitle').textContent=heading;
  $('badge').textContent=type==='connected'?'CONNECTED':type==='error'?'ACTION NEEDED':'NOT CONNECTED';
  $('badge').className='oauth-pill'+(type==='connected'?' ok':'');
}
async function request(path,method='GET'){
  const key=getKey();if(!key)throw new Error('Private StockLens key is required.');
  const r=await fetch('/api/upstox/'+path,{method,cache:'no-store',credentials:'same-origin',
    headers:{'x-stocklens-access':key,Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})}});
  let body;try{body=await r.json();}catch{throw new Error('StockLens connection API returned invalid JSON.');}
  if(r.status===401){forgetKey();throw new Error('StockLens access key rejected. Re-enter your private key on the next attempt.');}
  if(!r.ok)throw new Error(body.message||('HTTP '+r.status)+(body.missing?.length?' · Missing: '+body.missing.join(', '):''));
  return body;
}
async function run(fn){if(inFlight)return;inFlight=true;
  for(const id of ['connectBtn','checkBtn','disconnectBtn'])$(id).disabled=true;
  try{await fn();}catch(e){setStatus(e.message,'error','Connection error');}
  finally{inFlight=false;for(const id of ['connectBtn','checkBtn','disconnectBtn'])$(id).disabled=false;}
}
async function check(){const d=await request('status');
  $('expires').textContent=d.expiresAt?new Date(d.expiresAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'Daily reauthorization required';
  if(d.connected)setStatus('Upstox account authorization verified. Session lasts only in this browser until the daily token expires. No orders can be placed by StockLens.','connected','Authorized');
  else if(d.status==='not_configured')setStatus('Vercel environment setup incomplete: '+(d.missing||[]).join(', '),'error','Vercel setup needed');
  else setStatus(d.verification||'No verified Upstox session in this browser. Use Connect with Upstox to sign in.','neutral','Disconnected / expired');
}
$('checkBtn').addEventListener('click',()=>run(check));
$('connectBtn').addEventListener('click',()=>run(async()=>{
  setStatus('Preparing secure Upstox login…');const data=await request('connect','POST');
  const link=new URL(data.authorizationUrl);
  if(link.origin!=='https://api.upstox.com'||link.pathname!=='/v2/login/authorization/dialog')throw new Error('Unexpected authorization destination');
  window.location.assign(link.toString());
}));
$('disconnectBtn').addEventListener('click',()=>run(async()=>{
  await request('disconnect','POST');$('expires').textContent='Daily reauthorization required';
  setStatus('This browser’s encrypted session was cleared. This does not revoke the token at Upstox.','neutral','Disconnected');
}));
const p=new URLSearchParams(window.location.search);const result=p.get('result');
if(result){history.replaceState(null,'','/upstox-connect.html');
  if(result==='connected'){setStatus('Upstox returned an authorization token. Click Check status to verify it.','neutral','Authorization received');}
  else setStatus('Upstox login was not completed ('+String(result).replace(/[^a-z-]/g,'')+'). Restart Connect with Upstox.','error','Login not completed');
}
})();
