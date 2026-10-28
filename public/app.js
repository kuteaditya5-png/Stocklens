(() => {
'use strict';
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2});
const money=n=>Number.isFinite(Number(n))?'₹'+fmt.format(Number(n)):'—';
const pct=n=>Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ist=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
const store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const state={universe:null,stocks:[],errors:[],scanned:0,total:0,loading:false,token:0,complete:false,market:'all',selected:null,
  saved:read('sl_india_watchlist',[]),paper:read('sl_india_paper',[]),capital:read('sl_india_capital',100000),risk:read('sl_india_risk',1)};
function flash(msg) {const e=$('toast');e.textContent=msg;e.classList.add('on');clearTimeout(flash.timer);flash.timer=setTimeout(()=>e.classList.remove('on'),3600)}
function notice(msg,error=false) {const e=$('notice');e.textContent=msg;e.hidden=!msg;e.className='notice'+(error?' error':'');}
function marketClock(){const n=new Date();$('clock').textContent=ist.format(n);const h=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(n);const day=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'short'}).format(n);const isOpen=!['Sat','Sun'].includes(day)&&h>='09:15'&&h<'15:30';const b=$('marketBadge');b.className='live-pill'+(isOpen?'':' closed');b.innerHTML='<i></i> '+(isOpen?'TRADING HOURS':'OUTSIDE TRADING HOURS');}
function updateStats(){
  $('universeCount').textContent=state.universe?.count.unique??'—';$('watchCount').textContent=state.stocks.filter(s=>s.signal==='WATCH').length||'0';
  $('scanCount').innerHTML=`${state.scanned} <small>/ ${state.total||'—'}</small>`;
  $('scanDescription').textContent=state.loading?'Scanning…':state.complete?'Completed · '+state.errors.length+' unavailable':state.scanned?'Partial scan':'Awaiting first scan';
  $('paperCount').textContent=state.paper.length;$('ticketBadge').textContent=state.paper.length;$('watchBadge').textContent=state.saved.length;
  $('riskAmount').textContent=money(state.capital*state.risk/100);
}
async function json(url){const r=await fetch(url);let doc;try{doc=await r.json()}catch{throw Error('Market provider sent an unreadable response')}if(!r.ok)throw Error(doc?.message||'HTTP '+r.status);return doc;}
async function loadUniverse(){try {const x=await json('/api/universe');state.universe=x.data;state.total=x.data.count.unique;
  $('sourceChip').textContent=x.data.source.nifty.startsWith('NSE official')?'NSE constituent list ✓':'NSE fallback constituent list';
  if(!x.data.source.nifty.startsWith('NSE official')) notice('NSE constituent CSV is currently unavailable. Using a clearly labeled fallback list; verify membership before trading.');
  updateStats();}catch(e){notice('Unable to load index membership: '+e.message,true)}}
