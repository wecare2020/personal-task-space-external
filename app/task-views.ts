export type CompletionFilter='active'|'completed'|'all';
export type TaskGroupBy='status'|'project'|'team'|'none';
export type TaskSort='date-asc'|'date-desc'|'title-asc'|'title-desc';
export type TaskView='active'|'today'|'upcoming'|'overdue'|'completed'|'all';
export type TaskLayout='detail'|'table'|'cards'|'kanban'|'calendar'|'timeline';
export const TASK_LAYOUTS:Array<{value:TaskLayout;label:string;description:string}>=[
 {value:'detail',label:'List detail',description:'Task list beside the open task'},
 {value:'table',label:'Table',description:'Rows with task properties'},
 {value:'cards',label:'Cards',description:'A compact grid of task cards'},
 {value:'kanban',label:'Kanban',description:'Task cards in grouped columns'},
 {value:'calendar',label:'Calendar',description:'Month view by due date'},
 {value:'timeline',label:'Timeline',description:'Due-date milestones, without invented durations'},
];
export type ViewFilters={status:'all'|'today'|'upcoming';due:'all'|'overdue'|'today'|'week'|'none';team:'all'|'solo'|'team';project:string};
export const EMPTY_VIEW_FILTERS:ViewFilters={status:'all',due:'all',team:'all',project:''};
export const TASK_VIEWS:Array<{value:TaskView;label:string;description:string}>=[
 {value:'active',label:'Active tasks',description:'Unfinished tasks, including Top of mind'},
 {value:'today',label:'Today',description:'Active tasks planned for Today'},
 {value:'upcoming',label:'Upcoming',description:'Active tasks planned for Upcoming'},
 {value:'overdue',label:'Overdue',description:'Active tasks with a past due date'},
 {value:'completed',label:'Completed',description:'Finished tasks'},
 {value:'all',label:'All tasks',description:'Active and completed tasks'},
];
export type ViewTask={id:string;title:string;date:string;completed:boolean;status:string;isTop:boolean;team:boolean;projectId:string;projectIds?:string[]};
export type ViewProject={id:string;name:string};
export function calendarDays(month:string){const [year,m]=month.split('-').map(Number);const first=new Date(Date.UTC(year,m-1,1));const start=first.getTime()-((first.getUTCDay()+6)%7)*86400000;return Array.from({length:42},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));}
export function shiftMonth(month:string,offset:number){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-1+offset,1)).toISOString().slice(0,7);}
export function taskDeadline(task:ViewTask){return task.isTop?'':viewDateKey(task.date);}
const dateFormatter=new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
const titleCollator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
const dateKeys=new Map<string,string>();
export function viewDateKey(value:string){const cached=dateKeys.get(value);if(cached!==undefined)return cached;const date=new Date(value);let key='';if(!Number.isNaN(date.getTime())){const parts=Object.fromEntries(dateFormatter.formatToParts(date).map(part=>[part.type,part.value]));key=`${parts.year}-${parts.month}-${parts.day}`;}if(dateKeys.size>=512)dateKeys.delete(dateKeys.keys().next().value!);dateKeys.set(value,key);return key;}
export function viewProjectIds(task:ViewTask){return [...new Set([...(task.projectIds||[]),task.projectId].filter(Boolean))];}
export function presetFilters(view:TaskView):{completion:CompletionFilter;filters:ViewFilters}{return {completion:view==='all'?'all':view==='completed'?'completed':'active',filters:{...EMPTY_VIEW_FILTERS,...(view==='today'||view==='upcoming'?{status:view}:{}),...(view==='overdue'?{due:'overdue' as const}:{})}};}
export function matchingView(completion:CompletionFilter,filters:ViewFilters):TaskView|'custom'{return TASK_VIEWS.find(view=>{const preset=presetFilters(view.value);return preset.completion===completion&&(Object.keys(EMPTY_VIEW_FILTERS) as Array<keyof ViewFilters>).every(key=>preset.filters[key]===filters[key]);})?.value||'custom';}
export function extraFilterCount(filters:ViewFilters){return Number(filters.status!=='all')+Number(filters.due!=='all')+Number(filters.team!=='all')+Number(!!filters.project);}
export function matchesTaskView(task:ViewTask,completion:CompletionFilter,filters:ViewFilters,today:string){
 if(completion==='active'&&task.completed||completion==='completed'&&!task.completed)return false;
 if(filters.status!=='all'&&(task.isTop||(filters.status==='today'?task.status!=='today':task.status==='today')))return false;
 if(filters.team==='team'&&!task.team||filters.team==='solo'&&task.team)return false;
 const ids=viewProjectIds(task);if(filters.project&&(filters.project==='__none'?ids.length>0:!ids.includes(filters.project)))return false;
 if(filters.due==='all')return true;
 const date=task.isTop?'':viewDateKey(task.date);
 if(filters.due==='none'&&date)return false;
 if(filters.due==='overdue'&&(!date||date>=today||task.completed))return false;
 if(filters.due==='today'&&date!==today)return false;
 if(filters.due==='week'){const end=new Date(`${today}T12:00:00+07:00`);end.setUTCDate(end.getUTCDate()+7);if(!date||date<today||date>=viewDateKey(end.toISOString()))return false;}
 return true;
}
export function compareViewTasks(first:ViewTask,second:ViewTask,sort:TaskSort){
 const title=()=>titleCollator.compare(first.title,second.title);
 if(sort.startsWith('title'))return (sort==='title-desc'?-1:1)*title()||first.id.localeCompare(second.id);
 const a=first.isTop?'':viewDateKey(first.date),b=second.isTop?'':viewDateKey(second.date);
 if(!a&&b)return 1;if(a&&!b)return -1;
 return (sort==='date-desc'?-1:1)*a.localeCompare(b)||title()||first.id.localeCompare(second.id);
}
export function sortViewTasks<T extends ViewTask>(tasks:T[],sort:TaskSort):T[]{
 if(sort.startsWith('title'))return [...tasks].sort((a,b)=>compareViewTasks(a,b,sort));
 // Format dates once per task, not once per sort comparison.
 const keys=new Map(tasks.map(task=>[task.id,task.isTop?'':viewDateKey(task.date)]));
 return [...tasks].sort((a,b)=>{const first=keys.get(a.id)||'',second=keys.get(b.id)||'';if(!first&&second)return 1;if(first&&!second)return -1;return (sort==='date-desc'?-1:1)*first.localeCompare(second)||titleCollator.compare(a.title,b.title)||a.id.localeCompare(b.id);});
}
export type TaskViewGroup<T>={key:string;label:string;tasks:T[];create:{status?:'today'|'upcoming';projectId?:string;team?:boolean}};
export function groupViewTasks<T extends ViewTask>(tasks:T[],groupBy:TaskGroupBy,projects:ViewProject[]):TaskViewGroup<T>[] {
 const top=tasks.filter(task=>task.isTop).sort((a,b)=>Number(b.title.trim().toLowerCase()==='overall')-Number(a.title.trim().toLowerCase()==='overall')),rest=tasks.filter(task=>!task.isTop);
 const groups:TaskViewGroup<T>[]=[];if(top.length)groups.push({key:'TOP OF MIND',label:'TOP OF MIND',tasks:top,create:{}});
 if(groupBy==='status')groups.push({key:'TODAY',label:'TODAY',tasks:rest.filter(task=>task.status==='today'),create:{status:'today'}},{key:'UPCOMING',label:'UPCOMING',tasks:rest.filter(task=>task.status!=='today'),create:{status:'upcoming'}});
 if(groupBy==='none')groups.push({key:'TASKS',label:'TASKS',tasks:rest,create:{}});
 if(groupBy==='team')groups.push({key:'team:solo',label:'SOLO',tasks:rest.filter(task=>!task.team),create:{team:false}},{key:'team:team',label:'TEAM',tasks:rest.filter(task=>task.team),create:{team:true}});
 if(groupBy==='project'){
  const known=new Set(projects.map(project=>project.id));
  projects.forEach(project=>groups.push({key:`project:${project.id}`,label:project.name,tasks:rest.filter(task=>viewProjectIds(task).includes(project.id)),create:{projectId:project.id}}));
  groups.push({key:'project:none',label:'NO PROJECT',tasks:rest.filter(task=>!viewProjectIds(task).some(id=>known.has(id))),create:{}});
 }
 return groups;
}
