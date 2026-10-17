import 'server-only';
import {createHash} from 'node:crypto';
import {GithubRepository, GithubRepositoryError, repository} from './github-repository';
import {IMAGE_TYPES,MAX_IMAGE_BYTES,imageId,rasterImageType} from '../image-files';
import {DataError} from './model';

export const UPLOAD_CHUNK_BYTES=2*1024*1024;
export const UPLOAD_TTL_MS=10*60*1000;
const ownerPattern=/^[a-f0-9]{64}$/;
export function imageKey(owner:string,id:string){
  if(!ownerPattern.test(owner)||!imageId(id))throw new DataError('INVALID','Invalid image.');
  return 'images/'+owner+'/'+id.toLowerCase()+'.bin';
}
export function bytesHash(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}
export function checkedImage(bytes:Uint8Array,type:string){
  if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw new DataError('INVALID','Each image must be 8 MB or smaller.',413);
  if(!(IMAGE_TYPES as readonly string[]).includes(type)||rasterImageType(bytes)!==type)throw new DataError('INVALID','Paste a PNG, JPEG, GIF or WebP image.',415);
}
async function immutable(repo:GithubRepository,path:string,bytes:Uint8Array){
  const prior=await repo.read(path);
  if(prior){if(bytesHash(prior.bytes)!==bytesHash(bytes))throw new DataError('CONFLICT','This upload ID is already in use. Paste the image again.',409);return;}
  try{await repo.write(path,bytes);}catch(error){
    if(!(error instanceof GithubRepositoryError)||error.status!==409)throw error;
    const concurrent=await repo.read(path);
    if(!concurrent||bytesHash(concurrent.bytes)!==bytesHash(bytes))throw new DataError('CONFLICT','This upload ID is already in use. Paste the image again.',409);
  }
}
export async function putImage(owner:string,id:string,bytes:Uint8Array,type:string,repo=repository()){
  checkedImage(bytes,type);await immutable(repo,imageKey(owner,id),bytes);
  return {path:'/api/images/'+id.toLowerCase(),size:bytes.length,type};
}
export async function getImage(owner:string,id:string,repo=repository()){
  const object=await repo.read(imageKey(owner,id));if(!object)return null;
  const type=rasterImageType(object.bytes);if(!type||object.bytes.length>MAX_IMAGE_BYTES)return null;
  return {...object,type,hash:bytesHash(object.bytes)};
}
type Manifest={type:string;size:number;parts:number;hash:string;scope:string;createdAt:number};
const encoder=new TextEncoder();
function manifestPath(owner:string,id:string){imageKey(owner,id);return 'uploads/'+owner+'/'+id.toLowerCase()+'/manifest.json';}
function sameManifest(a:Manifest,b:Manifest){return a.type===b.type&&a.size===b.size&&a.parts===b.parts&&a.hash===b.hash&&a.scope===b.scope;}
function uploadManifest(request:Request,scope:string):Manifest{
  const type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),size=Number(request.headers.get('x-image-size')),parts=Number(request.headers.get('x-image-parts')),hash=request.headers.get('x-image-sha256')||'';
  if(!(IMAGE_TYPES as readonly string[]).includes(type)||!Number.isSafeInteger(size)||size<=0||size>MAX_IMAGE_BYTES||!Number.isInteger(parts)||parts!==Math.ceil(size/UPLOAD_CHUNK_BYTES)||!/^[a-f0-9]{64}$/.test(hash))throw new DataError('INVALID','Invalid image upload.');
  return {type,size,parts,hash,scope,createdAt:Date.now()};
}
async function ensureManifest(owner:string,id:string,candidate:Manifest,repo:GithubRepository,attempt=0):Promise<Manifest>{
  const path=manifestPath(owner,id),existing=await repo.read(path);
  if(existing){const manifest=JSON.parse(new TextDecoder().decode(existing.bytes)) as Manifest;if(!sameManifest(manifest,candidate))throw new DataError('CONFLICT','This upload ID is already in use.',409);if(manifest.createdAt<Date.now()-UPLOAD_TTL_MS)throw new DataError('UPLOAD_EXPIRED','Paste the image again to restart this upload.',410);return manifest;}
  try{await repo.write(path,encoder.encode(JSON.stringify(candidate)));return candidate;}catch(error){if(!(error instanceof GithubRepositoryError)||error.status!==409||attempt>=2)throw error;return ensureManifest(owner,id,candidate,repo,attempt+1);}
}
export async function boundedBytes(request:Request,max:number){
  const declared=Number(request.headers.get('content-length')||0);if(declared>max)throw new DataError('INVALID','Image upload is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw new DataError('INVALID','No image was received.');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new DataError('INVALID','Image upload is too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
// <=2 MB requests preserve the original 8 MB user limit on Vercel.
export async function receiveImage(owner:string,request:Request,scope='owner',repo=repository()){
  const id=request.headers.get('x-image-id')||'';imageKey(owner,id);
  const action=request.headers.get('x-image-upload'),type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!action)return {complete:true,result:await putImage(owner,id,await boundedBytes(request,UPLOAD_CHUNK_BYTES),type,repo)};
  if(action!=='chunk'&&action!=='complete')throw new DataError('INVALID','Invalid upload action.');
  const candidate=uploadManifest(request,scope);
  const final=await getImage(owner,id,repo);
  if(final){if(final.hash!==candidate.hash||final.bytes.length!==candidate.size||final.type!==candidate.type)throw new DataError('CONFLICT','This upload ID is already in use.',409);return {complete:true,result:{path:'/api/images/'+id.toLowerCase(),size:final.bytes.length,type:final.type}};}
  const manifest=await ensureManifest(owner,id,candidate,repo),base=manifestPath(owner,id).replace('manifest.json','');
  if(action==='chunk'){
    const part=Number(request.headers.get('x-image-part'));if(!Number.isInteger(part)||part<0||part>=manifest.parts)throw new DataError('INVALID','Invalid upload part.');
    const bytes=await boundedBytes(request,UPLOAD_CHUNK_BYTES),expected=part===manifest.parts-1?manifest.size-part*UPLOAD_CHUNK_BYTES:UPLOAD_CHUNK_BYTES;
    if(bytes.length!==expected)throw new DataError('INVALID','Incomplete image upload.');
    await immutable(repo,base+part+'.part',bytes);return {complete:false,result:{part}};
  }
  if(action!=='complete')throw new DataError('INVALID','Invalid upload action.');
  const bytes=new Uint8Array(manifest.size);let offset=0;
  for(let part=0;part<manifest.parts;part++){const chunk=await repo.read(base+part+'.part');if(!chunk)throw new DataError('UPLOAD_INCOMPLETE','Some image parts are missing. Retry this upload.',409);const expected=part===manifest.parts-1?manifest.size-part*UPLOAD_CHUNK_BYTES:UPLOAD_CHUNK_BYTES;if(chunk.bytes.length!==expected)throw new DataError('INVALID','Invalid image upload.');bytes.set(chunk.bytes,offset);offset+=chunk.bytes.length;}
  if(bytesHash(bytes)!==manifest.hash)throw new DataError('INVALID','The image upload is corrupted. Paste it again.');
  const result=await putImage(owner,id,bytes,manifest.type,repo);
  // Cleanup failure never rejects an already durable image.
  for(let part=0;part<manifest.parts;part++){try{const chunk=await repo.read(base+part+'.part');if(chunk)await repo.delete(base+part+'.part',chunk.sha);}catch{}}
  return {complete:true,result};
}
