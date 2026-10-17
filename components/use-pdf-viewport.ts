"use client"

import { useEffect, useRef, useState } from 'react'

export function usePdfViewport() {
  const reader=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null)
  const [width,setWidth]=useState(0),[fullscreen,setFullscreen]=useState(false)
  const [fullscreenAvailable,setFullscreenAvailable]=useState(false),[fullscreenError,setFullscreenError]=useState(false)
  useEffect(()=>{
    setFullscreenAvailable(Boolean(document.fullscreenEnabled))
    const update=()=>setFullscreen(document.fullscreenElement===reader.current)
    document.addEventListener('fullscreenchange',update)
    return ()=>document.removeEventListener('fullscreenchange',update)
  },[])
  useEffect(()=>{
    if(!viewport.current)return
    const observer=new ResizeObserver(([entry])=>setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(viewport.current)
    return ()=>observer.disconnect()
  },[])
  const toggleFullscreen=async()=>{
    try {
      setFullscreenError(false)
      if(document.fullscreenElement===reader.current)await document.exitFullscreen()
      else await reader.current?.requestFullscreen()
    } catch {setFullscreenError(true)}
  }
  return {reader,viewport,width,fullscreen,fullscreenAvailable,fullscreenError,toggleFullscreen}
}
