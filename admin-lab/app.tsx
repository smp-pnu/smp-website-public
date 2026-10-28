import { useEffect, useState } from "react"
import { CmsConsole } from "./cms-console"
import { UploadApp } from "./upload-app"
import { api } from "./server-storage"
import { cloudMode } from "./mode"
import type { SecurityControls } from "./security-settings"

export function App(props: {username?:string; onLogout?:()=>Promise<void>; security?:SecurityControls}) {
  const [cms,setCms] = useState<{active:boolean;total:number}|null>(null)
  const [loading,setLoading] = useState(cloudMode), [error,setError] = useState("")
  useEffect(()=>{
    if(!cloudMode)return
    let live=true
    void api("/cms/status").then(r=>r.json()).then(v=>{if(live)setCms(v)})
      .catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[])
  if(cloudMode) {
    if(loading)return <main className="fatal" role="status">관리 자료를 불러오는 중…</main>
    if(error||!cms)return <main className="fatal"><h1>관리 자료에 연결하지 못했습니다.</h1><p role="alert">{error||"잠시 후 다시 연결해 주세요."}</p><button onClick={()=>location.reload()}>다시 연결</button></main>
    return <CmsConsole active={cms.active} onLogout={props.onLogout} security={props.security}/>
  }
  return <UploadApp username={props.username} onLogout={props.onLogout}/>
}
