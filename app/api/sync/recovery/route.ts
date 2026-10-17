import {withOwnerWorkspace} from '../../../data/owner';
import {database} from '../../../data/db';
import {failure} from '../../../data/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return await withOwnerWorkspace(request,async()=>{const id=new URL(request.url).searchParams.get('task');if(!id)return Response.json({ok:false},{status:400});const rows=await database().prepare('SELECT data,reason,created_at FROM native_recovery WHERE task_id=? ORDER BY created_at DESC LIMIT 50').bind(id).all<{data:string;reason:string;created_at:number}>();return Response.json({taskId:id,versions:rows.results.map(r=>({at:r.created_at,reason:r.reason,data:JSON.parse(r.data)}))},{headers:{'cache-control':'private, no-store','cdn-cache-control':'no-store','vary':'Cookie','content-disposition':'attachment; filename="task-recovery.json"'}});});}catch(error){return failure(error);}}
