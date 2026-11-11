import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@heroui/react";
import { api } from "../../app/api";
import { useApiQuery } from "../../app/use-api-query";
import { CsvExport } from "../../components/CsvExport";
import { ServiceState } from "../../components/ServiceState";
interface Overview {
  registration: {
    registration_mode: string;
    version: string;
  };
}
interface Invitation {
  id: string;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
}
interface InvitationResult {
  id: string;
  token: string | null;
  tokenUnavailable: boolean;
}
export function RegistrationPage({ sessionId }: { sessionId: string }) {
  const [revision, setRevision] = useState(0);
  const [after, setAfter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [issued, setIssued] = useState<InvitationResult | null>(null);
  const operation = useRef<{
    operationId: string;
    maxUses: number;
    validHours: number;
  } | null>(null);
  const overview = useApiQuery<Overview>(
    "/v1/admin/overview",
    revision,
    sessionId,
  );
  const invitations = useApiQuery<{
    items: Invitation[];
    next: string | null;
  }>(
    `/v1/admin/invitations${after ? `?after=${after}` : ""}`,
    revision,
    sessionId,
  );
  async function settings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !overview.data) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await api("/v1/admin/registration", {
        method: "PATCH",
        audience: "admin",
        sessionId,
        body: {
          mode: String(data.get("mode")),
          version: overview.data.registration.version,
        },
      });
      setRevision((value) => value + 1);
      setMessage("注册模式已更新并审计。");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "设置结果未确认，请刷新核实。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || issued) return;
    const data = new FormData(event.currentTarget);
    operation.current ??= {
      operationId: crypto.randomUUID(),
      maxUses: Number(data.get("maxUses")),
      validHours: Number(data.get("validHours")),
    };
    setRetrying(true);
    setBusy(true);
    setMessage("");
    try {
      const result = await api<InvitationResult>("/v1/admin/invitations", {
        method: "POST",
        audience: "admin",
        sessionId,
        body: operation.current,
      });
      setIssued(result);
      setRevision((value) => value + 1);
      setMessage(
        result.tokenUnavailable
          ? "操作已创建；原始邀请码只返回一次，不能重新显示。未重复创建。"
          : "邀请码已创建。请安全保存，离开页面后不再显示。",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "结果未知。请用当前操作原样重试，不生成新的操作 ID。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (
      busy ||
      !confirm(
        "撤销此邀请码？已注册账号不受影响，正在注册的事务以数据库锁的提交顺序为准。",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/v1/admin/invitations/${id}/revoke`, {
        method: "POST",
        audience: "admin",
        sessionId,
      });
      setRevision((v) => v + 1);
      setMessage("邀请码撤销已确认并审计。");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "结果未确认，请刷新核实。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <header className="page-heading">
        <h1>注册与邀请码</h1>
        <p>配置版本比较、注册事务与幂等创建。</p>
      </header>
      <ServiceState {...overview} />
      {overview.data && (
        <form
          className="panel form"
          key={overview.data.registration.version}
          onSubmit={(event) => {
            void settings(event);
          }}
        >
          <h2>注册模式</h2>
          <label>
            模式
            <select
              name="mode"
              defaultValue={overview.data.registration.registration_mode}
            >
              <option value="closed">关闭</option>
              <option value="invite">邀请</option>
              <option value="open">开放</option>
            </select>
          </label>
          <Button type="submit" isPending={busy}>
            保存并审计
          </Button>
        </form>
      )}
      <form
        className="panel form"
        onSubmit={(event) => {
          void issue(event);
        }}
      >
        <h2>创建邀请码</h2>
        <fieldset disabled={busy || issued !== null || retrying}>
          <label>
            可用次数
            <input
              name="maxUses"
              type="number"
              min={1}
              max={100}
              defaultValue={1}
              required
            />
          </label>
          <label>
            有效小时
            <input
              name="validHours"
              type="number"
              min={1}
              max={720}
              defaultValue={24}
              required
            />
          </label>
        </fieldset>
        <Button type="submit" isPending={busy} isDisabled={issued !== null}>
          {retrying ? "核实并重试原操作" : "创建并仅显示一次"}
        </Button>
      </form>
      {issued && (
        <div className="panel">
          <h2>已确认的创建记录</h2>
          <p>{issued.id}</p>
          {issued.token && (
            <label>
              仅本次响应可见的邀请凭据
              <input readOnly value={issued.token} autoComplete="off" />
            </label>
          )}
          <Button
            variant="secondary"
            onPress={() => {
              if (confirm("确认已保存凭据，并明确创建另一张邀请码？")) {
                operation.current = null;
                setRetrying(false);
                setIssued(null);
                setMessage("");
              }
            }}
          >
            开始另一张邀请码
          </Button>
        </div>
      )}
      <p role="status">{message}</p>
      <ServiceState {...invitations} />
      {invitations.data && (
        <>
          <CsvExport
            key={`${after}:${revision}`}
            columns={["id", "uses", "max_uses", "expires_at", "revoked_at"]}
            rows={invitations.data.items.map((row) => ({ ...row }))}
            name="echo-invitations-current-page.csv"
          />
          <div className="table-scroll">
            <table>
              <caption>只查询元数据，不读取邀请码或哈希</caption>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>使用次数</th>
                  <th>到期时间</th>
                  <th>撤销时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {invitations.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>
                      {row.uses} / {row.max_uses}
                    </td>
                    <td>{row.expires_at}</td>
                    <td>{row.revoked_at ?? "未撤销"}</td>
                    <td>
                      <Button
                        variant="secondary"
                        isDisabled={busy || row.revoked_at !== null}
                        onPress={() => {
                          void revoke(row.id);
                        }}
                      >
                        撤销
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invitations.data.items.length === 0 && <p>没有此范围内的记录。</p>}
          <div className="actions">
            <Button
              variant="ghost"
              isDisabled={!after}
              onPress={() => setAfter("")}
            >
              第一页
            </Button>
            <Button
              variant="secondary"
              isDisabled={!invitations.data.next}
              onPress={() => setAfter(invitations.data!.next!)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
