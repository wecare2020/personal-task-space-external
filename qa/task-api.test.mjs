import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

const root=new URL('../',import.meta.url),origin='https://site.test',owner='fixture-owner';
const token=character=>'pts_read_'+character.repeat(64);
const keyId=character=>character.repeat(8)+'-'+character.repeat(4)+'-4'+character.repeat(3)+'-8'+character.repeat(3)+'-'+character.repeat(12);
const tokens={valid:token('a'),expired:token('b'),revoked:token('c'),foreign:token('d'),wrong:token('e')};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base={date:'2026-10-06',completed:false,status:'today',isTop:false,team:false,projectId:'Finance',projectIds:['Finance'],detail:'<p><b>Private fixture notes</b></p>'};
const fixtures=[
 {...base,id:'task-qa-0001',title:'Alpha plan',unknownPrivate:'Never publish this field'},
 {...base,id:'task-qa-0002',title:'Bravo plan',status:'upcoming',team:true,projectId:'Finance, Operations',projectIds:['Finance','Operations']},
 {...base,id:'task-qa-0003',title:'Charlie done',status:'upcoming',completed:true,projectId:'Operations',projectIds:['Operations']},
 {...base,id:'task-qa-0004',title:'Delta later',status:'later',projectId:'',projectIds:[]},
 {...base,id:'task-qa-0005',title:'Deleted fixture'},
 {...base,id:'task-qa-0006',title:'Echo next',status:'upcoming',projectId:'Operations',projectIds:['Operations']},
];
const source=`
import * as list from './app/api/v1/tasks/route.ts';
import * as detail from './app/api/v1/tasks/[id]/route.ts';
import * as keys from './app/api/task-read-keys/route.ts';
export default {async fetch(request){
 delete process.env.APP_OWNER_ID;
 const path=new URL(request.url).pathname;let route,context;
 if(path==='/api/v1/tasks')route=list;
 else if(path.startsWith('/api/v1/tasks/')){route=detail;context={params:Promise.resolve({id:decodeURIComponent(path.slice('/api/v1/tasks/'.length))})};}
 else if(path==='/api/task-read-keys')route=keys;
 else return new Response('Not found',{status:404});
 const handler=route[request.method];return handler?handler(request,context):new Response(null,{status:405});
}};
`;
let mf,db,outboundCalls=0;
async function call(path='/api/v1/tasks',{method='GET',key=tokens.valid,headers={},body}={}){
 const h={...(key?{authorization:'Bearer '+key}:{}),...headers};
 const response=await mf.dispatchFetch(origin+path,{method,headers:h,...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
 return {status:response.status,headers:response.headers,...await response.json()};
}
const ownerHeaders={'oai-authenticated-user-id':owner,'content-type':'application/json',origin};
const manage=(body,options={})=>call('/api/task-read-keys',{method:'POST',key:null,headers:ownerHeaders,body,...options});
async function snapshot(){
 const result={};
 for(const table of ['native_tasks','native_outbox','native_receipts','native_recovery','native_state','native_task_read_keys'])
   result[table]=(await db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results;
 return JSON.stringify(result);
}
before(async()=>{
 const bundled=await build({stdin:{contents:source,resolveDir:fileURLToPath(root)},bundle:true,write:false,format:'esm',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},external:['cloudflare:workers','node:*']});
 mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{SHEET_API_URL:'https://sheet-fixture.test/exec',SHEET_API_TOKEN:'fixture-only'},outboundService:()=>{outboundCalls++;return Response.json({ok:true,result:{tasks:[]}});}});
 db=await mf.getD1Database('DB');
 for(const name of readdirSync(new URL('drizzle/',root)).filter(name=>name.endsWith('.sql')).sort())
   for(const sql of readFileSync(new URL('drizzle/'+name,root),'utf8').split('--> statement-breakpoint').filter(sql=>sql.trim()))await db.prepare(sql).run();
});
after(async()=>{await mf?.dispose();});
beforeEach(async()=>{
 for(const table of ['native_receipts','native_recovery','native_outbox','native_task_shares','native_task_read_keys','native_tasks','native_state'])await db.prepare('DELETE FROM '+table).run();
 for(const [index,task] of fixtures.entries())await db.prepare('INSERT INTO native_tasks(id,data,version,baseline,sync_revision,deleted,updated_at) VALUES(?,?,?, ?,?,?,?)').bind(task.id,JSON.stringify(task),index+1,'private-baseline-'+index,10+index,task.id==='task-qa-0005'?1:0,1_000+index).run();
 for(const [key,value] of [['ready','1'],['app_owner_id',owner],['lease','fixture sync lease']])await db.prepare('INSERT INTO native_state(key,value) VALUES(?,?)').bind(key,value).run();
 await db.prepare('INSERT INTO native_outbox(task_id,version,next_attempt) VALUES(?,1,1000)').bind(fixtures[0].id).run();
 await db.prepare('INSERT INTO native_receipts(id,fingerprint,task_id,result,created_at) VALUES(?,?,?,?,0)').bind('fixture-receipt','fixture-hash',fixtures[0].id,'private fixture receipt').run();
 await db.prepare('INSERT INTO native_recovery(id,task_id,data,reason,created_at) VALUES(?,?,?,?,0)').bind('fixture-recovery',fixtures[0].id,'private fixture recovery','fixture').run();
 const now=Date.now();
 for(const [name,value] of Object.entries(tokens).filter(([name])=>name!=='wrong'))await db.prepare('INSERT INTO native_task_read_keys(id,owner_id,name,token_hash,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?)').bind(keyId(value.at(-1)),name==='foreign'?'another-owner':owner,name,hash(value),now,name==='expired'?now-1:now+86_400_000,name==='revoked'?now-1000:null).run();
 const share='f'.repeat(64);await db.prepare('INSERT INTO native_task_shares(task_id,token,token_hash,owner_id,permission,generation,updated_at) VALUES(?,?,?,?,?,1,0)').bind(fixtures[0].id,share,hash(share),owner,'edit').run();
 outboundCalls=0;
});

