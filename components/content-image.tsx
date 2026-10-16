"use client"

import Image from "next/image"
import {useEffect,useId,useRef,useState} from "react"
import {Expand,X} from "lucide-react"

export function ContentImage({src,alt}:{src:string;alt:string}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [open,setOpen]=useState(false)
  const titleId=useId()
  useEffect(()=>{
    if(!open)return
    const previous=document.body.style.overflow
    document.body.style.overflow="hidden"
    return()=>{document.body.style.overflow=previous}
  },[open])
  function show(){dialog.current?.showModal();setOpen(true)}
  return <>
    <button type="button" onClick={show} className="group relative block w-full cursor-zoom-in rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-site-accent" aria-label={`${alt} 크게 보기`}>
      <Image src={src} alt={alt} width={1200} height={800} loading="lazy" unoptimized className="h-auto w-full rounded" />
      <span aria-hidden="true" className="absolute bottom-3 right-3 rounded bg-black/60 p-2 text-white"><Expand size={16}/></span>
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close()}} className="m-auto max-h-[95svh] max-w-[96vw] overflow-auto border-0 bg-transparent p-0 backdrop:bg-black/85">
      <h2 id={titleId} className="sr-only">{alt}</h2>
      {open && <Image src={src} alt={alt} width={1200} height={800} unoptimized className="h-auto max-h-[90svh] w-auto max-w-[94vw] object-contain"/>}
      <button type="button" autoFocus onClick={()=>dialog.current?.close()} aria-label="이미지 닫기" className="fixed right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/80 text-white focus-visible:outline-2 focus-visible:outline-white"><X size={24}/></button>
    </dialog>
  </>
}
