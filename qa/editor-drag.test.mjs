import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,99,true,4);
const component=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DesktopRichDetail');
if(!component){test('legacy drag runtime is retired; native BlockNote owns drag behavior',()=>{assert.ok(!source.includes('Customer1RichDetail'));assert.ok(source.includes('<TaskTextEditor {...props}/>'));});}
else {
const names=new Set(['startTextDrag','finishTextDrag','dropPlainText']);
const code=component.body.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
assert.equal(component.body.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).length,3);
let beforeInput,onInput;
function visit(node){
  if(ts.isJsxAttribute(node)&&node.initializer&&ts.isJsxExpression(node.initializer)){
    if(node.name.text==='onBeforeInput')beforeInput=node.initializer.expression.getText(ast);
    if(node.name.text==='onInput')onInput=node.initializer.expression.getText(ast);
  }
  ts.forEachChild(node,visit);
}
visit(component);
const script=ts.transpileModule(code+'\nconst beforeInput='+beforeInput+';\nconst onInput='+onInput+';',{compilerOptions:{target:9,module:0}}).outputText;

// Native browser owns the actual rich DOM move. This harness tests our exact
// transaction handlers around native deletion/insertion, not a browser emulation.
function harness(){
  class Element {constructor(blocked=false){this.blocked=blocked;this.inside=true;}closest(){return this.blocked?this:null;}}
  const target=new Element();
  const root={innerHTML:'<p><strong>Move me</strong></p><p>Destination</p>',contains:node=>!!node?.inside};
  let range={collapsed:false,startContainer:target,endContainer:target,toString:()=> 'Move me',intersectsNode:()=>true};
  const tasks=[],calls={publish:0,finish:0,refresh:0,plain:[],remember:0};
  const state={html:root.innerHTML,start:0,end:7};
  const context=vm.createContext({
    Element,editor:{current:root},textDrag:{current:null},compositionState:{current:null},
    richUndo:{current:[]},richRedo:{current:[{html:'redo prior'}]},dirty:{current:false},
    autoLinkSuppressed:{current:false},lastAutoRow:{current:{}},
    currentRange:()=>range,tableCell:node=>node?.cell?node:null,
    richHistoryStateForRange:()=>({...state,html:root.innerHTML}),sameRichHistoryPosition:(a,b)=>a.start===b.start&&a.end===b.end,
    slash:{close(){}},window:{setTimeout:fn=>tasks.push(fn)},document:{activeElement:target,caretRangeFromPoint:()=>({commonAncestorContainer:target})},
    refreshOrderedListLabels:()=>calls.refresh++,refreshTodoControls:()=>calls.refresh++,refreshTableControls:()=>calls.refresh++,refreshTreeControls:()=>{},refreshPhotoControls:()=>calls.refresh++,
    preserveDraggedInlineMarks:()=>{},
    schedulePublish:()=>calls.publish++,finishEditing:()=>calls.finish++,
    rememberRichState:()=>calls.remember++,insertPlainEditorText:text=>calls.plain.push(text)
  });
  vm.runInContext(script,context);
  const event=(patch={})=>({target,clientX:5,clientY:5,ctrlKey:false,altKey:false,prevented:false,stopped:false,
    dataTransfer:{effectAllowed:'uninitialized',dropEffect:'none',getData:type=>type==='text/plain'?'external text':''},
    preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...patch});
  return {context,root,state,calls,event,tasks,target,range,setRange:value=>{range=value;},flush(){while(tasks.length)tasks.shift()();},before:e=>vm.runInContext('beforeInput',context)(e),input:e=>vm.runInContext('onInput',context)(e)};
}

test('internal rich selection uses native move, never our plain-text copier',()=>{
  const h=harness(),start=h.event();h.context.startTextDrag(start);
  assert.equal(start.dataTransfer.effectAllowed,'copyMove');
  assert.equal(h.context.richUndo.current.length,0);
  const drop=h.event();h.context.dropPlainText(drop);
  assert.equal(drop.prevented,false,'native default must not be canceled');
  assert.equal(drop.dataTransfer.dropEffect,'none','the native operation is not overridden');assert.deepEqual(h.calls.plain,[]);
  assert.doesNotMatch(component.getText(ast),/onDragOver[= ]/,'native dragover must keep the editable insertion caret');
});

