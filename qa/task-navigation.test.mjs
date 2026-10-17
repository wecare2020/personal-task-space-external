import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/task-navigation.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,URL});
const {createTaskNavigation,readTaskLocation,resolveLinkedTask,taskHref,canCanonicalizeTask}=exports;
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(href='https://example.test/?v=63',state={framework:'kept'}){
  const entries=[{href,state}];let index=0;const listeners=new Set(),events=[],drafts=[];
  const browser={location:{href},history:{get state(){return entries[index].state;},pushState(state,_,href){entries.splice(++index);entries.push({href:new URL(href,browser.location.href).href,state});browser.location.href=entries[index].href;},replaceState(state,_,href){entries[index]={href:new URL(href,browser.location.href).href,state};browser.location.href=entries[index].href;}},addEventListener(name,fn,capture){assert.equal(name,'popstate');assert.equal(capture,true);listeners.add(fn);},removeEventListener(_,fn){listeners.delete(fn);}};
  const navigation=createTaskNavigation(browser,(value,reason)=>events.push({value:plain(value),reason}),next=>drafts.push({next,outgoing:events.at(-1)?.value.taskId}));
  function go(delta){index+=delta;browser.location.href=entries[index].href;const event={state:entries[index].state,stopped:false,stopImmediatePropagation(){this.stopped=true;}};listeners.forEach(fn=>fn(event));return event;}
  navigation.start();
  return {browser,entries,navigation,events,drafts,go,listeners};
}
test('link encodes stable opaque IDs, preserving other parameters and hash',()=>{
  const url=taskHref('https://example.test/?v=63#notes','task-a & Việt/?');
  assert.equal(new URL(url,'https://example.test').searchParams.get('task'),'task-a & Việt/?');
  assert.match(url,/v=63/);assert.ok(url.endsWith('#notes'));
  assert.equal(taskHref('https://example.test/?task=old&v=63#notes',null),'/?v=63#notes');
});
test('cold direct link opens detail, including completed task regardless of active filter',()=>{
  const h=harness('https://example.test/?task=completed');
  assert.deepEqual(h.events[0].value,{taskId:'completed',detail:true,pending:false});
  assert.equal(resolveLinkedTask([{id:'active'},{id:'completed'}],'completed','active').id,'completed');
});
test('explicit task missing from cache never falls back; later fresh data resolves it',()=>{
  const h=harness('https://example.test/?task=fresh');h.navigation.canonicalize('cached');
  assert.equal(resolveLinkedTask([{id:'cached'}],h.navigation.current().taskId,'cached'),undefined);
  assert.equal(resolveLinkedTask([{id:'cached'},{id:'fresh'}],h.navigation.current().taskId,'cached').id,'fresh');
  assert.equal(h.browser.location.href,'https://example.test/?task=fresh');
});
test('empty or deleted task link does not open unrelated editable content',()=>{
  for(const id of ['', 'deleted'])assert.equal(resolveLinkedTask([{id:'first'}],id,'first'),undefined);
  assert.equal(readTaskLocation('https://example.test/?task=',null).taskId,'');
});
test('root canonicalization replaces history, preserves list view and framework state',()=>{
  const h=harness();h.navigation.canonicalize('first');
  assert.equal(h.entries.length,1);assert.equal(h.navigation.current().detail,false);
  assert.equal(h.browser.history.state.framework,'kept');
  assert.equal(h.browser.location.href,'https://example.test/?v=63&task=first');
});
test('cached root selection is not made into an explicit link before a successful fresh read',()=>{
  const location={taskId:null,pending:false,detail:false};
  assert.equal(canCanonicalizeTask(location,false,false),false);
  assert.equal(canCanonicalizeTask(location,true,false),true);
  assert.equal(canCanonicalizeTask(location,true,true),false,'pending creation must restore before a default link is made');
});
test('confirmed creation can become a link independently of root refresh',()=>{
  assert.equal(canCanonicalizeTask({taskId:'new',pending:true,detail:true},false,false),true);
});
test('A → B → Back → Forward stays within document and preserves outgoing draft first',()=>{
  const h=harness('https://example.test/?task=A');h.navigation.open('B');
  assert.ok(h.go(-1).stopped);assert.equal(h.events.at(-1).value.taskId,'A');
  assert.deepEqual(h.drafts.at(-1),{next:'A',outgoing:'B'});
  assert.ok(h.go(1).stopped);assert.equal(h.events.at(-1).value.taskId,'B');
  assert.equal(h.entries.length,2);assert.equal(h.browser.history.state.framework,'kept');
});
test('opening current task twice does not create duplicate history entries',()=>{
  const h=harness('https://example.test/?task=A');h.navigation.open('B');h.navigation.open('B');assert.equal(h.entries.length,2);
});
test('mobile list/detail is restored; copying URL to fresh session opens detail',()=>{
  const h=harness();h.navigation.canonicalize('A');h.navigation.open('A');
  h.go(-1);assert.equal(h.events.at(-1).value.detail,false);
  h.go(1);assert.equal(h.events.at(-1).value.detail,true);
  h.navigation.list();assert.equal(h.navigation.current().detail,false);
  assert.equal(readTaskLocation(h.browser.location.href,null).detail,true);
});
test('unconfirmed creation has no shareable ID until confirmation then replaces same entry',()=>{
  const h=harness('https://example.test/?task=A');h.navigation.open('new',false);
  assert.equal(new URL(h.browser.location.href).searchParams.get('task'),null);
  assert.equal(readTaskLocation(h.browser.location.href,h.browser.history.state).taskId,'new');
  h.navigation.canonicalize('new');assert.equal(h.entries.length,2);
  assert.equal(new URL(h.browser.location.href).searchParams.get('task'),'new');
});
test('late creation confirmation cannot steal selection or URL',()=>{
  const h=harness('https://example.test/?task=A');h.navigation.open('new',false);h.navigation.open('B');h.navigation.canonicalize('new');
  assert.equal(h.navigation.current().taskId,'B');assert.equal(h.browser.location.href,'https://example.test/?task=B');
});
test('different shell history is left for normal browser/router navigation',()=>{
  const h=harness();h.navigation.open('A');h.entries[0]={href:'https://example.test/other',state:{}};
  const previous=h.events.length;assert.equal(h.go(-1).stopped,false);assert.equal(h.events.length,previous);
});
test('listeners are installed once and removed on cleanup',()=>{
  const h=harness();h.navigation.start();assert.equal(h.listeners.size,1);h.navigation.stop();assert.equal(h.listeners.size,0);
});
test('renaming/reordering task does not change identity or link',()=>{
  const h=harness('https://example.test/?task=row-17');
  assert.equal(resolveLinkedTask([{id:'row-22',title:'Other'},{id:'row-17',title:'Renamed'}],h.navigation.current().taskId,'row-22').title,'Renamed');
  assert.equal(h.browser.location.href,'https://example.test/?task=row-17');
});
