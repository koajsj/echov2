import { useState } from "react";
import { Button, Select, Label, ListBox } from "@heroui/react";
import { RiGroupLine } from "@remixicon/react";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import { RevenueChartCard } from "../../components/boardui/RevenueChartCard";
import { OrdersChartCard } from "../../components/boardui/OrdersChartCard";
import { StatCards } from "../../components/boardui/StatCards";
interface Overview {
  counts: Record<string, string>;
  registration: { registration_mode: string };
  onlineNotificationSessions: number;
}
const labels: Record<string, string> = {
  users: "用户总数",
  new_users_today: "今日新增 · UTC",
  new_users_week: "本周新增 · UTC",
  new_users_month: "本月新增 · UTC",
  accounts_with_sessions: "持有有效会话的账号",
  devices: "active 设备目录",
  accepted_envelopes: "持久化投递数量",
  registered_attachment_bytes: "登记附件 · bytes",
  pending_deletions: "待处理删除",
};
export function DashboardPage({
  sessionId,
  analytics = false,
}: {
  sessionId: string;
  analytics?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [days, setDays] = useState("30");
  const query = useApiQuery<Overview>(
    "/v1/admin/overview",
    revision,
    sessionId,
  );
  const trends = useApiQuery<{
    items: { bucket: string; registrations: number; deliveries: number }[];
    source: string;
  }>(`/v1/admin/trends?days=${days}`, revision, sessionId);
  return (
    <section>
      <header className="page-heading">
        <p className="eyebrow">ECHO CONTROL / OVERVIEW</p>
        <h1>{analytics ? "流量与业务分析" : "管理概览"}</h1>
        <p>PostgreSQL 实际业务记录 · 当前会话不等同于历史活跃用户。</p>
      </header>
      <div className="dashboard-toolbar">
        <Select
          aria-label="统计时间范围"
          selectedKey={days}
          onSelectionChange={(key) => {
            if (key) setDays(String(key));
          }}
        >
          <Label>时间范围</Label>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="7" textValue="7 天">
                7 天
              </ListBox.Item>
              <ListBox.Item id="30" textValue="30 天">
                30 天
              </ListBox.Item>
              <ListBox.Item id="90" textValue="90 天">
                90 天
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        <Button
          variant="secondary"
          isDisabled={query.loading || trends.loading}
          onPress={() => setRevision((value) => value + 1)}
        >
          刷新数据
        </Button>
      </div>
      <ServiceState {...query} />
      {query.data && (
        <StatCards
          stats={[
            ...Object.entries(query.data.counts).map(([key, value]) => ({
              icon: RiGroupLine,
              label: labels[key] ?? key,
              value,
            })),
            {
              icon: RiGroupLine,
              label: "在线通知会话 · 60 秒",
              value: String(query.data.onlineNotificationSessions),
            },
            {
              icon: RiGroupLine,
              label: "注册模式",
              value: query.data.registration.registration_mode,
            },
            {
              icon: RiGroupLine,
              label: "流量 / 地区 / 活跃用户",
              value: "未知",
            },
          ]}
        />
      )}
      <ServiceState {...trends} />
      {trends.data && (
        <div className="dashboard-charts">
          <RevenueChartCard
            title="用户增长趋势"
            data={trends.data.items.map((row) => ({
              label: row.bucket,
              current: row.registrations,
            }))}
          />
          <OrdersChartCard
            title="每日新增用户"
            data={trends.data.items.map((row) => ({
              label: row.bucket,
              current: row.registrations,
            }))}
          />
          <OrdersChartCard
            title="每日持久化投递"
            data={trends.data.items.map((row) => ({
              label: row.bucket,
              current: row.deliveries,
            }))}
          />
        </div>
      )}
      <div className="split-panels">
        <section className="panel">
          <h2>浏览器 / 操作系统 / 地区分布</h2>
          <p>
            未知 · 未采集浏览器与 OS，未配置可靠
            GeoIP。无分布数据，不绘制虚假环形图。
          </p>
          <p className="muted">可靠分布数据接入前，不展示比例或排行。</p>
        </section>
        <section className="panel">
          <h2>流量与数据保障</h2>
          <p>
            未知 · Caddy
            流量采集器未接通；附件登记字节不等于已验证磁盘占用。历史活跃用户缺独立事件口径，不以当前会话数替代。
          </p>
        </section>
      </div>
    </section>
  );
}
