const {getUniverse}=require('../lib/universe');
const {batchDaily}=require('../lib/upstox');
const {analyzeDaily,isIndianCashSession}=require('../lib/indicators');
const {send,onlyGet,params,privateFeed}=require('../lib/http');
const SIZE=12;
module.exports=async (req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  const p=params(req),market=p.get('market')||'all',batch=Number(p.get('batch')||0);
  if(!['all','nifty','sensex'].includes(market)||!Number.isInteger(batch)||batch<0||batch>20) return send(res,400,{status:'error',message:'Invalid market or batch'});
  try {
    const uni=await getUniverse();
    const pool=uni.stocks.filter(s=>market==='all'||(market==='nifty'?s.nifty:s.sensex));
    const selection=pool.slice(batch*SIZE,(batch+1)*SIZE);
    if(!selection.length)return send(res,200,{status:'success',data:{stocks:[],total:pool.length,batch,hasMore:false,errors:[],source:uni.source,marketOpen:isIndianCashSession()}});
    const feed=await batchDaily(selection.map(s=>s.symbol));
    const stocks=[],errors=[];
    for(const s of selection){
      const item=feed.data[s.symbol];
      if(!item||item.error){errors.push({symbol:s.symbol,message:item?.error||'No data'});continue;}
      const analysis=analyzeDaily(s.symbol,item.bars,item.meta);
      if(!analysis){ errors.push({symbol:s.symbol,message:'Insufficient completed candles'});continue; }
      stocks.push({...s,...analysis});
    }
    send(res,200,{status:errors.length?'partial':'success',data:{stocks,total:pool.length,scanned:selection.length,batch,
      hasMore:(batch+1)*SIZE<pool.length,errors,provider:feed.mode,providerWarning:feed.error,
      marketOpen:isIndianCashSession(),source:uni.source,updatedAt:new Date().toISOString()}});
  } catch(e){send(res,503,{status:'error',message:'Scan unavailable: '+e.message});}
};
