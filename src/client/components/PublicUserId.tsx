import { useState } from "react";
import { Button } from "@heroui/react";

export function PublicUserId({ value }: { value: string }) {
  const [status, setStatus] = useState("");
  return (
    <span className="public-user-id">
      <code>{value}</code>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`复制用户 ID ${value}`}
        onPress={() => {
          void navigator.clipboard.writeText(value).then(
            () => setStatus("已复制"),
            () => setStatus("复制失败，请手动选择 ID"),
          );
        }}
      >
        复制
      </Button>
      <span role="status" className="muted">
        {status}
      </span>
    </span>
  );
}
