import {database} from '../../../../../data/db';
import {failure} from '../../../../../data/http';
import {readSharedImage,shareOwner} from '../../../../../data/shares';
import {withWorkspace} from '../../../../../data/github-workspace';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request,context:{params:Promise<{token:string;id:string}>}){try{const {token,id}=await context.params;return await withWorkspace(shareOwner(token),async()=>readSharedImage(database(),token,id,new URL(request.url).origin),{write:true,revalidate:true});}catch(error){return failure(error);}}
