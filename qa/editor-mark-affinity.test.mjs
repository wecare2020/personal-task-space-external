import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['normalizedEditorMarkTag','normalizeEditorMarks','rebaseEditorRanges','rebaseEditorMarksForEdit','inferEditorEdit']);
const declarations=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='EDITOR_MARK_TAGS')).map(node=>node.getText(ast)).join('\n');
const context=vm.createContext({});
vm.runInContext(ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
const plain=value=>JSON.parse(JSON.stringify(value));
for(const tag of ['strong','b','em','i'])for(const suffix of [' dung',' Việt Nam','\u0302'])test(tag+' continues across Vietnamese append '+JSON.stringify(suffix),()=>{
 const before='Nội',after=before+suffix;
 const actual=plain(context.rebaseEditorMarksForEdit([{start:0,end:before.length,tag}],{oldStart:before.length,oldEnd:before.length,newEnd:after.length},after.length));
 assert.deepEqual(actual,[{start:0,end:after.length,tag}]);
});
test('overlapping bold and italic both extend at the caret',()=>{
 const after='Nội dung',marks=['strong','em'].map(tag=>({start:0,end:3,tag}));
 const actual=plain(context.rebaseEditorMarksForEdit(marks,{oldStart:3,oldEnd:3,newEnd:after.length},after.length));
 assert.equal(actual.length,2);assert.ok(actual.every(mark=>mark.start===0&&mark.end===after.length));
});
test('composition edit inference retains full bold range',()=>{
 const before={value:'Nội',start:3,end:3},value='Nội tiếng Việt',after={value,start:value.length,end:value.length};
 const edit=context.inferEditorEdit(before,after,'insertCompositionText');
 const actual=plain(context.rebaseEditorMarksForEdit([{start:0,end:3,tag:'strong'}],edit,value.length));
 assert.deepEqual(actual,[{start:0,end:value.length,tag:'strong'}]);
});
