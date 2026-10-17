import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const file=ts.createSourceFile('task-space.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['flattenDetailBlocks','listIndentEm','normalizeMobileListIndexes','orderedListLabels','withOrderedListLabels']);
const helpers=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(file)).join('\n');
const context=vm.createContext({MAX_LIST_INDENT:12,LIST_SPACING_CLASS:/^editor-indent-(?:start|end)$/});
vm.runInContext(ts.transpile(helpers,{target:ts.ScriptTarget.ES2022}),context);
const plain=value=>JSON.parse(JSON.stringify(value));
const flatten=blocks=>plain(context.flattenDetailBlocks(blocks));
const row=(text,depth=0,extra={})=>({text,html:text||'<br>',tag:'li',inList:true,listKind:'ul',listIndex:0,listDepth:depth,extraIndent:0,groupStart:false,lineIndex:0,compact:false,...extra});

test('nested blank bullet becomes an independent indented row',()=>{
  const flat=flatten([row('Onboarding'),row('VHDN',1),row('',1),row('Next root')]);
  assert.deepEqual(flat.map(item=>item.listDepth),[0,0,0,0]);
  assert.deepEqual(flat.map(item=>item.extraIndent),[0,1,1,0]);
  const changed=flatten(flat.map((item,index)=>index===2?{...item,extraIndent:0}:item));
  assert.deepEqual(changed.map(item=>item.extraIndent),[0,1,0,0]);
  assert.equal(changed[2].html,'<br>');
});
test('formatting indentation never moves unselected descendants',()=>{
  const flat=flatten([row('Parent'),row('Child',1),row('Deep',2),row('Sibling',1)]);
  const changed=flatten(flat.map((item,index)=>index===1?{...item,extraIndent:0}:item));
  assert.deepEqual(changed.map(item=>item.extraIndent),[0,0,2,1]);
});
test('total indent is canonical and does not grow on repeated load/save',()=>{
  const flat=flatten([row('Formatted',2,{extraIndent:3,blockClass:'ql-align-right ql-indent-5',blockStyle:'color:red;margin-inline-start:5.1em'})]);
  assert.equal(flat[0].extraIndent,5);
  assert.equal(flat[0].blockStyle,'color:red;margin-inline-start:8.5em');
  assert.ok(flat[0].blockClass.includes('ql-align-right'));
  assert.ok(!flat[0].blockClass.includes('ql-indent-'));
  assert.deepEqual(flatten(flat),flat);
});
test('legacy nested numbered lists retain visible values after mobile normalization',()=>{
  const numbered=(index,depth=0,extra={})=>row('Item',depth,{listKind:'ol',listIndex:index,...extra});
  const flat=flatten([numbered(1),numbered(1,1),numbered(2,1),numbered(2),numbered(1,0,{listStart:1}),numbered(2)]);
  assert.deepEqual(flat.map(item=>item.listStart??null),[null,1,null,2,1,null]);
  assert.deepEqual(plain(context.normalizeMobileListIndexes(flat)).map(item=>item.listIndex),[1,1,2,2,1,2]);
});
test('flat spacing follows transitions, not parent child ownership',()=>{
  const flat=flatten([row('Root'),row('Child',1),row('Deep',2),row('Child',1),row('Root')]);
  assert.equal(flat[1].blockClass,'editor-indent-start');
  assert.equal(flat[2].blockClass,'editor-indent-start editor-indent-end');
  assert.equal(flat[3].blockClass,'editor-indent-end');
});
test('indent is bounded while inline marks and links remain unchanged',()=>{
  const html='<strong>Bold</strong> <a href="https://example.com">link</a>';
  const flat=flatten([row('Bold link',10,{extraIndent:8,html})]);
  assert.equal(flat[0].extraIndent,12);
  assert.equal(flat[0].html,html);
});
