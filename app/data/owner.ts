import {auth} from '../../auth';
import {optionalWorkspaceOwner,withWorkspace} from './github-workspace';
import {DataError} from './model';

export async function authenticatedOwner():Promise<string>{
  const owner=(await auth())?.user?.ownerId;
  if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))throw new DataError('UNAUTHORIZED','Sign in to open your workspace.',401);
  return owner;
}

// Authorization uses only the Auth.js verified session, never request headers,
// task IDs, URL parameters, development fixtures or a global pinned identity.
export async function requireOwner(request?:Request):Promise<string>{
  const owner=await authenticatedOwner(),active=optionalWorkspaceOwner();
  if(active&&active!==owner)throw new DataError('FORBIDDEN','This workspace is private.',403);
  const tabOwner=request?.headers.get('x-workspace-id');
  if(tabOwner!==undefined&&tabOwner!==null&&tabOwner!==owner)throw new DataError('ACCOUNT_CHANGED','Your account changed. Reload before continuing.',403);
  return owner;
}

export async function withOwnerWorkspace<T>(request:Request,operation:(owner:string)=>Promise<T>,options:{write?:boolean}={}):Promise<T>{
  const owner=await requireOwner(request);
  return withWorkspace(owner,()=>operation(owner),options);
}
