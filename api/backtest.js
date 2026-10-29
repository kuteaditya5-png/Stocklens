const {onlyGet,privateFeed,params,send}=require('../lib/http');
const {runBacktest,validateRange,dayOffset}=require('../lib/backtest');
const {dateIST}=require('../lib/upstox');
module.exports=async(req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  const p=params(req);
  const yesterday=dayOffset(dateIST(new Date()),-1);
  const to=p.get('to')||yesterday,from=p.get('from')||dayOffset(to,-27);
  const mode=p.get('mode')||'both';
  if(!['both','long','short'].includes(mode))return send(res,400,{status:'error',message:'Invalid direction'});
  try{validateRange(from,to);}
  catch(e){return send(res,400,{status:'error',message:e.message});}
  try{send(res,200,{status:'success',data:await runBacktest(from,to,mode)});}
  catch(e){send(res,503,{status:'error',message:'Backtest unavailable: '+e.message});}
};
