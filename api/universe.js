const {getUniverse}=require('../lib/universe');
const {send,onlyGet}=require('../lib/http');
module.exports=async (req,res)=>{
  if(!onlyGet(req,res))return;
  try {send(res,200,{status:'success',data:await getUniverse()});}
  catch(e) {send(res,503,{status:'error',message:e.message});}
};
