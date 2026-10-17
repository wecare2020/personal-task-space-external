import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/editor-toggles.ts',import.meta.url),'utf8');
const context=vm.createContext({exports:{}});vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:9,module:1}}).outputText,context);
const {moveToggleRows,toggleSubtreeEnd}=context.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const rows=[{text:'A',toggleId:'a'},{text:'a body',togglePath:['a']},{text:'B',toggleId:'b'},{text:'B child',toggleId:'c',togglePath:['b']},{text:'c body',togglePath:['b','c']},{text:'After'}];
test('Tab moves a whole toggle subtree below the preceding toggle',()=>{
 const next=plain(moveToggleRows(rows,2,false));
 assert.deepEqual(next.map(r=>r.text),rows.map(r=>r.text));
 assert.deepEqual(next[2].togglePath,['a']);assert.deepEqual(next[3].togglePath,['a','b']);assert.deepEqual(next[4].togglePath,['a','b','c']);
 assert.equal(rows[2].togglePath,undefined);
});
test('Shift Tab reverses nesting and retains every descendant',()=>{
 const nested=moveToggleRows(rows,2,false),restored=plain(moveToggleRows(nested,2,true));
 assert.deepEqual(restored.map(r=>r.text),rows.map(r=>r.text));
 assert.deepEqual(restored[2].togglePath,[]);assert.deepEqual(restored[4].togglePath,['b','c']);
 assert.equal(toggleSubtreeEnd(restored,2),5);
});
test('Outdenting a middle child preserves its following siblings in the original toggle',()=>{
 const input=[{text:'A',toggleId:'a'},{text:'one',togglePath:['a']},{text:'two',togglePath:['a']},{text:'after'}];
 const result=plain(moveToggleRows(input,1,true));
 assert.deepEqual(result.map(r=>r.text),['A','two','one','after']);assert.deepEqual(result[1].togglePath,['a']);assert.deepEqual(result[2].togglePath,[]);
});
test('Tab can place an ordinary continuation inside a preceding toggle',()=>{
 const result=plain(moveToggleRows(rows,5,false));assert.deepEqual(result[5].togglePath,['b']);
});
test('Invalid indentation does not modify the document',()=>{
 assert.equal(moveToggleRows(rows,0,false),null);assert.equal(moveToggleRows(rows,0,true),null);
 const deep=[{toggleId:'a',togglePath:['1','2','3','4','5','6','7']},{toggleId:'b',togglePath:['1','2','3','4','5','6','7']}];
 assert.equal(moveToggleRows(deep,1,false),null);
});
