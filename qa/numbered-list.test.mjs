import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the exact pure helpers used by the editor, without mounting React.
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const file=ts.createSourceFile('task-space.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['orderedListMarker','normalizeMobileListIndexes','orderedListLabels','withOrderedListLabels']);
const helpers=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(file)).join('\n');
const context=vm.createContext({});vm.runInContext(ts.transpile(helpers,{target:ts.ScriptTarget.ES2022}),context);
const normalize=blocks=>JSON.parse(JSON.stringify(context.normalizeMobileListIndexes(blocks)));
const item=(listIndex,extra={})=>({listKind:'ol',listIndex,listDepth:0,extraIndent:0,groupStart:false,...extra});

test('explicit restart survives normalization and later edits',()=>{
  const blocks=[item(1),item(2),item(1,{listStart:1}),item(4)];
  const result=normalize(blocks);assert.deepEqual(result.map(row=>row.listIndex),[1,2,1,2]);
  assert.deepEqual(normalize(result).map(row=>row.listIndex),[1,2,1,2]);
});
test('old list starting at 3 restarts at 1 with following items rebased',()=>{
  assert.deepEqual(normalize([item(1,{listStart:1}),item(4),item(5)]).map(row=>row.listIndex),[1,2,3]);
});
test('restart at an arbitrary number and at a nested level are independent',()=>{
  const result=normalize([item(1),item(1,{listDepth:1}),item(7,{listDepth:1,listStart:7}),item(3,{listDepth:1}),item(2)]);
  assert.deepEqual(result.map(row=>row.listIndex),[1,1,7,8,2]);
});
test('removing list formatting clears restart metadata',()=>{
  assert.equal(normalize([item(1,{listKind:'',listStart:5})])[0].listStart,undefined);
  assert.equal(normalize([item(1,{listKind:'ul',listStart:5})])[0].listStart,undefined);
});
test('new Enter sibling continues without copying explicit restart',()=>{
  assert.deepEqual(normalize([item(7,{listStart:7}),item(8),item(9)]).map(row=>row.listIndex),[7,8,9]);
});
test('recognize numbered shortcuts only at line start and within bounds',()=>{
  for(const number of [1,3,27,100000])assert.equal(context.orderedListMarker(`${number}. `),number);
  assert.equal(context.orderedListMarker('1.',true),1);
  for(const text of ['0. ','100001. ','text 1. ','1. text','1.5 '])assert.equal(context.orderedListMarker(text),undefined);
});