test('native remove+insert and deferred source cleanup become one undo transaction',()=>{
  const h=harness();h.context.startTextDrag(h.event());
  h.before({nativeEvent:{inputType:'deleteByDrag'}});
  h.root.innerHTML='<p></p><p>Destination</p>';h.input({nativeEvent:{inputType:'deleteByDrag'}});
  h.before({nativeEvent:{inputType:'insertFromDrop'}});
  h.context.dropPlainText(h.event());h.context.finishTextDrag();
  assert.equal(h.calls.remember,0);assert.equal(h.calls.publish,0);
  h.root.innerHTML='<p></p><p>Destination <strong>Move me</strong></p>';
  h.flush();
  assert.equal(h.context.richUndo.current.length,1);assert.equal(h.context.richUndo.current[0].html,h.state.html);
  assert.equal(h.context.richRedo.current.length,0);assert.equal(h.context.textDrag.current,null);
  assert.equal(h.calls.publish,1);assert.equal(h.calls.refresh,4);
});

test('platform copy modifiers keep the native operation without an extra manual insertion',()=>{
  for(const modifier of ['ctrlKey','altKey']){
    const h=harness();h.context.startTextDrag(h.event());
    const drop=h.event({[modifier]:true});drop.dataTransfer.dropEffect='copy';h.context.dropPlainText(drop);
    assert.equal(drop.dataTransfer.dropEffect,'copy');assert.equal(drop.prevented,false);
    assert.deepEqual(h.calls.plain,[]);
  }
});

test('cancel and self-drop preserve content and redo without a phantom undo entry',()=>{
  for(const selfDrop of [false,true]){
    const h=harness();h.context.startTextDrag(h.event());if(selfDrop)h.context.dropPlainText(h.event());
    h.context.finishTextDrag();h.flush();
    assert.equal(h.root.innerHTML,h.state.html);assert.equal(h.context.richUndo.current.length,0);
    assert.equal(h.context.richRedo.current.length,1);assert.equal(h.calls.publish,0);assert.equal(h.context.textDrag.current,null);
  }
});

test('pending earlier edits still publish after cancel, including focus outside',()=>{
  const h=harness();h.context.dirty.current=true;h.context.startTextDrag(h.event());h.context.document.activeElement=null;
  h.context.finishTextDrag();h.flush();assert.equal(h.calls.publish,1);assert.equal(h.calls.finish,1);
});

test('external drops keep plain/sanitized insertion and table drops remain blocked',()=>{
  const h=harness(),outside=h.event();h.context.dropPlainText(outside);
  assert.equal(outside.prevented,true);assert.deepEqual(h.calls.plain,['external text']);
  const cell=h.event({target:{cell:true}});h.context.dropPlainText(cell);assert.equal(cell.prevented,true);assert.equal(h.calls.plain.length,1);
});

test('canceled starts, collapsed selections, composition, stale targets and controls are not internal text drags',()=>{
  for(const kind of ['canceled','collapsed','composition','stale','control','cell']){
    const h=harness(),event=h.event();
    if(kind==='canceled')event.defaultPrevented=true;
    if(kind==='collapsed')h.range.collapsed=true;
    if(kind==='composition')h.context.compositionState.current={};
    if(kind==='stale')h.range.intersectsNode=()=>false;
    if(kind==='control')h.target.blocked=true;
    if(kind==='cell')h.target.cell=true;
    h.context.startTextDrag(event);assert.equal(h.context.textDrag.current,null,kind);
  }
});

test('drag suppression covers pending save, observer, incoming renders, blur, and global completion',()=>{
  assert.match(source,/publishTimer.current=undefined;if\(compositionState.current\|\|textDrag.current\|\|photoResizing.current\)return;/);
  assert.match(source,/if\(textDrag.current\|\|photoResizing.current\)return;if\(!editing.current&&!dirty.current\)return;/);
  assert.match(source,/if\(!root\|\|editing.current\|\|dirty.current\|\|textDrag.current\|\|html===lastPublished.current\)return;/);
  assert.match(source,/if\(!root\|\|linkPromptOpen.current\|\|compositionState.current\|\|textDrag.current\|\|photoResizing.current\)return;/);
  assert.match(source,/window.addEventListener\('dragend',finish,true\);window.addEventListener\('drop',finish,true\);/);
});
}
