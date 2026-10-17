import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();let activeRepository;
process.env.AUTH_SECRET='asset-security-tests-only-not-a-production-secret';
function load(path){
  const absolute=resolve(fileURLToPath(new URL('../app/',import.meta.url)),path);if(cache.has(absolute))return cache.get(absolute);
  const module={exports:{}};cache.set(absolute,module.exports);
  const source=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:absolute})(id=>id==='server-only'?{}:id.startsWith('.')?load(resolve(dirname(absolute),id+'.ts')):require(id),module,module.exports);
  if(absolute.endsWith('github-repository.ts'))module.exports.repository=()=>activeRepository;
  cache.set(absolute,module.exports);return module.exports;
}
const repoModule=load('data/github-repository.ts'),{GithubRepositoryError,gitBlobSha}=repoModule;
const assets=load('data/github-assets.ts'),images=load('data/images.ts'),sanitizer=load('data/share-html.ts'),shares=load('data/shares.ts'),workspace=load('data/github-workspace.ts'),routed=load('data/routed-token.ts');
const alice='a'.repeat(64),bob='b'.repeat(64),id='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222',origin='https://task.test';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3]);
class MemoryRepository{
  files=new Map();writes=0;reads=0;race;
  async read(path){this.reads++;const row=this.files.get(path);return row?{sha:row.sha,bytes:row.bytes.slice()}:null;}
  async write(path,bytes,sha){if(this.race){const race=this.race;this.race=null;await race(path,bytes);}const prior=this.files.get(path);if(prior?.sha!==sha)throw new GithubRepositoryError('REPOSITORY_CONFLICT','race',409);const next={sha:gitBlobSha(bytes),bytes:bytes.slice()};this.files.set(path,next);this.writes++;return {sha:next.sha};}
  async delete(path,sha){if(this.files.get(path)?.sha!==sha)throw new GithubRepositoryError('REPOSITORY_CONFLICT','race',409);this.files.delete(path);this.writes++;}
}
const run=(repo,owner,operation,write=false)=>workspace.withWorkspace(owner,operation,{repository:repo,write});
const db=()=>workspace.workspaceDatabase();
function upload(bytes=png,extra={}){return new Request(origin+'/api/images',{method:'POST',headers:{origin,'content-type':'image/png','x-image-id':id,...extra},body:bytes});}

