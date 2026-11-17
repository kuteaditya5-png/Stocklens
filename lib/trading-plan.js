/**
 * StockLens trade-readiness & position sizing. STRICTLY READ ONLY.
 * A plan NEVER submits, modifies or cancels an Upstox order.
 * All price levels are OPTION PREMIUM points, not index points.
 */
'use strict';
const MAX_LOTS=5;
const DEFAULT_LOTS=3;
const MIN_GAIN_POINTS=35;
const DEFAULT_RISK_CAP_RUPEES=2500;
const DEFAULT_NOTIONAL_CAP_RUPEES=75000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
const wait=(message,extra={})=>({status:'WAIT',reason:message,liveOrdersEnabled:false,ordersPlaced:0,...extra});
function limits(input={}) {
  const risk=Number(input.maxRiskRupees??DEFAULT_RISK_CAP_RUPEES);
  const invested=Number(input.maxPremiumCostRupees??DEFAULT_NOTIONAL_CAP_RUPEES);
  const maxLots=Number(input.maxLots??MAX_LOTS);
  if(!finite(risk)||risk<=0||risk>100000||!finite(invested)||invested<=0||invested>1000000||
     !Number.isInteger(maxLots)||maxLots<1||maxLots>10)throw Error('Invalid risk limits');
  return {maxRiskRupees:round(risk),maxPremiumCostRupees:round(invested),maxLots};
}
/** Accept a deliberately omitted quantity but never coerce invalid numbers.
 * `null`, empty input, or omitted value = three lots.
 * All explicit values must be whole exchange-lot counts within configured limit.
 */
