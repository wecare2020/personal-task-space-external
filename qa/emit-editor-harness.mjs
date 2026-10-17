import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,99,true,4),declarations=new Map();
for(const node of ast.statements){if(ts.isFunctionDeclaration(node)&&node.name)declarations.set(node.name.text,node);if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)if(ts.isIdentifier(d.name))declarations.set(d.name.text,node);}
const seeds=['normalizedDetailHtml','readDetailBlocks','detailHtmlFromBlocks','mobileBlocksFromDetail','materializeMobileBlock','safeHtml','normalizeMobileListIndexes','detailHtmlToPromptText'];
const selected=new Set();function visitName(name){const node=declarations.get(name);if(!node||selected.has(node))return;selected.add(node);function visit(n){if(ts.isIdentifier(n))visitName(n.text);ts.forEachChild(n,visit);}visit(node);}
seeds.forEach(visitName);
const code=ast.statements.filter(node=>selected.has(node)).map(node=>node.getText(ast)).join('\n');
console.log("import {treeMarkup,readEditorTree,normalizeTrees,treePlainText,TREE_ATTRIBUTES} from '/app/editor-trees.tsx';\nimport {tableMarkup,readEditorTable,normalizeTables,tablePlainText} from '/app/editor-tables.tsx';\nimport DOMPurify from '/node_modules/dompurify/dist/purify.es.mjs';\nimport {editorMediaUrl,mediaMarkup} from '/app/editor-inserts.tsx';\nimport {layoutFrames,normalizeLayoutDom,layoutContentBlocks} from '/app/editor-layouts.tsx';\nimport {todoState,setTodoState} from '/app/editor-todos.ts';");
console.log(ts.transpileModule(code,{compilerOptions:{target:9,module:99}}).outputText);
console.log("import {canonicalNoteEnvelope} from '/app/blocknote-document.ts';");
console.log(`export {${seeds.join(',')}};`);
