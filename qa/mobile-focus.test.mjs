import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real activation functions and focus layout effect, including
// an uncontrolled textarea whose DOM value predates an Enter split.
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,99,true,4);
const mobile=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='MobileRichDetail');
if(!mobile){test('legacy mobile textarea editor is retired',()=>{assert.ok(!source.includes('Customer1RichDetail'));assert.ok(source.includes('<TaskTextEditor {...props}/>'));});}
else {
const functions=mobile.body.statements.filter(n=>ts.isFunctionDeclaration(n)&&['activate','focusMobileRow'].includes(n.name?.text));
const focus=mobile.body.statements.find(n=>ts.isExpressionStatement(n)&&n.expression.expression?.getText(ast)==='useLayoutEffect'&&n.getText(ast).includes('if(!activeKey)return;const input=inputs.current[activeKey]'));
assert.equal(functions.length,2);assert.ok(focus);
const js=ts.transpileModule(functions.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:9,module:1}}).outputText;
const effect=ts.transpileModule('const runFocus='+focus.expression.arguments[0].getText(ast),{compilerOptions:{target:9,module:1}}).outputText;
function fixture(text,oldValue){
  const valuesAtFocus=[],saved=[];
  const rows={old:{text:'Previous',links:[],marks:[]},target:{text,links:[{start:0,end:text.length,href:'https://example.com'}],marks:[]}};
  const input={value:oldValue,focus(){valuesAtFocus.push(this.value)},setSelectionRange(start,end){this.start=start;this.end=end}};
  const ref=current=>({current});
  const ctx=vm.createContext({slash:{close(){}},activeKey:'old',activeKeyRef:ref('old'),composing:ref(false),pendingActivation:ref(null),inputs:ref({old:{value:'Unsaved previous'},target:input}),activeLinks:ref([]),activeMarks:ref([]),preserveDocumentDirtyOnFocus:ref(false),desiredSelection:ref(null),restoringDocument:ref(false),blockFor:key=>rows[key],finishBlock:(key,node)=>saved.push([key,node.value]),cloneEditorLinks:x=>structuredClone(x),cloneEditorMarks:x=>structuredClone(x),resize(){}});
  ctx.setActiveKey=key=>{ctx.activeKey=key};vm.runInContext(js+'\n'+effect,ctx);
  return {ctx,input,saved,valuesAtFocus,activate:()=>vm.runInContext("activate('target');runFocus()",ctx)};
}
for(const [label,text,stale] of [['start split','','Full original content'],['middle split','Left','Left and right'],['undo restored','Original','Obsolete edit']]){
  test('activation restores '+label+' before focus snapshots the textarea',()=>{const f=fixture(text,stale);f.activate();assert.deepEqual(f.valuesAtFocus,[text]);assert.equal(f.input.value,text);assert.equal(f.input.start,text.length);assert.deepEqual(f.saved,[['old','Unsaved previous']]);assert.equal(f.ctx.activeKeyRef.current,'target');});
}
test('activation waits for composition to finish without replacing IME text',()=>{const f=fixture('Committed','Đang gõ');f.ctx.composing.current=true;f.ctx.activeKey=null;f.activate();assert.equal(f.input.value,'Đang gõ');assert.equal(f.ctx.pendingActivation.current,'target');assert.equal(f.ctx.activeKeyRef.current,'old');assert.equal(f.saved.length,0);});
test('tapping the current row does not reset its unsaved text or selection',()=>{const f=fixture('Committed','Typing');f.ctx.activeKeyRef.current='target';f.ctx.activeKey=null;f.activate();assert.equal(f.input.value,'Typing');assert.equal(f.saved.length,0);});
}
