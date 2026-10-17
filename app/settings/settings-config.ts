import {TASK_SETTING_DEFINITIONS,TASK_SETTING_CATEGORY as CORE_TASK_SETTING_CATEGORY,type TaskSettingRoute,type TaskSettingItem} from '@wecare2020/ph-core/tasks';

// Navigation mirrors the PH UI Config. Native workspace utilities remain available.
export const SETTINGS_ITEMS={
 'project-info':{title:'Project info',short:'PRJ'},pm:{title:'PM',short:'PM'},step:{title:'Step',short:'STP'},
 metric:{title:'Metric',short:'KPI'},'report-planning':{title:'Report planning',short:'RPT'},
 ...(Object.fromEntries(TASK_SETTING_DEFINITIONS.map(({route,title,short})=>[route,{title,short}])) as Record<TaskSettingRoute,{title:string;short:string}>),
 'table-index':{title:'Table index',short:'TBL'},'data-column':{title:'Data column',short:'COL'},relationship:{title:'Relationship',short:'REL'},connector:{title:'Connector',short:'CON'},
 page:{title:'Page',short:'PG'},view:{title:'View',short:'VW'},form:{title:'Form',short:'FM'},component:{title:'Component',short:'CMP'},navigation:{title:'Navigation',short:'NAV'},interface:{title:'App config',short:'APP'},
 'data-services':{title:'Data services',short:'SVC'},permissions:{title:'App setting permission',short:'ACL'},
 storage:{title:'Storage & backup',short:'DB'},access:{title:'Account & API',short:'API'}
} as const;
export type SettingsItem=keyof typeof SETTINGS_ITEMS;
export const SETTINGS_SECTIONS:ReadonlyArray<{id:string;title:string;groups:ReadonlyArray<{id:string;title:string;short:string;items:readonly SettingsItem[]}>}>=[
 {id:'business',title:'Business setting',groups:[
  {id:'general',title:'General',short:'01',items:['project-info','pm','step']},
  {id:'report',title:'Report',short:'02',items:['metric','report-planning']},
  {id:'task-setting',title:'Task Setting',short:'03',items:TASK_SETTING_DEFINITIONS.map(item=>item.route)}
 ]},
 {id:'app',title:'App setting',groups:[
  {id:'data',title:'Data',short:'04',items:['table-index','data-column','relationship','connector','storage']},
  {id:'ui',title:'UI',short:'05',items:['page','view','form','component','navigation','interface']},
  {id:'service',title:'Service',short:'06',items:['data-services','permissions','access']}
 ]}
];
export const TASK_SETTING_CATEGORY:Partial<Record<SettingsItem,TaskSettingItem>>=CORE_TASK_SETTING_CATEGORY;
export function settingFromQuery(value:string|null):SettingsItem|undefined{
 const legacy:Record<string,SettingsItem>={list:'task-list',new:'task-defaults',types:'task-types',form:'task-form'};
 return value&&Object.hasOwn(legacy,value)?legacy[value]:value&&Object.hasOwn(SETTINGS_ITEMS,value)?value as SettingsItem:undefined;
}
export function settingParent(item:SettingsItem){
 for(const section of SETTINGS_SECTIONS)for(const group of section.groups)if((group.items as readonly string[]).includes(item))return {section:section.id,group:group.id};
 return {section:'business',group:'task-setting'};
}
export function restoredSettingsBranches(value:unknown){
 const allowed=new Set<string>(SETTINGS_SECTIONS.flatMap(section=>[section.id,...section.groups.map(group=>group.id)]));
 return Array.isArray(value)?[...new Set(value.filter((key):key is string=>typeof key==='string').map(key=>key==='tasks'?'task-setting':key).filter(key=>allowed.has(key)))]:['business','app','task-setting'];
}
