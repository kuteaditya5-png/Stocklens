/** Start Upstox OAuth from an authorized StockLens browser. No trading. */
const oauth=require('../lib/upstox-oauth');
module.exports=async(req,res)=>{
  if(oauth.rejectMethod(req,res,'POST'))return;
  const conf=oauth.configuration();
  if(!conf.ready)return oauth.sendJson(res,503,{status:'error',message:'OAuth setup incomplete in Vercel',missing:conf.missing});
  if(!oauth.requireOrigin(req,res)||!oauth.requireOwner(req,res))return;
  const request=oauth.makeState();
  oauth.appendCookie(res,oauth.setCookie(oauth.STATE_COOKIE,request.cookie,600));
  oauth.sendJson(res,200,{status:'success',authorizationUrl:oauth.authorizationUrl(request.state)});
};
