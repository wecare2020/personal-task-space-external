import {withOwnerWorkspace,requireOwner} from '../../data/owner';
import {database} from '../../data/db';
import {reply,failure,verifyBrowserWrite} from '../../data/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return await withOwnerWorkspace(request,async()=>{const rows=await database().prepare('SELECT DISTINCT task_id FROM native_recovery').all<{task_id:string}>();return reply({native:true,mode:'github',configured:false,retired:true,paused:false,running:false,pending:0,lastSuccess:0,lastRun:0,error:null,runnerLastSeen:0,archives:rows.results.map(row=>row.task_id),initializing:false});});}catch(error){return failure(error);}}
export async function POST(request:Request){try{await requireOwner(request);verifyBrowserWrite(request);return Response.json({ok:false,code:'RETIRED',error:'Sheet sync is disabled. GitHub stores this workspace.'},{status:410,headers:{'cache-control':'no-store','vary':'Cookie','x-task-storage':'github'}});}catch(error){return failure(error);}}
