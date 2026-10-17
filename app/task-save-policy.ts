import type {PendingMutation} from './reliability';

// A fresh user edit wins only its explicit fields. Never change the D1 CAS or
// replay a dormant draft as if the user had just edited it.
export async function saveLiveMutation<T extends {id:string}>(options:{
 operation:PendingMutation<T>;live:boolean;
 send:(operation:PendingMutation<T>)=>Promise<T>;
 conflict:(error:unknown)=>{current:T;fields?:string[]}|null;
 archive:(local:T,remote:T)=>boolean;
 persist:()=>boolean;
}){
 const {operation}=options;
 for(let retries=0;;retries++){
  try{return await options.send(operation);}
  catch(error){
   const conflict=options.conflict(error);
   if(!options.live||!conflict||conflict.current.id!==operation.id||conflict.fields?.includes('deleted')||retries>=3)throw error;
   if(!options.archive({...operation.baseTask,...operation.updates,id:operation.id} as T,conflict.current))throw error;
   // A changed payload must have a new idempotency key. Persist it before send,
   // so a timeout/reload can safely retry this exact attempt instead of duplicating it.
   operation.requestId=crypto.randomUUID();
   operation.expectedValues=Object.fromEntries(Object.keys(operation.expectedValues).map(key=>[key,conflict.current[key as keyof T]])) as Partial<T>;
   operation.baseTask=conflict.current;
   if(!options.persist())throw Error('Your edit is kept, but its recovery copy could not be stored. Keep this tab open and retry.');
  }
 }
}
