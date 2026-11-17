/** Read-only compliance gate. Never accesses Upstox order API or returns tokens. */
'use strict';
const oauth=require('../lib/upstox-oauth');
module.exports=async(req,res)=>{
  if(oauth.rejectMethod(req,res,'GET'))return;
  if(!oauth.requireOwner(req,res))return;
  const session=oauth.readSession(req);
  const result={status:'success',mode:'LIVE_EXECUTION_LOCKED',liveOrdersEnabled:false,
    checks:{oauth:session?'BROWSER_SESSION_PRESENT':'NOT_CONNECTED',
      brokerStaticIp:'UNKNOWN',alwaysOnWorker:'NOT_DEPLOYED',
      persistentTokenVault:'NOT_DEPLOYED',brokerReconciliation:'NOT_DEPLOYED',
      brokerStopsAndPartialFills:'NOT_TESTED',sandboxAcceptance:'NOT_VERIFIED'},
    note:'OAuth browser cookie is not a persistent auto-trading credential. No Upstox order requests are sent.'};
  if(!session)return oauth.sendJson(res,200,result);
  try{
    const response=await fetch('https://api.upstox.com/v2/user/ip',{
      headers:{Accept:'application/json',Authorization:'Bearer '+session.accessToken},
      signal:AbortSignal.timeout(9000)});
    if(response.status===401||response.status===403){result.checks.oauth='EXPIRED';}
    else if(response.ok){
      const json=await response.json();
      result.checks.brokerStaticIp=json?.data?.primary_ip?'REGISTERED_NOT_WORKER_VERIFIED':'NOT_REGISTERED';
    }else result.checks.brokerStaticIp='BROKER_CHECK_UNAVAILABLE';
  }catch {result.checks.brokerStaticIp='BROKER_CHECK_UNAVAILABLE';}
  oauth.sendJson(res,200,result);
};
