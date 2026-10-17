import {DataError} from './model';
import {failure,reply} from './http';
import {getImage,receiveImage} from './github-assets';

export function verifyImageOrigin(request:Request){
  const origin=request.headers.get('origin');
  if(origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new DataError('FORBIDDEN','Invalid upload origin.',403);
}
export async function uploadImage(request:Request,owner:string){
  try{verifyImageOrigin(request);return reply(await receiveImage(owner,request).then(value=>value.result));}catch(error){return failure(error);}
}
// Stream private bytes; credentials and private GitHub URLs stay server-only.
export function imageBody(bytes:Uint8Array){let offset=0;return new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+65536));offset+=65536;}});}
export async function readImage(request:Request,owner:string,id:string){
  try{
    const object=await getImage(owner,id);if(!object)throw new DataError('NOT_FOUND','Image not found.',404);
    const etag='"'+object.hash+'"';
    const headers=new Headers({'content-type':object.type,'cache-control':'private, max-age=86400, immutable','cdn-cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'none'; sandbox",etag,vary:'Cookie'});
    if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
    return new Response(imageBody(object.bytes),{headers});
  }catch(error){return failure(error);}
}
