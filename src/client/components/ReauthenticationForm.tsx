import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@heroui/react";
import type { Audience } from "../../shared/contracts";
import { api } from "../app/api";

export function ReauthenticationForm({
  audience,
  sessionId,
}: {
  audience: Audience;
  sessionId: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password"));
    setPending(true);
    setMessage("");
    try {
      await api("/v1/sessions/reauthenticate", {
        method: "POST",
        audience,
        sessionId,
        body: { password, audience },
      });
      setMessage("已重新认证，敏感操作有效期五分钟。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新认证未完成。");
    } finally {
      form.reset();
      setPending(false);
    }
  }
  return (
    <form
      className="form panel"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <h2>确认敏感操作身份</h2>
      <label>
        当前密码
        <input
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={256}
          autoComplete="current-password"
        />
      </label>
      <Button type="submit" isPending={pending}>
        重新认证
      </Button>
      <p role="status">{message}</p>
    </form>
  );
}
