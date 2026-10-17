import {database} from '../../../../data/db';
import {failure} from '../../../../data/http';
import {uploadSharedImage,shareOwner} from '../../../../data/shares';
import {withWorkspace} from '../../../../data/github-workspace';
import {boundedBytes,UPLOAD_CHUNK_BYTES} from '../../../../data/github-assets';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request,context:{params:Promise<{token:string}>}){try{
  const {token}=await context.params,owner=shareOwner(token),bytes=request.body?await boundedBytes(request,UPLOAD_CHUNK_BYTES):undefined;
  return await withWorkspace(owner,async()=>uploadSharedImage(database(),new Request(request.url,{method:'POST',headers:request.headers,body:bytes}),token),{write:true});
}catch(error){return failure(error);}}
