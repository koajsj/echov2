import { useEffect, useState } from "react";
import type { Audience, SessionView } from "../../shared/contracts";
import { ApiError, api } from "./api";
import { useApiQuery } from "./use-api-query";
export function useSession(audience: Audience) {
  const [revision, setRevision] = useState(0);
  const query = useApiQuery<SessionView>(
    `/v1/session?audience=${audience}`,
    revision,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const anonymous =
    query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (anonymous) location.replace("#login");
  }, [anonymous]);
  const changed = () => setRevision((value) => value + 1);
  async function logout() {
    if (pending || !query.data) return;
    setPending(true);
    setMessage("");
    try {
      await api(`/v1/sessions/current?audience=${audience}`, {
        method: "DELETE",
        audience,
        sessionId: query.data.sessionId,
      });
      changed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登出未确认。");
    } finally {
      setPending(false);
    }
  }
  return { query, anonymous, pending, message, changed, logout, revision };
}