test('binary assets stay separate from workspace JSON, private and owner scoped',async()=>{
  const repo=new MemoryRepository();activeRepository=repo;
  await assets.putImage(alice,id,png,'image/png',repo);assert.equal(repo.files.size,1);assert.ok(repo.files.has(`images/${alice}/${id}.bin`));assert.equal(await assets.getImage(bob,id,repo),null);
  const response=await images.readImage(new Request(origin+'/api/images/'+id),alice,id);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/^private/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
  assert.equal((await images.readImage(new Request(origin+'/api/images/'+id),bob,id)).status,404);
  for(const owner of ['../outside','owner',alice+'/../bob'])assert.throws(()=>assets.imageKey(owner,id));
});
test('immutable uploads are idempotent and preserve bytes under racing writes',async()=>{
  const repo=new MemoryRepository();await assets.putImage(alice,id,png,'image/png',repo);await assets.putImage(alice,id,png,'image/png',repo);assert.equal(repo.writes,1);
  await assert.rejects(()=>assets.putImage(alice,id,Uint8Array.from([...png,9]),'image/png',repo),{status:409});
  const race=new MemoryRepository();race.race=async(path,bytes)=>{race.files.set(path,{sha:gitBlobSha(bytes),bytes:bytes.slice()});};await assets.putImage(alice,id,png,'image/png',race);assert.deepEqual((await assets.getImage(alice,id,race)).bytes,png);
});
test('uploads reject spoofed identity, formats, cross-site origins and oversized direct bodies',async()=>{
  activeRepository=new MemoryRepository();assert.equal((await images.uploadImage(upload(png,{'oai-authenticated-user-id':bob}),alice)).status,200);assert.equal(await assets.getImage(bob,id,activeRepository),null);
  assert.equal((await images.uploadImage(upload(png,{origin:'https://evil.test'}),alice)).status,403);
  assert.equal((await images.uploadImage(upload(png,{'sec-fetch-site':'cross-site'}),alice)).status,403);
  await assert.rejects(()=>assets.putImage(alice,otherId,new TextEncoder().encode('<svg/>'),'image/png',activeRepository),{status:415});
  assert.equal((await images.uploadImage(upload(new Uint8Array(assets.UPLOAD_CHUNK_BYTES+1)),alice)).status,413);
});
test('8 MB images use <=2 MB parts and survive complete retry without duplicate assets',async()=>{
  const repo=new MemoryRepository(),bytes=new Uint8Array(8*1024*1024);bytes.set(png);const headers={'x-image-size':String(bytes.length),'x-image-parts':'4','x-image-sha256':assets.bytesHash(bytes)};
  for(let part=0;part<4;part++){const request=upload(bytes.slice(part*assets.UPLOAD_CHUNK_BYTES,(part+1)*assets.UPLOAD_CHUNK_BYTES),{...headers,'x-image-upload':'chunk','x-image-part':String(part)});assert.equal((await assets.receiveImage(alice,request,'owner',repo)).complete,false);}
  const complete=()=>new Request(origin+'/api/images',{method:'POST',headers:{'content-type':'image/png','x-image-id':id,...headers,'x-image-upload':'complete'}});
  assert.equal((await assets.receiveImage(alice,complete(),'owner',repo)).complete,true);const writes=repo.writes;
  assert.equal((await assets.receiveImage(alice,complete(),'owner',repo)).result.size,bytes.length);assert.equal(repo.writes,writes);assert.deepEqual((await assets.getImage(alice,id,repo)).bytes,bytes);
});
test('partial uploads cannot mix owner, scope, content or incomplete parts',async()=>{
  const repo=new MemoryRepository(),bytes=new Uint8Array(assets.UPLOAD_CHUNK_BYTES+10);bytes.set(png);const headers={'x-image-size':String(bytes.length),'x-image-parts':'2','x-image-sha256':assets.bytesHash(bytes),'x-image-upload':'chunk','x-image-part':'0'};
  await assets.receiveImage(alice,upload(bytes.slice(0,assets.UPLOAD_CHUNK_BYTES),headers),'grant-1',repo);
  await assert.rejects(()=>assets.receiveImage(alice,upload(bytes.slice(0,assets.UPLOAD_CHUNK_BYTES),headers),'grant-2',repo),{status:409});
  const complete=new Request(origin+'/api/images',{method:'POST',headers:{'content-type':'image/png','x-image-id':id,...headers,'x-image-upload':'complete'}});
  await assert.rejects(()=>assets.receiveImage(alice,complete,'grant-1',repo),{code:'UPLOAD_INCOMPLETE'});assert.equal(await assets.getImage(alice,id,repo),null);assert.equal(await assets.getImage(bob,id,repo),null);
});
test('structural sanitizer preserves lean document formats and removes executable HTML',async()=>{
  const token=routed.createRoutedToken(alice,'share'),html='<script>alert(1)</script><!--secret--><svg><a href="javascript:bad">bad</a></svg><p onclick="bad()" style="color:#789;background-image:url(https://evil.test)">Hi <a href="javascript:alert(1)">bad link</a><a href="https://safe.test/a">Safe</a></p><details><summary>Open</summary><p data-editor-todo="true">Done</p></details><img src="/api/images/'+id+'" onerror="bad()"><img src="/api/images/'+otherId+'"><iframe src="https://evil.test"></iframe>';
  const result=await sanitizer.shareHtml(html,{origin,token,assets:new Set([id]),mode:'read'});
  for(const unsafe of ['<script','<!--','<svg','onclick','onerror','javascript:','background-image','evil.test',otherId])assert.ok(!result.includes(unsafe),unsafe);
  assert.ok(result.includes('color:#789'));assert.ok(result.includes('data-editor-todo="true"'));assert.ok(result.includes('rel="noopener noreferrer"'));assert.ok(result.includes('/api/shared/'+token+'/images/'+id));
  const write=await sanitizer.shareHtml(result,{origin,token,assets:new Set([id]),mode:'write'});assert.ok(write.includes('/api/images/'+id));assert.ok(!write.includes('/api/shared/'));
});
test('token prefix selects one owner; hash, generation, permissions and revoke still authorize',async()=>{
  const repo=new MemoryRepository();activeRepository=repo;
  const shared=await run(repo,alice,async()=>shares.setShare(db(),alice,'task-overall',{permission:'edit',generation:0},origin),true),token=shared.url.split('/s/')[1];
  assert.equal(shares.shareOwner(token),alice);assert.throws(()=>shares.shareOwner('c'.repeat(64)),{status:404});
  assert.equal((await run(repo,alice,async()=>shares.grant(db(),token))).permission,'edit');
  await assert.rejects(()=>run(repo,bob,async()=>shares.grant(db(),token)),{status:404});
  await assert.rejects(()=>run(repo,alice,async()=>shares.grant(db(),routed.createRoutedToken(alice,'share'))),{status:404});
  await run(repo,alice,async()=>shares.setShare(db(),alice,'task-overall',{permission:'view',generation:1},origin),true);
  await assert.rejects(()=>run(repo,alice,async()=>shares.grant(db(),token,true)),{status:403});
  await run(repo,alice,async()=>shares.setShare(db(),alice,'task-overall',{permission:'private',generation:2},origin),true);
  await assert.rejects(()=>run(repo,alice,async()=>shares.grant(db(),token)),{status:404});
});
test('tampered or unsigned share routing is rejected before any private repository read',async()=>{
  const repo=new MemoryRepository(),token=routed.createRoutedToken(alice,'share');
  const serve=async(candidate)=>run(repo,shares.shareOwner(candidate),async()=>shares.grant(db(),candidate));
  for(const candidate of [alice+'.'+'f'.repeat(64),token.slice(0,-1)+(token.at(-1)==='0'?'1':'0'),bob+token.slice(64),routed.createRoutedToken(alice,'read')])await assert.rejects(()=>serve(candidate),{status:404});
  assert.equal(repo.reads,0);assert.equal(repo.writes,0);
});
test('public image access requires live grant, mapped owner asset and current reference',async()=>{
  const repo=new MemoryRepository();activeRepository=repo;await assets.putImage(alice,id,png,'image/png',repo);
  const state=await run(repo,alice,async()=>{const row=await db().prepare("SELECT data FROM native_tasks WHERE id='task-overall'").first();const task=JSON.parse(row.data);task.detail='<img src="/api/images/'+id+'">';await db().prepare("UPDATE native_tasks SET data=? WHERE id='task-overall'").bind(JSON.stringify(task)).run();return shares.setShare(db(),alice,'task-overall',{permission:'view',generation:0},origin);},true),token=state.url.split('/s/')[1];
  const document=await run(repo,alice,async()=>shares.sharedTask(db(),token,origin),true);assert.ok(document.detail.includes('/api/shared/'+token+'/images/'+id));
  assert.equal((await run(repo,alice,async()=>shares.readSharedImage(db(),token,id,origin))).status,200);
  await assert.rejects(()=>run(repo,alice,async()=>shares.readSharedImage(db(),token,otherId,origin)),{status:404});
  await run(repo,alice,async()=>{const row=await db().prepare("SELECT data FROM native_tasks WHERE id='task-overall'").first();const task=JSON.parse(row.data);task.detail='';await db().prepare("UPDATE native_tasks SET data=? WHERE id='task-overall'").bind(JSON.stringify(task)).run();},true);
  await assert.rejects(()=>run(repo,alice,async()=>shares.readSharedImage(db(),token,id,origin)),{status:404});
});
test('revocation during binary I/O is revalidated before a public image response escapes',async()=>{
  const repo=new MemoryRepository();activeRepository=repo;await assets.putImage(alice,id,png,'image/png',repo);
  const state=await run(repo,alice,async()=>{const row=await db().prepare("SELECT data FROM native_tasks WHERE id='task-overall'").first();const task=JSON.parse(row.data);task.detail='<img src="/api/images/'+id+'">';await db().prepare("UPDATE native_tasks SET data=? WHERE id='task-overall'").bind(JSON.stringify(task)).run();return shares.setShare(db(),alice,'task-overall',{permission:'view',generation:0},origin);},true),token=state.url.split('/s/')[1];
  await run(repo,alice,async()=>shares.sharedTask(db(),token,origin),true);
  const originalRead=repo.read.bind(repo);let revoked=false;
  repo.read=async path=>{
    if(path===assets.imageKey(alice,id)&&!revoked){
      revoked=true;const workspacePath=`workspaces/${alice}.json`,snapshot=JSON.parse(new TextDecoder().decode(repo.files.get(workspacePath).bytes));
      snapshot.tables.native_task_shares[0].permission='private';snapshot.tables.native_task_shares[0].generation++;
      const bytes=new TextEncoder().encode(JSON.stringify(snapshot));repo.files.set(workspacePath,{sha:gitBlobSha(bytes),bytes});
    }
    return originalRead(path);
  };
  await assert.rejects(()=>workspace.withWorkspace(alice,async()=>shares.readSharedImage(db(),token,id,origin),{repository:repo,write:true,revalidate:true}),{status:404});assert.equal(revoked,true);
});
