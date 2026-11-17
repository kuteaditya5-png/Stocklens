#!/usr/bin/env node
/** Node 20+ CLI. Read-only Upstox market data. No broker orders. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {executeWeek}=require('../lib/weekly-options-backtest');
function args(argv){
 const p={};for(const x of argv){const s=x.match(/^--([^=]+)=(.+)$/);if(s)p[s[1]]=s[2];}
 if(p.market&&!['nifty','sensex','both'].includes(p.market))throw Error('--market must be nifty, sensex, or both');
 if(p.fees!=null&&(!Number.isFinite(+p.fees)||+p.fees<0))throw Error('Invalid --fees value');
 return {market:p.market||'both',from:p.from||'2026-11-02',to:p.to||'2026-11-06',
   fees:p.fees!=null?Number(p.fees):null,maxTradesPerDay:p.maxTrades?Number(p.maxTrades):3,
   out:p.out||'weekly-backtest-results'};
}
const esc=v=>'"'+String(v==null?'':v).replaceAll('"','""')+'"';
async function main(){
 const a=args(process.argv.slice(2));
 if(!process.env.UPSTOX_ACCESS_TOKEN){
   console.error('Missing UPSTOX_ACCESS_TOKEN. Generate/login privately; do not paste a token into chat, source code, or Git.');process.exitCode=1;return;
 }
 const markets=a.market==='both'?['nifty','sensex']:[a.market];
 const out=[];
 for(const marketId of markets){
   console.log(`Analyzing ${marketId.toUpperCase()} ${a.from} → ${a.to} from authenticated history (research only)...`);
   const result=await executeWeek({...a,marketId});out.push(result);
   console.log(JSON.stringify({market:result.market,completeDays:result.completeDays,signals:result.signals,
     simulatedTrades:result.simulatedTrades,target35:result.target35Trades,stopped:result.stoppedTrades,
     grossPnl:result.grossPnl,netAfterAssumedFees:result.netAfterAssumedFees,skipped:result.skipped,
     incompleteDays:result.skippedDays.length,missingDays:result.missingDays,reportStatus:result.reportStatus},null,2));
 }
 const dir=path.resolve(a.out);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(out,null,2));
 const columns=['indexMarket','date','signalAt','source','setup','side','contract','expiry','strike','lot','enteredAt','entry','stop','target1','target2','exitAt','exit','exitReason','pnlPoints','grossPnl','netAfterAssumedFee'];
 const trades=out.flatMap(x=>x.trades);
 fs.writeFileSync(path.join(dir,'trades.csv'),columns.join(',')+'\n'+trades.map(r=>columns.map(k=>esc(r[k])).join(',')).join('\n')+'\n');
 const issues=['market,date,time,reason'];for(const x of out){for(const s of x.skippedDetails)issues.push([x.market,s.date,s.time,s.reason].map(esc).join(','));}
 fs.writeFileSync(path.join(dir,'skipped.csv'),issues.join('\n')+'\n');
 console.log('Saved '+dir+'/results.json, trades.csv, skipped.csv');
 console.log('NOT live trading. Index signals only match the historical scanner; historical option-chain Greeks and spreads are absent.');
}
main().catch(e=>{console.error('Backtest failed:',e.message);process.exitCode=1;});
