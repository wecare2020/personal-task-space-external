import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('retry returns original Sheet row, including later edits, and distinct IDs create distinct tasks',()=>{
  const rows=[];let appends=0;
  const context=vm.createContext({
    getTaskRows_:()=>rows,
    getTaskSheet_:()=>({getLastRow:()=>rows.length+1,getRange:()=>({setValues:values=>{rows.push(...values);appends++;}})}),
    SpreadsheetApp:{flush(){}},
    buildTaskSheetRow_:(_number,_row,task)=>[task.title,false,task.date,task.status,'',false,task.detail,task.id,''],
    rowToTask_:row=>({id:row[7],title:row[0]}),
  });
  vm.runInContext(readFileSync(new URL('../integrations/apps-script/Api.js',import.meta.url),'utf8'),context);
  const first=context.apiCreateTask({id:'task-intent-one',title:'Untitled Task'});
  rows[0][0]='Edited title';
  const retry=context.apiCreateTask({id:'task-intent-one',title:'Untitled Task'});
  assert.equal(first.task.id,retry.task.id);assert.equal(retry.task.title,'Edited title');assert.equal(appends,1);
  context.apiCreateTask({id:'task-intent-two',title:'Untitled Task'});assert.equal(appends,2);
});
