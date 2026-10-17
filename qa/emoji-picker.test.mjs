import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/editor-emoji.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('editor-emoji.tsx',source,99,true,4);
const names=new Set(['SHORTCUTS','emojiShortcut','isEmojiSpaceInput']);
const exact=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(ast)))).map(n=>n.getText(ast)).join('\n');
const context=vm.createContext({exports:{}});vm.runInContext(ts.transpileModule(exact,{compilerOptions:{target:9,module:1}}).outputText,context);const api=context.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
test('popular emoticons suggest a picker without changing the original text',()=>{
  for(const [token,emoji] of [[':D','😃'],[':-D','😃'],[':)','🙂'],[';-)','😉'],[':P','😛'],[':(','🙁'],[':O','😮'],['<3','❤️']]){
    const value='Nội dung '+token+' ';
    assert.deepEqual(plain(api.emojiShortcut(value,value.length)),{start:9,end:value.length,suggested:emoji});
  }
  assert.equal(api.emojiShortcut(':D',2),null);
});
test('shortcut boundaries exclude URL fragments, plain prose and selections',()=>{
  for(const value of ['https://example.com/:D ','abc:D ','word<3 ','::D ',':Dx ','x:D ','hello :) later'])assert.equal(api.emojiShortcut(value,value.length),null,value);
  assert.equal(api.emojiShortcut(':D ',0,3),null);
  assert.equal(api.emojiShortcut(':D ',2),null);
});
test('UTF-16 positions include emoji and preserve following text',()=>{
  const prefix='👨‍👩‍👧‍👦 Việt ',value=prefix+':D suffix';
  assert.deepEqual(plain(api.emojiShortcut(value,prefix.length+3)),{start:prefix.length,end:prefix.length+3,suggested:'😃'});
  assert.equal(api.emojiShortcut(':D\u00a0',3).suggested,'😃');
});
test('only explicit typed space triggers; IME and pasted tokens do not',()=>{
  assert.equal(api.isEmojiSpaceInput({inputType:'insertText',data:' ',isComposing:false}),true);
  for(const event of [{inputType:'insertFromPaste',data:':D ',isComposing:false},{inputType:'insertText',data:' ',isComposing:true},{inputType:'insertCompositionText',data:' ',isComposing:false},{inputType:'insertText',data:':D ',isComposing:false},{inputType:'deleteContentBackward',data:null,isComposing:false}])assert.equal(api.isEmojiSpaceInput(event),false);
});
test('emoji data is lazy, bounded on screen, and does not require an external runtime request',()=>{
  assert.match(source,/import\('\.\/emoji-data'\)/);
  assert.doesNotMatch(source,/from ['"]\.\/emoji-data['"]|fetch\(/);
  assert.match(source,/results\.slice\(0,limit\)/);
  const data=readFileSync(new URL('../app/emoji-data.ts',import.meta.url),'utf8');
  const rows=JSON.parse('['+data.slice(data.indexOf('= [')+3,data.lastIndexOf('];')).trim().replace(/,$/,'')+']');
  assert.equal(rows.length,1914);assert.equal(new Set(rows.map(row=>row[0])).size,rows.length);
  assert.equal(new Set(rows.map(row=>row[2])).size,9);
  assert.ok(rows.some(row=>row[0]==='👨‍👩‍👧‍👦'));assert.ok(rows.some(row=>row[0]==='🇻🇳'));
});
test('picker closes before outside row activation and avoids reentrant focus cancellation',()=>{
  assert.match(source,/addEventListener\('pointerdown',outside,true\)/);
  assert.match(source,/if\(!active\.current\)return;active\.current=false;setState\(null\);callbacks\.current\.onChoose/);
});
test('inline insertion uses editor history and does not replace the row or delay caret restoration',()=>{
  const task=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
  const inserts=[...task.matchAll(/function insertEmoji\(value:string\)\{([\s\S]*?)\n  \}/g)].map(m=>m[1]);
  assert.equal(inserts.length,2);
  assert.match(inserts[0],/insertPlainEditorText/);assert.match(inserts[1],/pushUndo\(before,true\)/);
  assert.match(inserts[1],/setRangeText/);assert.match(inserts[1],/rebaseEditorLinksForEdit/);assert.match(inserts[1],/rebaseEditorMarksForEdit/);
  for(const insert of inserts)assert.doesNotMatch(insert,/updateBlocks|replaceSlashRow|requestAnimationFrame|innerHTML\s*=/);
});
