import type { ApiFailure,Audience } from "../../shared/contracts";
export class ApiError extends Error {
  constructor(readonly status: number,readonly code: string,message: string) { super(message); }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; audience?: Audience; sessionId?: string; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string,string>={};
  if (options.sessionId) headers["X-Echo-Session"]=options.sessionId;
  if (options.body !== undefined) headers["Content-Type"]="application/json";
  if (options.method && options.method !== "GET") {
    const name=`__Host-echo-csrf-${options.audience ?? "user"}=`;
    const csrf=document.cookie.split("; ").find(value=>value.startsWith(name))?.slice(name.length);
    if (csrf) headers["X-Echo-CSRF"]=decodeURIComponent(csrf);
  }
  const response=await fetch(path,{ credentials: "same-origin",cache: "no-store",headers,...(options.method ? { method: options.method } : {}),...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),...(options.signal ? { signal: options.signal } : {}) });
  if (!response.ok) {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiError(response.status,"UNEXPECTED_RESPONSE","服务响应不可用，请核实操作状态后重试。");
    const data=await response.json() as ApiFailure;
    throw new ApiError(response.status,data.error.code,data.error.message);
  }
  return response.status===204 ? undefined as T : await response.json() as T;
}
