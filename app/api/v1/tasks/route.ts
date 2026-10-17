import {database} from '../../../data/db';
import {authorizeTaskRead,withTaskReadWorkspace,listApiTasks,apiReply,apiFailure,readOnlyResponse} from '../../../data/task-api';
export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
export async function GET(request:Request){try{return await withTaskReadWorkspace(request,async()=>{const db=database();await authorizeTaskRead(request,db);return apiReply(await listApiTasks(db,new URL(request.url)));});}catch(error){return apiFailure(error);}}
export const POST=readOnlyResponse,PUT=readOnlyResponse,PATCH=readOnlyResponse,DELETE=readOnlyResponse;
