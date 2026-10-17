import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4173',sheet='http://127.0.0.1:43123';
async function call(url,body){const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await response.json();assert.equal(response.ok,true,JSON.stringify(value));return value.result??value;}
const state=await call(origin+'/api/tasks');assert.equal(state.storage,'native');let task=state.tasks.find(t=>t.id==='task-native-qa-0001');assert.ok(task);
await call(sheet+'/__qa',{delay:3000,failure:false});
const timings=[];for(let i=0;i<20;i++){const start=performance.now();task=await call(origin+'/api/tasks',{action:'update',protocol:2,editorSchema:4,requestId:crypto.randomUUID(),id:task.id,updates:{team:!task.team},expectedValues:{team:task.team}});timings.push(performance.now()-start);}
await call(sheet+'/__qa',{delay:0});const sorted=timings.toSorted((a,b)=>a-b);
console.log(JSON.stringify({requests:timings.length,sheetDelayMs:3000,minMs:Math.round(sorted[0]),p50Ms:Math.round(sorted[10]),p95Ms:Math.round(sorted[18]),maxMs:Math.round(sorted.at(-1))}));
assert.ok(sorted.at(-1)<2500,'Foreground must not wait for slow Sheet');
