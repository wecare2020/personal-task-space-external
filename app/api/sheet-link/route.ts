import {requireOwner} from '../../data/owner';
import {failure} from '../../data/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{await requireOwner(request);return Response.json({ok:false,code:'UNCONFIGURED',error:'No Google Sheet is linked. GitHub stores this workspace.'},{status:410,headers:{'cache-control':'no-store','vary':'Cookie','x-task-storage':'github'}});}catch(error){return failure(error);}}
