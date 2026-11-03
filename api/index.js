const {onlyGet,privateFeed,send}=require('../lib/http');
const {getNiftyIndex}=require('../lib/nifty-index');
const {getMarket}=require('../lib/markets');
const {params}=require('../lib/http');
module.exports=async(req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  let market;try{market=getMarket(params(req).get('market')||'nifty');}catch(e){return send(res,400,{status:'error',message:e.message});}
  try{const data=await getNiftyIndex(new Date(),market.id);send(res,200,{status:data.warnings.length?'partial':'success',data},'no-store');}
  catch(e){send(res,503,{status:'error',message:e.message});}
};
