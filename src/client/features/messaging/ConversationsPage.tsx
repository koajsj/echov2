import { useState } from "react";
import { Button } from "@heroui/react";
import type {
  Capabilities,
  ConversationPage,
  SessionView,
} from "../../../shared/contracts";
import { useApiQuery } from "../../app/use-api-query";
import { useDeliveryNotifications } from "../../app/use-delivery-notifications";
import { ServiceState } from "../../components/ServiceState";
import { EmptyState } from "../../components/EmptyState";
export function ConversationsPage({ session }: { session: SessionView }) {
  const [after, setAfter] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const notices = useDeliveryNotifications(session.sessionId);
  const capabilities = useApiQuery<Capabilities>("/v1/capabilities");
  const conversations = useApiQuery<ConversationPage>(
    `/v1/conversations${after ? `?after=${after}` : ""}`,
    notices.revision + refresh,
    session.sessionId,
  );
  const current = conversations.data?.items.find(
    (item) => item.id === selected,
  );
  return (
    <section>
      <header className="page-heading">
        <h1>你的交流空间</h1>
        <p>原生 MLS 准入未完成；当前仅提供受限路由目录，不处理聊天正文。</p>
      </header>
      <ServiceState {...capabilities} />
      <div className="chat-layout">
        <aside className="conversation-list">
          <div className="section-heading">
            <h2>会话</h2>
            <Button
              variant="ghost"
              isDisabled={conversations.loading}
              onPress={() => setRefresh((value) => value + 1)}
            >
              刷新目录
            </Button>
          </div>
          <ServiceState {...conversations} />
          {conversations.data && (
            <>
              <div className="room-list">
                {conversations.data.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-current={item.id === selected ? "true" : undefined}
                    onClick={() => setSelected(item.id)}
                  >
                    {item.kind} · {item.id}
                    <span>
                      {item.status} · {item.role}
                    </span>
                  </button>
                ))}
              </div>
              {conversations.data.items.length === 0 && (
                <p className="muted">
                  没有此设备可路由的会话。当前没有创建加密组的实现。
                </p>
              )}
              <div className="actions">
                <Button
                  variant="ghost"
                  isDisabled={!after}
                  onPress={() => {
                    setAfter("");
                    setSelected(null);
                  }}
                >
                  第一页
                </Button>
                <Button
                  variant="secondary"
                  isDisabled={!conversations.data.next}
                  onPress={() => {
                    setAfter(conversations.data!.next!);
                    setSelected(null);
                  }}
                >
                  下一页
                </Button>
              </div>
            </>
          )}
          <small>{notices.status}</small>
          <a href="#devices">检查设备授权</a>
        </aside>
        <div className="conversation-detail">
          {current ? (
            <>
              <h2>会话路由元数据</h2>
              <dl className="details">
                <dt>Conversation ID</dt>
                <dd>{current.id}</dd>
                <dt>route_version（不是 MLS epoch）</dt>
                <dd>{current.routeVersion}</dd>
                <dt>服务持久化顺序 / 投递确认</dt>
                <dd>
                  {current.lastSeq} / {current.acknowledgedSeq}
                </dd>
                <dt>会话状态</dt>
                <dd>{current.status}</dd>
              </dl>
              <p>
                没有原生 MLS 验证和完整删除
                checkpoint，当前不读取、解密、搜索或展示消息，也不自动确认消费游标。
              </p>
            </>
          ) : (
            <EmptyState
              icon="chat"
              title="让密钥先准备好"
              description="BLOCKED · 原生 MLS、可信设备与本地原子持久化尚未接通。消息写入关闭，没有模拟会话或聊天正文。"
            >
              <a href="#recovery">密钥与恢复条件</a>
            </EmptyState>
          )}
          {capabilities.data && (
            <p className="muted">{capabilities.data.messaging.reason}</p>
          )}
        </div>
      </div>
    </section>
  );
}
