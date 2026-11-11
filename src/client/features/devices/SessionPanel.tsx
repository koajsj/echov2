import { useState } from "react";
import { Button } from "@heroui/react";
import type { Audience } from "../../../shared/contracts";
import { api } from "../../app/api";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
interface Row {
  id: string;
  audience: Audience;
  device_id: string | null;
  created_at: string;
  expires_at: string;
  current: boolean;
}
export function SessionPanel({
  sessionId,
  userId,
  audience = "user",
}: {
  sessionId: string;
  userId?: string;
  audience?: Audience;
}) {
  const [cursor, setCursor] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const base =
    audience === "admin"
      ? `/v1/admin/users/${userId}/sessions`
      : "/v1/account/sessions";
  const query = useApiQuery<{ items: Row[]; next: string | null }>(
    base + (cursor ? `?after=${cursor}` : ""),
    revision,
    sessionId,
  );
  async function revoke(id: string | null) {
    if (
      busy ||
      !confirm(
        audience === "admin"
          ? "撤销该账号全部服务端会话？不会移除 MLS leaf 或擦除私钥。"
          : id
            ? "撤销此服务端会话？"
            : "撤销本人除当前会话外的全部服务端会话？",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ revoked: number }>(base + "/revoke", {
        method: "POST",
        audience,
        sessionId,
        ...(audience === "user" ? { body: { sessionId: id } } : {}),
      });
      setRevision((v) => v + 1);
      setMessage(
        `已确认撤销 ${result.revoked} 个服务端会话；不代表密码学撤权。`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "结果未确认，请刷新核对；重复撤销不会重建会话。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>服务端会话</h2>
      <p>
        仅列未过期会话，不显示凭据。撤销需要五分钟内重新认证；密码登录和会话有效均不代表设备可信。
      </p>
      <Button
        variant="secondary"
        isPending={busy}
        onPress={() => {
          void revoke(null);
        }}
      >
        {audience === "admin" ? "撤销该账号全部会话" : "撤销其他会话"}
      </Button>
      <Button
        variant="ghost"
        isDisabled={busy || query.loading}
        onPress={() => setRevision((v) => v + 1)}
      >
        刷新
      </Button>
      <ServiceState {...query} />
      {query.data && (
        <>
          <ul className="record-list">
            {query.data.items.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>
                    {row.audience} · {row.current ? "当前会话" : row.id}
                  </strong>
                  <span>设备：{row.device_id ?? "未绑定"}</span>
                  <small>
                    创建 {row.created_at} · 到期 {row.expires_at}
                  </small>
                </div>
                {audience === "user" && !row.current && (
                  <Button
                    variant="secondary"
                    isDisabled={busy}
                    onPress={() => {
                      void revoke(row.id);
                    }}
                  >
                    撤销
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {query.data.items.length === 0 && <p>此页没有未过期会话。</p>}
          <div className="actions">
            <Button
              variant="ghost"
              isDisabled={!cursor || busy}
              onPress={() => setCursor("")}
            >
              第一页
            </Button>
            <Button
              variant="secondary"
              isDisabled={!query.data.next || busy}
              onPress={() => setCursor(query.data!.next!)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