function resolveLots(value,maxLots=MAX_LOTS){
  const missing=value==null||(typeof value==='string'&&(
    value.trim()===''||value.trim().toLowerCase()==='null'));
  const raw=missing?DEFAULT_LOTS:value;
  if(typeof raw==='boolean'||typeof raw==='object'||(
    typeof raw==='string'&&!/^\d+$/.test(raw.trim())))
    throw new Error(`Choose 1–${maxLots} whole lots`);
  const lots=Number(raw);
  if(!Number.isInteger(lots)||lots<1||lots>maxLots)
    throw new Error(`Choose 1–${maxLots} whole lots`);
  return {lots,usedDefault:missing};
}
function splitLots(lots,hasT2){
  if(!Number.isInteger(lots)||lots<1||lots>10)throw Error('Lots must be a positive integer up to 10');
  // Never split an exchange lot into fractional quantities.
  if(!hasT2||lots===1)return [{step:'TARGET_1',lots}];
  if(lots===2)return [{step:'TARGET_1',lots:1},{step:'TARGET_2',lots:1}];
  return [{step:'TARGET_1',lots:1},{step:'TARGET_2',lots:1},{step:'TRAILING_REMAINDER',lots:lots-2}];
}
function validateCandidate(advice){
  if(advice?.status!=='WATCH'||!advice.selected)return 'Current CE/PE advisor is WAIT. No eligible new event or verified contract.';
  const p=advice.selected;
  if(!['nifty','sensex'].includes(advice.market))return 'Index not supported';
  if(!['CE','PE'].includes(advice.side)||advice.side!==p.side)return 'Contract side mismatch';
  if(typeof p.instrumentKey!=='string'||!p.instrumentKey.startsWith(advice.market==='sensex'?'BSE_FO|':'NSE_FO|'))return 'Contract instrument key mismatch';
  if(typeof p.expiry!=='string'||!/^\d{4}-\d\d-\d\d$/.test(p.expiry))return 'Expiry is unavailable';
  if(!Number.isInteger(p.lotSize)||p.lotSize<1||p.lotSize>10000)return 'Unverified exchange lot size';
  if(![p.entry,p.stop,p.target1,p.ask,p.bid].every(finite)||p.entry<=0||p.stop<=0||p.stop>=p.entry||p.target1-p.entry<MIN_GAIN_POINTS-0.02)
    return 'Option premium levels or minimum +35 target are invalid';
  if(p.target2!=null&&(!finite(p.target2)||p.target2<=p.target1))return 'Second target is invalid';
  if(!finite(p.spreadPct)||p.spreadPct>3||p.spreadPct<0)return 'Option bid-ask spread is too wide';
  if(typeof advice.indexSetup?.candleTime!=='string'||!Number.isFinite(Date.parse(advice.indexSetup.candleTime)))
    return 'Confirmed candle timestamp is unavailable';
  return null;
}
function preview(advice,{lots=null,maxRiskRupees=DEFAULT_RISK_CAP_RUPEES,maxPremiumCostRupees=DEFAULT_NOTIONAL_CAP_RUPEES,maxLots=MAX_LOTS}={}){
  // Do not rely on a user-configured LIVE_TRADING flag in this Vercel process.
  // This module has NO broker order methods and returns NO execution authorization.
  let cfg;try{cfg=limits({maxRiskRupees,maxPremiumCostRupees,maxLots})}catch(e){return wait(e.message)}
  let resolved;try{resolved=resolveLots(lots,cfg.maxLots)}catch(e){return wait(e.message)}
  lots=resolved.lots;
  const bad=validateCandidate(advice);if(bad)return wait(bad);
  const p=advice.selected,qty=lots*p.lotSize;
  const riskPerUnit=round(p.entry-p.stop);
  const maxGrossLoss=round(qty*riskPerUnit);
  const premiumCost=round(qty*p.entry);
  if(maxGrossLoss>cfg.maxRiskRupees)return wait(`Planned risk ₹${maxGrossLoss} exceeds configured cap ₹${cfg.maxRiskRupees}`,
    {riskRupees:maxGrossLoss,allowedRiskRupees:cfg.maxRiskRupees});
  if(premiumCost>cfg.maxPremiumCostRupees)return wait(`Premium cost ₹${premiumCost} exceeds configured cap ₹${cfg.maxPremiumCostRupees}`);
  const splits=splitLots(lots,p.target2!=null).map(s=>{
    const price=s.step==='TARGET_1'?p.target1:s.step==='TARGET_2'?p.target2:null;
    return {...s,units:s.lots*p.lotSize,targetPremium:price,
      indicativeGrossPnl:price==null?null:round((price-p.entry)*s.lots*p.lotSize),
      action:s.step==='TRAILING_REMAINDER'?'REQUIRES_ALWAYS_ON_WORKER':'PAPER_EXIT_REFERENCE'};
  });
  return {status:'PLAN_ONLY',mode:'PAPER_PREVIEW',market:advice.market,side:advice.side,
    instrumentKey:p.instrumentKey,expiry:p.expiry,tradingSymbol:p.tradingSymbol||null,
    confirmedAt:advice.indexSetup.candleTime,
    lots,lotsSource:resolved.usedDefault?'DEFAULT_3':'SELECTED',lotSize:p.lotSize,units:qty,entryPremium:p.entry,stopPremium:p.stop,
    target1Premium:p.target1,target2Premium:p.target2??null,
    maxGrossLossRupees:maxGrossLoss,estimatedPremiumCostRupees:premiumCost,
    exitSplits:splits,limits:cfg,liveOrdersEnabled:false,ordersPlaced:0,
    warnings:[
      'NO LIVE BROKER ORDER. Read-only illustrative plan only.',
      'Quote is not guaranteed at the entry reference; actual fill can differ.',
      'Stops are not guaranteed to execute at trigger price; loss may exceed planned risk.',
      'Brokerage, charges, taxes, spread and slippage are excluded.',
      'A real target-split engine requires persistent fills, stop protection, and remaining-position reconciliation.',
      'StockLens existing OAuth session is browser-scoped; unattended live trading needs a new secure service and registered static IP.'
    ]};
}
module.exports={MAX_LOTS,DEFAULT_LOTS,MIN_GAIN_POINTS,DEFAULT_RISK_CAP_RUPEES,DEFAULT_NOTIONAL_CAP_RUPEES,
  resolveLots,splitLots,limits,validateCandidate,preview,wait};
