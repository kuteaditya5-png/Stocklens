/**
 * Research-only order/position state machine. Never sends broker requests.
 * Designed so the eventual trading worker has a testable risk model; not safe
 * to interpret simulated prices as actual exchange fills.
 */
'use strict';
const {preview}=require('./trading-plan');
const num=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
function start(plan,{key='paper-test',now=new Date()}={}){
  if(plan?.status!=='PLAN_ONLY'||plan.liveOrdersEnabled||plan.ordersPlaced!==0)throw Error('Valid read-only preview required');
  if(typeof key!=='string'||!key.trim()||key.length>180)throw Error('Unique signal key required');
  if(!(now instanceof Date)||!Number.isFinite(now.valueOf()))throw Error('Invalid date');
  const stages=plan.exitSplits.map(x=>({...x,done:false}));
  const qty=stages.reduce((n,s)=>n+s.units,0);
  if(qty!==plan.units)throw Error('Split quantities do not match entry');
  return Object.freeze({key,market:plan.market,side:plan.side,instrumentKey:plan.instrumentKey,
    lotSize:plan.lotSize,entryPremium:plan.entryPremium,stop:plan.stopPremium,
    target1:plan.target1Premium,target2:plan.target2Premium,quantity:qty,
    remainingUnits:qty,stages,open:true,events:[],grossRealizedPnl:0,
    bestPremium:plan.entryPremium,createdAt:now.toISOString(),execution:'PAPER_ONLY'});
}
function closeUnits(state,count,price,reason){
  if(!Number.isInteger(count)||count<1||count>state.remainingUnits)throw Error('Unsafe position close quantity');
  const profit=round((price-state.entryPremium)*count);
  state.events.push({type:'PAPER_SELL',reason,units:count,price,grossPnl:profit});
  state.remainingUnits-=count;
  state.grossRealizedPnl=round(state.grossRealizedPnl+profit);
  if(state.remainingUnits===0)state.open=false;
}
/** Advance with a hypothetical observed option premium. One quote is not an
 * execution-quality tick; no intrabar stop/target ordering is inferred. */
function mark(old,price,{now=new Date(),trailingGap=10}={}){
  if(!old||old.execution!=='PAPER_ONLY')throw Error('Paper position required');
  if(!num(price)||price<=0||!num(trailingGap)||trailingGap<=0)throw Error('Invalid premium observation');
  if(!(now instanceof Date)||!Number.isFinite(now.valueOf()))throw Error('Invalid time');
  const state={...old,events:old.events.slice(),stages:old.stages.map(s=>({...s}))};
  if(!state.open)return state;
  if(now.toISOString()<=state.createdAt)throw Error('Observation must follow simulated entry');
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  if(clock>='15:15'){
    closeUnits(state,state.remainingUnits,price,'SESSION_CUTOFF');
    return state;
  }
  state.bestPremium=Math.max(state.bestPremium,price);
  if(price<=state.stop){
    closeUnits(state,state.remainingUnits,price,'STOP_OR_TRAILING_STOP');
    return state;
  }
  for(const stage of state.stages){
    if(stage.done)continue;
    if(stage.step==='TRAILING_REMAINDER')continue;
    if(price>=stage.targetPremium){
      closeUnits(state,stage.units,price,stage.step);
      stage.done=true;
      if(!state.open)break;
      if(stage.step==='TARGET_1'){
        // Move remaining paper stop to entry after first target observation.
        state.stop=Math.max(state.stop,state.entryPremium);
        state.events.push({type:'PAPER_STOP_ADJUST',newStop:state.stop,reason:'AFTER_TARGET_1'});
      }
    }
  }
  if(state.open&&state.stages.some(s=>s.step==='TRAILING_REMAINDER')&&
     state.stages.some(s=>s.step==='TARGET_2'&&s.done)){
    // A simulated trailing stop rises with favourable option premium changes.
    const candidate=round(state.bestPremium-trailingGap);
    if(candidate>state.stop){state.stop=candidate;
      state.events.push({type:'PAPER_STOP_ADJUST',newStop:state.stop,reason:'TRAILING'});
    }
  }
  return state;
}
function register(book,plan,key,opts){
  if(!(book instanceof Map))throw Error('Persistent store must be provided by caller');
  if(book.has(key))throw Error('Duplicate signal prevented');
  const position=start(plan,{...opts,key});book.set(key,position);return position;
}
module.exports={start,mark,register};
