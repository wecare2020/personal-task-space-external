/** Local drafts are durable immediately; this clock only coalesces remote saves. */
export const AUTOSAVE_QUIET_MS=30_000;
export const AUTOSAVE_MAX_MS=120_000;
export function createAutosaveWindow(quietMs=AUTOSAVE_QUIET_MS,maxMs=AUTOSAVE_MAX_MS){
 const starts=new Map<string,number>();
 return {
  delay(key:string,now=Date.now()){
   const first=starts.get(key)??now;starts.set(key,first);
   return Math.max(0,Math.min(quietMs,maxMs-(now-first)));
  },
  reset(key:string){starts.delete(key);},
 };
}
