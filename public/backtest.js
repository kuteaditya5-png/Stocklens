(()=>{'use strict';
const $=id=>document.getElementById(id);
const n=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('en-IN',{maximumFractionDigits:2}):'—';
const sanitize=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shift(date,delta){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
function yesterdayIST(){const s=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return shift(s,-1);}
function setRange(days){const to=yesterdayIST();$('toDate').value=to;$('fromDate').value=shift(to,-days+1);}
function notice(msg,ok=false){$('notice').textContent=msg;$('notice').className='notice'+(ok?' ok':'');$('notice').hidden=!msg;}
async function fetchBacktest(from,to,mode){let key='';try{key=sessionStorage.getItem('stocklens_access_key')||''}catch{}
  for(let attempt=0;attempt<2;attempt++){
    const qs=new URLSearchParams({from,to,mode});
    const response=await fetch('/api/backtest?'+qs,{headers:key?{'x-stocklens-access':key}:{},cache:'no-store'});
    let doc;try{doc=await response.json()}catch{throw Error('Backtest service returned an unreadable response');}
    if(response.status===401&&doc?.code==='STOCKLENS_ACCESS_REQUIRED'){
      if(attempt)throw Error('Incorrect private StockLens access key');
      key=window.prompt('Enter your private StockLens scanner access key:')||'';
      if(!key)throw Error('An access key is required');
      try{sessionStorage.setItem('stocklens_access_key',key)}catch{}
      continue;
    }
    if(!response.ok)throw Error(doc?.message||'API HTTP '+response.status);
    return doc.data;
  }
  throw Error('StockLens access key rejected');
}
function equitySvg(points){if(!points?.length)return '<div class="equity-placeholder">No simulated entries within this date range.</div>';
  const series=[0,...points.map(p=>p.cumulativeR)],w=900,h=240,padX=25,padY=20;
  const lo=Math.min(...series,0),hi=Math.max(...series,0),height=Math.max(1,hi-lo),dx=(w-2*padX)/Math.max(1,series.length-1);
  const y=x=>padY+(hi-x)/height*(h-2*padY);
  const d=series.map((v,i)=>(i?'L':'M')+(padX+i*dx).toFixed(2)+' '+y(v).toFixed(2)).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Cumulative risk multiples over historical trades"><line x1="${padX}" x2="${w-padX}" y1="${y(0)}" y2="${y(0)}" stroke="#536d85" stroke-dasharray="5 5"/><path d="${d}" stroke="#55b7f8" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><text x="${w-15}" y="${padY}" text-anchor="end" font-size="12" fill="#96aeca">+${n(hi)}R</text><text x="${w-15}" y="${h-5}" text-anchor="end" font-size="12" fill="#96aeca">${n(lo)}R</text></svg>`;
}
function render(d){$('results').hidden=false;
  $('tradeCount').textContent=n(d.summary.trades);$('daysStatus').textContent=`${d.validSessions} complete sessions · ${d.sessionCount} with data`;
  $('winRate').textContent=d.summary.winRate==null?'—':n(d.summary.winRate)+'%';$('winLoss').textContent=`${d.summary.wins} wins · ${d.summary.losses} losses`;
  $('netR').textContent=n(d.summary.netR)+'R';$('netR').className='metric-value'+(d.summary.netR>0?' positive':d.summary.netR<0?' negative':'');
  $('maxDD').textContent=n(d.summary.maxDrawdownR)+'R';$('windowLabel').textContent=d.from+' → '+d.to;
  $('skipLabel').textContent=`${d.skipped.missingCandles} incomplete sessions excluded`;
  $('equityChart').innerHTML=equitySvg(d.equityCurve);
  $('tradeRows').innerHTML=d.trades.length?d.trades.map(t=>`<tr><td>${sanitize(t.date)}</td><td>${sanitize(t.side)}</td><td>${n(t.entry)}</td><td>${n(t.stop)}</td><td>${n(t.target2)}</td><td>${n(t.exit)}</td><td class="${t.pnlPoints>0?'tag-win':t.pnlPoints<0?'tag-loss':''}">${sanitize(t.result)}</td><td>${n(t.r)}R</td><td>${sanitize(t.exitReason)}</td></tr>`).join(''):'<tr><td colspan="9">No trade met the rules. Try another historical date range.</td></tr>';
  $('assumptions').innerHTML=d.assumptions.map(x=>'<li>'+sanitize(x)+'</li>').join('');
  notice(`Backtest complete: ${d.summary.trades} hypothetical trades in ${d.validSessions} complete sessions. No synthetic prices or real orders.`,true);
}
$('backtestForm').addEventListener('submit',async e=>{
  e.preventDefault();const from=$('fromDate').value,to=$('toDate').value,mode=$('direction').value;
  const days=Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000)+1;
  if(!from||!to||days<1||days>28||to>yesterdayIST()){notice('Select 1–28 completed calendar days, ending no later than yesterday.');return;}
  $('runBtn').disabled=true;$('runBtn').textContent='◌ Testing historical candles…';$('results').hidden=true;notice('Retrieving verified Upstox historical 5-minute candles…',true);
  try{render(await fetchBacktest(from,to,mode));}catch(err){notice(err.message);}
  finally{$('runBtn').disabled=false;$('runBtn').textContent='▶ Run backtest';}
});
document.querySelectorAll('[data-days]').forEach(x=>x.addEventListener('click',()=>setRange(Number(x.dataset.days))));
setRange(28);
})();
