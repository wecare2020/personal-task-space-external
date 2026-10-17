import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const matches=[];
function walk(node){
  if(ts.isJsxElement(node)){
    const attribute=node.openingElement.attributes.properties.find(p=>p.name?.text==='className');
    if(attribute?.initializer?.text==='task-actions')matches.push(node);
  }
  ts.forEachChild(node,walk);
}
walk(ast);
assert.equal(matches.length,1,'there must be one positioning owner for task actions');
const toolbar=matches[0].getText(ast);
const start=source.indexOf('{syncIssue&&<div className=');
assert.ok(start>0);
const notice=source.slice(start+1,source.indexOf('</div>}',start)+6);
const js=ts.transpileModule([
  "import {createElement} from 'react';",
  "const Icon=({name})=>createElement('svg',{'data-icon':name,'aria-hidden':true});",
  "const ShareTask=({taskId})=>createElement('button',{'data-share-task':taskId},'Share');",
  'export function actions(p){',
  ' const {selected,selectedIsCreating,syncState,syncIssue,syncLabel,setRecoveryRecords,listLocalRecovery}=p;',
  ' return ('+toolbar+');',
  '}',
  'export function issue(p){',
  ' const {syncIssue,syncState,syncLabel,syncActionLabel,createTask,retrySync}=p;',
  ' return ('+notice+');',
  '}'
].join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};vm.runInNewContext(js,{exports,require});
const base={selected:{id:'task-one'},selectedIsCreating:false,syncState:'saved',syncIssue:null,syncLabel:'Saved',setRecoveryRecords(){},listLocalRecovery(){return [];}};

test('Share is in the same toolbar as icon-only save and recovery, for every task type',()=>{
  for(const isTop of [false,true]){
    const tree=exports.actions({...base,selected:{id:'task-one',isTop}});
    const html=renderToStaticMarkup(tree);
    assert.match(html,/data-share-task="task-one"/);
    assert.match(html,/data-icon="cloud"/);
    assert.match(html,/data-icon="history"/);
    assert.match(html,/aria-label="Recovery"/);
    assert.match(html,/class="visually-hidden">Saved<\/span>/);
    assert.doesNotMatch(html,/>Recovery<\/button>/);
    assert.equal(tree.props.children[0].props.title,'Saved');
  }
});

test('missing or still-creating tasks never expose a stale Share action',()=>{
  for(const state of [{selected:undefined},{selectedIsCreating:true}]){
    assert.doesNotMatch(renderToStaticMarkup(exports.actions({...base,...state})),/data-share-task/);
  }
});

test('Recovery still opens backups and sync indicators reflect current save state',()=>{
  const records=[{value:'local draft'}];let opened;
  const tree=exports.actions({...base,listLocalRecovery:()=>records,setRecoveryRecords:value=>{opened=value;}});
  tree.props.children[1].props.onClick();assert.equal(opened,records);
  for(const state of ['saving','syncing','error','offline']){
    const syncIssue=['error','offline'].includes(state)?{message:'Not saved'}:null;
    const html=renderToStaticMarkup(exports.actions({...base,syncState:state,syncIssue,syncLabel:state}));
    assert.match(html,new RegExp('data-icon="'+(syncIssue?'warning':'sync')+'"'));
    assert.match(html,/data-share-task="task-one"/);
  }
});

test('actionable sync errors stay separate from toolbar, preserving retry and review',()=>{
  assert.equal(exports.issue({...base}),null);
  for(const action of ['retry-create','retry-task','review-draft']){
    let called='';
    const tree=exports.issue({...base,syncIssue:{action},syncState:'error',syncLabel:'Not saved',syncActionLabel:'Retry',createTask:()=>{called='create';},retrySync:()=>{called='retry';}});
    assert.equal(tree.props.role,'alert');
    tree.props.children[2].props.onClick();
    assert.equal(called,action==='retry-create'?'create':'retry');
    assert.doesNotMatch(renderToStaticMarkup(tree),/data-share-task|Recovery/);
  }
});

test('single toolbar positions controls without overlap and respects mobile/modal layers',()=>{
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  const shareCss=readFileSync(new URL('../app/sharing.css',import.meta.url),'utf8');
  const toolbarCss=/\.task-actions\{([^}]+)\}/.exec(css)[1];
  assert.match(toolbarCss,/display:flex/);
  assert.match(toolbarCss,/align-items:center/);
  assert.ok(Number(/z-index:(\d+)/.exec(toolbarCss)[1])<80);
  assert.match(shareCss,/\.task-share\{position:relative;/);
  assert.doesNotMatch(shareCss,/\.task-share\{[^}]*\b(?:top|right|z-index):/);
  assert.doesNotMatch(css,/\.sync-status\b/);
  assert.match(css,/\.app-shell:not\(\.mobile-detail-open\) \.task-actions\{display:none\}/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
