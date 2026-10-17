import React from 'react';
import {createRoot} from 'react-dom/client';
import TaskSpace from '../app/task-space';
import {DEFAULT_TASK_PREFERENCES} from '../app/task-preferences';
import {noteEnvelope,readNoteEnvelope} from '../app/blocknote-document';
import {archiveRecovery,listLocalRecovery,writeOwnedRecord} from '../app/reliability';
import '../app/globals.css';
const initial={id:'task-autosave-qa-0001',title:'Synthetic task',detail:noteEnvelope([{id:'qa-first',type:'paragraph',content:[{type:'text',text:'Synthetic notes',styles:{}}]}]),completed:false,date:'',isTop:false,status:'today',team:false,projectId:'',projectIds:[]};
let task=JSON.parse(sessionStorage.getItem('qa:server')||'null')||initial,delay=0,fail=false,contention=false,requests:unknown[]=[],reads=0;
const receipts=new Map<string,string>();
const response=(result:unknown,status=200)=>Response.json(result,{status});
const native=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 if(String(input)==='/api/settings')return response({ok:true,result:{revision:0,preferences:DEFAULT_TASK_PREFERENCES}});
 if(String(input)!=='/api/tasks')return native(input,init);
 if(!init?.method||init.method==='GET'){reads++;return response({ok:true,result:{tasks:[task],projects:[]}});}
 const body=JSON.parse(String(init.body));requests.push(structuredClone(body));
 if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
 if(fail)throw Error('Synthetic offline');
 if(contention){task={...task,title:'Concurrent '+requests.length};sessionStorage.setItem('qa:server',JSON.stringify(task));}
 const fields=Object.keys(body.updates||{}),conflicts=fields.filter(k=>JSON.stringify(task[k])!==JSON.stringify(body.expectedValues[k]));
 if(conflicts.length&&!fields.every(k=>JSON.stringify(task[k])===JSON.stringify(body.updates[k])))return response({ok:false,code:'CONFLICT',currentTask:task,fields:conflicts},409);
 const fingerprint=JSON.stringify([body.updates,body.expectedValues]);if(receipts.has(body.requestId)&&receipts.get(body.requestId)!==fingerprint)return response({ok:false,error:'Reused request ID'},400);
 receipts.set(body.requestId,fingerprint);task={...task,...body.updates};sessionStorage.setItem('qa:server',JSON.stringify(task));return response({ok:true,result:task});
};
const params=new URLSearchParams(location.search);
if(params.get('recovered')==='1')writeOwnedRecord('title-draft',task.id,{version:1,taskId:task.id,baseTitle:'Old base',title:'Recovered old draft',conflict:true,updatedAt:1});
if(params.get('pending')==='1'){
 delay=1800;
 writeOwnedRecord('pending-mutations','all',[{id:task.id,requestId:crypto.randomUUID(),updates:{title:'Recovered pending title'},expectedValues:{title:'Old base'},baseTask:initial,createdAt:1}]);
}
if(params.get('quota')==='1'){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('personal-task-space:recovery:'))throw new DOMException('Synthetic quota','QuotaExceededError');return set.call(this,key,value);};}
(window as unknown as {__autosaveQA:unknown}).__autosaveQA={task:()=>task,requests:()=>requests,reads:()=>reads,remote:(patch:object)=>{task={...task,...patch};sessionStorage.setItem('qa:server',JSON.stringify(task));},delay:(n:number)=>{delay=n;},fail:(value:boolean)=>{fail=value;},contention:(value:boolean)=>{contention=value;},recovery:listLocalRecovery,archiveRecovery,readNoteEnvelope};
history.replaceState(null,'',location.pathname+location.search+(location.search?'&':'?')+'task='+task.id);
createRoot(document.getElementById('root')!).render(<TaskSpace account={{name:'QA',email:'qa@example.test'}} preferences={{...DEFAULT_TASK_PREFERENCES,upcomingCollapsed:false}}/>);
