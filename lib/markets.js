/** Canonical Upstox index registry. Never derive BSE contracts from NSE symbols. */
'use strict';
const MARKETS=Object.freeze({
  nifty:Object.freeze({id:'nifty',name:'NIFTY 50',short:'NIFTY',exchange:'NSE',underlyingKey:'NSE_INDEX|Nifty 50',optionSegment:'NSE_FO',maxStrikeDistance:150,spotTolerance:35,maxOptionAsk:650}),
  sensex:Object.freeze({id:'sensex',name:'SENSEX',short:'SENSEX',exchange:'BSE',underlyingKey:'BSE_INDEX|SENSEX',optionSegment:'BSE_FO',maxStrikeDistance:500,spotTolerance:120,maxOptionAsk:1300})
});
function getMarket(id='nifty'){
  if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(MARKETS,id))throw new Error('Unsupported index: choose nifty or sensex');
  return MARKETS[id];
}
module.exports={MARKETS,getMarket};
