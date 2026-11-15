// Adapted from Cult UI Copy Button; upstream and MIT terms: ./notice.md.
import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Icon } from "../Icon";
import "./copy-button.css";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const valid = /^[A-Z2-7]{12}$/.test(value);
  const pending = useRef(false);
  const [status, setStatus] = useState<"idle" | "pending" | "copied" | "error">(
    "idle",
  );
  const hasCopied = status === "copied";

  useEffect(() => {
    if (hasCopied) {
      const timer = setTimeout(() => setStatus("idle"), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasCopied]);

  async function copy() {
    if (!valid || pending.current) return;
    pending.current = true;
    setStatus("pending");
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    } finally {
      pending.current = false;
    }
  }

  return (
    <span className="cult-copy">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={label}
        data-slot="copy-button"
        data-copied={hasCopied}
        isDisabled={!valid}
        isPending={status === "pending"}
        onPress={() => void copy()}
      >
        <span className="cult-copy-icons" aria-hidden="true">
          <Icon name="copy" className="cult-copy-original" />
          <Icon name="check" className="cult-copy-check" />
        </span>
        <span>{hasCopied ? "已复制" : "复制"}</span>
      </Button>
      <span
        role="status"
        aria-atomic="true"
        className={status === "error" ? "error" : "sr-only"}
      >
        {!valid
          ? "公共用户 ID 无效，无法复制"
          : hasCopied
            ? "已复制"
            : status === "error"
              ? "复制失败，请手动选择 ID"
              : ""}
      </span>
    </span>
  );
}
