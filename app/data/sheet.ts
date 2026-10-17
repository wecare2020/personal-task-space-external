import {DataError} from './model';
// Server-only, one-way backup transport. Reads/imports are deliberately unsupported.
export async function sheetRequest(body:Record<string,unknown>){
  if(!['nativeApply','createProject'].includes(String(body.action)))throw new DataError('RETIRED','Sheet is a backup destination, not a data source.',410);
  const endpoint=process.env.SHEET_API_URL,token=process.env.SHEET_API_TOKEN;if(!endpoint||!token)throw new Error('Sheet connection is not configured.');
  const response=await fetch(new URL(endpoint),{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,token}),redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(25000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Sheet service unavailable.');
  const payload=await response.json() as {ok:boolean;result:unknown;code?:string;error?:string;currentTask?:never;fields?:string[]};
  if(!payload.ok)throw new DataError(payload.code||'SHEET_ERROR',payload.error||'Sheet request failed.',payload.code==='CONFLICT'?409:payload.code==='CLIENT_UPDATE_REQUIRED'?428:502,payload.currentTask,payload.fields);
  return payload.result;
}
