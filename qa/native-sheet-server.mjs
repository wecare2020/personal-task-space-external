import {createServer} from 'node:http';
const initial={id:'task-native-qa-0001',title:'Native data QA',detail:'<ul><li><strong>Quick note</strong></li><li>Test content</li></ul>',date:'2026-09-20T00:00:00.000Z',completed:false,status:'today',isTop:false,team:false,projectId:'',projectIds:[]};
const tasks=new Map([[initial.id,initial]]);let failure=false,delay=0,calls=0,exports=0;
createServer(async(req,res)=>{let text='';for await(const c of req)text+=c;let body={};try{body=JSON.parse(text||'{}');}catch{}const path=new URL(req.url,'http://localhost').pathname;const send=(result,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(result));};
 if(path==='/__qa'){if(body.task)tasks.set(body.task.id,body.task);if('failure' in body)failure=body.failure;if('delay' in body)delay=body.delay;return send({tasks:[...tasks.values()],calls,exports});}
 calls++;if(delay)await new Promise(r=>setTimeout(r,delay));if(failure)return send({ok:false,error:'QA Sheet unavailable'},503);
 if(req.method==='GET'||['nativePrepare','nativeSnapshot'].includes(body.action))return send({ok:true,result:{tasks:[...tasks.values()],projects:[],deleted:[],backupId:'qa-local-only'}});
 if(body.action==='nativeApply'){exports++;const current=tasks.get(body.id)||null;if(JSON.stringify(current)!==JSON.stringify(body.base)&&JSON.stringify(current)!==JSON.stringify(body.desired))return send({ok:false,code:'CONFLICT',error:'Changed',currentTask:current});if(body.desired)tasks.set(body.id,body.desired);else tasks.delete(body.id);return send({ok:true,result:{task:body.desired}});}
 send({ok:false,error:'Unsupported'});
}).listen(43123,'127.0.0.1',()=>console.log('Native Sheet QA on http://127.0.0.1:43123'));
