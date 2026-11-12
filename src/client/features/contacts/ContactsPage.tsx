import { UserLookupMode } from "../../components/UserLookupMode";
import { PublicUserId } from "../../components/PublicUserId";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Input, Form } from "@heroui/react";
import { api } from "../../app/api";
interface Lookup {
  id: string;
  publicId: string;
  username: string;
  trust: "unverified-directory";
}
export function ContactsPage({ sessionId }: { sessionId: string }) {
  const [result, setResult] = useState<Lookup | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setResult(null);
    setMessage("");
    setBusy(true);
    const username = String(new FormData(event.currentTarget).get("username"));
    try {
      setResult(
        await api<Lookup>(
          `/v1/accounts/lookup?${new URLSearchParams({ [String(new FormData(event.currentTarget).get("identityKind"))]: username })}`,
          {
            sessionId,
          },
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "查找失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <header className="page-heading">
        <h1>联系人</h1>
        <p>用户名可以变化，交流身份始终关联永久 ID。</p>
      </header>
      <Form
        className="panel form"
        onSubmit={(event) => {
          void lookup(event);
        }}
      >
        <UserLookupMode />
        <label>
          用户名或公共 ID
          <Input
            name="username"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_]+"
            autoComplete="off"
          />
        </label>
        <Button type="submit" isPending={busy}>
          查找账号
        </Button>
      </Form>
      <p role="status">{message}</p>
      {result && (
        <dl className="details">
          <dt>用户名</dt>
          <dd>{result.username}</dd>
          <dt>公共 ID</dt>
          <dd>
            <PublicUserId value={result.publicId} />
          </dd>
          <dt>信任来源</dt>
          <dd>服务端目录，尚未核验根身份。查找结果不会自动成为可信联系人。</dd>
        </dl>
      )}
      <div className="panel">
        <h2>加密联系人与备注</h2>
        <p>
          BLOCKED · 依赖已授权设备及本人 MLS
          私人组。当前不保存备注、不生成假联系人列表、不提供明文同步替代。
        </p>
        <a href="#recovery">查看密钥与恢复状态</a>
      </div>
    </section>
  );
}