function filtered(){const query=$('searchInput').value.trim().toUpperCase(),signal=$('filterInput').value;
  return state.stocks.filter(s=>{
    const allowed=state.market==='all'||state.market==='saved'&&state.saved.includes(s.symbol)||state.market==='nifty'&&s.nifty||state.market==='sensex'&&s.sensex;
    return allowed&&(signal==='all'||s.signal===signal)&&(!query||s.symbol.includes(query));
  }).sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol));
}
function rowHTML(s){const saved=state.saved.includes(s.symbol);return `<tr class="stock-row" data-symbol="${safe(s.symbol)}">
<td><span class="sym">${safe(s.symbol)}</span><span class="ticker-sfx">${safe(s.ticker)}</span></td>
<td>${s.nifty?'<span class="tag">N50</span>':''}${s.sensex?'<span class="tag">S30</span>':''}</td>
<td><span class="num">${money(s.price)}</span></td><td class="${s.changePct>=0?'positive':'negative'}">${pct(s.changePct)}</td>
<td>${Number.isFinite(s.rsi)?s.rsi.toFixed(1):'—'}</td><td><span class="setup ${s.setup==='20D BREAKOUT'?'bull':''}">${safe(s.setup)}</span></td>
<td><span class="score"><span class="score-track"><b style="width:${Math.max(0,Math.min(100,s.score))}%"></b></span><strong>${s.score}</strong></span></td>
<td><span class="signal ${safe(s.signal)}">${safe(s.signal)}</span></td>
<td><button class="favorite ${saved?'saved':''}" data-favorite="${safe(s.symbol)}" title="${saved?'Remove watchlist':'Add to watchlist'}">${saved?'★':'☆'}</button></td></tr>`;}
function renderStocks(){const v=filtered(),body=$('stockRows');
  if(!v.length){body.innerHTML=`<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">⌁</div><h3>${state.loading?'Reading market candles…':state.stocks.length?'No matching stocks':'No price data yet'}</h3><p>${state.loading?'Completed results will appear as batches finish.':state.stocks.length?'Try changing your filter.':'Scan to request Yahoo Finance data. No placeholder quotes are used.'}</p>${!state.loading?'<button class="button button-primary" id="emptyScan">Scan market →</button>':''}</div></td></tr>`;}
  else body.innerHTML=v.map(rowHTML).join('');
  $('scanStatus').textContent=state.loading?'SCANNING…':state.complete?(state.errors.length?'PARTIAL / DONE':'SCAN COMPLETE'):state.scanned?'PARTIAL SCAN':'NO DATA YET';
  $('tableCaption').textContent=`Showing ${v.length} of ${state.stocks.length} valid results (${state.scanned}/${state.total||'—'} symbols attempted)`;
  $('feedWarning').textContent=state.errors.length?`${state.errors.length} unavailable / no reliable data. No fallback prices.`:'Scores are technical screens, not buy recommendations.';
  updateStats();
}
async function runScan(){if(state.loading||!state.universe)return;
  const token=++state.token;state.stocks=[];state.errors=[];state.scanned=0;state.complete=false;state.loading=true;
  $('scanBtn').disabled=true;$('scanBtn').textContent='◌ Scanning…';renderStocks();
  let errorText='';
  for(let batch=0;batch<Math.ceil(state.total/12);batch++){
    if(token!==state.token)break;
    try {const response=await json(`/api/scan?market=all&batch=${batch}`);
      const data=response.data;
      state.stocks.push(...data.stocks.filter(s=>!state.stocks.some(x=>x.symbol===s.symbol)));
      state.errors.push(...(data.errors||[]));state.scanned+=data.scanned||0;
      if(!data.hasMore)break;
    }catch(e){errorText=e.message;break;}
    renderStocks();
  }
  state.complete=!errorText&&state.scanned>=state.total;state.loading=false;
  $('scanBtn').disabled=false;$('scanBtn').innerHTML='<span class="btn-bolt">✦</span> Scan market';
  if(errorText)notice(`Scan interrupted (${errorText}). Results shown only for completed requests.`,true);
  else if(state.errors.length===state.scanned)notice('The market-data feed returned no usable candles. It may be blocked or rate-limited. No sample prices have been substituted.',true);
  else if(state.errors.length)notice(`${state.errors.length} symbol(s) could not be verified from Yahoo. Scanner results are incomplete.`,false);
  else if(state.universe?.source.nifty.startsWith('NSE official'))notice('');
  renderStocks();
}
function chartSVG(bars){const points=(bars||[]).filter(b=>Number.isFinite(b.c));if(points.length<2)return '<div class="loading-copy">Insufficient chart data.</div>';
  const W=450,H=150,pad=12,values=points.map(b=>b.c),min=Math.min(...values),max=Math.max(...values),span=Math.max(.01,max-min);
  const xy=values.map((v,i)=>[pad+(i/(values.length-1))*(W-2*pad),pad+(1-(v-min)/span)*(H-2*pad)]);
  const line=xy.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const area=line+` L${W-pad},${H} L${pad},${H} Z`;
  const rising=values.at(-1)>=values[0],color=rising?'#46d4ad':'#f098a3';
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Historical daily closing prices"><defs><linearGradient id="fillC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="M12 38 H438 M12 76 H438 M12 114 H438" stroke="#2e4057" stroke-width="1" stroke-dasharray="3 5" fill="none"/><path d="${area}" fill="url(#fillC)"/><path d="${line}" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
}
function planHTML(d){const p=d.plan,orb=d.orb;
  if(!p)return '<div class="detail-box">Unable to calculate ATR-based plan from available completed daily candles.</div>';
  const qualified=p.qualified;
  return `<div class="detail-box"><div class="box-head">Entry / Exit Planner <span>ATR-based · indicative</span></div>
    <div class="level"><span>Reference entry</span><strong>${money(p.entry)}</strong></div>
    <div class="level"><span>Protective stop · ${p.riskPct}% below</span><strong class="negative">${money(p.stop)}</strong></div>
    ${p.targets.map((t,i)=>`<div class="level"><span><span class="level-target">Target ${i+1} · ${p.rr[i]}R</span><div class="target-value">Position value ${money(p.qty*t)} · potential profit ${money(p.estimatedProfit[i])}</div></span><strong class="positive">${money(t)}</strong></div>`).join('')}
    <div class="metrics"><div class="metric"><label>QTY</label><strong>${p.qty} shares</strong></div><div class="metric"><label>INVESTMENT</label><strong>${money(p.invested)}</strong></div><div class="metric"><label>PLANNED RISK</label><strong class="negative">${money(p.maxPlannedLoss)}</strong></div></div>
    <div class="detail-banner ${qualified?'success':''}">${qualified?'✓ Screen score and intraday breakout conditions both met. Confirm live quotes and liquidity with your broker.':'⚠ Watch / wait: this plan is illustrative. A qualifying daily score AND a completed opening-range breakout are required before even considering an entry.'}</div>
    <div class="detail-actions"><button class="button button-primary" id="paperCreate" ${!p.qty?'disabled':''}>＋ Save paper ticket</button><button class="button button-outline" id="saveDetail">${state.saved.includes(d.stock.symbol)?'★ Watching':'☆ Watchlist'}</button></div><p class="section-mini">${safe(p.caution)} Browser storage only. Saving a ticket does not mean a fill occurred.</p></div>`;
}
function detailHTML(d){const q=d.score;return `<div class="detail-price"><strong>${money(q?.price)}</strong><span class="${(q?.changePct||0)>=0?'positive':'negative'}">${pct(q?.changePct)}</span></div>
  <div class="detail-quote-time">Daily signal candle: ${q?.asOf?ist.format(new Date(q.asOf)):'—'} · Latest quote time: ${q?.priceTime?ist.format(new Date(q.priceTime)):'Not provided'}</div>
  <div class="chart-card"><div class="chart-title">Price history <span>Completed daily candles · 3 months</span></div>${chartSVG(d.daily)}</div>
  <div class="metrics"><div class="metric"><label>SCANNER SCORE</label><strong>${q?.score??'—'} / 100</strong></div><div class="metric"><label>RSI 14</label><strong>${q?.rsi??'—'}</strong></div><div class="metric"><label>ATR 14</label><strong>${money(d.atr14)}</strong></div></div>
  <div class="detail-box"><div class="box-head">Opening Range Breakout <span>09:15–09:30 IST</span></div>
  <div class="metrics"><div class="metric"><label>RANGE HIGH</label><strong>${money(d.orb.high)}</strong></div><div class="metric"><label>RANGE LOW</label><strong>${money(d.orb.low)}</strong></div><div class="metric"><label>CONDITION</label><strong class="${d.orb.status==='TRIGGERED'?'positive':''}">${safe(d.orb.status)}</strong></div></div>
  <p class="orb-message">${safe(d.orb.message)}. ${d.orb.breakoutTime?'First observed breakout: '+ist.format(new Date(d.orb.breakoutTime))+'.':''}</p></div>
  <div class="detail-box"><div class="box-head">Signal evidence <span>${safe(q?.setup||'No setup')}</span></div><p class="section-mini">${q?.reasons?.length?q.reasons.map(safe).join(' · '):'No positive conditions observed.'}</p></div>
  ${planHTML(d)}${d.warning?`<div class="detail-banner">Intraday feed warning: ${safe(d.warning)}</div>`:''}`;
}
async function openDetail(symbol){$('detailDrawer').hidden=false;$('drawerShade').hidden=false;document.body.style.overflow='hidden';
  $('detailTitle').textContent=symbol;$('detailIndices').textContent='Loading analysis…';$('detailBody').innerHTML='<div class="loading-copy">Loading daily and 5-minute bars…</div>';
  const select=symbol;state.selected=null;
  try {const x=await json(`/api/detail?symbol=${encodeURIComponent(symbol)}&capital=${state.capital}&risk=${state.risk}`);
    if($('detailDrawer').hidden||$('detailTitle').textContent!==select)return;
    state.selected=x.data;$('detailIndices').textContent=[x.data.stock.nifty?'NIFTY 50':'',x.data.stock.sensex?'SENSEX 30':''].filter(Boolean).join(' · ')+' · NSE cash equity';
    $('detailBody').innerHTML=detailHTML(x.data);
  } catch(e){$('detailBody').innerHTML=`<div class="detail-banner">Unable to validate ${safe(symbol)} right now: ${safe(e.message)}. No synthetic prices shown.</div>`;}
}
function closeDrawer(){$('detailDrawer').hidden=true;$('drawerShade').hidden=true;document.body.style.overflow='';state.selected=null;}
function toggleWatch(symbol){state.saved=state.saved.includes(symbol)?state.saved.filter(x=>x!==symbol):[...state.saved,symbol];store('sl_india_watchlist',state.saved);renderStocks();if(state.selected?.stock.symbol===symbol){$('detailBody').innerHTML=detailHTML(state.selected);}flash(state.saved.includes(symbol)?`${symbol} added to watchlist`:`${symbol} removed from watchlist`);}
function addPaper(){const d=state.selected,p=d?.plan;if(!p||p.qty<=0){flash('No valid quantity to save');return;}
  const entry={id:Date.now()+'-'+Math.random().toString(36).slice(2,6),symbol:d.stock.symbol,entry:p.entry,stop:p.stop,targets:p.targets,qty:p.qty,invested:p.invested,
    created:new Date().toISOString(),setup:d.score?.setup,qualified:p.qualified};state.paper.unshift(entry);store('sl_india_paper',state.paper);renderPaper();updateStats();flash('Paper plan saved locally — NOT an executed order');}
