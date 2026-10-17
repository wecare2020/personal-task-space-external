import {withOwnerWorkspace} from '../../../data/owner';
import {database} from '../../../data/db';
import {getData} from '../../../data/store';
import {getPreferences} from '../../../data/preferences';
import {failure} from '../../../data/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return await withOwnerWorkspace(request,async()=>{
 const data=await getData(database()),settings=await getPreferences();
 const related=(await database().prepare("SELECT key,value FROM native_state WHERE key LIKE 'related-record:v1:%' OR key LIKE 'task-related:v1:%' ORDER BY key").all()).results;
 return Response.json({format:'personal-task-space-export',version:1,exportedAt:new Date().toISOString(),...data,settings,related},{headers:{'cache-control':'private, no-store','content-disposition':'attachment; filename="personal-task-space-backup.json"'}});
 });}catch(error){return failure(error);}}
