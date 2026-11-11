import { MetadataArchivePanel } from "./MetadataArchivePanel";
import { AttachmentPreparationPanel } from "./AttachmentPreparationPanel";
import type { Capabilities, SessionView } from "../../../shared/contracts";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import { browserPrerequisites } from "../../crypto/readiness";
export function DataPage({ session }: { session: SessionView }) {
  const capabilities = useApiQuery<Capabilities>("/v1/capabilities");
  const browser = browserPrerequisites();
  return (
    <section>
      <header className="page-heading">
        <h1>安全与数据</h1>
        <p>导出、密钥恢复与系统灾备是不同能力。</p>
      </header>
      <ServiceState {...capabilities} />
      {capabilities.data && (
        <div className="split-panels">
          {Object.entries(capabilities.data)
            .filter(([key]) => key !== "phase")
            .map(
              ([key, value]) =>
                typeof value === "object" && (
                  <article className="panel" key={key}>
                    <h2>{key}</h2>
                    <p className="status">{value.status}</p>
                    <p>{value.reason}</p>
                  </article>
                ),
            )}
        </div>
      )}
      <MetadataArchivePanel session={session} />
      <AttachmentPreparationPanel />
      <h2>当前浏览器前提</h2>
      <dl className="details">
        {Object.entries(browser).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value ? "API 存在，未完成集成验证" : "不可用"}</dd>
          </div>
        ))}
      </dl>
      <p>
        <a href="#trash">查看分页删除请求与回收边界</a>
        。待锚请求不表示物理擦除或完整墓碑同步。
      </p>
    </section>
  );
}
