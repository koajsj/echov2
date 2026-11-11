import type { Capabilities } from "../../../shared/contracts";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import { browserPrerequisites } from "../../crypto/readiness";
export function DataPage({sessionId}:{sessionId:string}){
  const capabilities=useApiQuery<Capabilities>("/v1/capabilities");
  const deletions=useApiQuery<{items:{id:string;message_id:string;state:string;reason:string}[]}>("/v1/deletions/own",0,sessionId);
  const browser=browserPrerequisites();
  return (
    <section>
      <header className="page-heading"><h1>安全与数据</h1><p>导出、密钥恢复与系统灾备是不同能力。</p></header>
      <ServiceState {...capabilities}/>
      {capabilities.data && (
        <div className="split-panels">
          {Object.entries(capabilities.data).filter(([key])=>key!=="phase").map(([key,value])=>typeof value==="object" && (
            <article className="panel" key={key}><h2>{key}</h2><p className="status">{value.status}</p><p>{value.reason}</p></article>
          ))}
        </div>
      )}
      <h2>当前浏览器前提</h2>
      <dl className="details">
        {Object.entries(browser).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value?"API 存在，未完成集成验证":"不可用"}</dd></div>)}
      </dl>
      <h2>本人删除请求</h2>
      <ServiceState {...deletions}/>
      {deletions.data && (
        <ul className="record-list">
          {deletions.data.items.map(item=><li key={item.id}><span>{item.message_id}</span><span>{item.state}</span></li>)}
          {deletions.data.items.length===0 && <li>没有已登记的本人删除请求。</li>}
        </ul>
      )}
      <p className="muted">pending-anchor 只表示请求持久化与读取门控，不表示物理删除、离线多设备同步或备份防复活已完成。</p>
    </section>
  );
}
