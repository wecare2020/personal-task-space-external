import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,99,true,4);
const names=new Set(['isAtomicDetailBlock','normalizeMobileListIndexes','withOrderedListLabels','orderedListLabels','flattenDetailBlocks','detailHtmlFromBlocks','detailBlockAttributes','escapeHtml','listIndentEm','materializeMobileBlock']);
const selected=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const context=vm.createContext({MAX_LIST_INDENT:12,LIST_SPACING_CLASS:/^editor-indent-(?:start|end)$/,safeHtml:html=>html,layoutFrames:()=>[],rangedInlineHtml:text=>text,normalizeEditorLinks:links=>links,normalizeEditorMarks:marks=>marks,inlineHtml:(_text,source)=>source.html});
vm.runInContext(ts.transpileModule(selected,{compilerOptions:{target:9,module:1}}).outputText,context);
const row=(extra={})=>({html:'<b>Việt Nam</b> <a href="https://example.com">link</a>',text:'Việt Nam link',tag:'p',todoChecked:false,inList:false,listKind:'',listIndex:0,listDepth:0,extraIndent:0,groupStart:false,compact:true,links:[],marks:[],...extra});

test('todo checkbox is subtly smaller without reducing its hit area or changing text indentation',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(css,/\.editor-todo-checkbox\{[^}]*width:16px;height:16px/);
 assert.match(css,/\.editor-todo-checkbox::before\{[^}]*inset:-6\.5px/);
 assert.match(css,/p\[data-editor-todo\]\{[^}]*padding-inline-start:26px/);
 assert.match(css,/\.mobile-rich-block\.is-todo\{grid-template-columns:26px minmax\(0,1fr\)/);
});
test('mobile normalization preserves checked state and independent todo indentation',()=>{
 for(const checked of [false,true])for(const indent of [0,1,3,12,99]){
  const output=context.normalizeMobileListIndexes([row({todoChecked:checked,extraIndent:indent})])[0];
  assert.equal(output.todoChecked,checked);assert.equal(output.extraIndent,Math.min(12,indent));assert.equal(output.html,row().html);
 }
 assert.equal(context.normalizeMobileListIndexes([row({todoChecked:undefined,extraIndent:3})])[0].extraIndent,0);
});
test('todo storage is a rich paragraph with no persisted interactive controls',()=>{
 for(const checked of [false,true]){
  const html=context.detailHtmlFromBlocks([row({todoChecked:checked,extraIndent:2})]);
  assert.match(html,new RegExp('data-editor-todo="'+checked+'"'));
  assert.match(html,/data-list-extra-indent="2"/);assert.match(html,/margin-inline-start:3.4em/);
  assert.match(html,/<b>Việt Nam<\/b>/);assert.match(html,/<a href="https:\/\/example.com">link<\/a>/);
  assert.doesNotMatch(html,/<(?:input|button)|aria-checked|data-todo-control/);
 }
});
test('empty checked and unchecked todo rows remain persisted',()=>{
 for(const checked of [false,true])assert.match(context.detailHtmlFromBlocks([row({html:'<br>',text:'',todoChecked:checked})]),/<p[^>]+data-editor-todo[^>]*><br><\/p>/);
});
test('materializing unchanged mobile text preserves checkbox and rich HTML',()=>{
 const block=row({todoChecked:true,extraIndent:2});
 const result=context.materializeMobileBlock(block,block.text,[],[]);
 assert.equal(result.todoChecked,true);assert.equal(result.extraIndent,2);assert.equal(result.html,block.html);
});
test('desktop hyperlink finalization preserves checkbox paths and cannot overwrite the next keystroke',()=>{
 const desktop=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DesktopRichDetail');
 if(!desktop){assert.ok(!source.includes('Customer1RichDetail'));return;}
 const apply=desktop.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='applyLink').getText(ast);
 assert.match(apply,/refreshTodoControls\(canonical\)/);
 assert.match(apply,/restoreRichHistoryState\(root,\{\.\.\.after,html:next\}\)/);
 assert.doesNotMatch(apply,/requestAnimationFrame\(\(\)=>\{const current=editor.current/);
});
test('native schema guard protects both existing and incoming checkbox content',async()=>{
 const {loadNativeModel}=await import('./load-native-model.mjs');const exports=loadNativeModel();
 const todo='<p data-editor-todo="false">Item</p>';
 for(const schema of [undefined,2,3,4]){
  assert.throws(()=>exports.checkEditor({detail:todo},{detail:'<p>Lost checkbox</p>'},schema),e=>e.code==='CLIENT_UPDATE_REQUIRED');
  assert.throws(()=>exports.checkEditor({detail:'old'},{detail:todo},schema),e=>e.code==='CLIENT_UPDATE_REQUIRED');
  assert.doesNotThrow(()=>exports.checkEditor({detail:todo},{completed:true},schema));
 }
 for(const html of [todo,'<details>note</details>','<div data-editor-columns="2">note</div>'])assert.doesNotThrow(()=>exports.checkEditor({detail:html},{detail:html},5));
});
