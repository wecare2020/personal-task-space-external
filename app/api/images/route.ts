import {uploadImage} from '../../data/images';
import {requireOwner} from '../../data/owner';
import {failure} from '../../data/http';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request: Request) {
  try {return await uploadImage(request,await requireOwner(request));}catch(error){return failure(error);}
}
