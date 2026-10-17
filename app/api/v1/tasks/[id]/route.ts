import {database} from '../../../../data/db';
import {authorizeTaskRead,withTaskReadWorkspace,readApiTask,apiReply,apiFailure,readOnlyResponse} from '../../../../data/task-api';
export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{return await withTaskReadWorkspace(request,async()=>{const db=database();await authorizeTaskRead(request,db);return apiReply(await readApiTask(db,(await context.params).id));});}catch(error){return apiFailure(error);}}
export const POST=readOnlyResponse,PUT=readOnlyResponse,PATCH=readOnlyResponse,DELETE=readOnlyResponse;
