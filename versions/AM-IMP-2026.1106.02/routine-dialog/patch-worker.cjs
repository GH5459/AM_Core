exports.patchWorker=function(source){
 const needle='const operation_speed_worker={...save_reconcile_worker,async fetch(request,env,ctx){const start=performance.now();return operationSpeedResponse(request,await save_reconcile_worker.fetch(request,env,ctx),env,start);}};';
 if(source.split(needle).length!==2||source.includes('routine_dialog_worker'))throw Error('Routine dialog worker anchor changed');
 const wrapper='import {routineDialogResponse} from "./routine-dialog.mjs";\nconst routine_dialog_worker={...save_reconcile_worker,async fetch(request,env,ctx){return routineDialogResponse(request,await save_reconcile_worker.fetch(request,env,ctx));}};\n';
 return source.replace(needle,wrapper+needle.replaceAll('save_reconcile_worker','routine_dialog_worker'));
};
