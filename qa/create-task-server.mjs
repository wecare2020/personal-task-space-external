import {createServer} from 'node:http';
const base={id:'qa-existing',title:'Existing task',date:'2026-09-20T00:00:00.000Z',completed:false,status:'today',isTop:false,team:false,detail:'<p>Existing content</p>',projectId:'',projectIds:[]};
let tasks=[{...base},{...base,id:'qa-completed',title:'Completed task',completed:true}];
let readMode='immediate',createMode='hold',posts=0,appends=0;
const heldReads=[],heldCreates=[];
function send(res,body,status=200){if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));}
function data(){return {ok:true,result:{tasks:structuredClone(tasks),projects:[]}};}
createServer(async(req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/state'){send(res,{tasks,posts,appends,heldReads:heldReads.length,heldCreates:heldCreates.length});return;}
  if(req.method==='GET'){const snapshot=data();if(readMode==='hold')heldReads.push(()=>send(res,snapshot));else send(res,snapshot);return;}
  let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text||'{}');
  if(path==='/control'){
    if(body.reset){tasks=[{...base},{...base,id:'qa-completed',title:'Completed task',completed:true}];posts=0;appends=0;}
    if(body.readMode)readMode=body.readMode;if(body.createMode)createMode=body.createMode;
    if(body.releaseReads)heldReads.splice(0).forEach(release=>release());
    if(body.releaseCreates)heldCreates.splice(0).forEach(release=>release());
    send(res,{ok:true});return;
  }
  if(body.action==='create'){
    posts++;let task=tasks.find(task=>task.id===body.task.id);
    if(!task){task={...base,...body.task};tasks.push(task);appends++;}
    const response={ok:true,result:{success:true,task:structuredClone(task)}};
    if(createMode==='hold')heldCreates.push(()=>send(res,response));
    else if(createMode==='commit-error')send(res,{ok:false,error:'Response lost after commit'},503);
    else send(res,response);
    return;
  }
  if(body.action==='update'){const task=tasks.find(task=>task.id===body.id);if(!task){send(res,{ok:false,error:'Task not found'},404);return;}Object.assign(task,body.updates);send(res,{ok:true,result:{success:true,task}});return;}
  send(res,{ok:false,error:'Unsupported action'},400);
}).listen(43124,'127.0.0.1',()=>process.stdout.write('Create-task QA API: http://127.0.0.1:43124\n'));
