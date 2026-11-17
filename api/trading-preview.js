/** GET only: validated paper quantity/target plan for a NEW Upstox option event. */
'use strict';
const {onlyGet,privateFeed,params,send}=require('../lib/http');
const {getMarket}=require('../lib/markets');
const {getOptionAdvice}=require('../lib/option-advisor');
const {preview,wait,resolveLots}=require('../lib/trading-plan');
module.exports=async(req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  const p=params(req);let market;
  try{market=getMarket(p.get('market')||'nifty');}catch(e){return send(res,400,{status:'error',message:e.message},'no-store');}
  const suppliedLots=p.get('lots');
  try{resolveLots(suppliedLots,5);}
  catch(e){return send(res,400,{status:'error',message:e.message},'no-store');}
  const capRisk=Number(process.env.STOCKLENS_PAPER_MAX_RISK_RUPEES||2500);
  const capCost=Number(process.env.STOCKLENS_PAPER_MAX_PREMIUM_COST_RUPEES||75000);
  try{
    const advice=await getOptionAdvice(new Date(),market.id);
    const plan=preview(advice,{lots:suppliedLots,maxRiskRupees:capRisk,maxPremiumCostRupees:capCost,maxLots:5});
    send(res,200,{status:'success',data:plan,market:market.id,liveOrdersEnabled:false},'no-store');
  }catch(e){
    // No substitute fake trades when Upstox is down.
    send(res,503,{status:'error',message:'Unable to validate live option setup: '+e.message,
      data:wait('Broker/market data unavailable')},'no-store');
  }
};
