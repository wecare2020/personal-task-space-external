import {database} from '../../../data/db';
import {reply,failure,verifyBrowserWrite} from '../../../data/http';
import {sharedTask,editSharedTask,shareOwner} from '../../../data/shares';
import {withWorkspace} from '../../../data/github-workspace';
import {boundedBytes} from '../../../data/github-assets';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,context:Context){try{const {token}=await context.params;return await withWorkspace(shareOwner(token),async()=>reply(await sharedTask(database(),token,new URL(request.url).origin)),{write:true,revalidate:true});}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){try{
  verifyBrowserWrite(request);
  const {token}=await context.params,owner=shareOwner(token),bytes=await boundedBytes(request,4_100_000),body=JSON.parse(new TextDecoder().decode(bytes));
  return await withWorkspace(owner,async()=>reply(await editSharedTask(database(),token,body,new URL(request.url).origin)),{write:true});
}catch(error){return failure(error);}}
