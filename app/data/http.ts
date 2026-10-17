import {DataError} from './model';
const privateHeaders={'cache-control':'private, no-store','cdn-cache-control':'no-store','vary':'Cookie','x-task-storage':'github','x-content-type-options':'nosniff'};
export function reply(result:unknown,status=200){return Response.json({ok:true,result},{status,headers:privateHeaders});}
export function failure(error:unknown){const known=error instanceof DataError;return Response.json({ok:false,code:known?error.code:'STORAGE_ERROR',error:known?error.message:'Storage request failed. Your local changes are kept.',currentTask:known?error.currentTask:undefined,fields:known?error.fields:undefined},{status:known?error.status:503,headers:privateHeaders});}
export function verifyBrowserWrite(request:Request){const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)throw new DataError('FORBIDDEN','Invalid origin.',403);if(!request.headers.get('content-type')?.includes('application/json'))throw new DataError('INVALID','JSON is required.');}
export function verifyRunner(_request:Request){throw new DataError('RETIRED','Legacy Sheet runners are disabled in this app.',410);}
