'use strict';
// Test double for Render CLI: only local JSON files, no network.
const fs=require('node:fs');const [file,...args]=process.argv.slice(2);const state=JSON.parse(fs.readFileSync(file,'utf8'));state.calls.push(args);const save=()=>fs.writeFileSync(file,JSON.stringify(state));
const flag=k=>args[args.indexOf(k)+1];
if(args[1]==='create'){
 const out={id:'sbx-abcdef',sandboxGroupId:flag('--group'),timeoutSeconds:Number(flag('--timeout')),idleTimeoutSeconds:Number(flag('--idle-timeout')),networkPolicy:{type:flag('--network-policy'),rules:args.flatMap((x,i)=>x==='--allow-egress-https'?[{domain:args[i+1]}]:[])},status:'running'};if(state.badPolicy)out.networkPolicy.type='allow-all';state.items.push(out);save();if(state.createLost)process.exit(1);if(state.createDelay)setTimeout(()=>console.log(JSON.stringify(out)),state.createDelay);else console.log(JSON.stringify(out));
}else if(args[1]==='list'){save();console.log(JSON.stringify(state.items));}
else if(args[1]==='stop'){const item=state.items.find(x=>x.id===args[2]);if(item)item.status='terminated';save();if(state.stopLost)process.exit(1);console.log(JSON.stringify(item));}
else process.exit(2);
