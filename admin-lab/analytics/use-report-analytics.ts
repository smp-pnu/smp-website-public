import { useEffect, useState } from 'react'
import { api } from '../server-storage'
import type { ReportAnalytics } from '../site-model'
export function useReportAnalytics(refresh:number) {
  const [state,setState]=useState<{data:ReportAnalytics|null;loading:boolean;error:string}>({data:null,loading:true,error:''})
  useEffect(()=>{
    const controller=new AbortController()
    setState(previous=>({...previous,loading:true,error:''}))
    void api('/dashboard/reports',{signal:controller.signal}).then(r=>r.json()).then((data:ReportAnalytics|null)=>{
      if(!controller.signal.aborted)setState({data,loading:false,error:''})
    }).catch((e:Error)=>{if(!controller.signal.aborted)setState(previous=>({...previous,loading:false,error:e.message}))})
    return ()=>controller.abort()
  },[refresh])
  return state
}
