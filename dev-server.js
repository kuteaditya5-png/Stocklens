const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'public');
const APIs={'/api/universe':require('./api/universe'),'/api/scan':require('./api/scan'),'/api/detail':require('./api/detail')};
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
const port=Number(process.env.PORT||3000);
http.createServer(async (req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(APIs[pathname]) {try {return await APIs[pathname](req,res);}catch(e){res.writeHead(500);return res.end(JSON.stringify({status:'error',message:e.message}));}}
  if(req.method!=='GET'){res.writeHead(405);return res.end('Method not allowed');}
  const file=path.join(ROOT,pathname==='/'?'index.html':pathname.slice(1));
  if(!file.startsWith(ROOT+path.sep)&&file!==path.join(ROOT,'index.html')){res.writeHead(403);return res.end('Forbidden');}
  try {const data=await fs.promises.readFile(file);res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);}
  catch {res.writeHead(404);res.end('Not found');}
}).listen(port,()=>console.log('StockLens India ready: http://localhost:'+port));
