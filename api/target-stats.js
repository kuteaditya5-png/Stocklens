'use strict';
const {onlyGet,privateFeed,params,send}=require('../lib/http');
const {getMarket}=require('../lib/markets');
const {historicalTargetOdds}=require('../lib/target-odds');
module.exports=async(req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  let market;
  try{market=getMarket(params(req).get('market')||'nifty');}
  catch(e){return send(res,400,{status:'error',message:e.message},'private, no-store');}
  try{const data=await historicalTargetOdds(market.id);
    send(res,200,{status:'success',data},'private, no-store');}
  catch(e){send(res,503,{status:'error',message:'Historical target hit rates unavailable: '+e.message},'private, no-store');}
};
