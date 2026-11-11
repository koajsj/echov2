import { useState } from "react";
import { Button } from "@heroui/react";
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
    columns: ["id", "user_id", "kind", "ip", "created_at"],
  },
  audit: {
    title: "操作审计",
    cursor: "before",
    columns: ["id", "actor_user_id", "action", "target_id", "created_at"],
  },
  backups: {
    title: "备份管理",
    cursor: "after",
    columns: ["id", "state", "created_at", "verified_at"],
  },
} as const;
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
  const query = useApiQuery<{
    items: Row[];
    next: string | null;
  }>(
    `/v1/admin/${kind}${cursor ? `?${view.cursor}=${cursor}` : ""}`,
    revision,
    sessionId,
  );
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
          这里只包含登录结果和设备服务撤销事件；完整检测和运营处置留待第三阶段。
        </p>
      )}
      {kind === "devices" && (
        <p>
          pending 不代表已核验。当前只读目录，密码学授权、设备运营操作和全组
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
      <ServiceState {...query} />
      {query.data && (
        <>
          <div className="table-scroll">
            <table>
              <caption>{view.title} · 每页最多 50 条</caption>
              <thead>
                <tr>
                  {view.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id}>
                    {view.columns.map((column) => (
                      <td key={column}>
                        {row[column] === null ? "未知" : row[column]}
                      </td>
                    ))}
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
