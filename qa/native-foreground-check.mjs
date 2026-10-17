import assert from 'node:assert/strict';
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:4182';
async function call(body,etag){const start=performance.now();const response=await fetch(origin+'/api/tasks',{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:etag?{'if-none-match':etag}:undefined,body:body?JSON.stringify(body):undefined});const text=await response.text();return {status:response.status,etag:response.headers.get('etag'),bytes:Buffer.byteLength(text),ms:performance.now()-start,payload:text?JSON.parse(text):null};}
const first=await call();assert.equal(first.status,200);assert.equal(first.payload.result.storage,'native');assert.ok(first.etag);
let task=first.payload.result.tasks.find(t=>t.id==='task-native-qa-0001');assert.ok(task,'Only the known local QA task may be edited');
const unchanged=await call(null,first.etag);assert.equal(unchanged.status,304);assert.equal(unchanged.bytes,0);
const timings=[];for(let i=0;i<20;i++){const r=await call({action:'update',protocol:2,editorSchema:6,requestId:crypto.randomUUID(),id:task.id,updates:{team:!task.team},expectedValues:{team:task.team}});assert.equal(r.status,200,JSON.stringify(r.payload));task=r.payload.result;timings.push(r.ms);}
const fresh=await call(null,first.etag);assert.equal(fresh.status,200);assert.notEqual(fresh.etag,first.etag);
const next=await call(null,fresh.etag);assert.equal(next.status,304);assert.equal(next.bytes,0);
const sorted=timings.toSorted((a,b)=>a-b);
console.log(JSON.stringify({scope:'local QA native HTTP',saves:20,p50Ms:Math.round(sorted[10]),p95Ms:Math.round(sorted[18]),maxMs:Math.round(sorted.at(-1)),firstReadBytes:first.bytes,unchangedReadBytes:next.bytes,unchangedReadMs:Math.round(next.ms)}));
