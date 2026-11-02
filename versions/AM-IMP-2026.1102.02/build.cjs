const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const originals={
 'line-self-task.mjs':'bee2d6b0dbba4daeb91c84ef06e8c627c89681a7ec653efb15891ba4fb512802',
 'line-task-dates.mjs':'c6acfacca3922646519baf500d1d4c0c111aaf53e3e92c862d0128fea311eee1'
};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
exports.build=(baseline,candidate,root=path.resolve(__dirname,'../..'))=>{
 assert(path.isAbsolute(baseline)&&path.isAbsolute(candidate));assert(!fs.existsSync(candidate),'Candidate must be a new private directory');
 for(const [name,expected]of Object.entries(originals))assert.equal(hash(fs.readFileSync(path.join(baseline,name))),expected,'Live date/task module changed: '+name);
 fs.cpSync(baseline,candidate,{recursive:true});
 fs.copyFileSync(path.join(root,'core/line-self-task-worker.mjs'),path.join(candidate,'line-self-task.mjs'));
 fs.copyFileSync(path.join(root,'core/line-task-dates.mjs'),path.join(candidate,'line-task-dates.mjs'));
};
