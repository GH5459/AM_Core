'use strict';
function patchWorker(source){
 const anchor='const operation_speed_worker={...routine_dialog_worker,async fetch(request,env,ctx){const start=performance.now();return operationSpeedResponse(request,await routine_dialog_worker.fetch(request,env,ctx),env,start);}};';
 if(source.split(anchor).length!==2||source.includes('./task-form-open.mjs'))throw Error('Task form open worker anchor changed');
 return source.replace(anchor,"import {taskFormOpenResponse} from './task-form-open.mjs';\nconst form_open_worker={...routine_dialog_worker,async fetch(request,env,ctx){return taskFormOpenResponse(request,await routine_dialog_worker.fetch(request,env,ctx));}};\nconst operation_speed_worker={...form_open_worker,async fetch(request,env,ctx){const start=performance.now();return operationSpeedResponse(request,await form_open_worker.fetch(request,env,ctx),env,start);}};");
}
module.exports={patchWorker};
