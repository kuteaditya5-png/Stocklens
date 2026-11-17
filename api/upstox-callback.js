/** OAuth callback at /api/upstox/callback (rewritten via vercel.json). */
const oauth=require('../lib/upstox-oauth');
module.exports=async(req,res)=>{
  if(oauth.rejectMethod(req,res,'GET'))return;
  const conf=oauth.configuration();
  if(!conf.ready)return oauth.sendJson(res,503,{status:'error',message:'OAuth setup incomplete in Vercel',missing:conf.missing});
  const q=new URL(req.url||'/','https://stocklens.local').searchParams;
  const state=q.get('state'),code=q.get('code');
  const signedState=oauth.getCookie(req,oauth.STATE_COOKIE);
  if(!state&&!code){
    return oauth.sendJson(res,400,{status:'error',message:'OAuth callback is deployed. Start from /upstox-connect.html; this endpoint cannot be opened directly.'});
  }
  if(!oauth.verifyState(state,signedState))return oauth.sendJson(res,403,{status:'error',message:'Login attempt expired or state mismatch. Start again from StockLens.'});
  // One-time state cookie is cleared BEFORE exchange; auth codes are single-use.
  oauth.appendCookie(res,oauth.setCookie(oauth.STATE_COOKIE,'',0));
  if(q.get('error'))return oauth.redirect(res,'cancelled');
  if(!code||code.length>2000)return oauth.redirect(res,'missing-code');
  try{
    const token=await oauth.exchangeToken(code);
    const expiresAt=oauth.tokenExpiry(new Date());
    const now=Date.now();
    if(expiresAt<=now+60000)return oauth.redirect(res,'token-window-expired');
    const sealed=oauth.encrypt({accessToken:token,connectedAt:now,expiresAt});
    if(sealed.length>3800)return oauth.redirect(res,'session-too-large');
    oauth.appendCookie(res,oauth.setCookie(oauth.SESSION_COOKIE,sealed,Math.floor((expiresAt-now)/1000)));
    return oauth.redirect(res,'connected');
  }catch{ // Never echo OAuth code, token, API secret, or raw broker response.
    return oauth.redirect(res,'token-exchange-failed');
  }
};
