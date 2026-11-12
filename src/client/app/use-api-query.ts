import { useEffect, useState } from "react";
import { api } from "./api";
export function useApiQuery<T>(path: string, revision = 0, sessionId?: string) {
  const key = JSON.stringify([path, revision, sessionId]);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: Error | null;
    loading: boolean;
  }>({
    key,
    data: null,
    error: null,
    loading: true,
  });
  useEffect(() => {
    const controller = new AbortController();
    void api<T>(path, {
      signal: controller.signal,
      ...(sessionId
        ? {
            sessionId,
          }
        : {}),
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({
            key,
            data,
            error: null,
            loading: false,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            key,
            data: null,
            error:
              error instanceof Error ? error : new Error("无法读取服务状态"),
            loading: false,
          });
      });
    return () => controller.abort();
  }, [path, revision, sessionId, key]);
  return state.key === key
    ? { data: state.data, error: state.error, loading: state.loading }
    : {
        data: null,
        error: null,
        loading: true,
      };
}
