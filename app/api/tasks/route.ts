import {withOwnerWorkspace} from '../../data/owner';
import {database} from '../../data/db';
import {getData,mutate,nativeReadRevision} from '../../data/store';
import {reply,failure,verifyBrowserWrite} from '../../data/http';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
export async function GET(request:Request){try{
  return await withOwnerWorkspace(request,async()=>{const db=database(),revision=await nativeReadRevision(db);
  const headers={'etag':revision,'cache-control':'private, no-store','cdn-cache-control':'no-store','vary':'Cookie','x-task-storage':'github'};
  if(request.headers.get('if-none-match')===revision)return new Response(null,{status:304,headers});
  return Response.json({ok:true,result:await getData(db)},{headers});});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{verifyBrowserWrite(request);const body=await request.json() as Record<string,unknown>;return await withOwnerWorkspace(request,async()=>reply(await mutate(database(),body)),{write:true});}catch(error){return failure(error);}}
