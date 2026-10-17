import {readImage} from '../../../data/images';
import {requireOwner} from '../../../data/owner';
import {failure} from '../../../data/http';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  try {return await readImage(request,await requireOwner(request),(await context.params).id);}catch(error){return failure(error);}
}
