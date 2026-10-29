const {onlyGet,privateFeed,send}=require('../lib/http');
const {getNiftyIndex}=require('../lib/nifty-index');
module.exports=async(req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  try{const data=await getNiftyIndex();send(res,200,{status:data.warnings.length?'partial':'success',data});}
  catch(e){send(res,503,{status:'error',message:e.message});}
};
