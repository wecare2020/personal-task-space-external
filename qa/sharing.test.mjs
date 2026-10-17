import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {noteEnvelope,parseNoteAttribute} from '../app/blocknote-document.ts';

const root=new URL('../',import.meta.url), origin='https://site.test';
const task={id:'share-qa-task',title:'Private title',detail:'<p>Hello</p>',date:'2026-09-10',completed:false,status:'today',isTop:false,team:false,projectId:'Secret project',projectIds:['Secret project']};
let mf,db,token;
const source=`
import * as shares from './app/data/shares.ts';
import {shareHtml} from './app/data/share-html.ts';
import {requireOwner} from './app/data/owner.ts';
export default {async fetch(request,env){try{
 const b=await request.json();const db=env.DB;let result;
 if(b.action==='set')result=await shares.setShare(db,'owner',b.id||'share-qa-task',b,'https://site.test');
 else if(b.action==='read')result=await shares.sharedTask(db,env.IMAGES,b.token,'https://site.test');
 else if(b.action==='edit')result=await shares.editSharedTask(db,b.token,b.edit,'https://site.test');
 else if(b.action==='sanitize')result=await shareHtml(b.html,{origin:'https://site.test',token:b.token,assets:new Set(b.assets||[]),mode:b.mode||'read'});
 else if(b.action==='owner'){process.env.APP_OWNER_ID='owner';result=await requireOwner(new Request('https://site.test/api/tasks',{headers:b.headers||{}}));}
 else if(b.action==='image')return await shares.readSharedImage(db,env.IMAGES,b.token,b.id,'https://site.test');
 else if(b.action==='upload'){const bytes=Uint8Array.from(atob(b.bytes),c=>c.charCodeAt(0));return await shares.uploadSharedImage(db,env.IMAGES,new Request('https://site.test/api/shared/'+b.token+'/images',{method:'POST',headers:{origin:'https://site.test','content-type':'image/png','x-image-id':b.id},body:bytes}),b.token);}
 else if(b.action==='race'){const real=db.batch.bind(db);const wrapped={prepare:s=>db.prepare(s),batch:async statements=>{await db.prepare(b.sql).bind(...(b.args||[])).run();return real(statements);}};result=await shares.editSharedTask(wrapped,b.token,b.edit,'https://site.test');}
 return Response.json({ok:true,result});
 }catch(e){return Response.json({ok:false,error:e.message,code:e.code},{status:e.status||500});}}};
`;
async function call(body){const response=await mf.dispatchFetch(origin,{method:'POST',body:JSON.stringify(body)});return {status:response.status,...await response.json()};}
before(async()=>{
 const bundled=await build({stdin:{contents:source,resolveDir:decodeURIComponent(root.pathname).replace(/^\/([A-Z]:)/,'$1')},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
 mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['IMAGES']});
 db=await mf.getD1Database('DB');
 for(const name of readdirSync(new URL('drizzle/',root)).filter(n=>n.endsWith('.sql')).sort())
   for(const sql of readFileSync(new URL('drizzle/'+name,root),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
});
after(async()=>{await mf?.dispose();});
beforeEach(async()=>{
 for(const table of ['native_receipts','native_recovery','native_outbox','native_task_shares','native_share_assets','native_share_limits','native_tasks'])await db.prepare('DELETE FROM '+table).run();
 await db.prepare('INSERT INTO native_tasks(id,data,updated_at) VALUES(?,?,0)').bind(task.id,JSON.stringify(task)).run();
 const result=await call({action:'set',permission:'edit',generation:0});assert.equal(result.status,200);token=new URL(result.result.url).pathname.slice(3);
});
const edit=(overrides={})=>({title:'Guest title',detail:'<p><b>Guest notes</b></p>',version:1,requestId:'guest-request-0001',...overrides});
const stored=async()=>JSON.parse((await db.prepare('SELECT data FROM native_tasks WHERE id=?').bind(task.id).first()).data);

test('owner authorization denies anonymous and other accounts; only exact Site owner passes',async()=>{
 assert.equal((await call({action:'owner'})).status,401);
 assert.equal((await call({action:'owner',headers:{'oai-authenticated-user-id':'other'}})).status,403);
 assert.equal((await call({action:'owner',headers:{'oai-authenticated-user-id':'owner'}})).status,200);
});
test('anonymous projection contains only title, notes, version and permission',async()=>{
 const result=await call({action:'read',token});assert.equal(result.status,200);
 assert.deepEqual(Object.keys(result.result).sort(),['detail','permission','title','version']);
 assert.ok(!JSON.stringify(result).includes('Secret project'));
});
test('view links cannot write; arbitrary/private task IDs do not grant access',async()=>{
 await call({action:'set',permission:'view',generation:1});
 assert.equal((await call({action:'edit',token,edit:edit()})).status,403);
 assert.equal((await call({action:'read',token:task.id})).status,404);
 assert.equal((await call({action:'edit',token,edit:edit({completed:true})})).status,403);
 assert.equal((await stored()).title,task.title);
});
test('guest fields are allowlisted and successful save is versioned, recoverable, queued once',async()=>{
 assert.equal((await call({action:'edit',token,edit:edit({completed:true})})).status,400);
 const result=await call({action:'edit',token,edit:edit()});assert.equal(result.status,200);assert.equal(result.result.version,2);
 const current=await stored();assert.equal(current.title,'Guest title');assert.equal(current.projectId,'Secret project');
 for(const table of ['native_receipts','native_recovery','native_outbox'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,1);
 assert.equal((await call({action:'edit',token,edit:edit()})).result.version,2);
 assert.equal((await db.prepare('SELECT version FROM native_tasks').first()).version,2);
});
test('stale edits cannot overwrite owner changes; conflict response contains no private fields',async()=>{
 await db.prepare('UPDATE native_tasks SET version=2').run();
 const result=await call({action:'edit',token,edit:edit()});assert.equal(result.status,409);assert.ok(!JSON.stringify(result).includes('Secret project'));assert.equal((await stored()).title,task.title);
});
test('revocation, replacement, deletion and downgrade are enforced inside the write transaction',async()=>{
 for(const sql of ["UPDATE native_task_shares SET permission='private'","UPDATE native_task_shares SET generation=generation+1","UPDATE native_tasks SET deleted=1","UPDATE native_task_shares SET permission='view'"]){
   await db.prepare("UPDATE native_task_shares SET permission='edit',generation=1").run();await db.prepare('UPDATE native_tasks SET deleted=0').run();
   const result=await call({action:'race',token,edit:edit(),sql});assert.ok([403,404,409].includes(result.status),JSON.stringify(result));
   assert.equal((await stored()).title,task.title);assert.equal((await db.prepare('SELECT COUNT(*) n FROM native_receipts').first()).n,0);
 }
});
test('revoked link cannot replay a successful receipt or read after rotation',async()=>{
 await call({action:'edit',token,edit:edit()});await call({action:'set',permission:'private',generation:1});
 assert.equal((await call({action:'edit',token,edit:edit()})).status,404);
 assert.equal((await call({action:'read',token})).status,404);
 const reopened=await call({action:'set',permission:'view',generation:2});assert.notEqual(new URL(reopened.result.url).pathname.slice(3),token);
});
test('HTML allowlist blocks script, namespace, rawtext, active attributes and CSS URLs',async()=>{
 const inputs=['<noembed><img src=x onerror=alert(1)></noembed>','<noframes><img src=x onerror=alert(1)></noframes>','<svg><foreignObject><p onclick=alert(1)>bad</p></foreignObject></svg>','<math><mtext><img src=x onerror=alert(1)></mtext></math>','<p onclick="x" style="color:red;background-image:url(https://evil.test)">safe<script>bad()</script></p>','<a href="javascript:alert(1)">link</a>','<iframe src="https://evil.test"></iframe>'];
 for(const html of inputs){const result=await call({action:'sanitize',token,html});assert.equal(result.status,200);assert.doesNotMatch(result.result,/onerror|onclick|javascript:|<script|<iframe|background-image|<svg|<math/);}
});
test('formatting survives: callout, 3 columns, tables, to-do, nested numbering and bold',async()=>{
 const html='<div data-editor-callout="callout-1"><p><b>Bold</b></p></div><div data-editor-columns="3" data-layout-id="cols-1"><div data-editor-column="3"><p data-editor-todo="false">Todo</p></div></div><div data-editor-table="table-1" data-table-header="true"><table><tbody><tr><th>Cell</th></tr></tbody></table></div><ol><li data-list-number="1.2" data-list-extra-indent="2">Nested</li></ol>';
 const result=await call({action:'sanitize',token,html,mode:'write'});assert.equal(result.status,200);
 for(const expected of ['data-editor-callout="callout-1"','data-editor-column="3"','data-editor-table="table-1"','data-table-header="true"','data-editor-todo="false"','data-list-number="1.2"','<b>Bold</b>'])assert.ok(result.result.includes(expected),expected);
});

test('tree metadata survives shared edits; older guests cannot flatten a tree',async()=>{
 const html='<div data-editor-tree="tree-a"><div data-tree-title="">Process tree</div><div data-tree-node="a" data-tree-parent="" data-tree-collapsed="true"><div data-tree-name-cell=""><span data-tree-field="name">Parent</span></div><span data-tree-field="note">Note</span></div><div data-tree-node="b" data-tree-parent="a" data-tree-collapsed="false"><span data-tree-field="name">Child</span></div></div>';
 const sanitized=await call({action:'sanitize',token,html,mode:'write'});assert.equal(sanitized.status,200);assert.match(sanitized.result,/data-tree-parent="a"/);assert.match(sanitized.result,/data-tree-collapsed="true"/);assert.doesNotMatch(sanitized.result,/contenteditable/);
 assert.equal((await call({action:'edit',token,edit:edit({detail:html,editorSchema:7})})).status,200);
 assert.match((await stored()).detail,/data-tree-node="b"/);
 assert.equal((await call({action:'edit',token,edit:edit({detail:'<p>Lost tree</p>',version:2,requestId:'tree-old-request-2'})})).status,428);
 assert.match((await stored()).detail,/data-tree-parent="a"/);
});
test('internal image source AND open-photo anchor never persist bearer URLs',async()=>{
 const id='94b9e240-e976-4f1b-9c47-cce6763c3f22',url=origin+'/api/shared/'+token+'/images/'+id;
 const result=await call({action:'sanitize',token,mode:'write',assets:[id],html:'<figure data-editor-media="image"><img src="'+url+'"><a href="'+url+'">Open photo</a></figure>'});
 assert.equal(result.status,200);assert.ok(!result.result.includes(token));assert.equal((result.result.match(/\/api\/images\//g)||[]).length,2);
 const blocked=await call({action:'sanitize',token,assets:[],html:'<img src="'+origin+'/api/images/'+id+'">'});assert.equal(blocked.result,'');
});

test('BlockNote shared edits retain JSON and reject old clients; metadata cannot bypass HTML sanitization',async()=>{
 const blocks=[{id:'bn-parent',type:'toggleListItem',content:[{type:'text',text:'Toggle',styles:{}}],children:[{id:'bn-child',type:'checkListItem',props:{checked:true},content:[{type:'text',text:'Child',styles:{bold:true}}]}]},{id:'blank-1',type:'paragraph',content:[]},{id:'blank-2',type:'paragraph',content:[]}];
 const html=noteEnvelope(blocks);assert.equal((await call({action:'edit',token,edit:edit({detail:html,editorSchema:8})})).status,200);assert.match((await stored()).detail,/data-blocknote-document=/);assert.deepEqual(parseNoteAttribute((await stored()).detail.match(/data-blocknote-document="([^"]*)"/)[1]),blocks);
 const shared=await call({action:'read',token});assert.match(shared.result.detail,/data-blocknote-document=/);assert.deepEqual(parseNoteAttribute(shared.result.detail.match(/data-blocknote-document="([^"]*)"/)[1]),blocks);assert.match(shared.result.detail,/data-editor-todo="true"/);
 assert.equal((await call({action:'edit',token,edit:edit({detail:'<p>Lost document</p>',version:2,requestId:'blocknote-old-client',editorSchema:7})})).status,428);
 const evil=noteEnvelope([{type:'image',props:{url:'javascript:alert(1)'}}]);const clean=await call({action:'sanitize',token,html:evil,mode:'write'});assert.ok(!clean.result.includes('data-blocknote-document'));
});
test('BlockNote image metadata rewrites capability URLs and strips unmapped private references',async()=>{
 const id='94b9e240-e976-4f1b-9c47-cce6763c3f22',raw=origin+'/api/shared/'+token+'/images/'+id,html=noteEnvelope([{type:'image',props:{url:raw}}]);
 const mapped=await call({action:'sanitize',token,html,mode:'write',assets:[id]});assert.ok(!mapped.result.includes(token));assert.ok(mapped.result.includes('/api/images/'+id));
 const unmapped=await call({action:'sanitize',token,html,mode:'write',assets:[]});assert.ok(!unmapped.result.includes(id));
});
test('BlockNote videos retain allowlisted embeds and cannot persist internal bearer URLs',async()=>{
 const id='94b9e240-e976-4f1b-9c47-cce6763c3f22',raw=origin+'/api/shared/'+token+'/images/'+id;
 const mapped=await call({action:'sanitize',token,html:noteEnvelope([{type:'video',props:{url:raw}}]),mode:'write',assets:[id]});assert.ok(!mapped.result.includes(token));
 const unmapped=await call({action:'sanitize',token,html:noteEnvelope([{type:'video',props:{url:raw}}]),mode:'write',assets:[]});assert.ok(!unmapped.result.includes(token)&&!unmapped.result.includes(id));
 const embed='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',safe=await call({action:'sanitize',token,html:noteEnvelope([{type:'video',props:{url:embed}}]),mode:'read'});assert.ok(safe.result.includes(embed)&&safe.result.includes('<iframe'));
});
test('guest raster upload is scoped; removed published image and revoked link become unreadable',async()=>{
 const id='94b9e240-e976-4f1b-9c47-cce6763c3f22',bytes='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=';
 const upload=await call({action:'upload',token,id,bytes});assert.equal(upload.status,200);
 const image=()=>mf.dispatchFetch(origin,{method:'POST',body:JSON.stringify({action:'image',token,id})});
 assert.equal((await image()).status,200);
 const url=origin+upload.result.path;assert.equal((await call({action:'edit',token,edit:edit({detail:'<figure data-editor-media="image"><img src="'+url+'"></figure>'})})).status,200);
 assert.equal((await image()).status,200);
 await db.prepare('UPDATE native_tasks SET data=?').bind(JSON.stringify(task)).run();
 assert.equal((await image()).status,404);
});
test('all existing workspace data routes require owner checks; runner endpoints remain secret-gated',()=>{
 for(const path of ['tasks','sync','sync/recovery','images','images/[id]','shares/[id]','sheet-link'])assert.match(readFileSync(new URL('app/api/'+path+'/route.ts',root),'utf8'),/await requireOwner\(request\)/,path);
 for(const path of ['sync/run','sync/admin'])assert.match(readFileSync(new URL('app/api/'+path+'/route.ts',root),'utf8'),/verifyRunner\(request\)/,path);
 assert.doesNotMatch(readFileSync(new URL('app/shared-task.tsx',root),'utf8'),/readOwnedRecord|readMutationJournal|<TaskSpace/);
});
