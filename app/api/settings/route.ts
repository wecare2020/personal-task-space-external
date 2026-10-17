import {withOwnerWorkspace} from '../../data/owner';
import {getPreferences,savePreferences} from '../../data/preferences';
import {reply,failure,verifyBrowserWrite} from '../../data/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return await withOwnerWorkspace(request,async()=>reply(await getPreferences()));}catch(error){return failure(error);}}
export async function POST(request:Request){try{verifyBrowserWrite(request);const body=await request.json();return await withOwnerWorkspace(request,async()=>reply(await savePreferences(body)),{write:true});}catch(error){return failure(error);}}
