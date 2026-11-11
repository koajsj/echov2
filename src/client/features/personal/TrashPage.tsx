import { useState } from "react";
import { Button } from "@heroui/react";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
export function TrashPage({ sessionId }: { sessionId: string }) {
  const [revision, setRevision] = useState(0);
  const [before, setBefore] = useState("");
  const query = useApiQuery<{
    next: string | null;
    items: {
      id: string;
      message_id: string;
      state: string;
      reason: string;
    }[];
  }>(
    `/v1/deletions/own${before ? `?before=${before}` : ""}`,
    revision,
    sessionId,
  );
  return (
    <section>
      <header className="page-heading">
        <h1>回收站与删除状态</h1>
        <p>七天私人回收站与全体撤回是两条不同流程。</p>
      </header>
      <div className="panel">
        <h2>Delete for me</h2>
        <p>
          BLOCKED ·
          本人加密墓碑、七天恢复与多设备删除同步未接通。不会伪造可恢复项目或永久删除成功状态。
        </p>
      </div>
      <h2>本人提交的全体删除请求</h2>
      <Button
        variant="secondary"
        onPress={() => setRevision((value) => value + 1)}
      >
        刷新真实状态
      </Button>
      <ServiceState {...query} />
      {query.data && (
        <ul className="record-list">
          {query.data.items.map((row) => (
            <li key={row.id}>
              <span>{row.message_id}</span>
              <span>
                {row.reason} · {row.state}
              </span>
            </li>
          ))}
          {query.data.items.length === 0 && <li>没有已登记请求。</li>}
        </ul>
      )}
      {query.data && (
        <div className="actions">
          <Button
            variant="ghost"
            isDisabled={!before}
            onPress={() => setBefore("")}
          >
            最新请求
          </Button>
          <Button
            variant="secondary"
            isDisabled={!query.data.next}
            onPress={() => setBefore(query.data!.next!)}
          >
            更早请求
          </Button>
        </div>
      )}
      <p className="muted">
        pending-anchor 表示已授权、等待独立删除证据；不是物理删除完成。MLS
        撤回、媒体清理和旧备份防复活仍 BLOCKED。外部副本无法远程擦除。
      </p>
    </section>
  );
}
