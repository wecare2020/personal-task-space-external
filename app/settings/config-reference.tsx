'use client';
import {useId} from 'react';
import type {SettingsItem} from './settings-config';

type Reference={note:string;fields:Array<[string,string]>;action?:[string,SettingsItem]};
// Reference definitions are illustrative, not task records or executable configuration.
const references:Partial<Record<SettingsItem,Reference>>={
 'project-info':{note:'Workspace information.',fields:[['Workspace','Personal Task Space'],['Storage','private GitHub snapshots'],['Timezone','UTC+07:00'],['Task links','One URL per task']],action:['Storage & backup','storage']},
 pm:{note:'Planning structure reference.',fields:[['Task','Work item'],['Stage','Prepare → Execute → Review'],['Status','Today / Upcoming / Completed'],['Owner','Solo / Team'],['Content','Brief / Task Form / Discussion']],action:['Task list settings','task-list']},
 step:{note:'Workflow step reference; not an active workflow engine.',fields:[['Name','Review deliverable'],['Sequence','3'],['Owner role','Reviewer'],['Duration','Optional'],['Approval','Optional']],action:['Configure task fields','task-form']},
 metric:{note:'Reporting definition reference; values are not live metrics.',fields:[['Name','Task completion'],['Measure','Completed / total tasks'],['Scope','Project / task type'],['Target','Optional'],['Period','Week / month']]},
 'report-planning':{note:'Reporting plan reference; no scheduled reports are created.',fields:[['Period','Weekly / monthly'],['Group by','Project / status / task type'],['Measure','Task count / completion'],['Recipient','Workspace owner'],['Delivery','Not configured']]},
 'table-index':{note:'Native table structure. This page does not change the database schema.',fields:[['Tasks','native_tasks · id · version · data'],['Projects','native_projects · id · data'],['Preferences','native_state · key · value'],['Related records','Independent workspace records']],action:['Storage & backup','storage']},
 'data-column':{note:'Column definition reference. Task Form fields can be configured separately.',fields:[['Table','Tasks'],['Column','Task name'],['Data type','Text'],['Required','Yes'],['Visible','Yes']],action:['Configure task fields','task-form']},
 relationship:{note:'Relationship reference. These definitions do not create new database relations.',fields:[['Source','Task'],['Target','Project / related record'],['Cardinality','Many-to-one / one-to-many'],['Link','Stable record ID'],['Delete behavior','Keep unrelated records']],action:['Related table settings','task-form']},
 connector:{note:'Existing data connections. No new connection is enabled here.',fields:[['Primary storage','private GitHub snapshots'],['Data backup','Private GitHub snapshots'],['Task API','Read-only keys'],['Two-way sync','Disabled']],action:['Storage & backup','storage']},
 page:{note:'Page structure reference.',fields:[['Task workspace','/'],['Task record','/?task=<task-id>'],['Settings','/settings'],['Task API management','/api-access'],['Layout','List detail']]},
 view:{note:'View definition reference. Layout is selected in the task workspace.',fields:[['Layouts','List detail / Table / Cards / Kanban / Calendar / Timeline'],['Group by','Status / project / task type'],['Sort','Name / due date'],['Filter','Active / completed / all']],action:['Task list settings','task-list']},
 form:{note:'Form definition reference. Use Task Form to configure native sections and fields.',fields:[['Main form','Task Form'],['Sections','Current task / related tables / related record'],['Display','Expandable sections'],['Changes','Explicit save / cancel'],['Visibility','Hide / restore']],action:['Configure Task Form','task-form']},
 component:{note:'Shared component reference; does not override the design system.',fields:[['Button','White outlined'],['Field','Label + input + optional hint'],['Status','Neutral tag'],['Section','Expandable'],['Focus','Visible keyboard focus']]},
 navigation:{note:'Navigation reference. Opening tab is configured in Task list.',fields:[['Primary tabs','Task / Project'],['Settings groups','Business setting / App setting'],['Sidebar','Expandable categories / compact rail'],['Mobile','Navigation drawer']],action:['Opening tab settings','task-list']},
 interface:{note:'PH UI design tokens. These remain shared design-system values.',fields:[['Heading font','Montserrat'],['Body font','Roboto'],['Brand','#7A4E1D'],['Surface','#FFFFFF'],['Background','#F8F9FA']],action:['Task appearance options','task-list']},
 'data-services':{note:'Existing services; no background jobs are created by this page.',fields:[['Read / write tasks','Native private GitHub snapshots'],['Draft recovery','On-device recovery'],['Google Sheet','Separate one-way backup'],['External API','Read-only task access']],action:['Storage & backup','storage']},
 permissions:{note:'Current access model. Editing this reference cannot grant access.',fields:[['Settings','Workspace owner only'],['Task records','Private by default'],['Sharing','Per-task link permissions'],['Task API','Read-only'],['Related records','Private to the workspace']],action:['Account & API','access']}
};
export function hasConfigReference(item:SettingsItem){return Object.hasOwn(references,item);}
export default function ConfigReference({item,onSelect}:{item:SettingsItem;onSelect:(item:SettingsItem)=>void}){
 const scope=useId(),definition=references[item];if(!definition)return null;
 return <div className="settings-config-reference"><p className="settings-reference-note">{definition.note}</p><div className="settings-grid">{definition.fields.map(([label,value],index)=><div className="settings-field" key={label}><label className="settings-label" htmlFor={`${scope}-${index}`}>{label}</label><input id={`${scope}-${index}`} value={value} readOnly/></div>)}</div>{definition.action&&<div className="settings-reference-action"><button className="settings-button" type="button" onClick={()=>onSelect(definition.action![1])}>{definition.action[0]}</button></div>}</div>;
}
