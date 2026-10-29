const assert=require('node:assert/strict');
function once(s,a,b){assert.equal(s.split(a).length,2,'Live source changed: '+a.slice(0,100));return s.replace(a,b);}
exports.patchWorker=function(s){
 s=once(s,"if(path==='/api/uof-review/bootstrap'&&request.method==='GET')return reviewBootstrap(request,app);","if(path==='/api/uof-review/bootstrap'&&request.method==='GET')return app.fetch(request);");
 s=once(s,"const early=await uofContinuationFetch(this,request);if(early)return early;if(cp==='/Line/Review')", "const early=await uofContinuationFetch(this,request);if(early)return early;if(cp==='/api/uof-review/bootstrap'&&request.method==='GET')return scopedReviewBootstrap(this,request,reviewBootstrap);if(cp==='/Line/Review')");
 return "import {scopedReviewBootstrap} from './review-request.mjs';\n"+s;
};
