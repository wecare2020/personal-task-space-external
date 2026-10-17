export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(){return Response.json({ok:false,code:'RETIRED',error:'Legacy Sheet runners are disabled. GitHub stores this workspace.'},{status:410,headers:{'cache-control':'no-store','x-task-storage':'github'}});}
