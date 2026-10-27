const assert=require('node:assert/strict');
const before="(u.searchParams.get('ReturnUrl')||'/Line/Review')";
const after="(u.searchParams.get('ReturnUrl')||(u.pathname==='/Line/Review'?u.pathname+u.search:'/Line/Review'))";
exports.patch=source=>{if(source.includes(after))return source;assert.equal(source.split(before).length,2,'Unexpected UOF continuation baseline');return source.replace(before,after);};
