import {withOwnerWorkspace} from '../../data/owner';
import {database} from '../../data/db';
import {verifyBrowserWrite} from '../../data/http';
import {DataError} from '../../data/model';
import {listReadKeys,createReadKey,revokeReadKey,apiReply,apiFailure} from '../../data/task-api';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return await withOwnerWorkspace(request,async owner=>apiReply({keys:await listReadKeys(database(),owner)}));}catch(error){return apiFailure(error);}}
export async function POST(request:Request){try{verifyBrowserWrite(request);if(Number(request.headers.get('content-length'))>2048)throw new DataError('INVALID','Request is too large.',413);const text=await request.text();if(text.length>2048)throw new DataError('INVALID','Request is too large.',413);let body:Record<string,unknown>;try{body=JSON.parse(text);}catch{throw new DataError('INVALID','Invalid JSON.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new DataError('INVALID','Invalid request.');return await withOwnerWorkspace(request,async owner=>{const db=database();if(body.action==='create')return apiReply(await createReadKey(db,owner,body),201);if(body.action==='revoke')return apiReply(await revokeReadKey(db,owner,body.id));throw new DataError('INVALID','Unsupported action.');},{write:true});}catch(error){return apiFailure(error);}}
