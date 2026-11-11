import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@heroui/react";
import type { MetadataExport, SessionView } from "../../../shared/contracts";
import { api } from "../../app/api";
import { DownloadFile } from "../../components/DownloadFile";
import {
  openMetadata,
  sealMetadata,
  validateMetadata,
} from "./metadata-archive";

export function MetadataArchivePanel({ session }: { session: SessionView }) {
  const live = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<MetadataExport | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function run(
    event: FormEvent<HTMLFormElement>,
    mode: "export" | "preview",
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get("archivePassword"));
    const input = fields.get("archive");
    form.reset();
    setBusy(true);
    setMessage("");
    setFile(null);
    setPreview(null);
    try {
      if (mode === "export") {
        if (password !== String(fields.get("confirmation")))
          throw new Error("两次归档口令不一致。");
        const response = await api<MetadataExport>("/v1/account/export", {
          method: "POST",
          sessionId: session.sessionId,
        });
        const data = validateMetadata(
          response,
          session.account.id,
          location.origin,
        );
        const archive = await sealMetadata(data, password);
        if (live.current) {
          setFile(archive);
          setMessage("已生成加密元数据归档；不含聊天、附件、会话凭据或私钥。");
        }
      } else {
        if (!(input instanceof File) || !input.size)
          throw new Error("请选择加密元数据归档。");
        const data = await openMetadata(
          input,
          password,
          session.account.id,
          location.origin,
        );
        if (live.current) {
          setPreview(data);
          setMessage(
            "文件认证、账号、来源与结构检查通过；仅本地预览，未恢复或更改任何状态。",
          );
        }
      }
    } catch (error) {
      if (live.current)
        setMessage(
          error instanceof Error ? error.message : "操作失败，未恢复任何数据。",
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>服务元数据归档</h2>
      <p>
        包含本账号用户名、设备目录和本人消息删除请求快照。默认加密；不包含聊天历史、附件、浏览器私钥或系统备份。导出需要五分钟内重新认证。
      </p>
      <p>
        <a href="#devices">前往设备页重新认证</a>
        。归档口令独立保存，忘记后无法解密。导入只供核对，旧文件不能覆盖新删除状态。
      </p>
      <form
        className="form"
        onSubmit={(event) => {
          void run(event, "export");
        }}
      >
        <fieldset disabled={busy}>
          <legend>创建加密归档</legend>
          <label>
            独立归档口令
            <input
              name="archivePassword"
              type="password"
              minLength={12}
              maxLength={256}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            确认归档口令
            <input
              name="confirmation"
              type="password"
              minLength={12}
              maxLength={256}
              required
              autoComplete="new-password"
            />
          </label>
          <Button type="submit" isPending={busy}>
            创建加密元数据文件
          </Button>
        </fieldset>
      </form>
      {file && (
        <DownloadFile
          blob={file}
          name="echo-service-metadata.echo"
          label="下载加密元数据归档"
        />
      )}
      <form
        className="form"
        onSubmit={(event) => {
          void run(event, "preview");
        }}
      >
        <fieldset disabled={busy}>
          <legend>导入预览 · 不执行恢复</legend>
          <label>
            加密归档
            <input name="archive" type="file" required />
          </label>
          <label>
            归档口令
            <input
              name="archivePassword"
              type="password"
              minLength={12}
              maxLength={256}
              required
              autoComplete="off"
            />
          </label>
          <Button type="submit" variant="secondary" isPending={busy}>
            认证文件并预览
          </Button>
        </fieldset>
      </form>
      {preview && (
        <dl className="details">
          <div>
            <dt>文件账号</dt>
            <dd>
              {preview.account.username} · {preview.account.id}
            </dd>
          </div>
          <div>
            <dt>快照时间（不是新鲜删除证明）</dt>
            <dd>{preview.issuedAt}</dd>
          </div>
          <div>
            <dt>设备 / 删除请求</dt>
            <dd>
              {preview.devices.length} / {preview.deletions.length}
            </dd>
          </div>
        </dl>
      )}
      {(file || preview) && (
        <Button
          variant="ghost"
          isDisabled={busy}
          onPress={() => {
            setFile(null);
            setPreview(null);
            setMessage("已释放当前预览和下载引用；不承诺内存物理擦除。");
          }}
        >
          关闭预览与下载
        </Button>
      )}
      <p role="status">{message}</p>
      <p className="muted">
        历史归档、媒体导出、MLS 恢复和系统备份执行器仍
        BLOCKED。文件认证不能证明服务器元数据真实、删除证据新鲜或可恢复聊天。
      </p>
    </section>
  );
}