function renderPaper(){const el=$('paperRows');if(!state.paper.length){el.innerHTML='<div class="paper-empty">No paper tickets yet. Open a stock to create one.</div>';return;}
  el.innerHTML=state.paper.map(p=>`<div class="paper-ticket"><div><strong>${safe(p.symbol)} <span class="tag">PAPER · UNFILLED PLAN</span></strong><small>${ist.format(new Date(p.created))} · ${p.qty} shares · ${safe(p.setup||'—')}</small></div><div class="ticket-meta"><span>Entry <b>${money(p.entry)}</b></span><span>Invest <b>${money(p.invested)}</b></span><button data-remove-ticket="${safe(p.id)}">Remove</button></div></div>`).join('');}
function exportCsv(){const rows=filtered();if(!rows.length){flash('Nothing to export');return;}
  const cols=['symbol','nifty','sensex','price','changePct','rsi','ma20','ma50','setup','score','signal','asOf'];
  const csv=[cols.join(','),...rows.map(x=>cols.map(k=>JSON.stringify(x[k]??'')).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='stocklens-india-scan.csv';a.click();URL.revokeObjectURL(url);}
function setupEvents(){
  $('scanBtn').addEventListener('click',runScan);$('refreshBtn').addEventListener('click',runScan);$('exportBtn').addEventListener('click',exportCsv);
  $('searchInput').addEventListener('input',renderStocks);$('filterInput').addEventListener('change',renderStocks);
  document.querySelectorAll('[data-market]').forEach(el=>el.addEventListener('click',()=>{state.market=el.dataset.market;document.querySelectorAll('[data-market]').forEach(x=>x.classList.toggle('active',x===el));renderStocks();}));
  $('stockRows').addEventListener('click',e=>{const fav=e.target.closest('[data-favorite]');if(fav){toggleWatch(fav.dataset.favorite);return;}const row=e.target.closest('[data-symbol]');if(row)openDetail(row.dataset.symbol);else if(e.target.id==='emptyScan')runScan();});
  $('closeDrawer').addEventListener('click',closeDrawer);$('drawerShade').addEventListener('click',closeDrawer);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
  $('detailBody').addEventListener('click',e=>{if(e.target.closest('#paperCreate'))addPaper();if(e.target.closest('#saveDetail')&&state.selected)toggleWatch(state.selected.stock.symbol);});
  $('capitalInput').value=state.capital;$('capitalInput').addEventListener('change',e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<1000||v>1e9){e.target.value=state.capital;return}state.capital=v;store('sl_india_capital',v);updateStats();});
  document.querySelectorAll('[data-risk]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.risk)===state.risk);b.addEventListener('click',()=>{state.risk=Number(b.dataset.risk);store('sl_india_risk',state.risk);document.querySelectorAll('[data-risk]').forEach(x=>x.classList.toggle('selected',x===b));updateStats()});});
  $('clearPaperBtn').addEventListener('click',()=>{if(!state.paper.length)return;if(confirm('Delete all saved local paper tickets?')){state.paper=[];store('sl_india_paper',[]);renderPaper();updateStats();}});
  $('paperRows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-ticket]');if(!b)return;state.paper=state.paper.filter(p=>p.id!==b.dataset.removeTicket);store('sl_india_paper',state.paper);renderPaper();updateStats()});
  document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-go]').forEach(x=>x.classList.toggle('selected',x===b));$(b.dataset.go).scrollIntoView({behavior:'smooth',block:'start'})}));
}
async function init(){setupEvents();marketClock();setInterval(marketClock,30000);renderStocks();renderPaper();updateStats();await loadUniverse();}
init();
})();
