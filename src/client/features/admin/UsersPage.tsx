import { UserLookupMode } from "../../components/UserLookupMode";
import { PublicUserId } from "../../components/PublicUserId";
import { useState } from "react";
import { Table, Button, Input, Form } from "@heroui/react";
import { api } from "../../app/api";
import { useApiQuery } from "../../app/use-api-query";
import { CsvExport } from "../../components/CsvExport";
import { SessionPanel } from "../devices/SessionPanel";
import { ServiceState } from "../../components/ServiceState";
interface User {
  id: string;
  publicId: string;
  username: string;
  status: string;
}
interface Detail extends User {
  version: string;
  created_at: string;
  device_count: string;
  active_sessions: string;
}
function UserDetailPanel({
  id,
  sessionId,
  onClose,
}: {
  id: string;
  sessionId: string;
  onClose: () => void;
}) {
  const query = useApiQuery<Detail>(`/v1/admin/users/${id}`, 0, sessionId);
  return (
    <section className="panel" aria-label="用户详情">
      <h2>用户详情</h2>
      <ServiceState {...query} />
      {query.data && (
        <dl className="details">
          {Object.entries(query.data)
            .filter(([name]) => name !== "id")
            .map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  {name === "publicId" ? <PublicUserId value={value} /> : value}
                </dd>
              </div>
            ))}
        </dl>
      )}
      <SessionPanel sessionId={sessionId} userId={id} audience="admin" />
      <Button variant="ghost" onPress={onClose}>
        收起详情
      </Button>
    </section>
  );
}
export function UsersPage({ sessionId }: { sessionId: string }) {
  const [filterKind, setFilterKind] = useState("username");
  const [filter, setFilter] = useState("");
  const [after, setAfter] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = useApiQuery<{
    items: User[];
    next: string | null;
  }>(
    `/v1/admin/users?${new URLSearchParams({ ...(after ? { after } : {}), ...(filter ? { [filterKind]: filter } : {}) })}`,
    revision,
    sessionId,
  );
  async function suspend(user: User) {
    if (
      busy ||
      !confirm(
        `${user.status === "active" ? "暂停" : "恢复"} ${user.username} 的服务访问？暂停会冻结群组，不代表 MLS 移除。`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/v1/admin/users/${user.id}/status`, {
        method: "POST",
        audience: "admin",
        sessionId,
        body: {
          suspended: user.status === "active",
        },
      });
      setRevision((value) => value + 1);
      setSelected(null);
      setMessage("服务状态已更新并审计；密码学移除仍未完成。");
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
        <h1>用户管理</h1>
        <p>账号与服务权限。管理员无法取得用户私钥或聊天明文。</p>
      </header>
      <Form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          setFilterKind(
            String(new FormData(event.currentTarget).get("identityKind")),
          );
          setFilter(
            String(new FormData(event.currentTarget).get("username")).trim(),
          );
          setAfter("");
          setSelected(null);
        }}
      >
        <UserLookupMode />
        <label>
          用户名或12位公共 ID（留空显示全部）
          <Input name="username" pattern="[a-zA-Z0-9_]{3,32}" maxLength={32} />
        </label>
        <Button type="submit" variant="secondary" isDisabled={busy}>
          查询用户
        </Button>
      </Form>
      <ServiceState {...query} />
      {query.data && (
        <>
          <CsvExport
            key={`${filterKind}:${filter}:${after}:${revision}`}
            columns={["publicId", "username", "status"]}
            rows={query.data.items.map((row) => ({ ...row }))}
            name="echo-users-current-page.csv"
          />
          <div className="table-scroll">
            <p className="muted">内部游标分页 · 对外显示公共 ID</p>
            <Table>
              <Table.Content aria-label="用户管理">
                <Table.Header>
                  <Table.Column isRowHeader>用户名</Table.Column>
                  <Table.Column>ID</Table.Column>
                  <Table.Column>状态</Table.Column>
                  <Table.Column>操作</Table.Column>
                </Table.Header>
                <Table.Body>
                  {query.data.items.map((user) => (
                    <Table.Row id={user.id} key={user.id}>
                      <Table.Cell>{user.username}</Table.Cell>
                      <Table.Cell>
                        <PublicUserId value={user.publicId} />
                      </Table.Cell>
                      <Table.Cell>{user.status}</Table.Cell>
                      <Table.Cell>
                        <div className="actions">
                          <Button
                            variant="ghost"
                            onPress={() => setSelected(user.id)}
                          >
                            详情
                          </Button>
                          <Button
                            variant="secondary"
                            isDisabled={
                              busy ||
                              !["active", "suspended"].includes(user.status)
                            }
                            onPress={() => {
                              void suspend(user);
                            }}
                          >
                            {user.status === "active" ? "暂停服务" : "恢复服务"}
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table>
          </div>
          {query.data.items.length === 0 && <p>此页没有用户。</p>}
          <div className="actions">
            <Button
              variant="ghost"
              isDisabled={!after || busy}
              onPress={() => setAfter("")}
            >
              第一页
            </Button>
            <Button
              variant="secondary"
              isDisabled={!query.data.next || busy}
              onPress={() => setAfter(query.data!.next!)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
      <p role="status">{message}</p>
      {selected && (
        <UserDetailPanel
          key={`${selected}:${revision}`}
          id={selected}
          sessionId={sessionId}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
