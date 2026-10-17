import {database} from '../../../data/db';
import {withOwnerWorkspace} from '../../../data/owner';
import {reply,failure,verifyBrowserWrite} from '../../../data/http';
import {ownerShare,setShare} from '../../../data/shares';
import {DataError} from '../../../data/model';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const {id}=await context.params;return await withOwnerWorkspace(request,async()=>reply(await ownerShare(database(),id,new URL(request.url).origin)));}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){try{verifyBrowserWrite(request);const {id}=await context.params,body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new DataError('INVALID','Invalid share settings.');return await withOwnerWorkspace(request,async owner=>reply(await setShare(database(),owner,id,body as Record<string,unknown>,new URL(request.url).origin)),{write:true});}catch(error){return failure(error);}}
