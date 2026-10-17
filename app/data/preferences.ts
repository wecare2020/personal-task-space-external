import {database,readState} from './db';
import {DataError} from './model';
import {parsePreferences,validPreferences,type PreferencesRecord} from '../task-preferences';
import {keepsFormDefinitions} from '../task-form-layout';
import {keepsTaskSchema,taskSchemaFor} from '../task-schema';
const KEY='personal_task_preferences_v1';
export async function getPreferences(){return parsePreferences(await readState(database(),KEY));}
export async function savePreferences(body:unknown):Promise<PreferencesRecord>{
 const input=body as Partial<PreferencesRecord>|null;
 if(!input||!Number.isSafeInteger(input.revision)||Number(input.revision)<0||!validPreferences(input.preferences))throw new DataError('INVALID','Invalid settings.',400);
 const db=database(),raw=await readState(db,KEY),current=parsePreferences(raw);
 if(current.revision!==input.revision)throw new DataError('CONFLICT','Settings changed in another tab. Reload before saving.',409);
 // Old clients may edit preferences, but may never erase the new catalogue.
 const preferences={...input.preferences,...(!input.preferences.taskSchema&&current.preferences.taskSchema?{taskSchema:current.preferences.taskSchema}:{})};
 if(!validPreferences(preferences))throw new DataError('INVALID','Invalid task type / attribute relationships.');
 if(current.preferences.taskTypes.some(type=>!preferences.taskTypes.some(next=>next.id===type.id)))throw new DataError('INVALID','Hide task types instead of deleting them, to protect existing tasks.');
 if(!keepsFormDefinitions(current.preferences.formLayout,preferences.formLayout))throw new DataError('INVALID','Hide sections and fields instead of deleting them or changing field types.');
 if(preferences.taskSchema&&!keepsTaskSchema(taskSchemaFor(current.preferences),preferences.taskSchema))throw new DataError('INVALID','Hide groups, attributes, sections and links instead of deleting them or changing field types.');
 const next={revision:current.revision+1,preferences},value=JSON.stringify(next);
 const result=raw===null?await db.prepare('INSERT OR IGNORE INTO native_state(key,value) VALUES(?,?)').bind(KEY,value).run():await db.prepare('UPDATE native_state SET value=? WHERE key=? AND value=?').bind(value,KEY,raw).run();
 if(result.meta.changes!==1)throw new DataError('CONFLICT','Settings changed in another tab. Reload before saving.',409);return next;
}
