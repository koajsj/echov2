import { useState } from "react";
import { Button } from "@heroui/react";
import { useApiQuery } from "../../app/use-api-query";
import { CsvExport } from "../../components/CsvExport";
import { ServiceState } from "../../components/ServiceState";
import {
  ChartFrame,
  LineChart,
  type ChartDatum,
} from "../../components/Charts";
interface Overview {
  counts: Record<string, string>;
  registration: {
    registration_mode: string;
    version: string;
  };
  trafficBytes: null;
  regions: null;
  onlineNotificationSessions: number;
  onlineDevices: null;
}
const labels: Record<string, string> = {
  users: "注册账号",
  devices: "active 状态的设备目录",
  accepted_envelopes: "持久化 envelope",
  pending_deletions: "未完成删除",
  new_users_today: "今日新注册（UTC）",
  accounts_with_sessions: "持有有效服务会话的账号",
  registered_attachment_bytes: "登记的附件密文字节",
};
export function DashboardPage({
  sessionId,
  analytics = false,
}: {
  sessionId: string;
  analytics?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const query = useApiQuery<Overview>(
    "/v1/admin/overview",
    revision,
    sessionId,
  );
  const growth = useApiQuery<{
    items: ChartDatum[];
    source: string;
  }>("/v1/admin/growth", revision, sessionId);
  return (
    <section>
      <header className="page-heading">
        <h1>{analytics ? "网站分析" : "管理概览"}</h1>
        <p>来源明确的业务元数据；持久化数量不等于密码学验证成功数。</p>
      </header>
      <Button
        variant="secondary"
        isDisabled={query.loading || growth.loading}
        onPress={() => setRevision((value) => value + 1)}
      >
        刷新数据
      </Button>
      <ServiceState {...query} />
      {query.data && (
        <div className="metrics">
          {Object.entries(query.data.counts).map(([name, value]) => (
            <div key={name}>
              <span>{labels[name] ?? name}</span>
              <strong>{value}</strong>
            </div>
          ))}
          <div>
            <span>在线通知会话（60 秒窗口）</span>
            <strong>{query.data.onlineNotificationSessions}</strong>
          </div>
          <div>
            <span>在线可信设备</span>
            <strong className="unknown">未知</strong>
          </div>
        </div>
      )}
      <p className="muted">
        会话数量不是每日活跃用户；通知连接不是可信设备。附件登记量不等于已校验磁盘占用。
      </p>
      <ServiceState {...growth} />
      {growth.data && (
        <ChartFrame
          title="账号增长"
          kind="过去 30 个 UTC 日的实际注册记录"
          description="只绘制有观测记录的日期，不插入虚构零值；没有采集流量或地区。"
        >
          <CsvExport
            columns={["bucket", "value"]}
            rows={growth.data.items.map((row) => ({ ...row }))}
            name="echo-registrations-observed.csv"
          />
          <LineChart series={growth.data.items} label="每日注册账号" />
          <ul className="chart-observations">
            {growth.data.items.map((item) => (
              <li key={item.bucket}>
                {item.bucket} · {item.value} 个账号
              </li>
            ))}
          </ul>
        </ChartFrame>
      )}
      <div className="split-panels">
        <div className="panel">
          <h2>全站与媒体流量</h2>
          <p>未知 · Caddy 可信采集器尚未接入。</p>
        </div>
        <div className="panel">
          <h2>IP 属地、浏览器与操作系统分布</h2>
          <p>
            未知 · 没有合法本地 GeoIP 数据库或浏览器解析来源，不推断、不补零。
          </p>
        </div>
      </div>
    </section>
  );
}
