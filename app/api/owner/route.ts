import {requireOwner} from '../../data/owner';
import {reply,failure} from '../../data/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return reply({id:await requireOwner(request)});}catch(error){return failure(error);}}
