import {workspaceDatabase} from './github-workspace';
export function database():D1Database {return workspaceDatabase();}
export async function readState(db:D1Database,key:string){return (await db.prepare('SELECT value FROM native_state WHERE key=?').bind(key).first<{value:string}>())?.value??null;}
export function putState(db:D1Database,key:string,value:string){return db.prepare('INSERT INTO native_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value);}
