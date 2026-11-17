/** Verify a browser-scoped read-only Upstox session; never expose access_token. */
const oauth=require('../lib/upstox-oauth');
const readiness=require('../lib/upstox-readiness-handler');
module.exports=async(req,res)=>{
  // Both the original profile endpoint and the read-only readiness endpoint
  // share this single Vercel function to stay inside the Hobby 12-function limit.
  const path=new URL(req.url||'/', 'https://stocklens.local');
  if(path.pathname==='/api/upstox/readiness'||path.searchParams.get('view')==='readiness')
    return readiness(req,res);
  if(oauth.rejectMethod(req,res,'GET'))return;
  const conf=oauth.configuration();
  if(!conf.ready)return oauth.sendJson(res,200,{status:'not_configured',connected:false,missing:conf.missing,liveTradingEnabled:false});
  if(!oauth.requireOwner(req,res))return;
  const session=oauth.readSession(req);
  if(!session)return oauth.sendJson(res,200,{status:'disconnected',connected:false,liveTradingEnabled:false});
  try{
    const p=await oauth.verifyProfile(session.accessToken);
    oauth.sendJson(res,200,{status:p.valid===true?'connected':p.valid===false?'expired':'unverified',
      connected:p.valid===true,verification:p.reason||'Upstox user profile verified',
      connectedAt:new Date(session.connectedAt).toISOString(),expiresAt:new Date(session.expiresAt).toISOString(),
      scope:'BROWSER_READ_ONLY_VERIFICATION',liveTradingEnabled:false});
  }catch{
    oauth.sendJson(res,200,{status:'unverified',connected:false,verification:'Could not reach Upstox profile right now',
      expiresAt:new Date(session.expiresAt).toISOString(),liveTradingEnabled:false});
  }
};
