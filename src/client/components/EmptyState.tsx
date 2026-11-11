import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
export function EmptyState({
  title,
  description,
  icon = "lock",
  children,
}: {
  title: string;
  description: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} className="empty-symbol" />
      <h2>{title}</h2>
      <p>{description}</p>
      {children ? <div className="actions">{children}</div> : null}
    </div>
  );
}
