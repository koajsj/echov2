import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import type { Capabilities } from "../../../shared/contracts";
export function AdminSettingsPage({ sessionId }: { sessionId: string }) {
  const storage = useApiQuery<{
    totalBytes: string | null;
    freeBytes: string | null;
    reason?: string;
  }>("/v1/admin/storage", 0, sessionId);
  const query = useApiQuery<Capabilities>("/v1/capabilities");
  return (
    <section>
      <header className="page-heading">
        <h1>系统设置与准入</h1>
        <p>配置来源与安全限制透明可见；不开放未经审查的启用开关。</p>
      </header>
      <ServiceState {...query} />
      {query.data && (
        <dl className="details">
          {Object.entries(query.data)
            .filter(([key]) => key !== "phase")
            .map(
              ([key, value]) =>
                typeof value === "object" && (
                  <div key={key}>
                    <dt>
                      {key} · {value.status}
                    </dt>
                    <dd>{value.reason}</dd>
                  </div>
                ),
            )}
        </dl>
      )}
      <p>
        单 Fastify、单 PostgreSQL、Caddy、systemd。附件上限 10 MiB；不提供 URL
        Preview、服务端转码或正文分析。
      </p>
      <p>
        服务器资源、备份执行器与发布配置须由受控运维审查，不能通过网页直接改写服务配置或密钥。
      </p>
      <section className="panel">
        <h2>媒体文件系统</h2>
        <ServiceState {...storage} />
        {storage.data && (
          <dl className="details">
            <div>
              <dt>卷总字节</dt>
              <dd>{storage.data.totalBytes ?? "未知"}</dd>
            </div>
            <div>
              <dt>服务账号可用字节</dt>
              <dd>{storage.data.freeBytes ?? "未知"}</dd>
            </div>
            {storage.data.reason && (
              <div>
                <dt>缺失原因</dt>
                <dd>{storage.data.reason}</dd>
              </div>
            )}
          </dl>
        )}
        <p>
          来源为媒体路径所在卷
          statfs；不扫描媒体、不含主机路径，不是媒体占用核查或配额执行。缺目录显示未知，读取失败单独报错。
        </p>
      </section>
      <section className="panel">
        <h2>数据保留与存储管理</h2>
        <p>
          BLOCKED ·
          尚无审定的保留策略、媒体清理与备份执行器。没有会假装生效的保留设置；不提供绕过删除证据的清空按钮。
        </p>
      </section>
      <a href="#admin/registration">修改已支持的注册配置</a>
    </section>
  );
}
