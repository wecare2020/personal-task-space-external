import test from 'node:test';
import assert from 'node:assert/strict';
import {saveLiveMutation} from '../app/task-save-policy.ts';
const original={id:'task-qa-live',title:'Original',detail:'Old',team:false};
const remote={...original,detail:'Other tab',team:true};
const conflict=(fields=['detail'],current=remote)=>Object.assign(Error('conflict'),{current,fields});
const operation=()=>({id:original.id,requestId:crypto.randomUUID(),updates:{detail:'My new edit'},expectedValues:{detail:original.detail},baseTask:original,createdAt:1});
const options=()=>({operation:operation(),live:true,conflict:e=>e.current?{current:e.current,fields:e.fields}:null,archive:()=>true,persist:()=>true});
test('live edit retries only its fields with a fresh CAS and idempotency key after recovery',async()=>{
 const o=options(),calls=[],events=[],archives=[];o.archive=(local,remote)=>{archives.push({local,remote});events.push('archive');return true;};o.persist=()=>{events.push('persist');return true;};
 o.send=async op=>{calls.push(structuredClone(op));events.push('send');if(calls.length===1)throw conflict();return {...remote,...op.updates};};
 const saved=await saveLiveMutation(o);assert.equal(saved.team,true);assert.equal(saved.title,'Original');assert.equal(saved.detail,'My new edit');assert.deepEqual(calls[1].updates,{detail:'My new edit'});assert.deepEqual(calls[1].expectedValues,{detail:'Other tab'});assert.notEqual(calls[0].requestId,calls[1].requestId);assert.deepEqual(events,['send','archive','persist','send']);assert.equal(archives[0].local.detail,'My new edit');assert.equal(archives[0].remote.detail,'Other tab');
});
for(const [name,extra,error] of [['dormant recovered intent',{live:false},conflict()],['deleted task',{},conflict(['deleted'])],['wrong record',{},conflict(['detail'],{...remote,id:'other'})],['network timeout',{},Error('timeout')],['recovery unavailable',{archive:()=>false},conflict()]])test(name+' never silently overwrites',async()=>{let calls=0;const o={...options(),...extra,send:async()=>{calls++;throw error;}};await assert.rejects(saveLiveMutation(o));assert.equal(calls,1);});
test('failed durable retry journal prevents the second request',async()=>{let calls=0;const o={...options(),persist:()=>false,send:async()=>{calls++;throw conflict();}};await assert.rejects(saveLiveMutation(o),/recovery copy/);assert.equal(calls,1);});
test('ongoing same-field contention has a bounded retry count',async()=>{let sends=0,archives=0;const o={...options(),archive:()=>{archives++;return true;},send:async()=>{sends++;throw conflict();}};await assert.rejects(saveLiveMutation(o));assert.equal(sends,4);assert.equal(archives,3);});
test('ordinary save makes no recovery write or extra request',async()=>{let sends=0;const o={...options(),archive:()=>{throw Error('unneeded archive');},persist:()=>{throw Error('unneeded journal');},send:async()=>{sends++;return original;}};assert.equal(await saveLiveMutation(o),original);assert.equal(sends,1);});
