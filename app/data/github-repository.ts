import {createHash} from 'node:crypto';

const API_ORIGIN = 'https://api.github.com';
export const MAX_REPOSITORY_FILE_BYTES = 16 * 1024 * 1024;

export class GithubRepositoryError extends Error {
  constructor(public readonly code:string, message:string, public readonly status=503) { super(message); this.name='GithubRepositoryError'; }
}
export type RepositoryFile = {sha:string;bytes:Uint8Array};
export interface WorkspaceRepository {
  read(path:string):Promise<RepositoryFile|null>;
  write(path:string,bytes:Uint8Array,sha?:string):Promise<{sha:string}>;
  delete(path:string,sha:string):Promise<void>;
}
type Options={owner?:string;repo?:string;branch?:string;token?:string;fetch?:typeof fetch};

// Only the fixed GitHub API origin ever receives the server credential. Neither
// download_url nor arbitrary Location URLs supplied by a response are followed.
export class GithubRepository implements WorkspaceRepository {
  readonly owner:string; readonly repo:string; readonly branch:string;
  private readonly token:string; private readonly fetcher:typeof fetch;
  constructor(options:Options={}) {
    this.owner=options.owner??process.env.GITHUB_DATA_OWNER??'';
    this.repo=options.repo??process.env.GITHUB_DATA_REPO??'';
    this.branch=options.branch??process.env.GITHUB_DATA_BRANCH??'main';
    this.token=options.token??process.env.GITHUB_DATA_TOKEN??'';
    this.fetcher=options.fetch??fetch;
    if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(this.owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(this.repo)||!this.branch||this.branch.length>200||!this.token)
      throw new GithubRepositoryError('NOT_CONFIGURED','Private workspace storage is not configured.');
  }
  private base(){return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;}
  private filePath(path:string){
    if(!path||path.length>500||path.startsWith('/')||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..'||!/^[A-Za-z0-9_.-]+$/.test(part)))
      throw new GithubRepositoryError('INVALID_PATH','Invalid storage path.',400);
    return path.split('/').map(encodeURIComponent).join('/');
  }
  private async request(path:string,init:RequestInit={}) {
    const response=await this.fetcher(`${API_ORIGIN}${path}`,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20_000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'PH-Personal-Task-Workspace',Authorization:`Bearer ${this.token}`,...init.headers}});
    if(response.redirected||response.status>=300&&response.status<400||response.url&&new URL(response.url).origin!==API_ORIGIN)
      throw new GithubRepositoryError('REDIRECT_BLOCKED','Storage redirected unexpectedly.');
    return response;
  }
  private fail(status:number):never {
    if(status===409||status===422)throw new GithubRepositoryError('REPOSITORY_CONFLICT','Workspace changed while saving. Retry your change.',409);
    if(status===429||status===403)throw new GithubRepositoryError('REPOSITORY_UNAVAILABLE','Private workspace storage is temporarily unavailable.',503);
    throw new GithubRepositoryError('REPOSITORY_UNAVAILABLE','Private workspace storage is unavailable.',503);
  }
  async validatePrivate(){
    const response=await this.request(this.base());if(!response.ok)this.fail(response.status);
    const data=await response.json() as {private?:unknown;full_name?:unknown;archived?:unknown;disabled?:unknown};
    if(data.private!==true||String(data.full_name).toLowerCase()!==`${this.owner}/${this.repo}`.toLowerCase()||data.archived===true||data.disabled===true)
      throw new GithubRepositoryError('PRIVATE_REPOSITORY_REQUIRED','Workspace storage must be an active private repository.');
  }
  async read(path:string):Promise<RepositoryFile|null> {
    const encoded=this.filePath(path);await this.validatePrivate();
    const response=await this.request(`${this.base()}/contents/${encoded}?ref=${encodeURIComponent(this.branch)}`,{headers:{Accept:'application/vnd.github.object+json'}});
    if(response.status===404)return null;if(!response.ok)this.fail(response.status);
    const data=await response.json() as {type?:unknown;sha?:unknown;size?:unknown};
    if(data.type!=='file'||typeof data.sha!=='string'||!/^[a-f0-9]{40}$/.test(data.sha)||!Number.isSafeInteger(data.size)||Number(data.size)<0||Number(data.size)>MAX_REPOSITORY_FILE_BYTES)
      throw new GithubRepositoryError('INVALID_STORAGE_FILE','Workspace storage file is invalid or too large.');
    // Contents omits inline content above 1 MB. Fetch this immutable blob SHA,
    // not a moving raw URL, so bytes and CAS metadata refer to one version.
    const blob=await this.request(`${this.base()}/git/blobs/${data.sha}`,{headers:{Accept:'application/vnd.github.raw+json'}});
    if(!blob.ok)this.fail(blob.status);
    const bytes=await boundedBytes(blob,MAX_REPOSITORY_FILE_BYTES);
    if(bytes.byteLength!==Number(data.size)||gitBlobSha(bytes)!==data.sha)
      throw new GithubRepositoryError('INVALID_STORAGE_FILE','Workspace storage content failed integrity verification.');
    return {sha:data.sha,bytes};
  }
  async write(path:string,bytes:Uint8Array,sha?:string):Promise<{sha:string}> {
    const encoded=this.filePath(path);
    if(bytes.byteLength>MAX_REPOSITORY_FILE_BYTES)throw new GithubRepositoryError('WORKSPACE_FULL','Workspace storage limit reached.',413);
    if(sha!==undefined&&!/^[a-f0-9]{40}$/.test(sha))throw new GithubRepositoryError('INVALID_SHA','Invalid workspace revision.',400);
    await this.validatePrivate();
    const response=await this.request(`${this.base()}/contents/${encoded}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Save private workspace data',branch:this.branch,content:Buffer.from(bytes).toString('base64'),...(sha?{sha}:{})})});
    if(!response.ok)this.fail(response.status);
    const data=await response.json() as {content?:{sha?:unknown}};
    if(data.content?.sha!==gitBlobSha(bytes))throw new GithubRepositoryError('INVALID_STORAGE_RESPONSE','Workspace save was not confirmed.');
    return {sha:data.content.sha as string};
  }
  async delete(path:string,sha:string):Promise<void> {
    const encoded=this.filePath(path);if(!/^[a-f0-9]{40}$/.test(sha))throw new GithubRepositoryError('INVALID_SHA','Invalid file revision.',400);
    await this.validatePrivate();
    const response=await this.request(`${this.base()}/contents/${encoded}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Remove private workspace asset',branch:this.branch,sha})});
    if(!response.ok)this.fail(response.status);
  }
}
export function gitBlobSha(bytes:Uint8Array){return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');}
async function boundedBytes(response:Response,max:number){
  const advertised=Number(response.headers.get('content-length'));if(advertised>max)throw new GithubRepositoryError('WORKSPACE_FULL','Storage file is too large.',413);
  if(!response.body)return new Uint8Array();const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max)throw new GithubRepositoryError('WORKSPACE_FULL','Storage file is too large.',413);parts.push(part.value);}} finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}return bytes;
}
// Deliberately not cached: environment changes cannot reuse a credential/repo
// pair, and every read/write independently validates repository privacy.
export function repository(){return new GithubRepository();}
