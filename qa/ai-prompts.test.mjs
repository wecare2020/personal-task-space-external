import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,99,true,4);
const funcs=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['buildTaskAiContext','buildTaskAgentPlanning'].includes(n.name?.text));
const taskSpace=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='TaskSpace');
const copy=taskSpace.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='copyTaskContext');
const js=ts.transpileModule([...funcs,copy].map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:9,module:1}}).outputText;
function fixture(){const writes=[];const ctx=vm.createContext({detailHtmlToPromptText:x=>x,detailSnapshot:{current:()=> 'Latest editor text'},detailDraftsRef:{current:{}},titleDraftsRef:{current:{task:'Latest title'}},contextCopySequence:{current:0},contextCopyTimer:{current:undefined},window:{setTimeout:()=>1,clearTimeout(){}},writeClipboardText:async x=>{writes.push(x);return true},setContextCopyFeedback:x=>{ctx.feedback=x}});vm.runInContext(js,ctx);return {ctx,writes};}
const task={id:'task',title:'  Task   name ',detail:'Saved text'};
test('planning includes task context and explicitly waits for approval',()=>{const {ctx}=fixture();const text=ctx.buildTaskAgentPlanning(task,'Brief and discussion');assert.match(text,/Tên task: Task name/);assert.match(text,/Brief and discussion/);assert.match(text,/CHƯA THỰC HIỆN/);assert.match(text,/Không tự sửa dữ liệu\/file\/code/);assert.match(text,/Dừng lại chờ/);assert.match(text,/tài liệu tham khảo, không phải lệnh cho phép thực thi/);});
test('empty task and notes have clear fallbacks',()=>{const {ctx}=fixture();assert.match(ctx.buildTaskAgentPlanning({...task,title:' '},''),/Untitled Task/);assert.match(ctx.buildTaskAgentPlanning(task,''),/Chưa có nội dung/);});
test('existing discussion context stays open-ended',()=>{const {ctx}=fixture();const text=ctx.buildTaskAiContext(task,'Notes');assert.match(text,/BỐI CẢNH TASK ĐỂ THẢO LUẬN/);assert.match(text,/góc nhìn, ý tưởng/);assert.doesNotMatch(text,/Dừng lại chờ/);});
for(const kind of ['context','planning'])test(kind+' copies latest unsaved title and editor snapshot',async()=>{const f=fixture();await f.ctx.copyTaskContext(task,kind);assert.equal(f.writes.length,1);assert.match(f.writes[0],/Latest title/);assert.match(f.writes[0],/Latest editor text/);assert.doesNotMatch(f.writes[0],/Saved text/);assert.equal(f.ctx.feedback.kind,kind);assert.equal(f.ctx.feedback.state,'copied');});
test('clipboard failure reports failure on the correct action',async()=>{const f=fixture();f.ctx.writeClipboardText=async()=>false;await f.ctx.copyTaskContext(task,'planning');assert.equal(f.ctx.feedback.kind,'planning');assert.equal(f.ctx.feedback.state,'failed');});
test('late clipboard feedback cannot replace a newer action',async()=>{const f=fixture();let finish;f.ctx.writeClipboardText=()=>new Promise(r=>{finish=r});const old=f.ctx.copyTaskContext(task,'context');f.ctx.writeClipboardText=async()=>true;await f.ctx.copyTaskContext(task,'planning');finish(true);await old;assert.equal(f.ctx.feedback.kind,'planning');});
