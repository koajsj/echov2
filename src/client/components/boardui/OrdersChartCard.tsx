// Adapted from BoardUI free MIT source; see notice.md. No demo data or fabricated comparisons.
"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cx } from "./cx";

export type OrdersPoint = {
  label: string;
  current: number;
};

const formatK = (value: number) => value.toLocaleString("zh-CN");

export function OrdersChartCard({
  data,
  title = "Orders",
  className,
}: {
  data: OrdersPoint[];
  title?: string;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const totalCurrent = data.reduce((sum, point) => sum + point.current, 0);
  const hovering = activeIndex !== null && activeIndex < data.length;
  const point = hovering ? data[activeIndex] : null;

  const headlineValue = point ? point.current : totalCurrent;
  const label = point ? point.label : title;
  const display = headlineValue;

  const yMax = Math.max(1, ...data.map((d) => d.current));

  if (!data.length)
    return (
      <section className="panel" role="status">
        {title}：当前范围没有观测记录。
      </section>
    );
  return (
    <section
      className={cx(
        "flex h-[344px] min-w-0 flex-1 flex-col gap-6 rounded-2xl bg-background-secondary-default px-4 pt-4 pb-3",
        className,
      )}
    >
      {/* Actual count and current-range legend. */}
      <div className="flex w-full flex-row gap-3 items-start justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="w-full text-body-medium text-text-secondary">{label}</p>
          <div className="flex w-full items-center gap-2">
            <p
              key={activeIndex ?? "total"}
              className="text-title-1-medium whitespace-nowrap text-text-primary tabular-nums"
            >
              {display.toLocaleString("en-US")}
            </p>
          </div>
          <p className="text-body-2-medium text-text-tertiary tabular-nums">
            单位：个 · 实际观测记录
          </p>
        </div>
        <dl className="flex shrink-0 items-center gap-4 text-body-2-medium text-text-secondary">
          <div className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full bg-chart-9-active"
              aria-hidden
            />
            <dt>当前范围</dt>
          </div>
        </dl>
      </div>

      {/* Chart */}
      <div className="min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 6, bottom: 0, left: 0 }}
            barCategoryGap="28%"
            barGap={3}
            onMouseMove={(state) => {
              const index = Number(state?.activeTooltipIndex);
              if (state?.isTooltipActive && Number.isFinite(index))
                setActiveIndex(index);
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <YAxis
              width={40}
              domain={[0, yMax * 1.1]}
              tickCount={4}
              tickFormatter={formatK}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              interval="preserveStartEnd"
              tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }}
            />
            <Tooltip
              formatter={(value) => [
                Number(value).toLocaleString("zh-CN"),
                "个",
              ]}
              cursor={{ fill: "var(--color-chart-track)", opacity: 0.5 }}
            />

            <Bar
              dataKey="current"
              fill="var(--color-chart-9-active)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              animationDuration={450}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
