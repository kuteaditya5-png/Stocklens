/* Cross-page NIFTY/SENSEX selection. No API tokens or prices are stored. */
(()=>{'use strict';
const names={nifty:'NIFTY 50',sensex:'SENSEX'};
const saved=()=>{try{return localStorage.getItem('stocklens-market')}catch{return null}};
const isValid=s=>Object.prototype.hasOwnProperty.call(names,s);
const urlValue=new URLSearchParams(location.search).get('market');
let selected=isValid(urlValue)?urlValue:isValid(saved())?saved():'nifty';
function updateLinks(){
  document.querySelectorAll('a[href^="/"]').forEach(a=>{
    const u=new URL(a.href,location.origin);
    if(!['/','/index.html','/backtest.html','/option-advisor.html'].includes(u.pathname))return;
    u.searchParams.set('market',selected);
    a.href=u.pathname+u.search+u.hash;
  });
}
function paint(){
 const el=document.getElementById('marketSelect');if(el)el.value=selected;
 document.querySelectorAll('[data-market-name]').forEach(x=>x.textContent=names[selected]);
 document.querySelectorAll('[data-market-exchange]').forEach(x=>x.textContent=selected==='sensex'?'BSE_INDEX':'NSE_INDEX');
 document.body.dataset.market=selected;
 updateLinks();
}
function init(callback){
 paint();const select=document.getElementById('marketSelect');
 if(select)select.addEventListener('change',()=>{
   if(!isValid(select.value))return;
   selected=select.value;
   try{localStorage.setItem('stocklens-market',selected)}catch{}
   const u=new URL(location.href);u.searchParams.set('market',selected);
   history.replaceState(null,'',u.pathname+u.search+u.hash);
   paint();if(callback)callback(selected);
 });
 return selected;
}
window.StockLensMarket={init,id:()=>selected,name:()=>names[selected]};
})();
