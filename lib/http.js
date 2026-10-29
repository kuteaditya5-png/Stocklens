const crypto = require('node:crypto');
function privateFeed(req,res) {
  const secret=process.env.STOCKLENS_ACCESS_KEY;
  if (!secret) return true;
  const provided=String(req.headers?.['x-stocklens-access']||'');
  const a=Buffer.from(secret),b=Buffer.from(provided);
  if (a.length === b.length && crypto.timingSafeEqual(a,b)) return true;
  send(res,401,{status:'error',code:'STOCKLENS_ACCESS_REQUIRED',message:'Enter your private StockLens access key to scan.'});
  return false;
}
function send(res,status,payload) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control',process.env.STOCKLENS_ACCESS_KEY?'private, no-store':status===200?'public, s-maxage=180, stale-while-revalidate=300':'no-store');
  res.end(JSON.stringify(payload));
}
function onlyGet(req,res){ if(req.method!=='GET') {res.setHeader('Allow','GET');send(res,405,{status:'error',message:'GET only'});return false;}return true; }
function params(req){return new URL(req.url||'/', 'https://app.local').searchParams;}
module.exports={send,onlyGet,params,privateFeed};
