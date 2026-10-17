import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require=createRequire(import.meta.url),ownerA='a'.repeat(64),ownerB='b'.repeat(64);
const root=new URL('../',import.meta.url);
const previousSecret=process.env.AUTH_SECRET;
process.env.AUTH_SECRET='test-only-routed-token-secret-with-more-than-32-characters';
after(()=>{if(previousSecret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=previousSecret;});
class DataError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const fingerprint=async value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function load(path,imports={}){
 const module={exports:{}};
 const source=ts.transpileModule(readFileSync(new URL(path,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:path})(id=>id in imports?imports[id]:require(id),module,module.exports);
 return module.exports;
}
function ownerFixture(){
 let session=null,active,opens=0;
 const scope={optionalWorkspaceOwner:()=>active,withWorkspace:async(owner,operation,options)=>{opens++;const before=active;active=owner;try{return await operation();}finally{active=before;}}};
 const api=load('app/data/owner.ts',{'../../auth':{auth:async()=>session},'./github-workspace':scope,'./model':{DataError}});
 return {api,setSession:value=>{session=value;},setActive:value=>{active=value;},opens:()=>opens};
}
function authFixture(){
 let config;
 const api=load('auth.ts',{'next-auth':{__esModule:true,default:value=>{config=value;return{};}},'next-auth/providers/github':{__esModule:true,default:options=>({id:'github',...options})}});
 return{api,config};
}
const routedTokens=load('app/data/routed-token.ts',{'server-only':{}});
function bearer(owner=ownerA){return 'pts_read_'+routedTokens.createRoutedToken(owner,'read');}
const request=(headers={},url='https://tasks.test/api/tasks')=>new Request(url,{headers});

test('routed capabilities authenticate owner, nonce and kind with a server-only MAC',()=>{
 const token=routedTokens.createRoutedToken(ownerA,'read'),[owner,nonce,mac]=token.split('.');
 assert.equal(owner,ownerA);assert.match(nonce,/^[a-f0-9]{64}$/);assert.match(mac,/^[a-f0-9]{64}$/);
 assert.equal(routedTokens.routedTokenOwner(token,'read'),ownerA);
 assert.equal(routedTokens.routedTokenOwner(token,'share'),null);
 for(const forged of [ownerB+'.'+nonce+'.'+mac,owner+'.'+(nonce[0]==='a'?'b':'a')+nonce.slice(1)+'.'+mac,owner+'.'+nonce+'.'+(mac[0]==='a'?'b':'a')+mac.slice(1),owner+'.'+nonce,token+'.extra'])assert.equal(routedTokens.routedTokenOwner(forged,'read'),null);
 assert.notEqual(routedTokens.createRoutedToken(ownerA,'read'),token);
});
test('missing, weak or changed signing secrets fail closed without a fallback',()=>{
 const original=process.env.AUTH_SECRET,token=routedTokens.createRoutedToken(ownerA,'read');
 try{
  for(const secret of [undefined,'','too-short']){if(secret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=secret;assert.equal(routedTokens.routedTokenOwner(token,'read'),null);assert.throws(()=>routedTokens.createRoutedToken(ownerA,'read'),/not configured/);}
  process.env.AUTH_SECRET='a-different-test-only-secret-with-at-least-32-characters';assert.equal(routedTokens.routedTokenOwner(token,'read'),null);
 }finally{process.env.AUTH_SECRET=original;}
});

test('GitHub identity is stable, immutable-ID based and separate per account',()=>{
 const {api}=authFixture();
 assert.equal(api.githubOwnerId(123),createHash('sha256').update('github:123').digest('hex'));
 assert.equal(api.githubOwnerId('123'),api.githubOwnerId(123));
 assert.notEqual(api.githubOwnerId(124),api.githubOwnerId(123));
 for(const value of [null,undefined,0,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,{},true,'01','abc','../1'])assert.throws(()=>api.githubOwnerId(value));
});
test('Auth.js uses JWT without a database adapter or repository OAuth scopes',()=>{
 const {config}=authFixture();
 assert.equal(config.session.strategy,'jwt');assert.equal(config.adapter,undefined);
 assert.equal(config.providers.length,1);assert.equal(config.providers[0].id,'github');
 assert.equal(config.providers[0].authorization.params.scope,'read:user user:email');
 assert.doesNotMatch(config.providers[0].authorization.params.scope,/\brepo\b|workflow|write/);
 assert.equal(config.pages.signIn,'/signin');
});
test('only verified GitHub login assigns an owner, client session updates cannot change it',async()=>{
 const {api,config}=authFixture();
 const signed=await config.callbacks.jwt({token:{},account:{provider:'github',access_token:'fixture-oauth-token'},profile:{id:123}});
 assert.equal(signed.ownerId,api.githubOwnerId(123));
 const updated=await config.callbacks.jwt({token:signed,trigger:'update',session:{ownerId:ownerB}});
 assert.equal(updated.ownerId,signed.ownerId);
 assert.equal(await config.callbacks.jwt({token:{},account:{provider:'credentials'},profile:{id:123}}),null);
 assert.equal(await config.callbacks.jwt({token:{},account:{provider:'github'},profile:null}),null);
});
test('OAuth access, refresh and ID tokens never reach the JWT or browser session',async()=>{
 const {config}=authFixture();
 const token=await config.callbacks.jwt({token:{access_token:'private-access',refresh_token:'private-refresh',id_token:'private-id'},account:{provider:'github',access_token:'private-access'},profile:{id:123}});
 assert.deepEqual(Object.keys(token),['ownerId']);
 const session=await config.callbacks.session({session:{user:{name:'Sample'}},token});
 assert.deepEqual(Object.keys(session.user),['name','ownerId']);
 assert.doesNotMatch(JSON.stringify(session),/private-access|private-refresh|private-id/);
 const invalid=await config.callbacks.session({session:{user:{}},token:{ownerId:'invalid'}});
 assert.equal(invalid.user.ownerId,undefined);
});
test('Sites headers, development localhost and global owner env do not authenticate',async()=>{
 const fixture=ownerFixture();
 for(const headers of [{},{'oai-authenticated-user-id':ownerA},{'oai-authenticated-user-email':'owner@example.test'},{'x-workspace-id':ownerA}]){
   await assert.rejects(fixture.api.requireOwner(request(headers,'http://localhost/api/tasks')),error=>error.code==='UNAUTHORIZED'&&error.status===401);
 }
 assert.equal(fixture.opens(),0);
 for(const value of ['invalid','a'.repeat(63),'A'.repeat(64),'../'+ownerA]){fixture.setSession({user:{ownerId:value}});await assert.rejects(fixture.api.requireOwner(request()),error=>error.status===401);}
});
test('owner authorization checks both active context and stale-tab account hints',async()=>{
 const fixture=ownerFixture();fixture.setSession({user:{ownerId:ownerA}});
 assert.equal(await fixture.api.requireOwner(request()),ownerA);
 assert.equal(await fixture.api.requireOwner(request({'x-workspace-id':ownerA})),ownerA);
 await assert.rejects(fixture.api.requireOwner(request({'x-workspace-id':ownerB})),error=>error.code==='ACCOUNT_CHANGED'&&error.status===403);
 fixture.setActive(ownerB);await assert.rejects(fixture.api.requireOwner(request()),error=>error.code==='FORBIDDEN');
 fixture.setActive(ownerA);assert.equal(await fixture.api.requireOwner(request()),ownerA);
});
test('workspace routing authenticates before loading a snapshot and scopes operations',async()=>{
 const fixture=ownerFixture();
 await assert.rejects(fixture.api.withOwnerWorkspace(request(),async()=>assert.fail('Must not run')));
 assert.equal(fixture.opens(),0);
 fixture.setSession({user:{ownerId:ownerA}});
 const result=await fixture.api.withOwnerWorkspace(request({'x-workspace-id':ownerA}),async owner=>({owner,verified:await fixture.api.requireOwner(request())}),{write:true});
 assert.deepEqual(result,{owner:ownerA,verified:ownerA});assert.equal(fixture.opens(),1);
});
test('browser writes require same-origin JSON; legacy runners fail closed',()=>{
 const {verifyBrowserWrite,verifyRunner,reply,failure}=load('app/data/http.ts',{'./model':{DataError}});
 assert.doesNotThrow(()=>verifyBrowserWrite(request({origin:'https://tasks.test','content-type':'application/json'})));
 for(const headers of [{'content-type':'application/json'},{origin:'https://evil.test','content-type':'application/json'},{origin:'null','content-type':'application/json'}])assert.throws(()=>verifyBrowserWrite(request(headers)),error=>error.code==='FORBIDDEN');
 assert.throws(()=>verifyBrowserWrite(request({origin:'https://tasks.test','content-type':'text/plain'})),error=>error.code==='INVALID');
 assert.throws(()=>verifyRunner(request({'x-sync-secret':'any-old-secret'})),error=>error.status===410);
 for(const response of [reply({}),failure(new Error('Private detail'))]){assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('vary'),'Cookie');assert.equal(response.headers.get('x-task-storage'),'github');}
});
function readFixture(){
 let active=ownerA,opens=0;
 const rows=[];
 const db={prepare(sql){let values;return{bind(...input){values=input;return this;},async first(){return rows.find(row=>row.token_hash===values[0]&&row.revoked_at===null&&row.expires_at>values[1])||null;},async all(){return{results:rows.filter(row=>row.owner_id===values[0])};},async run(){if(sql.startsWith('INSERT')){const[id,owner_id,name,token_hash,created_at,expires_at]=values;rows.push({id,owner_id,name,token_hash,created_at,expires_at,revoked_at:null});return{meta:{changes:1}};}const row=rows.find(row=>row.id===values[1]&&row.owner_id===values[2]);if(row)row.revoked_at=values[0];return{meta:{changes:row?1:0}};}};}};
 const scope={currentWorkspaceOwner:()=>active,withWorkspace:async(owner,operation)=>{opens++;const previous=active;active=owner;try{return await operation();}finally{active=previous;}}};
 const api=load('app/data/task-api.ts',{'./github-workspace':scope,'./model':{DataError,fingerprint},'./store':{ready:async()=>true},'./routed-token':routedTokens});
 return {api,db,rows,setActive:owner=>{active=owner;},opens:()=>opens};
}
test('read keys encode only an owner routing hint and require secret/hash validation inside that owner',async()=>{
 const f=readFixture();
 const key=await f.api.createReadKey(f.db,ownerA,{name:'Integration',days:30});
 assert.match(key.token,new RegExp('^pts_read_'+ownerA+'\\.[a-f0-9]{64}\\.[a-f0-9]{64}$'));
 assert.equal(f.rows[0].token_hash,await fingerprint(key.token));assert.notEqual(f.rows[0].token_hash,key.token);
 const valid=request({authorization:'Bearer '+key.token});
 assert.equal(f.api.taskReadOwner(valid),ownerA);assert.equal(await f.api.authorizeTaskRead(valid,f.db),ownerA);
 f.setActive(ownerB);await assert.rejects(f.api.authorizeTaskRead(valid,f.db),error=>error.status===401);
 f.setActive(ownerA);await assert.rejects(f.api.authorizeTaskRead(request({authorization:'Bearer '+bearer(ownerA)}),f.db),error=>error.status===401);
 const forged=request({authorization:'Bearer '+key.token.replace(ownerA,ownerB)});
 await assert.rejects(f.api.withTaskReadWorkspace(forged,()=>f.api.authorizeTaskRead(forged,f.db)),error=>error.status===401);
 assert.equal(f.opens(),0);
});
test('expired and revoked read keys fail immediately and owner key management is scoped',async()=>{
 const f=readFixture(),key=await f.api.createReadKey(f.db,ownerA,{name:'Integration'}),valid=request({authorization:'Bearer '+key.token});
 f.rows[0].expires_at=Date.now()-1;await assert.rejects(f.api.authorizeTaskRead(valid,f.db),error=>error.status===401);
 f.rows[0].expires_at=Date.now()+60_000;await f.api.revokeReadKey(f.db,ownerA,key.id);await assert.rejects(f.api.authorizeTaskRead(valid,f.db),error=>error.status===401);
 f.setActive(ownerB);await assert.rejects(f.api.listReadKeys(f.db,ownerA),error=>error.status===401);await assert.rejects(f.api.createReadKey(f.db,ownerA,{name:'Other'}),error=>error.status===401);await assert.rejects(f.api.revokeReadKey(f.db,ownerA,key.id),error=>error.status===401);
});
test('legacy token formats and forged session/share credentials cannot route a read API request',()=>{
 const f=readFixture();
 for(const token of [null,'pts_read_'+'a'.repeat(64),'a'.repeat(64),'pts_read_../workspace.foo.bar','Bearer '+bearer(),bearer()+' extra'])assert.throws(()=>f.api.taskReadOwner(request(token?{authorization:'Bearer '+token}:{})),error=>error.status===401);
 assert.throws(()=>f.api.taskReadOwner(request({'oai-authenticated-user-id':ownerA,'x-workspace-id':ownerA})),error=>error.status===401);
});
test('invalid routed signatures and signed share tokens never load a read API snapshot',async()=>{
 const f=readFixture(),valid=bearer(),tampered=valid.replace(ownerA,ownerB),share='pts_read_'+routedTokens.createRoutedToken(ownerA,'share');
 for(const token of [tampered,share,valid.slice(0,-1)+(valid.at(-1)==='a'?'b':'a')])await assert.rejects(f.api.withTaskReadWorkspace(request({authorization:'Bearer '+token}),async()=>assert.fail('Do not load a snapshot')),error=>error.status===401);
 assert.equal(f.opens(),0);
});
test('task mutation request JSON is parsed once before snapshot conflict replay',async()=>{
 let calls=0;const seen=[];
 const owner={withOwnerWorkspace:async(_request,operation)=>{await operation(ownerA);return operation(ownerA);}};
 const route=load('app/api/tasks/route.ts',{'../../data/owner':owner,'../../data/db':{database:()=>({})},'../../data/store':{mutate:async(_db,body)=>{seen.push(body);return{saved:true};}},'../../data/http':{verifyBrowserWrite(){},reply:result=>Response.json(result),failure:error=>{throw error;}}});
 const input={action:'patch',patch:{title:'Sample'}};
 const response=await route.POST({json:async()=>{calls++;if(calls>1)throw Error('Body already consumed');return input;}});
 assert.equal(response.status,200);assert.equal(calls,1);assert.equal(seen.length,2);assert.equal(seen[0],input);assert.equal(seen[1],input);
});
test('legacy Sheet endpoints have no remote links or runtime imports and always retire runner writes',async()=>{
 for(const name of ['sync/run','sync/admin']){
   const path='app/api/'+name+'/route.ts',source=readFileSync(new URL(path,root),'utf8');
   assert.doesNotMatch(source,/sheetRequest|runBackup|fetch\(|https?:\/\//);
   const response=await load(path).POST(request());assert.equal(response.status,410);assert.equal((await response.json()).code,'RETIRED');
 }
 assert.doesNotMatch(readFileSync(new URL('app/api/sheet-link/route.ts',root),'utf8'),/docs\.google\.com|Response\.redirect/);
 assert.doesNotMatch(readFileSync(new URL('app/data/backup-runner.ts',root),'utf8'),/vinext|\.\/backup|waitUntil/);
});
test('account display comes from session data and never interprets Sites headers',()=>{
 const {personalAccount}=load('app/personal-account.ts');
 assert.deepEqual(personalAccount({name:' Sample User ',email:'sample@example.test',ownerId:ownerA}),{name:'Sample User',email:'sample@example.test',ownerId:ownerA});
 assert.deepEqual(personalAccount(new Headers({'oai-authenticated-user-full-name':'Spoofed'})),{name:'Account',email:''});
});
test('sign-in return paths cannot redirect outside the workspace',async()=>{
 const old=Object.fromEntries(['AUTH_GITHUB_ID','AUTH_GITHUB_SECRET','AUTH_SECRET'].map(key=>[key,process.env[key]]));
 Object.assign(process.env,{AUTH_GITHUB_ID:'fixture-client',AUTH_GITHUB_SECRET:'fixture-secret',AUTH_SECRET:'fixture-session-secret'});
 try{
  for(const [returnTo,expected] of [['//evil.test','/'],['https://evil.test','/'],['/\\evil.test','/'],['/settings?section=task-types','/settings?section=task-types'],['/api-access','/api-access'],['/api/auth/signout','/']]){
   let destination;
   const {default:Page}=load('app/signin/page.tsx',{'../../auth':{auth:async()=>null,signIn:async(provider,options)=>{assert.equal(provider,'github');destination=options.redirectTo;}},'next/navigation':{redirect(){assert.fail('Unexpected redirect');}}});
   const element=await Page({searchParams:Promise.resolve({returnTo})});
   const form=element.props.children.find(child=>child?.type==='form');assert.ok(form);await form.props.action();assert.equal(destination,expected);
  }
 }finally{for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
