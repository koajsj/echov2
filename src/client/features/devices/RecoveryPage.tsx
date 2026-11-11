import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
export function RecoveryPage({ sessionId }: { sessionId: string }) {
  const query = useApiQuery<{
    identity: {
      version: string;
      publicKey: string;
      registeredAt: string;
      trust: string;
    } | null;
  }>("/v1/identity", 0, sessionId);
  return (
    <section>
      <header className="page-heading">
        <h1>密钥与恢复</h1>
        <p>登录、身份恢复与历史恢复分别管理。</p>
      </header>
      <ServiceState {...query} />
      {query.data && (
        <div className="panel">
          <h2>根身份目录记录</h2>
          <p>
            {query.data.identity
              ? `版本 ${query.data.identity.version} · 仅目录记录，尚未通过可信绑定核验。`
              : "没有当前根身份目录记录。"}
          </p>
          <p>目录存在不等于本机持有私钥，也不等于身份已核验。</p>
        </div>
      )}
      <dl className="details">
        <dt>密码恢复</dt>
        <dd>BLOCKED · 尚未选定并审查独立登录恢复凭据。</dd>
        <dt>根身份恢复</dt>
        <dd>
          BLOCKED · 标准恢复封装、根授权 profile
          与成熟库未接通。不会生成虚假恢复密钥。
        </dd>
        <dt>可信设备迁移</dt>
        <dd>
          BLOCKED · 新设备独立 key、可信授权与原生 Add / Welcome
          未接通。密码登录不授予信任。
        </dd>
        <dt>活跃 Group State</dt>
        <dd>关闭旧快照自动导入。不能证明新鲜度时须重新入群。</dd>
        <dt>历史归档</dt>
        <dd>BLOCKED · 与群状态分离，完整删除证据缺失时不得自动恢复。</dd>
      </dl>
      <a href="#devices">管理服务设备</a>
    </section>
  );
}
