import {AsyncLocalStorage} from 'node:async_hooks';
import {DatabaseSync} from 'node:sqlite';
import {GithubRepositoryError,MAX_REPOSITORY_FILE_BYTES,repository,type WorkspaceRepository} from './github-repository';

// Bundled static schema; no runtime filesystem, persistent local DB, D1 binding,
// production records, or original Personal resource is required on Vercel.
const SCHEMA=`
CREATE TABLE native_state(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
CREATE TABLE native_tasks(id TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,baseline TEXT,sync_revision INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
CREATE TABLE native_projects(id TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL,exported INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX idx_native_projects_name ON native_projects(lower(id));
CREATE TABLE native_receipts(id TEXT PRIMARY KEY NOT NULL,fingerprint TEXT NOT NULL,task_id TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE native_recovery(id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL,data TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE native_outbox(task_id TEXT PRIMARY KEY NOT NULL,version INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT);
CREATE INDEX idx_native_outbox_due ON native_outbox(next_attempt);
CREATE TABLE native_sync_attempts(task_id TEXT PRIMARY KEY NOT NULL,id TEXT NOT NULL,base TEXT,desired TEXT NOT NULL,version INTEGER NOT NULL,sync_revision INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE native_conflicts(task_id TEXT PRIMARY KEY NOT NULL,base TEXT,local TEXT NOT NULL,remote TEXT,fields TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE native_share_assets(asset_id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL,r2_key TEXT NOT NULL,uploaded_at INTEGER NOT NULL DEFAULT 0,grant_generation INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_share_assets_task ON native_share_assets(task_id);
CREATE TABLE native_share_limits(key TEXT PRIMARY KEY NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL);
CREATE TABLE native_task_shares(task_id TEXT PRIMARY KEY NOT NULL,token TEXT NOT NULL,token_hash TEXT NOT NULL,owner_id TEXT NOT NULL,permission TEXT NOT NULL,generation INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX idx_share_token_hash ON native_task_shares(token_hash);
CREATE TABLE native_task_read_keys(id TEXT PRIMARY KEY NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER);
CREATE UNIQUE INDEX idx_task_read_key_hash ON native_task_read_keys(token_hash);
CREATE INDEX idx_task_read_key_owner ON native_task_read_keys(owner_id);
`;
const TABLES={
  native_state:['key','value'],native_tasks:['id','data','version','baseline','sync_revision','deleted','updated_at'],native_projects:['id','data','exported'],
  native_receipts:['id','fingerprint','task_id','result','created_at'],native_recovery:['id','task_id','data','reason','created_at'],native_outbox:['task_id','version','attempts','next_attempt','last_error'],
  native_sync_attempts:['task_id','id','base','desired','version','sync_revision','created_at'],native_conflicts:['task_id','base','local','remote','fields','created_at'],
  native_share_assets:['asset_id','task_id','r2_key','uploaded_at','grant_generation'],native_share_limits:['key','window','count'],
  native_task_shares:['task_id','token','token_hash','owner_id','permission','generation','updated_at'],native_task_read_keys:['id','owner_id','name','token_hash','created_at','expires_at','revoked_at'],
} as const;
const NUMBER_COLUMNS=new Set(['version','sync_revision','deleted','updated_at','exported','created_at','attempts','next_attempt','uploaded_at','grant_generation','window','count','generation','expires_at','revoked_at']);
const NULLABLE_COLUMNS=new Set(['baseline','base','remote','last_error','revoked_at']);
type Cell=string|number|null;type Row=Record<string,Cell>;
type Snapshot={format:'ph-personal-github-workspace';version:1;owner:string;tables:Record<string,Row[]>};
const contexts=new AsyncLocalStorage<{owner:string;database:D1Database}>();
export function optionalWorkspaceOwner():string|undefined {return contexts.getStore()?.owner;}
export function currentWorkspaceOwner(){const context=contexts.getStore();if(!context)throw new Error('No authorized workspace context.');return context.owner;}
export function workspaceDatabase():D1Database {const context=contexts.getStore();if(!context)throw new Error('No authorized workspace context.');return context.database;}
function assertOwner(owner:string){if(!/^[a-f0-9]{64}$/.test(owner))throw new GithubRepositoryError('INVALID_OWNER','Invalid workspace owner.',403);}
function emptyDatabase(owner:string){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(SCHEMA);
  const state=sqlite.prepare('INSERT INTO native_state(key,value) VALUES(?,?)');state.run('ready','1');state.run('app_owner_id',owner);
  const insert=sqlite.prepare('INSERT INTO native_tasks(id,data,version,updated_at) VALUES(?,?,1,0)');
  for(const [id,title] of [['task-overall','Overall'],['task-next-note','Next & Note']])insert.run(id,JSON.stringify({id,title,date:'',completed:false,status:'today',isTop:true,team:false,detail:'',projectId:'',projectIds:[]}));
  return sqlite;
}
function invalidSnapshot():never {throw new GithubRepositoryError('INVALID_WORKSPACE','Workspace data is malformed. No changes were saved.');}
function parseSnapshot(bytes:Uint8Array,owner:string):Snapshot {
  if(bytes.byteLength>MAX_REPOSITORY_FILE_BYTES)invalidSnapshot();let value:unknown;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{invalidSnapshot();}
  if(!value||typeof value!=='object'||Array.isArray(value))invalidSnapshot();const snapshot=value as Snapshot;
  if(Object.keys(snapshot).some(key=>!['format','version','owner','tables'].includes(key))||snapshot.format!=='ph-personal-github-workspace'||snapshot.version!==1||snapshot.owner!==owner||!snapshot.tables||typeof snapshot.tables!=='object'||Array.isArray(snapshot.tables))invalidSnapshot();
  if(Object.keys(snapshot.tables).length!==Object.keys(TABLES).length||Object.keys(snapshot.tables).some(name=>!(name in TABLES)))invalidSnapshot();
  let count=0;for(const [name,columns] of Object.entries(TABLES)){
    const rows=snapshot.tables[name];if(!Array.isArray(rows)|| (count+=rows.length)>100_000)invalidSnapshot();
    for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==columns.length||Object.keys(row).some(key=>!(columns as readonly string[]).includes(key)))invalidSnapshot();
      for(const column of columns){const cell=row[column];if(cell===null){if(!NULLABLE_COLUMNS.has(column))invalidSnapshot();}else if(NUMBER_COLUMNS.has(column)?typeof cell!=='number'||!Number.isSafeInteger(cell):typeof cell!=='string')invalidSnapshot();}
      if(['native_tasks','native_projects','native_recovery'].includes(name)){try{const content=JSON.parse(String(row.data));if(!content||typeof content!=='object'||Array.isArray(content))invalidSnapshot();if(name!=='native_recovery'&&content.id!==row.id)invalidSnapshot();}catch{invalidSnapshot();}}
      if((name==='native_task_shares'||name==='native_task_read_keys')&&row.owner_id!==owner)invalidSnapshot();
    }
  }
  if(snapshot.tables.native_state.find(row=>row.key==='app_owner_id')?.value!==owner||snapshot.tables.native_state.find(row=>row.key==='ready')?.value!=='1')invalidSnapshot();
  return snapshot;
}
function hydrate(sqlite:DatabaseSync,snapshot:Snapshot){
  sqlite.exec('BEGIN');try{
    for(const [name,columns] of Object.entries(TABLES)){
      sqlite.exec(`DELETE FROM ${name}`);const insert=sqlite.prepare(`INSERT INTO ${name}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
      for(const row of snapshot.tables[name])insert.run(...columns.map(column=>row[column]));
    }sqlite.exec('COMMIT');
  }catch{sqlite.exec('ROLLBACK');invalidSnapshot();}
}
function serialize(sqlite:DatabaseSync,owner:string){
  const tables:Record<string,Row[]>={};for(const name of Object.keys(TABLES))tables[name]=sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all() as Row[];
  const value:Snapshot={format:'ph-personal-github-workspace',version:1,owner,tables};
  // Validate ownership and limits again after application SQL has run.
  const bytes=new TextEncoder().encode(JSON.stringify(value));parseSnapshot(bytes,owner);return bytes;
}
function meta(changes=0,lastRowId=0):D1Meta&Record<string,unknown>{return {changes,last_row_id:lastRowId,duration:0,size_after:0,rows_read:0,rows_written:changes,changed_db:changes>0};}
function result<T>(rows:T[],changes=0,lastRowId=0):D1Result<T>{return {success:true,results:rows,meta:meta(changes,lastRowId)};}
class Prepared {
  constructor(private readonly sqlite:DatabaseSync,private readonly sql:string,private readonly values:Cell[]=[]){ }
  bind(...values:unknown[]){
    const cells=values.map(value=>typeof value==='boolean'?Number(value):value instanceof Uint8Array?value:value);
    if(cells.some(value=>value!==null&&typeof value!=='string'&&typeof value!=='number'&&!(value instanceof Uint8Array)))throw new TypeError('Unsupported SQL binding.');
    return new Prepared(this.sqlite,this.sql,cells as Cell[]);
  }
  async first<T=Row>(column?:string):Promise<T|null>{const row=this.sqlite.prepare(this.sql).get(...this.values) as Record<string,unknown>|undefined;return (row?(column?row[column]:row):null) as T|null;}
  async all<T=Row>():Promise<D1Result<T>>{return result(this.sqlite.prepare(this.sql).all(...this.values) as T[]);}
  async run<T=Row>():Promise<D1Result<T>>{const value=this.sqlite.prepare(this.sql).run(...this.values);return result<T>([],Number(value.changes),Number(value.lastInsertRowid));}
  async raw<T=unknown[]>(options?:{columnNames?:boolean}):Promise<T[]>{const statement=this.sqlite.prepare(this.sql);statement.setReturnArrays(true);const rows=statement.all(...this.values) as unknown as unknown[][];return (options?.columnNames?[statement.columns().map(column=>column.name),...rows]:rows) as T[];}
  async execute(){return this.sqlite.prepare(this.sql).columns().length?this.all():this.run();}
}
export function sqliteD1(sqlite:DatabaseSync):D1Database {
  let batches=0;return {
    prepare(sql:string){return new Prepared(sqlite,sql);},
    async batch(statements:Prepared[]){const name=`batch_${++batches}`;sqlite.exec(`SAVEPOINT ${name}`);try{const results=[];for(const statement of statements)results.push(await statement.execute());sqlite.exec(`RELEASE ${name}`);return results;}catch(error){sqlite.exec(`ROLLBACK TO ${name}`);sqlite.exec(`RELEASE ${name}`);throw error;}},
    async exec(sql:string){sqlite.exec(sql);return {count:0,duration:0};},
    async dump(){throw new Error('Workspace database dumps are disabled.');},
  } as unknown as D1Database;
}
type WorkspaceOptions={write?:boolean;revalidate?:boolean;repository?:WorkspaceRepository;maxAttempts?:number};
export async function withWorkspace<T>(owner:string,operation:()=>Promise<T>,options:WorkspaceOptions={}):Promise<T> {
  assertOwner(owner);if(contexts.getStore())throw new Error('Nested workspace contexts are not allowed.');
  const remote=options.repository??repository(),path=`workspaces/${owner}.json`,attempts=Math.max(1,Math.min(3,options.maxAttempts??3));
  for(let attempt=0;attempt<attempts;attempt++){
    const source=await remote.read(path),sqlite=emptyDatabase(owner);let transaction=false;
    try{
      if(source)hydrate(sqlite,parseSnapshot(source.bytes,owner));const before=serialize(sqlite,owner);
      if(!options.write)sqlite.exec('PRAGMA query_only=ON');sqlite.exec('BEGIN');transaction=true;
      const output=await contexts.run({owner,database:sqliteD1(sqlite)},operation);
      if(output instanceof Response&&output.status>=400){sqlite.exec('ROLLBACK');transaction=false;return output;}
      const after=serialize(sqlite,owner);
      if(!Buffer.from(before).equals(Buffer.from(after))){
        if(!options.write)throw new GithubRepositoryError('READ_ONLY','This request cannot update workspace data.',405);
        await remote.write(path,after,source?.sha);
      }else if(options.revalidate){
        // A public capability may have been revoked while its callback loaded
        // binary assets. Replaying against a fresh snapshot rechecks the grant;
        // do not return the already-built response from the stale snapshot.
        const latest=await remote.read(path);
        if(latest?.sha!==source?.sha)throw new GithubRepositoryError('REPOSITORY_CONFLICT','Workspace changed while reading. Retry your request.',409);
      }
      sqlite.exec('COMMIT');transaction=false;return output;
    }catch(error){
      if(transaction){sqlite.exec('ROLLBACK');transaction=false;}
      if(error instanceof GithubRepositoryError&&error.code==='REPOSITORY_CONFLICT'&&attempt+1<attempts)continue;
      throw error;
    }finally{sqlite.close();}
  }
  throw new GithubRepositoryError('REPOSITORY_CONFLICT','Workspace is busy. Your local changes are kept.',409);
}
