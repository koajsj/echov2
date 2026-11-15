import { CopyButton } from "./cultui/CopyButton";

export function PublicUserId({ value }: { value: string }) {
  return (
    <span className="public-user-id">
      <code>{value}</code>
      <CopyButton key={value} value={value} label={`复制用户 ID ${value}`} />
    </span>
  );
}
