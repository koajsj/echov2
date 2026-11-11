import type { Capabilities } from "../../../shared/contracts";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
export function ConversationsPage(){
  const query=useApiQuery<Capabilities>("/v1/capabilities");
  return (
    <section>
      <header className="page-heading"><h1>你的交流空间</h1><p>独立通信架构，清晰的信任边界。</p></header>
      <ServiceState {...query}/>
      {query.data && (
        <div className="workspace">
          <aside><h2>会话</h2><p className="muted">加密通信暂未开放。</p></aside>
          <div className="empty-state">
            <img src="/echo.svg" width="64" height="64" alt=""/>
            <h2>让密钥先准备好</h2>
            <p>真实 MLS 尚未接入。聊天消息写入关闭，不展示模拟会话。</p>
            <p className="muted">{query.data.messaging.reason}</p>
          </div>
        </div>
      )}
    </section>
  );
}
