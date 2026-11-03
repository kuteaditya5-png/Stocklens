const {onlyGet,privateFeed,send}=require('../lib/http');
const {getOptionAdvice}=require('../lib/option-advisor');
module.exports=async(req,res)=>{
  if(!onlyGet(req,res)||!privateFeed(req,res))return;
  try {const data=await getOptionAdvice();send(res,200,{status:'success',data});}
  catch(e){send(res,503,{status:'error',message:'Option advisor unavailable: '+e.message});}
};