test('external list and detail require a live bearer read key, never session or share authorization',async()=>{
 const cases=[{key:null},{key:null,headers:{'oai-authenticated-user-id':owner}},{key:null,headers:{authorization:'Basic '+tokens.valid}},{key:null,headers:{authorization:'Bearer invalid'}},{key:null,headers:{authorization:'Bearer '+tokens.valid+' extra'}},...['wrong','expired','revoked','foreign'].map(name=>({key:tokens[name]})),{key:'f'.repeat(64)}];
 for(const path of ['/api/v1/tasks','/api/v1/tasks/task-qa-0001'])for(const options of cases){const result=await call(path,options);assert.equal(result.status,401,JSON.stringify({path,options,result}));assert.equal(result.code,'UNAUTHORIZED');assert.match(result.headers.get('www-authenticate'),/^Bearer /);assert.ok(!JSON.stringify(result).includes('Private fixture notes'));}
 assert.equal((await call('/api/v1/tasks?token='+tokens.valid,{key:null})).status,401);
 assert.equal((await call('/api/v1/tasks/task-qa-0001?token='+tokens.valid,{key:null})).status,401);
 assert.equal((await call('/api/v1/tasks?token='+tokens.valid)).status,400);
});
test('default list is active metadata only; detail provides exact notes and safe version metadata',async()=>{
 const list=await call();assert.equal(list.status,200);assert.equal(list.result.storage,'d1');assert.deepEqual(list.result.items.map(task=>task.id),['task-qa-0001','task-qa-0002','task-qa-0004','task-qa-0006']);assert.equal(list.result.nextCursor,null);
 for(const task of list.result.items){assert.ok(!('detail' in task));assert.ok(!('baseline' in task));assert.ok(!('sync_revision' in task));assert.ok(!('unknownPrivate' in task));assert.ok(Number.isInteger(task.version));assert.ok(Number.isInteger(task.updatedAt));}
 const detail=await call('/api/v1/tasks/task-qa-0001');assert.equal(detail.status,200);assert.equal(detail.result.task.detail,fixtures[0].detail);assert.equal(detail.result.task.version,1);assert.equal(detail.result.task.updatedAt,1000);assert.ok(!JSON.stringify(detail).includes('Never publish this field'));assert.ok(!('baseline' in detail.result.task));
 const included=await call('/api/v1/tasks?includeDetail=true');assert.equal(included.result.items[0].detail,fixtures[0].detail);
});
test('list/detail reads never alter native tasks, sync, recovery, receipts, keys or state',async()=>{
 const before=await snapshot();
 await call();await call('/api/v1/tasks?completed=all&includeDetail=true');await call('/api/v1/tasks/task-qa-0001');await call('/api/v1/tasks/task-qa-0003');
 assert.equal(await snapshot(),before);assert.equal(outboundCalls,0);
});
test('write methods on external routes are explicit 405 and cannot change tasks',async()=>{
 const before=await snapshot();
 for(const path of ['/api/v1/tasks','/api/v1/tasks/task-qa-0001'])for(const method of ['POST','PUT','PATCH','DELETE']){
  const result=await call(path,{method,body:{action:'delete',id:fixtures[0].id,title:'Injected overwrite'}});assert.equal(result.status,405);assert.equal(result.code,'READ_ONLY');assert.equal(result.headers.get('allow'),'GET');
 }
 assert.equal(await snapshot(),before);assert.equal(outboundCalls,0);
});
test('deleted and nonexistent task identifiers stay unavailable; unsafe IDs cannot query storage',async()=>{
 for(const id of ['task-qa-0005','missing-task'])assert.equal((await call('/api/v1/tasks/'+id)).status,404);
 for(const id of ['x'.repeat(151),'bad\u0000id'])assert.equal((await call('/api/v1/tasks/'+encodeURIComponent(id))).status,400);
 assert.equal((await call('/api/v1/tasks/'+encodeURIComponent("' OR 1=1 --"))).status,404);
});
test('keyset pagination gives each filtered task exactly once, independent of page size',async()=>{
 const first=await call('/api/v1/tasks?completed=all&limit=2');assert.deepEqual(first.result.items.map(t=>t.id),['task-qa-0001','task-qa-0002']);assert.ok(first.result.nextCursor);
 const next=await call('/api/v1/tasks?completed=all&limit=1&cursor='+first.result.nextCursor);assert.deepEqual(next.result.items.map(t=>t.id),['task-qa-0003']);assert.ok(next.result.nextCursor);
 const end=await call('/api/v1/tasks?completed=all&limit=100&cursor='+next.result.nextCursor);assert.deepEqual(end.result.items.map(t=>t.id),['task-qa-0004','task-qa-0006']);assert.equal(end.result.nextCursor,null);
 const ids=[...first.result.items,...next.result.items,...end.result.items].map(t=>t.id);assert.equal(new Set(ids).size,5);
});
test('cursor is bound to completed/status/project/search filters and rejects malformed input',async()=>{
 const first=await call('/api/v1/tasks?limit=1');
 for(const change of ['completed=all','status=upcoming','project=Finance','q=plan'])assert.equal((await call('/api/v1/tasks?limit=1&'+change+'&cursor='+first.result.nextCursor)).status,400,change);
 for(const cursor of ['', '!', 'bm90LWpzb24','a'.repeat(2401)])assert.equal((await call('/api/v1/tasks?cursor='+encodeURIComponent(cursor))).status,400);
});
test('filters combine with exact project membership and literal title search',async()=>{
 const ids=result=>result.result.items.map(t=>t.id);
 assert.deepEqual(ids(await call('/api/v1/tasks?completed=completed')),['task-qa-0003']);
 assert.deepEqual(ids(await call('/api/v1/tasks?status=upcoming&project=Operations')),['task-qa-0002','task-qa-0006']);
 assert.deepEqual(ids(await call('/api/v1/tasks?project=Finance&q=BRAVO')),['task-qa-0002']);
 assert.deepEqual(ids(await call('/api/v1/tasks?project=Fin')),[]);
 assert.deepEqual(ids(await call('/api/v1/tasks?q='+encodeURIComponent("' OR 1=1 --"))),[]);
});
test('limits, invalid filters, unsupported and duplicate query arguments are bounded',async()=>{
 for(const query of ['limit=0','limit=101','limit=-1','limit=1.5','limit=Infinity','limit=','completed=true','status=unknown','includeDetail=1','project=','q='+('x'.repeat(201)),'project='+('x'.repeat(201)),'limit=1&limit=2','status=today&status=upcoming','unknown=value'])assert.equal((await call('/api/v1/tasks?'+query)).status,400,query);
 assert.equal((await call('/api/v1/tasks?limit=100')).status,200);
 assert.equal((await call('/api/v1/tasks?includeDetail=true&limit=10')).status,200);
 assert.equal((await call('/api/v1/tasks?includeDetail=true&limit=11')).status,400);
});
test('default detail pages stop at ten full documents and offer a usable cursor',async()=>{
 for(let i=10;i<25;i++)await db.prepare('INSERT INTO native_tasks(id,data,updated_at) VALUES(?,?,0)').bind('task-qa-'+i,JSON.stringify({...base,id:'task-qa-'+i,title:'Additional fixture '+i})).run();
 const result=await call('/api/v1/tasks?includeDetail=true');assert.equal(result.status,200);assert.equal(result.result.items.length,10);assert.ok(result.result.nextCursor);assert.ok(result.result.items.every(task=>task.detail===base.detail));
 const next=await call('/api/v1/tasks?includeDetail=true&cursor='+result.result.nextCursor);assert.equal(next.status,200);assert.equal(new Set([...result.result.items,...next.result.items].map(task=>task.id)).size,19);
});
test('native-not-ready is a no-store 503 and never falls back to Sheets',async()=>{
 await db.prepare("UPDATE native_state SET value='0' WHERE key='ready'").run();const before=await snapshot();
 for(const path of ['/api/v1/tasks','/api/v1/tasks/task-qa-0001']){const result=await call(path);assert.equal(result.status,503);assert.equal(result.code,'NOT_READY');assert.equal(result.headers.get('cache-control'),'no-store');}
 assert.equal(await snapshot(),before);assert.equal(outboundCalls,0);
});
test('all external success/failure responses are uncacheable without permissive CORS',async()=>{
 for(const result of [await call(),await call('/api/v1/tasks/task-qa-0001'),await call('/api/v1/tasks',{key:null}),await call('/api/v1/tasks?limit=0'),await call('/api/v1/tasks/missing')]){
  assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('cdn-cache-control'),'no-store');assert.equal(result.headers.get('access-control-allow-origin'),null);assert.equal(result.headers.get('x-content-type-options'),'nosniff');
 }
});
test('key management accepts only exact owner identity, never bearer authority',async()=>{
 for(const options of [{key:null},{key:tokens.valid},{key:null,headers:{'oai-authenticated-user-id':'another-owner'}}]){const result=await call('/api/task-read-keys',options);assert.equal(result.status,options.headers?403:401);}
 const before=await snapshot();assert.equal((await manage({action:'create',name:'Denied'},{headers:{'content-type':'application/json',origin}})).status,401);assert.equal(await snapshot(),before);
});
test('owner creation returns a one-time secret; DB and later listing contain metadata only',async()=>{
 const beforeTask=(await db.prepare('SELECT * FROM native_tasks ORDER BY id').all()).results;
 const result=await manage({action:'create',name:'  Isolated QA agent  ',days:30});assert.equal(result.status,201);assert.match(result.result.token,/^pts_read_[a-f0-9]{64}$/);assert.equal(result.result.name,'Isolated QA agent');assert.equal(result.result.scope,'tasks:read');assert.ok(result.result.expiresAt>result.result.createdAt);
 const stored=await db.prepare('SELECT * FROM native_task_read_keys WHERE id=?').bind(result.result.id).first();assert.equal(stored.token_hash,hash(result.result.token));assert.ok(!JSON.stringify(stored).includes(result.result.token));
 const listing=await call('/api/task-read-keys',{key:null,headers:{'oai-authenticated-user-id':owner}});assert.equal(listing.status,200);assert.ok(listing.result.keys.some(k=>k.id===result.result.id));assert.ok(listing.result.keys.every(k=>!('token' in k)&&!('token_hash' in k)&&!('owner_id' in k)));assert.ok(!JSON.stringify(listing).includes(result.result.token));assert.ok(!listing.result.keys.some(k=>k.id===keyId('d')));
 assert.equal((await call('/api/v1/tasks',{key:result.result.token})).status,200);assert.deepEqual((await db.prepare('SELECT * FROM native_tasks ORDER BY id').all()).results,beforeTask);
});
test('management rejects cross-origin, non-JSON, malformed and oversized key requests without writes',async()=>{
 const before=await snapshot();
 const requests=[{body:{action:'create',name:'Unsafe'},headers:{...ownerHeaders,origin:'https://other.test'}},{body:{action:'create',name:'Unsafe'},headers:{...ownerHeaders,'content-type':'text/plain'}},{body:'{',headers:ownerHeaders},{body:'[]',headers:ownerHeaders},{body:'null',headers:ownerHeaders},{body:'x'.repeat(2049),headers:ownerHeaders}];
 for(const options of requests){const result=await manage(options.body,{headers:options.headers});assert.ok([400,403,413].includes(result.status),JSON.stringify(result));}
 for(const body of [{action:'create',name:''},{action:'create',name:'x'.repeat(81)},{action:'create',name:'Test',days:'90'},{action:'create',name:'Test',days:10},{action:'unsupported'},{action:'revoke',id:'bad'}])assert.equal((await manage(body)).status,400);
 assert.equal(await snapshot(),before);
});
test('owner revocation is immediate, repeatable, and cannot revoke another owner key',async()=>{
 assert.equal((await manage({action:'revoke',id:keyId('d')})).status,404);assert.equal((await db.prepare('SELECT revoked_at FROM native_task_read_keys WHERE id=?').bind(keyId('d')).first()).revoked_at,null);
 const result=await manage({action:'revoke',id:keyId('a')});assert.equal(result.status,200);assert.deepEqual(result.result,{id:keyId('a'),revoked:true});assert.equal((await call()).status,401);assert.equal((await manage({action:'revoke',id:keyId('a')})).status,200);
});
test('key cap counts only live keys for this owner and revocation frees capacity',async()=>{
 const now=Date.now();for(let i=0;i<19;i++)await db.prepare('INSERT INTO native_task_read_keys(id,owner_id,name,token_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,'Additional fixture '+i,hash('additional-key-'+i),now,now+86_400_000).run();
 const denied=await manage({action:'create',name:'Above cap'});assert.equal(denied.status,409);assert.equal(denied.code,'KEY_LIMIT');
 await manage({action:'revoke',id:keyId('a')});assert.equal((await manage({action:'create',name:'After revoke'})).status,201);
});
