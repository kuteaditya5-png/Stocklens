(()=>{'use strict';
const $=id=>document.getElementById(id);
const money=n=>typeof n==='number'&&Number.isFinite(n)?'₹'+n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const num=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-IN',{maximumFractionDigits:2}):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notice=(message,isError=false)=>{const el=$('notice');el.hidden=!message;el.className='notice'+(isError?'':' ok');el.textContent=message||''};
async function fetchAdvice(){let key='';try{key=sessionStorage.getItem('stocklens_access_key')||''}catch{}
 for(let i=0;i<2;i++){
   const res=await fetch('/api/option-advisor',{cache:'no-store',headers:key?{'x-stocklens-access':key}:{}});
   let body;try{body=await res.json()}catch{throw new Error('Option advisor returned invalid JSON');}
   if(res.status===401&&body?.code==='STOCKLENS_ACCESS_REQUIRED'){
     if(i)throw new Error('Incorrect private access key');
     key=window.prompt('Enter your private StockLens access key:')||'';
     if(!key)throw new Error('Private access key required');
     try{sessionStorage.setItem('stocklens_access_key',key)}catch{}
     continue;
   }
   if(!res.ok)throw new Error(body?.message||'API HTTP '+res.status);
   return body.data;
 }
 throw new Error('StockLens access key rejected');
}
function render(d){
 const watch=d.status==='WATCH'&&d.selected;
 $('verdict').textContent=watch?d.side+' WATCH · SCENARIO':'WAIT';
 $('verdict').className='advisor-verdict'+(watch?' watch':'');
 $('reason').textContent=d.reason||'No eligible setup';
 $('indexSignal').textContent=watch?(d.indexSignal+' · '+(d.indexSetup?.candleTime?new Date(d.indexSetup.candleTime).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'completed candle')):'No eligible new event';
 $('setup').hidden=!watch;
 $('asOf').textContent=watch?'API snapshot received: '+new Date(d.snapshotReceivedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' · Option exchange quote age not independently available':
 (d.asOf?'Last completed NIFTY candle: '+new Date(d.asOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'No eligible fresh breakout');
 if(!watch)return;
 const p=d.selected;
 $('contract').textContent=p.tradingSymbol||`NIFTY ${p.strike} ${p.side}`;
 $('expiry').textContent=`Expiry ${p.expiry} · ${p.lotSize} units per lot`;
 $('entry').textContent=money(p.entry);$('stop').textContent=money(p.stop);$('target').textContent=money(p.target1);
 $('rr').textContent=`Risk ${num(p.riskPoints)} points · Reward:risk ${num(p.rewardRisk)}:1`;
 const lines=[['NIFTY spot reference',num(d.spot)],['Index event',d.indexSignal],['Option bid / ask',money(p.bid)+' / '+money(p.ask)],
   ['Bid–ask spread',num(p.spread)+' pts ('+num(p.spreadPct)+'%)'],['Delta / gamma',num(p.delta)+' / '+num(p.gamma)],
   ['5-minute option ATR',num(p.optionAtr5m)+' premium pts'],['Scenario NIFTY move',num(p.scenarioSpotMove)+' index pts'],
   ['Scenario net premium movement',num(p.scenarioNetPremiumMove)+' pts · NOT a forecast'],
   ['Option candle closed',new Date(p.candleAsOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})],
   ['Option OI / volume',num(p.oi)+' / '+num(p.volume)],['Extended goal',p.target2?money(p.target2)+' (+50)':'Not supported by scenario']];
 $('details').innerHTML=lines.map(([a,b])=>'<div class="focus-row"><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>').join('');
 $('warnings').innerHTML=[p.scenarioNote,...(d.warnings||[])].map(x=>'<li>'+esc(x)+'</li>').join('');
}
let busy=false;
async function load(){if(busy)return;busy=true;$('runBtn').disabled=true;notice('Checking completed NIFTY breakouts, breakdowns, reversals and Upstox option chain…');
 try{const d=await fetchAdvice();render(d);notice(d.status==='WATCH'?'A hypothetical contract passed the +35-point screening criteria. Verify all prices before taking any action.':'No eligible trade: '+d.reason);}
 catch(e){$('verdict').textContent='DATA UNAVAILABLE';$('verdict').className='advisor-verdict';$('reason').textContent=e.message;$('setup').hidden=true;notice(e.message,true);}
 finally{busy=false;$('runBtn').disabled=false;}}
$('runBtn').addEventListener('click',load);load();
})();
