'use client';
import {FormLayoutSettings as CoreFormLayoutSettings} from '@wecare2020/ph-core/tasks/react';
import type {ComponentProps} from 'react';
import RelatedDataActions from './related-data-actions';
export default function FormLayoutSettings({demo=false,...props}:ComponentProps<typeof CoreFormLayoutSettings>&{demo?:boolean}){
 return <CoreFormLayoutSettings {...props} footer={demo?undefined:<RelatedDataActions disabled={props.disabled}/>}/>;
}
