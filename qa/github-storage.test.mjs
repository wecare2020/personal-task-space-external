import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,imports={}){
  const module={exports:{}};
  const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:path})(id=>imports[id]??require(id),module,module.exports);return module.exports;
}
const repositoryModule=load('../app/data/github-repository.ts');
const {GithubRepository,GithubRepositoryError,gitBlobSha}=repositoryModule;
const {withWorkspace,workspaceDatabase,currentWorkspaceOwner}=load('../app/data/github-workspace.ts',{'./github-repository':repositoryModule});
const workspaceModule={workspaceDatabase};
const dbModule=load('../app/data/db.ts',{'./github-workspace':workspaceModule});
const formModule=load('../app/task-form-data.ts');
const modelModule=load('../app/data/model.ts',{'../task-form-data':formModule});
const coreTasks=await import('@wecare2020/ph-core/tasks');
const {mutate}=load('../app/data/store.ts',{'./model':modelModule,'./db':dbModule,'../task-preferences':coreTasks,'../task-schema':coreTasks});
const alice='a'.repeat(64),bob='b'.repeat(64);
const bytes=value=>new TextEncoder().encode(value);
class MemoryRepository {
  files=new Map();writes=[];race;
  async read(path){const entry=this.files.get(path);return entry?{sha:entry.sha,bytes:entry.bytes.slice()}:null;}
  async write(path,value,sha){
    if(this.race){const race=this.race;this.race=null;await race(path);}
    const existing=this.files.get(path);
    if(existing?.sha!==sha)throw new GithubRepositoryError('REPOSITORY_CONFLICT','race',409);
    const next={sha:gitBlobSha(value),bytes:value.slice()};this.files.set(path,next);this.writes.push({path,sha});return {sha:next.sha};
  }
  async delete(path,sha){if(this.files.get(path)?.sha!==sha)throw new GithubRepositoryError('REPOSITORY_CONFLICT','race',409);this.files.delete(path);}
}
async function value(owner,repo,key){return withWorkspace(owner,async()=>workspaceDatabase().prepare('SELECT value FROM native_state WHERE key=?').bind(key).first('value'),{repository:repo});}
async function put(owner,repo,key,text){return withWorkspace(owner,async()=>workspaceDatabase().prepare('INSERT INTO native_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,text).run(),{repository:repo,write:true});}

test('missing workspace has two blank top notes and reads never create commits',async()=>{
  const repo=new MemoryRepository();await withWorkspace(alice,async()=>{assert.equal(currentWorkspaceOwner(),alice);const result=await workspaceDatabase().prepare('SELECT data FROM native_tasks').all();assert.deepEqual(result.results.map(row=>JSON.parse(row.data).title),['Overall','Next & Note']);assert.ok(result.results.every(row=>JSON.parse(row.data).detail===''));},{repository:repo});assert.equal(repo.writes.length,0);
});
test('owner isolation and SHA CAS are preserved on sequential writes',async()=>{
  const repo=new MemoryRepository();await put(alice,repo,'note','alice');await put(bob,repo,'note','bob');const previous=repo.files.get(`workspaces/${alice}.json`).sha;await put(alice,repo,'note','alice2');assert.equal(await value(alice,repo,'note'),'alice2');assert.equal(await value(bob,repo,'note'),'bob');assert.equal(repo.writes.at(-1).sha,previous);await assert.rejects(()=>withWorkspace('../alice',async()=>{}, {repository:repo}));assert.throws(()=>workspaceDatabase());
});
test('failed request and error Response rollback all writes',async()=>{
  const repo=new MemoryRepository();await assert.rejects(()=>withWorkspace(alice,async()=>{await workspaceDatabase().prepare("INSERT INTO native_state VALUES('x','bad')").run();throw new Error('fail');},{repository:repo,write:true}),/fail/);assert.equal(repo.writes.length,0);
  const output=await withWorkspace(alice,async()=>{await workspaceDatabase().prepare("INSERT INTO native_state VALUES('x','bad')").run();return new Response('failed',{status:409});},{repository:repo,write:true});assert.equal(output.status,409);assert.equal(repo.writes.length,0);
});
test('atomic D1 batch rollback and SELECT batch/raw/first compatibility',async()=>{
  const repo=new MemoryRepository();await withWorkspace(alice,async()=>{
    const db=workspaceDatabase();await assert.rejects(()=>db.batch([db.prepare("INSERT INTO native_state VALUES('x','bad')"),db.prepare("INSERT INTO native_state VALUES('ready','duplicate')")]));assert.equal(await db.prepare("SELECT value FROM native_state WHERE key='x'").first('value'),null);
    const selected=await db.batch([db.prepare("SELECT value FROM native_state WHERE key='ready'")]);assert.equal(selected[0].results[0].value,'1');assert.deepEqual(await db.prepare("SELECT value FROM native_state WHERE key='ready'").raw({columnNames:true}),[['value'],['1']]);
  },{repository:repo,write:true});assert.equal(repo.writes.length,0);
});
test('repository race reloads fresh snapshot and reruns entire callback',async()=>{
  const repo=new MemoryRepository();await put(alice,repo,'base','yes');let calls=0;
  repo.race=async()=>{await put(alice,repo,'concurrent','kept');};
  await withWorkspace(alice,async()=>{calls++;await workspaceDatabase().prepare("INSERT INTO native_state VALUES('local','kept')").run();},{repository:repo,write:true});
  assert.equal(calls,2);assert.equal(await value(alice,repo,'concurrent'),'kept');assert.equal(await value(alice,repo,'local'),'kept');
});
test('CAS retries are bounded and failed commits are not acknowledged',async()=>{
  const repo=new MemoryRepository();repo.write=async()=>{throw new GithubRepositoryError('REPOSITORY_CONFLICT','race',409);};let calls=0;
  await assert.rejects(()=>withWorkspace(alice,async()=>{calls++;await workspaceDatabase().prepare("INSERT INTO native_state VALUES('x','a')").run();return 'saved';},{repository:repo,write:true}),{code:'REPOSITORY_CONFLICT'});assert.equal(calls,3);
});
test('malformed snapshots, foreign owner and unknown tables fail closed',async()=>{
  const repo=new MemoryRepository();await put(alice,repo,'safe','yes');const path=`workspaces/${alice}.json`,original=repo.files.get(path);
  for(const transform of [snapshot=>({...snapshot,owner:bob}),snapshot=>({...snapshot,tables:{...snapshot.tables,users:[]}}),snapshot=>({...snapshot,tables:{...snapshot.tables,native_state:[{key:'ready',value:1}]}})]){
    const changed=bytes(JSON.stringify(transform(JSON.parse(new TextDecoder().decode(original.bytes)))));repo.files.set(path,{sha:gitBlobSha(changed),bytes:changed});await assert.rejects(()=>value(alice,repo,'safe'),{code:'INVALID_WORKSPACE'});
  }
  repo.files.set(path,{sha:'x',bytes:bytes('{bad')});await assert.rejects(()=>value(alice,repo,'safe'),{code:'INVALID_WORKSPACE'});assert.equal(repo.writes.length,1);
});
test('read-only contexts cannot write and concurrent owners keep separate context',async()=>{
  const repo=new MemoryRepository();await assert.rejects(()=>withWorkspace(alice,async()=>workspaceDatabase().prepare("INSERT INTO native_state VALUES('x','bad')").run(),{repository:repo}),/readonly/i);
  await Promise.all([alice,bob].map(owner=>withWorkspace(owner,async()=>{await Promise.resolve();assert.equal(currentWorkspaceOwner(),owner);},{repository:repo})));
});
test('optional read revalidation replays against changed snapshot without committing',async()=>{
  const repo=new MemoryRepository();await put(alice,repo,'grant','active');const path=`workspaces/${alice}.json`,initial=repo.files.get(path);
  const changed=JSON.parse(new TextDecoder().decode(initial.bytes));changed.tables.native_state.find(row=>row.key==='grant').value='changed';const next=bytes(JSON.stringify(changed));let calls=0,reads=0;
  const originalRead=repo.read.bind(repo);repo.read=async path=>{reads++;return originalRead(path);};
  const result=await withWorkspace(alice,async()=>{calls++;const value=await workspaceDatabase().prepare("SELECT value FROM native_state WHERE key='grant'").first('value');if(calls===1)repo.files.set(path,{sha:gitBlobSha(next),bytes:next});return value;},{repository:repo,revalidate:true});
  assert.equal(result,'changed');assert.equal(calls,2);assert.equal(reads,4);assert.equal(repo.writes.length,1);
  reads=0;await value(alice,repo,'grant');assert.equal(reads,1,'ordinary reads have no additional repository call');
});
test('read revalidation rejects a grant revoked during binary I/O and never returns old response',async()=>{
  const repo=new MemoryRepository();await put(alice,repo,'grant','active');const path=`workspaces/${alice}.json`,initial=repo.files.get(path);
  const changed=JSON.parse(new TextDecoder().decode(initial.bytes));changed.tables.native_state.find(row=>row.key==='grant').value='revoked';const next=bytes(JSON.stringify(changed));let calls=0;
  await assert.rejects(()=>withWorkspace(alice,async()=>{calls++;const grant=await workspaceDatabase().prepare("SELECT value FROM native_state WHERE key='grant'").first('value');if(grant!=='active')throw new Error('Grant revoked');repo.files.set(path,{sha:gitBlobSha(next),bytes:next});return new Response('private image');},{repository:repo,revalidate:true}),/Grant revoked/);
  assert.equal(calls,2);assert.equal(repo.writes.length,1);
});
test('existing native task create/update receipts remain idempotent through snapshots',async()=>{
  const repo=new MemoryRepository(),id='task-example-1234';
  const created=await withWorkspace(alice,()=>mutate(workspaceDatabase(),{action:'create',task:{id,title:'First'}}),{repository:repo,write:true});assert.equal(created.id,id);
  const update={action:'update',id,protocol:2,requestId:'request-one-1234',updates:{title:'Renamed'},expectedValues:{title:'First'}};
  await withWorkspace(alice,()=>mutate(workspaceDatabase(),update),{repository:repo,write:true});const commits=repo.writes.length;
  const retry=await withWorkspace(alice,()=>mutate(workspaceDatabase(),update),{repository:repo,write:true});assert.equal(retry.title,'Renamed');assert.equal(repo.writes.length,commits);
  await assert.rejects(()=>withWorkspace(alice,()=>mutate(workspaceDatabase(),{...update,updates:{title:'Unexpected'}}),{repository:repo,write:true}),{code:'INVALID'});
});
test('fresh snapshot retry preserves concurrent task fields and rejects same-field conflicts',async()=>{
  const repo=new MemoryRepository(),id='task-example-2345';await withWorkspace(alice,()=>mutate(workspaceDatabase(),{action:'create',task:{id,title:'First'}}),{repository:repo,write:true});
  repo.race=()=>withWorkspace(alice,()=>mutate(workspaceDatabase(),{action:'update',id,protocol:2,requestId:'request-date-1234',updates:{date:'2026-10-17'},expectedValues:{date:''}}),{repository:repo,write:true});
  const renamed=await withWorkspace(alice,()=>mutate(workspaceDatabase(),{action:'update',id,protocol:2,requestId:'request-title-2345',updates:{title:'Local'},expectedValues:{title:'First'}}),{repository:repo,write:true});assert.equal(renamed.date,'2026-10-17');assert.equal(renamed.title,'Local');
  repo.race=()=>withWorkspace(alice,()=>mutate(workspaceDatabase(),{action:'update',id,protocol:2,requestId:'request-remote-1234',updates:{title:'Remote'},expectedValues:{title:'Local'}}),{repository:repo,write:true});
  await assert.rejects(()=>withWorkspace(alice,()=>mutate(workspaceDatabase(),{action:'update',id,protocol:2,requestId:'request-local-4567',updates:{title:'Other'},expectedValues:{title:'Local'}}),{repository:repo,write:true}),{code:'CONFLICT'});
  const saved=await withWorkspace(alice,async()=>workspaceDatabase().prepare('SELECT data FROM native_tasks WHERE id=?').bind(id).first('data'),{repository:repo});assert.equal(JSON.parse(saved).title,'Remote');
});

function mockGithub(handler){const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});return handler(new URL(url),init,calls);};const repo=new GithubRepository({owner:'example',repo:'private-data',token:'test-only-token',fetch:fetcher});return {repo,calls};}
const privacy=()=>Response.json({private:true,full_name:'example/private-data'});
test('repository validates privacy before any file access and blocks redirects',async()=>{
  const denied=mockGithub(()=>Response.json({private:false,full_name:'example/private-data'}));await assert.rejects(()=>denied.repo.read('workspaces/a.json'),{code:'PRIVATE_REPOSITORY_REQUIRED'});assert.equal(denied.calls.length,1);
  const redirected=mockGithub(()=>new Response('',{status:302,headers:{location:'https://evil.invalid'}}));await assert.rejects(()=>redirected.repo.read('workspaces/a.json'),{code:'REDIRECT_BLOCKED'});assert.equal(redirected.calls[0].init.redirect,'error');
});
test('large files use immutable blob SHA and validate content integrity',async()=>{
  const content=bytes('x'.repeat(1024*1024+1)),sha=gitBlobSha(content);const {repo,calls}=mockGithub(url=>url.pathname.endsWith('/private-data')?privacy():url.pathname.includes('/contents/')?Response.json({type:'file',sha,size:content.byteLength,download_url:'https://evil.invalid'}):new Response(content));const result=await repo.read('images/owner/id');assert.equal(result.sha,sha);assert.equal(result.bytes.length,content.length);assert.ok(calls[2].url.endsWith(`/git/blobs/${sha}`));assert.ok(calls.every(call=>new URL(call.url).origin==='https://api.github.com'));
  const bad=mockGithub(url=>url.pathname.endsWith('/private-data')?privacy():url.pathname.includes('/contents/')?Response.json({type:'file',sha,size:content.byteLength}):new Response(bytes('corrupt')));await assert.rejects(()=>bad.repo.read('x.json'),{code:'INVALID_STORAGE_FILE'});
});
test('repository write includes previous SHA, create omits SHA, 409 never forces',async()=>{
  const content=bytes('data'),sha=gitBlobSha(content);const {repo,calls}=mockGithub((url,init)=>init.method==='PUT'?Response.json({content:{sha}}):privacy());await repo.write('x.json',content,'a'.repeat(40));assert.equal(JSON.parse(calls[1].init.body).sha,'a'.repeat(40));await repo.write('new.json',content);assert.equal('sha' in JSON.parse(calls[3].init.body),false);
  const conflict=mockGithub((url,init)=>init.method==='PUT'?new Response('',{status:409}):privacy());await assert.rejects(()=>conflict.repo.write('x.json',content,'a'.repeat(40)),{code:'REPOSITORY_CONFLICT'});assert.equal(conflict.calls.length,2);
});
