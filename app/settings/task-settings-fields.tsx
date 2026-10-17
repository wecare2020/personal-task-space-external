'use client';
import type {ComponentProps} from 'react';
import {TaskSettingsFields as CoreTaskSettingsFields} from '@wecare2020/ph-core/tasks/react';
import RelatedDataActions from './related-data-actions';
export {TASK_SETTING_ITEMS} from '@wecare2020/ph-core/tasks';
export type {TaskSettingItem} from '@wecare2020/ph-core/tasks';
export default function TaskSettingsFields({demo=false,...props}:ComponentProps<typeof CoreTaskSettingsFields>&{demo?:boolean}){
 return <CoreTaskSettingsFields {...props} relatedDataActions={demo?undefined:<RelatedDataActions disabled={props.disabled}/>}/>;
}
