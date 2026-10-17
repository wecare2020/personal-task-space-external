import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const file=ts.createSourceFile('task-space.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['isAtomicDetailBlock','orderedListLabels','withOrderedListLabels','flattenDetailBlocks','listIndentEm','listExtraIndent','normalizeMobileListIndexes','detailHtmlFromBlocks','detailBlockAttributes','detailBlockPrefix','refreshOrderedListLabels']);
const helpers=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(file)).join('\n');
const context=vm.createContext({MAX_LIST_INDENT:12,LIST_SPACING_CLASS:/^editor-indent-(?:start|end)$/,UNORDERED_PREFIX:'- ',safeHtml:value=>value,escapeHtml:value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;')});
const layoutAst=ts.createSourceFile('layouts.tsx',readFileSync(new URL('../app/editor-layouts.tsx',import.meta.url),'utf8'),99,true,4);
const frameHelpers=layoutAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='layoutFrames'||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(layoutAst)==='safeId')).map(n=>n.getText(layoutAst).replace(/^export /,'')).join('\n');
vm.runInContext(ts.transpile(frameHelpers,{target:ts.ScriptTarget.ES2022}),context);
vm.runInContext(ts.transpile(helpers,{target:ts.ScriptTarget.ES2022}),context);
const plain=value=>JSON.parse(JSON.stringify(value));
const row=(listIndex,extraIndent=0,extra={})=>({html:'Item',text:'Item',tag:'li',inList:true,listKind:'ol',listIndex,listDepth:0,extraIndent,groupStart:false,lineIndex:0,compact:false,...extra});
const labels=blocks=>plain(context.orderedListLabels(blocks));

test('number labels follow independent visual levels and return to root sequence',()=>{
  assert.deepEqual(labels([row(1),row(2,1),row(3,1),row(4,2),row(5)]),['1','1.1','1.2','1.2.1','2']);
});
test('root and child explicit restarts only change their own number component',()=>{
  assert.deepEqual(labels([row(3),row(4,1),row(5,1,{listStart:7}),row(6,1),row(7),row(1,0,{listStart:1}),row(2,1)]),['3','3.1','3.7','3.8','4','1','1.1']);
});
test('Tab repeatedly may skip levels without requiring or creating parent rows',()=>{
  for(let depth=0;depth<=12;depth++){
    assert.deepEqual(labels([row(1,depth)]),[Array(depth+1).fill(1).join('.')]);
  }
  assert.deepEqual(labels([row(1),row(2,3),row(3,1),row(4)]),['1','1.1.1.1','1.2','2']);
});
test('bullet children do not consume the outer number',()=>{
  assert.deepEqual(labels([row(1),row(0,1,{listKind:'ul'}),row(2,1),row(3)]),['1','','1.1','2']);
  assert.deepEqual(labels([row(1),row(2,1),row(0,1,{listKind:'ul'}),row(3,1),row(4)]),['1','1.1','','1.1','2']);
});
test('paragraphs and explicit group breaks begin a new numbered sequence',()=>{
  assert.deepEqual(labels([row(1),row(2,1),row(0,0,{listKind:''}),row(1),row(2,1),row(1,0,{groupStart:true})]),['1','1.1','','1','1.1','1']);
});
test('blank Enter row continues at the same level and does not become editable marker text',()=>{
  const rows=[row(1),row(2,1),row(3,1,{html:'<br>',text:''}),row(4)];
  const normalized=plain(context.normalizeMobileListIndexes(rows));
  assert.deepEqual(normalized.map(item=>item.listLabel),['1','1.1','1.2','2']);
  assert.equal(normalized[2].text,'');assert.equal(normalized[2].html,'<br>');
  assert.deepEqual(normalized.map(item=>item.listIndex),[1,2,3,4]);
});
test('Tab and ShiftTab of selected rows preserve other indentation and inline HTML',()=>{
  const rows=[row(1),row(2,1,{html:'<strong>Bold</strong> <a href="https://example.com">link</a>'}),row(3,2),row(4,1),row(5)];
  const shifted=rows.map((item,index)=>[1,3].includes(index)?{...item,extraIndent:item.extraIndent+1}:item);
  const restored=shifted.map((item,index)=>[1,3].includes(index)?{...item,extraIndent:item.extraIndent-1}:item);
  assert.deepEqual(labels(restored),labels(rows));assert.deepEqual(restored,rows);
  assert.equal(shifted[2].extraIndent,2);assert.equal(shifted[1].html,rows[1].html);
});
test('serialization persists presentation labels separately from native counters and text',()=>{
  const rows=[row(1),row(2,1,{html:'<strong>Child</strong>'}),row(3,1,{html:'<br>',text:''}),row(4)];
  const once=plain(context.flattenDetailBlocks(rows));const twice=plain(context.flattenDetailBlocks(once));
  assert.deepEqual(twice,once);
  const html=context.detailHtmlFromBlocks(once);
  assert.deepEqual([...html.matchAll(/data-list-number="([^"]+)"/g)].map(match=>match[1]),['1','1.1','1.2','2']);
  assert.ok(html.includes('<strong>Child</strong>'));assert.ok(html.includes('><br></li>'));
  assert.ok(!html.includes('value="'));assert.ok(!html.includes('1.1. <strong>'));
  assert.equal(context.detailBlockPrefix(once[1]),'1.1. ');
});

// Small DOM fixture for the real refresh function: only attributes may change.
function element(tag,attrs={},children=[]){return {tagName:tag,children,attrs:{...attrs},classList:[],getAttribute(name){return this.attrs[name]??null;},hasAttribute(name){return name in this.attrs;},setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];}};}
test('desktop refresh matches mobile, keeps node identity and corrects cloned Enter labels',()=>{
  const items=[element('LI'),element('LI',{'data-list-extra-indent':'1'}),element('LI',{'data-list-extra-indent':'1','data-list-number':'1.1'}),element('LI')];
  const root=element('ARTICLE',{},[element('OL',{},items)]);
  context.refreshOrderedListLabels(root);
  assert.deepEqual(items.map(item=>item.attrs['data-list-number']),['1','1.1','1.2','2']);
  assert.equal(root.children[0].children[2],items[2]);
  items[2].attrs['data-list-extra-indent']='2';context.refreshOrderedListLabels(root);
  assert.equal(items[2].attrs['data-list-number'],'1.1.1');
  delete items[2].attrs['data-list-extra-indent'];context.refreshOrderedListLabels(root);
  assert.deepEqual(items.map(item=>item.attrs['data-list-number']),['1','1.1','2','3']);
});
test('desktop imported OL start and nested legacy lists match normalized labels',()=>{
  const child=element('LI');const first=element('LI',{},[element('OL',{},[child])]);const last=element('LI');
  const root=element('ARTICLE',{},[element('OL',{start:'3'},[first,last])]);
  context.refreshOrderedListLabels(root);
  assert.deepEqual([first,child,last].map(item=>item.attrs['data-list-number']),['3','3.1','4']);
});
