import { useEffect,useState } from "react";
import { api } from "./api";
export function useApiQuery<T>(path: string, revision=0,sessionId?: string) {
  const [state,setState]=useState<{ data: T | null; error: Error | null; loading: boolean }>({ data: null,error: null,loading: true });
  useEffect(()=>{
    const controller=new AbortController();
    setState({ data: null,error: null,loading: true });
    void api<T>(path,{ signal: controller.signal,...(sessionId ? { sessionId } : {}) }).then(data=>{
      if (!controller.signal.aborted) setState({ data,error: null,loading: false });
    }).catch((error: unknown)=>{
      if (!controller.signal.aborted) setState({ data: null,error: error instanceof Error ? error : new Error("无法读取服务状态"),loading: false });
    });
    return ()=>controller.abort();
  },[path,revision,sessionId]);
  return state;
}
