const {onlyGet,privateFeed,send,params}=require('../lib/http');
const {getMarket}=require('../lib/markets');
const {getOptionAdvice}=require('../lib/option-advisor');
module.exports=async(req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  let market;try{market=getMarket(params(req).get('market')||'nifty');}catch(e){return send(res,400,{status:'error',message:e.message});}
  try {const data=await getOptionAdvice(new Date(),market.id);send(res,200,{status:'success',data},'no-store');}
  catch(e){send(res,503,{status:'error',message:'Option advisor unavailable: '+e.message});}
};
