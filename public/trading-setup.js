(()=>{'use strict';
const $=id=>document.getElementById(id),M=window.StockLensMarket;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>typeof x==='number'&&Number.isFinite(x)?'₹'+x.toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2}):'—';
async function load(path){
  let key='';try{key=sessionStorage.getItem('stocklens_access_key')||''}catch{}
  for(let a=0;a<2;a++){
    const res=await fetch(path,{cache:'no-store',headers:key?{'x-stocklens-access':key}:{}});
    let data;try{data=await res.json()}catch{throw Error('Invalid backend response')}
    if(res.status===401&&(data.code==='STOCKLENS_ACCESS_REQUIRED'||/access key/i.test(data.message||''))){
      if(a)throw Error('StockLens access key was rejected');
      key=prompt('Enter your private StockLens access key:')||'';
      if(!key)throw Error('Access key required');
      try{sessionStorage.setItem('stocklens_access_key',key)}catch{}
      continue;
    }
    if(!res.ok)throw Error(data.message||'HTTP '+res.status);
    return data;
  }
  throw Error('Unauthorized');
}
async function readiness(){
  $('checkBtn').disabled=true;$('checkGrid').textContent='Checking browser authorization and broker static-IP registration…';
  try{
    const body=await load('/api/upstox/readiness');
    if(body.liveOrdersEnabled)throw Error('Unexpected live execution state; stop and review the server');
    $('checkGrid').innerHTML=Object.entries(body.checks||{}).map(([key,value])=>{
      const ok=value==='REGISTERED_NOT_WORKER_VERIFIED'||value==='BROWSER_SESSION_PRESENT';
      return `<div class="check-card ${ok?'ok':value==='UNKNOWN'||value==='BROKER_CHECK_UNAVAILABLE'?'warn':'bad'}"><span>${esc(key.replace(/([A-Z])/g,' $1'))}</span><strong>${esc(value.replace(/_/g,' '))}</strong></div>`;
    }).join('');
  }catch(e){$('checkGrid').textContent='Readiness check unavailable: '+e.message}
  finally{$('checkBtn').disabled=false}
}
async function preview(){
  $('previewBtn').disabled=true;$('previewData').hidden=true;$('previewNote').textContent='Checking new completed-candle setup and actual Upstox contract data…';
  const market=M.id(),lots=$('lots').value;
  try{
    const body=await load('/api/trading-preview?market='+encodeURIComponent(market)+'&lots='+encodeURIComponent(lots));
    if(market!==M.id())return;
    const p=body.data;
    if(body.liveOrdersEnabled||p.liveOrdersEnabled)throw Error('Unexpected live trading flag');
    if(p.status!=='PLAN_ONLY'){$('previewNote').textContent='WAIT: '+(p.reason||'No eligible new setup');return}
    $('previewData').hidden=false;
    $('previewNote').textContent='PAPER PREVIEW ONLY — '+(p.lotsSource==='DEFAULT_3'?'Default 3 lots used':'Selected '+p.lots+' lot(s)')+' — NO UPSTOX ORDER PLACED';
    $('pContract').textContent=p.tradingSymbol||p.instrumentKey;
    $('pQuantity').textContent=p.units+' units ('+p.lots+' complete lots)';
    $('pEntryStop').textContent=money(p.entryPremium)+' / '+money(p.stopPremium);
    $('pRisk').textContent=money(p.maxGrossLossRupees)+' (before slippage)';
    $('planRows').innerHTML=p.exitSplits.map(s=>`<tr><td>${esc(s.step.replace(/_/g,' '))}</td><td>${s.lots}</td><td>${s.units}</td><td>${money(s.targetPremium)}</td><td>${money(s.indicativeGrossPnl)}</td><td>${esc(s.action)}</td></tr>`).join('');
    $('planWarning').textContent=p.warnings.join(' ');
  }catch(e){if(market===M.id())$('previewNote').textContent='No safe preview: '+e.message}
  finally{$('previewBtn').disabled=false}
}
M.init(()=>{$('previewData').hidden=true;$('previewNote').textContent='Market changed. No plan loaded.'});
$('previewBtn').addEventListener('click',preview);
$('checkBtn').addEventListener('click',readiness);
readiness();
})();
