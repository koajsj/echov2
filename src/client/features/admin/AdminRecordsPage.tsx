import { useState } from "react";
import { Button } from "@heroui/react";
import { api } from "../../app/api";
import { CsvExport } from "../../components/CsvExport";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
const views = {
  devices: {
    title: "设备管理",
    cursor: "after",
    columns: [
      "id",
      "username",
      "user_id",
      "label",
      "status",
      "created_at",
      "revoked_at",
    ],
  },
  logins: {
    title: "登录记录",
    cursor: "before",
    columns: ["id", "user_id", "kind", "ip", "created_at"],
  },
  security: {
    title: "安全中心",
    cursor: "before",
    columns: [
      "id",
      "user_id",
      "kind",
      "ip",
      "created_at",
      "reviewed_at",
      "reviewed_by",
    ],
  },
  audit: {
    title: "操作审计",
    cursor: "before",
    columns: [
      "id",
      "actor_user_id",
      "action",
      "target_id",
      "event_id",
      "created_at",
    ],
  },
  deletions: {
    title: "删除状态",
    cursor: "before",
    columns: [
      "id",
      "message_id",
      "reason",
      "state",
      "created_at",
      "completed_at",
    ],
  },
  backups: {
    title: "备份管理",
    cursor: "after",
    columns: ["id", "state", "created_at", "verified_at"],
  },
} as const;
const absent: Record<string, string> = {
  reviewed_at: "未审阅",
  reviewed_by: "尚无审阅者",
  revoked_at: "未撤销",
  completed_at: "未完成",
  verified_at: "未验证",
  ip: "未记录",
  user_id: "未关联账号",
  target_id: "未指定 UUID 目标",
  event_id: "不适用",
};
export type AdminRecordKind = keyof typeof views;
type Row = Record<string, string | null> & {
  id: string;
};
export function AdminRecordsPage({
  kind,
  sessionId,
}: {
  kind: AdminRecordKind;
  sessionId: string;
}) {
  const view = views[kind];
  const [cursor, setCursor] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = useApiQuery<{
    items: Row[];
    next: string | null;
  }>(
    `/v1/admin/${kind}${cursor ? `?${view.cursor}=${cursor}` : ""}`,
    revision,
    sessionId,
  );
  async function action(row: Row) {
    if (
      busy ||
      !confirm(
        kind === "devices"
          ? "撤销此设备的服务访问并冻结关联群组？不会完成 MLS Remove。"
          : "将事件标记为已审阅？这不表示安全风险已解决。",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await api(
        `/v1/admin/${kind}/${row.id}/${kind === "devices" ? "revoke" : "review"}`,
        { method: "POST", audience: "admin", sessionId },
      );
      setRevision((v) => v + 1);
      setMessage(
        kind === "devices"
          ? "服务撤销已确认；密码学移除仍 BLOCKED。"
          : "事件已审阅并审计；未宣称风险已解决。",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "操作结果未知，请刷新核实。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <header className="page-heading">
        <h1>{view.title}</h1>
        <p>仅显示 PostgreSQL 中的实际记录，未采集的字段保持未知。</p>
      </header>
      {kind === "logins" && (
        <p>
          来源为密码认证处理器（含重新认证）；成功记录不等于已签发用户或管理员会话。IP
          受可信代理配置影响；地区、浏览器和 OS
          未采集，不能推断为未知设备已可信。
        </p>
      )}
      {kind === "security" && (
        <p>
          这里只包含登录结果和设备服务撤销事件；可以记录人工审阅，不能据此声称风险已消除。
        </p>
      )}
      {kind === "devices" && (
        <p>
          pending 不代表已核验。可撤销服务访问并冻结关联组；密码学授权和全组
          Remove 尚未接通。
        </p>
      )}
      {kind === "backups" && (
        <p>
          BLOCKED ·
          无备份或隔离恢复执行器；记录存在也不代表已验证可恢复。不提供假任务按钮。
        </p>
      )}
      <Button
        variant="secondary"
        isDisabled={query.loading}
        onPress={() => setRevision((value) => value + 1)}
      >
        刷新记录
      </Button>
      <p role="status">{message}</p>
      <ServiceState {...query} />
      {query.data && (
        <>
          <CsvExport
            key={`${kind}:${cursor}:${revision}`}
            columns={view.columns}
            rows={query.data.items}
            name={`echo-${kind}-current-page.csv`}
          />
          <div className="table-scroll">
            <table>
              <caption>{view.title} · 每页最多 50 条</caption>
              <thead>
                <tr>
                  {view.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  {(kind === "devices" || kind === "security") && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id}>
                    {view.columns.map((column) => (
                      <td key={column}>
                        {row[column] === undefined
                          ? "缺失"
                          : row[column] === null
                            ? (absent[column] ?? "未知")
                            : row[column]}
                      </td>
                    ))}
                    {(kind === "devices" || kind === "security") && (
                      <td>
                        <Button
                          variant="secondary"
                          isDisabled={
                            busy ||
                            (kind === "devices"
                              ? row.status === "revoked"
                              : row.reviewed_at !== null)
                          }
                          onPress={() => {
                            void action(row);
                          }}
                        >
                          {kind === "devices" ? "撤销服务" : "标记已审阅"}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data.items.length === 0 && <p>此范围没有真实记录。</p>}
          <div className="actions">
            <Button
              variant="ghost"
              isDisabled={!cursor}
              onPress={() => setCursor("")}
            >
              第一页
            </Button>
            <Button
              variant="secondary"
              isDisabled={!query.data.next}
              onPress={() => setCursor(query.data!.next!)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
