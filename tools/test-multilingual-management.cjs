const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const folder=process.env.MULTILINGUAL_MANAGEMENT_PACKAGE||'C:/Users/seven/.codex/private/multilingual-text-20261019/management';
const source=fs.readFileSync(folder+'/candidate/worker.mjs','utf8');
const start=source.indexOf('var SharedAccess = class {'),end=source.indexOf('\n};',start)+3;assert(start>0&&end>start);
class AppError extends Error{constructor(code,status=400,message=code){super(message);this.status=status;}}
const exactFields=(obj,fields)=>{if(Object.keys(obj).some(k=>!fields.includes(k)))throw new AppError('INVALID_FIELDS');};
const state={schemaVersion:1,sharedAccessVersion:1,revision:10,employees:[{account:'111',name:'示例同仁甲'},{account:'222',name:'示例同仁乙'}],enabledAccounts:['111'],dailylogEnabledAccounts:['111','222'],adminAccounts:['111'],hrDailylogEnabledAccounts:[],routineGrants:{},directory:{revision:5},personnelDetails:{revision:5,people:{},departments:[]}};
let current=structuredClone(state),revoked=false;
const app={env:{DAILYLOG_MANAGEMENT:{ready:async()=>true}},csrf(request){if(request.headers.get('X-Test-CSRF')!=='fixture')throw new AppError('CSRF',403);},isAdmin:(a,account)=>!revoked&&a.adminAccounts.includes(account),directory:{metadata:async()=>({revision:5})},store:{get:async()=>structuredClone(current),update:async(k,mutate)=>{const draft=structuredClone(current);current=mutate(draft);return current;}}};
const context={__name(){},AppError,exactFields,body:async req=>req.json(),effectiveAccess:a=>a,owner2:'111',managementUiVersion:'synthetic',libraries:a=>a.routineLibraries||[],grants:(a,k)=>a.routineGrants?.[k]||[],validateLibraries(){},applyPersonnelSelection(){throw Error('Unrequested department change');},Object,Array,Number,Set,Map,Date,JSON};vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nglobalThis.SharedAccessTest=SharedAccess;',context);
const access=new context.SharedAccessTest(app),session={account:'111'};
const request=(changes,revision=current.revision,valid=true)=>new Request('https://synthetic.test/api/management/permissions',{method:'PUT',headers:{'Content-Type':'application/json','X-Test-CSRF':valid?'fixture':'invalid'},body:JSON.stringify({revision,changes})});
const change=(account,experienceLocale)=>({account,experienceLocale,lineEnabled:account==='111',dailylogEnabled:true,admin:account==='111',routineLibraryIds:[]});
(async()=>{
 access.ensure=async()=>structuredClone(current);
 let roster=await access.roster('111');assert(roster.employees.every(p=>p.experienceLocale==='zh-Hant'));
 const preserved={enabledAccounts:current.enabledAccounts,dailylogEnabledAccounts:current.dailylogEnabledAccounts,adminAccounts:current.adminAccounts,directory:current.directory};
 roster=await access.save(request([change('222','id')]),session);assert.equal(roster.employees.find(p=>p.account==='222').experienceLocale,'id');assert.equal((await access.snapshot()).experienceLocales['222'],'id');
 for(const [k,v]of Object.entries(preserved))assert.equal(JSON.stringify(current[k]),JSON.stringify(v),k);
 await assert.rejects(()=>access.save(request([change('222','en')],10),session),e=>e.status===409);assert.equal(current.experienceLocales['222'],'id');
 await assert.rejects(()=>access.save(request([change('222','fr')]),session),e=>e.status===400);
 await assert.rejects(()=>access.save(request([change('222','en')],current.revision,false),session),e=>e.status===403);
 revoked=true;await assert.rejects(()=>access.save(request([change('222','en')]),session),e=>e.status===403);revoked=false;
 await access.save(request([change('222','en')]),session);assert.equal(current.experienceLocales['222'],'en');
 await access.save(request([change('222','zh-Hant')]),session);assert.equal(current.experienceLocales['222'],undefined);assert.equal((await access.roster('111')).employees.find(p=>p.account==='222').experienceLocale,'zh-Hant');
 const assets=JSON.parse(fs.readFileSync(folder+'/management-assets-candidate.json','utf8'));new vm.Script(assets.js);assert(assets.js.includes('data-org-locale'));assert(assets.js.includes('experienceLocale:e.experienceLocale||"zh-Hant"'));assert(assets.js.includes('drafts.get(e.account)?.experienceLocale'));assert(assets.js.includes('d.experienceLocale=i.value'));assert(assets.js.includes('變更任務狀態'));assert(assets.js.includes('experienceLocale===v'));
 console.log('Management exact candidate passed: default Chinese, single locale, central snapshot, original grants/settings preservation, atomic save, stale revision, invalid locale, CSRF, revoked administrator, reset Chinese, draft/change tracking and compiled UI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
