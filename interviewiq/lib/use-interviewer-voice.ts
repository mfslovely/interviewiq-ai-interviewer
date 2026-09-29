"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useInterviewerVoice(enabled: boolean) {
  const [status,setStatus] = useState("Neural voice ready · AI-generated");
  const active = useRef<{controller:AbortController;audio?:HTMLAudioElement;url?:string;finish?:()=>void} | null>(null);
  const stop = useCallback(() => {
    const current = active.current;
    if(current) { current.controller.abort(); current.audio?.pause(); current.finish?.(); if(current.url) URL.revokeObjectURL(current.url); }
    active.current=null;
    window.speechSynthesis?.cancel();
  },[]);
  useEffect(() => { if(!enabled) stop(); return stop; },[enabled,stop]);
  const speak = useCallback(async (text:string) => {
    stop(); if(!enabled) return;
    const current = {controller:new AbortController()} as NonNullable<typeof active.current>;
    active.current=current;
    const chunks:string[]=[];
    let rest=text.trim();
    while(rest) { let end=Math.min(rest.length,200); if(end<rest.length) { const space=rest.lastIndexOf(" ",end); if(space>0) end=space; } chunks.push(rest.slice(0,end)); rest=rest.slice(end).trim(); }
    setStatus("Preparing neural voice…");
    let completed=0;
    try {
      for(const chunk of chunks) {
        const response=await fetch("/api/speech",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:chunk}),signal:current.controller.signal});
        if(!response.ok) throw new Error("Voice unavailable");
        const blob=await response.blob();
        if(current.controller.signal.aborted) return;
        current.url=URL.createObjectURL(blob); current.audio=new Audio(current.url);
        setStatus("Orpheus neural voice · AI-generated");
        await new Promise<void>((resolve,reject)=>{ current.finish=resolve; current.audio!.onended=()=>resolve(); current.audio!.onerror=()=>reject(new Error("Audio failed")); current.audio!.play().catch(reject); });
        URL.revokeObjectURL(current.url); current.url=undefined;
        if(current.controller.signal.aborted) return;
        completed++;
      }
    } catch {
      if(current.controller.signal.aborted) return;
      if(current.url) URL.revokeObjectURL(current.url);
      setStatus("Browser voice fallback · neural voice unavailable");
      if(window.speechSynthesis) { const utterance=new SpeechSynthesisUtterance(chunks.slice(completed).join(" ")); utterance.rate=0.96; window.speechSynthesis.speak(utterance); }
    }
  },[enabled,stop]);
  return {speak,stop,status};
}
