import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const context=vm.createContext({exports:{},require:createRequire(import.meta.url),React});
vm.runInContext(ts.transpileModule(readFileSync(new URL('../app/editor-layouts.tsx',import.meta.url),'utf8'),{compilerOptions:{target:9,module:1,jsx:2}}).outputText,context);
export const layouts=context.exports;
const keys=row=>Array.from(layouts.layoutFrames(row),f=>f.key);
test('frames preserve alternating toggle and layout ownership',()=>{
 assert.deepEqual(keys({togglePath:['A','B'],layoutPath:[{id:'C',kind:'column',count:2,column:1,withinToggle:'A'},{id:'D',kind:'callout',withinToggle:'B'}]}),['toggle:A','columns:C','column:C:1','toggle:B','callout:D']);
});
test('unwrapping or replacing a toggle rebases nested layout ownership',()=>{
 const row={togglePath:['A'],layoutPath:[{id:'C',kind:'callout',withinToggle:'B'}]};
 assert.deepEqual(keys(layouts.rebaseLayoutToggle(row,'B','A')),['toggle:A','callout:C']);
 assert.deepEqual(keys(layouts.rebaseLayoutToggle({...row,togglePath:[]},'B')),['callout:C']);
 assert.equal(layouts.rebaseLayoutToggle(row,'B','Z').layoutPath[0].withinToggle,'Z');
});
test('leaving a layout drops only its internal toggle ancestry',()=>{
 assert.deepEqual(Array.from(layouts.enclosingLayoutToggles({togglePath:['A','B']},{withinToggle:'A'})),['A']);
 assert.deepEqual(Array.from(layouts.enclosingLayoutToggles({togglePath:['B']},{})),[]);
});
test('hidden rows do not leave callout/column shells, visible rows retain original indices',()=>{
 const rows=[{hidden:true,layoutPath:[{id:'C',kind:'column',column:1,count:2}]},{hidden:true,layoutPath:[{id:'C',kind:'column',column:2,count:2}]},{text:'tail'}];
 const html=renderToStaticMarkup(React.createElement(React.Fragment,null,...layouts.renderLayoutRows(rows,(r,i)=>React.createElement('p',{key:i},String(i)),r=>!r.hidden)));
 assert.equal(html,'<p>2</p>');
});
test('layout markup bounds columns and rejects unsafe identifiers',()=>{
 assert.equal(layouts.layoutMarkup('columns2','bad"'), '');
 assert.equal((layouts.layoutMarkup('columns3','safe').match(/data-editor-column="/g)||[]).length,3);
});
