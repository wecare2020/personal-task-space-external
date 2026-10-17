import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/editor-inserts.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('editor-inserts.tsx',source,99,true,4);
const names=new Set(['COMMANDS','slashQuery','matchingInsertCommands','editorMediaUrl','escapeAttribute','photoWidth','mediaMarkup']);
const exact=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(ast)))).map(n=>n.getText(ast)).join('\n');
const context=vm.createContext({exports:{},URL});vm.runInContext(ts.transpileModule(exact,{compilerOptions:{target:9,module:1}}).outputText,context);const api=context.exports;
test('slash only triggers for a command occupying the current row and a collapsed caret',()=>{
 assert.equal(api.slashQuery('/',1),'');assert.equal(api.slashQuery('/toggle',7),'toggle');
 assert.equal(api.slashQuery('  /toggle',9),'toggle');assert.equal(api.slashQuery('\u00a0/photo',7),'photo');
 for(const [text,start,end] of [['https://example.com',19,19],['hello /',7,7],['/two/three',10,10],['/command\n',9,9],['/photo',0,6],['/photo',3,3]])assert.equal(api.slashQuery(text,start,end),null,text);
 assert.equal(api.matchingInsertCommands('').length,18);assert.equal(api.matchingInsertCommands('')[0].id,'p');assert.equal(api.matchingInsertCommands('emoji')[0].id,'emoji');assert.equal(api.matchingInsertCommands('ảnh')[0].id,'image');
 for(const query of ['tree','tree builder','parent child'])assert.equal(api.matchingInsertCommands(query)[0].id,'tree');
 for(const query of ['todo','to do','checkbox','checklist'])assert.equal(api.matchingInsertCommands(query)[0].id,'todo');
 assert.equal(api.matchingInsertCommands('header').length,3);assert.equal(api.matchingInsertCommands('h2')[0].id,'h2');
 assert.equal(api.matchingInsertCommands('callout')[0].id,'callout');assert.equal(api.matchingInsertCommands('2 columns')[0].id,'columns2');
});
for(const kind of ['image','video'])test(kind+' rejects dangerous and non-HTTPS URLs',()=>{
 for(const value of ['javascript:alert(1)','data:image/svg+xml,x','blob:https://example.com/x','file:///a.png','http://example.com/a.png','https://user:password@example.com/a.mp4','/relative.mp4','https://'])assert.equal(api.editorMediaUrl(kind,value),null,value);
});
test('video URLs become narrowly allowlisted embeds or native video',()=>{
 assert.equal(api.editorMediaUrl('video','https://youtu.be/dQw4w9WgXcQ').url,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(api.editorMediaUrl('video','https://vimeo.com/123456').url,'https://player.vimeo.com/video/123456');
 assert.equal(api.editorMediaUrl('video','https://evil.example/embed/abc'),null);
 assert.equal(api.editorMediaUrl('video','https://example.com/video.webm').url,'https://example.com/video.webm');
});
test('media is lazy, has no autoplay, and never accepts arbitrary iframe markup',()=>{
 const image=api.mediaMarkup({kind:'image',url:'https://example.com/a.png?x=%22&y=2'});assert.match(image,/loading="lazy"/);assert.match(image,/&amp;/);assert.doesNotMatch(image,/onerror|srcset/);
 const video=api.mediaMarkup({kind:'video',url:'https://example.com/a.mp4'});assert.match(video,/preload="none"/);assert.doesNotMatch(video,/autoplay|iframe/);
 assert.equal(api.mediaMarkup({kind:'video',url:'https://evil.example/'}),'');
});
