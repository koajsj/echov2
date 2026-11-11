import { useEffect, useState } from "react";

// A lossy wake-up signal only. Never interpret this as persisted messages, keys or deletion evidence.
export function useDeliveryNotifications(sessionId: string) {
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("连接中");
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    function connect() {
      if (stopped) return;
      if (!navigator.onLine) {
        setStatus("离线；重连后须 HTTPS 补齐");
        return;
      }
      const url = new URL("/v1/events", location.origin);
      url.protocol = "wss:";
      url.searchParams.set("context", sessionId);
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        if (
          stopped ||
          typeof event.data !== "string" ||
          event.data.length > 1024
        )
          return;
        let notice: unknown;
        try {
          notice = JSON.parse(event.data);
        } catch {
          socket?.close(1008, "Invalid notification");
          return;
        }
        if (
          !notice ||
          typeof notice !== "object" ||
          !("type" in notice) ||
          (notice.type !== "connected" && notice.type !== "sync-required")
        )
          return;
        attempts = 0;
        setStatus("通知已连接；内容以 HTTPS 为准");
        setRevision((value) => value + 1);
      };
      socket.onerror = () => {
        if (!stopped) setStatus("通知不可用；可手动刷新");
      };
      socket.onclose = (event) => {
        if (stopped) return;
        if (event.code === 1008) {
          setStatus("会话权限已变化，请重新登录或刷新确认");
          return;
        }
        setStatus("等待重新连接；不推进消息游标");
        timer = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) +
            Math.random() * 1000,
        );
      };
    }
    function online() {
      if (timer) clearTimeout(timer);
      if (!socket || socket.readyState === WebSocket.CLOSED) connect();
    }
    window.addEventListener("online", online);
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", online);
      socket?.close(1000, "View closed");
    };
  }, [sessionId]);
  return {
    revision,
    status,
  };
}
