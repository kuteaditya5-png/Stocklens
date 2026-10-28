function send(res,status,payload) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control',status===200?'public, s-maxage=180, stale-while-revalidate=300':'no-store');
  res.end(JSON.stringify(payload));
}
function onlyGet(req,res){ if(req.method!=='GET') {res.setHeader('Allow','GET');send(res,405,{status:'error',message:'GET only'});return false;}return true; }
function params(req){return new URL(req.url||'/', 'https://app.local').searchParams;}
module.exports={send,onlyGet,params};
