/** Clear this browser session only; does not remotely revoke the broker token. */
const oauth=require('../lib/upstox-oauth');
module.exports=async(req,res)=>{
  if(oauth.rejectMethod(req,res,'POST'))return;
  const c=oauth.configuration();if(!c.ready)return oauth.sendJson(res,503,{status:'error',message:'OAuth setup incomplete'});
  if(!oauth.requireOrigin(req,res)||!oauth.requireOwner(req,res))return;
  oauth.appendCookie(res,oauth.setCookie(oauth.SESSION_COOKIE,'',0));
  oauth.appendCookie(res,oauth.setCookie(oauth.STATE_COOKIE,'',0));
  oauth.sendJson(res,200,{status:'disconnected',message:'Local browser session cleared. Broker-side token was not revoked.',liveTradingEnabled:false});
};
