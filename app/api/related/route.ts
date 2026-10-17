import {withOwnerWorkspace} from '../../data/owner';
import {reply,failure,verifyBrowserWrite} from '../../data/http';
import {readRelated,writeRelated} from '../../data/related-records';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return await withOwnerWorkspace(request,async()=>reply(await readRelated(new URL(request.url).searchParams)));}catch(error){return failure(error);}}
export async function POST(request:Request){try{verifyBrowserWrite(request);const body=await request.json() as Record<string,unknown>;return await withOwnerWorkspace(request,async()=>reply(await writeRelated(body)),{write:true});}catch(error){return failure(error);}}
