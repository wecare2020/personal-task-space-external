import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,99,true,4);
test('completion is icon-only with an accessible label, tooltip and unchanged toggle',()=>{
 let label;
 function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='label'&&n.openingElement.attributes.getText(ast).includes('completion-property'))label=n;ts.forEachChild(n,visit);}
 visit(ast);assert.ok(label);const text=label.getText(ast);
 assert.match(text,/title=\{selected.completed\?'Mark incomplete':'Mark complete'\}/);
 assert.match(text,/<span className="visually-hidden">\{selected.completed\?'Completed':'Complete'\}<\/span>/);
 assert.match(text,/checked=\{selected.completed\}/);
 assert.ok(text.includes('onChange={event=>updateTask({completed:event.target.checked})}'));
 assert.match(text,/<Icon name="check" size=\{14\}\/>/);
});
