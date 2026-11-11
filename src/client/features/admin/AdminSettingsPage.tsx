import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import type { Capabilities } from "../../../shared/contracts";
export function AdminSettingsPage() {
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
      <a href="#admin/registration">修改已支持的注册配置</a>
    </section>
  );
}
