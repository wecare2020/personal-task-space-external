import {auth} from '../../auth';
import ApiAccess from './api-access';
export const dynamic='force-dynamic';
export default async function Page(){const owner=(await auth())?.user?.ownerId;if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))return <main className="workspace-signin"><h1>Task API access</h1><p>Sign in to manage read-only API keys.</p><a href="/signin?returnTo=%2Fapi-access">Continue with GitHub</a></main>;return <ApiAccess/>;}
