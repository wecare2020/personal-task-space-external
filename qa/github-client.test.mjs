import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,imports={},globals={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:name=>imports[name]??require(name),console,URL,Headers,Request,crypto,Date,Map,Set,...globals});return module.exports;}
function storage(){const value={};Object.defineProperties(value,{getItem:{value:key=>Object.hasOwn(value,key)?value[key]:null},setItem:{value:(key,text)=>{value[key]=String(text);}},removeItem:{value:key=>{delete value[key];}}});return value;}
const A='a'.repeat(64),B='b'.repeat(64);
test('cache, draft, recovery and writer namespaces cannot cross accounts or adopt old Sites data',()=>{
 const window={localStorage:storage(),sessionStorage:storage()},document={body:{dataset:{workspaceId:A}}};
 const cache=load('../app/workspace-cache.ts',{}, {window,document});
 window.localStorage.setItem('personal-task-space:data:v1','legacy private data');
 assert.equal(cache.accountLocalStorage.getItem('personal-task-space:data:v1'),null);
 const reliability=load('../app/reliability.ts',{'./workspace-cache':cache},{window,document,localStorage:window.localStorage,sessionStorage:window.sessionStorage});
 assert.ok(reliability.writeOwnedRecord('detail-draft','task',{html:'A secret'}));
 reliability.archiveRecovery('task','detail','A secret','old');cache.accountSessionStorage.setItem('pending','A intent');
 document.body.dataset.workspaceId=B;
 assert.equal(reliability.readOwnedRecord('detail-draft','task'),null);assert.equal(reliability.listLocalRecovery().length,0);assert.equal(cache.accountSessionStorage.getItem('pending'),null);
 reliability.writeOwnedRecord('detail-draft','task',{html:'B secret'});
 document.body.dataset.workspaceId=A;
 assert.equal(reliability.readOwnedRecord('detail-draft','task').html,'A secret');assert.equal(cache.accountSessionStorage.getItem('pending'),'A intent');
});
test('remote autosave coalesces bursts and has a finite maximum wait without delaying local drafts',()=>{
 const {createAutosaveWindow,AUTOSAVE_QUIET_MS,AUTOSAVE_MAX_MS}=load('../app/autosave-window.ts');
 assert.equal(AUTOSAVE_QUIET_MS,30000);assert.equal(AUTOSAVE_MAX_MS,120000);
 const clock=createAutosaveWindow();assert.equal(clock.delay('detail:x',0),30000);assert.equal(clock.delay('detail:x',25000),30000);assert.equal(clock.delay('detail:x',110000),10000);assert.equal(clock.delay('detail:x',120001),0);
 assert.equal(clock.delay('detail:y',120001),30000);clock.reset('detail:x');assert.equal(clock.delay('detail:x',130000),30000);
 const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');assert.ok(source.indexOf('const persisted=writeTaskDetailDraft')<source.indexOf("autosaveWindow.delay('detail:'+id)"));assert.ok(source.includes('if(flush){void commitTaskDetail'));assert.ok(source.includes("autosaveWindow.reset('title:'+id)"));
 const shared=readFileSync(new URL('../app/shared-task.tsx',import.meta.url),'utf8');assert.ok(shared.includes("autosaveClock.current.delay('shared')"));assert.ok(!shared.includes('soon?50:700'));assert.ok(!shared.includes('setTimeout(()=>void flush(),500)'));
});
test('API traffic pins the tab owner and never sends it to a third-party origin',async()=>{
 const calls=[],window={localStorage:storage(),sessionStorage:storage()},document={body:{dataset:{workspaceId:A}}};
 const cache=load('../app/workspace-cache.ts',{}, {window,document,location:{origin:'https://tasks.example'},fetch:async(input,init)=>{calls.push(init);return new Response('ok');},Response});
 await cache.workspaceFetch('/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(calls[0].headers.get('x-workspace-id'),A);assert.equal(calls[0].headers.get('content-type'),'application/json');
 await cache.workspaceFetch('https://example.org/api/elsewhere');assert.equal(calls[1].headers.has('x-workspace-id'),false);
});
test('Core and Personal styles remain unchanged in the fork',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.dependencies['@wecare2020/ph-core'],'file:vendor/wecare2020-ph-core-0.5.2.tgz');
 const original=new URL('../../../sites-personal-task-space/app/',import.meta.url),fork=new URL('../app/',import.meta.url);
 // Optional local baseline comparison: the independent repo has no external dependency.
 let files;try{files=readdirSync(original,{recursive:true});}catch{return;}
 for(const file of files.filter(file=>file.endsWith('.css')))assert.equal(readFileSync(new URL(file.replaceAll('\\','/'),fork),'utf8').replaceAll('\r\n','\n'),readFileSync(new URL(file.replaceAll('\\','/'),original),'utf8').replaceAll('\r\n','\n'),file);
});
