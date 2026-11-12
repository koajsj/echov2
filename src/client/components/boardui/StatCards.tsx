// Adapted from BoardUI free MIT source; see notice.md. Real API values are required.
import type { RemixiconComponentType } from "@remixicon/react";
type Stat = { icon: RemixiconComponentType; label: string; value: string };
function PlainStatCard({ stat }: { stat: Stat }) {
  return (
    <section className="flex h-[112px] min-w-0 flex-col items-start justify-between rounded-2xl bg-background-secondary-default p-4">
      <span className="flex items-center rounded-md bg-stat-card-icon-background p-1.5">
        <stat.icon
          className="size-5 shrink-0 text-foreground-icon-primary"
          aria-hidden
        />
      </span>
      <div className="flex w-full flex-col gap-0.5">
        <p className="w-full text-body-medium text-text-secondary">
          {stat.label}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className="text-title-1-medium whitespace-nowrap text-text-primary">
            {stat.value}
          </p>
        </div>
      </div>
    </section>
  );
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="boardui-stats">
      {stats.map((stat) => (
        <PlainStatCard key={stat.label} stat={stat} />
      ))}
    </div>
  );
}
