export const TASK_FORM_FIELDS = ['goal','outcome','priority','owner','effort','nextStep','reference'] as const;
export type TaskFormField = typeof TASK_FORM_FIELDS[number];
export type TaskFormValues = Record<TaskFormField,string>&{custom:Record<string,string>};
export const EMPTY_TASK_FORM:TaskFormValues={goal:'',outcome:'',priority:'',owner:'',effort:'',nextStep:'',reference:'',custom:{}};
export function parseTaskForm(value:string,validateReference=true):TaskFormValues {
  if(!value)return {...EMPTY_TASK_FORM};
  const input:unknown=JSON.parse(value);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='custom'&&!TASK_FORM_FIELDS.includes(key as TaskFormField)))throw new Error('Invalid task form.');
  const result={...EMPTY_TASK_FORM};
  for(const key of TASK_FORM_FIELDS){const text=(input as Record<string,unknown>)[key]??'';if(typeof text!=='string'||text.length>10000)throw new Error('Invalid task form field.');result[key]=text;}
  if(!['','low','normal','high','urgent'].includes(result.priority))throw new Error('Invalid priority.');
  const custom=(input as {custom?:unknown}).custom??{};if(!custom||typeof custom!=='object'||Array.isArray(custom)||Object.keys(custom).length>40)throw new Error('Invalid custom fields.');
  result.custom={};for(const [id,text] of Object.entries(custom)){if(!/^[a-zA-Z][a-zA-Z0-9-]{0,79}$/.test(id)||['constructor','prototype','__proto__'].includes(id)||typeof text!=='string'||text.length>10000)throw new Error('Invalid custom field.');result.custom[id]=text;}
  if(validateReference&&result.reference){const url=new URL(result.reference);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an http or https reference link.');}
  return result;
}
export function serializeTaskForm(value:TaskFormValues,validateReference=true):string {
  const fields:Record<string,unknown>=Object.fromEntries(TASK_FORM_FIELDS.filter(key=>value[key]!=='').map(key=>[key,value[key]]));
  const custom=Object.fromEntries(Object.entries(value.custom||{}).filter(([,text])=>text!==''));if(Object.keys(custom).length)fields.custom=custom;
  const encoded=Object.keys(fields).length?JSON.stringify(fields):'';
  if(encoded.length>50000)throw new Error('Task form is too long.');
  parseTaskForm(encoded,validateReference);
  return encoded;
}
