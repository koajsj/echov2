import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import {
  prepareAttachment,
  discardPreparedAttachment,
  openPreparedAttachment,
  type PreparedAttachment,
} from "../../crypto/attachment-crypto";
export function AttachmentPreparationPanel() {
  const prepared = useRef<PreparedAttachment | null>(null);
  const live = useRef(true);
  const [busy, setBusy] = useState(false);
  const [bytes, setBytes] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (prepared.current) discardPreparedAttachment(prepared.current);
    };
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function clear() {
    if (prepared.current) discardPreparedAttachment(prepared.current);
    prepared.current = null;
    setBytes(null);
    setUrl(null);
    setMessage("已释放当前内存引用；不承诺物理擦除。");
  }
  async function select(file: File | undefined) {
    if (!file || busy) return;
    clear();
    setBusy(true);
    setMessage("");
    try {
      const value = await prepareAttachment(file);
      if (!live.current) {
        discardPreparedAttachment(value);
        return;
      }
      prepared.current = value;
      setBytes(value.ciphertext.byteLength);
      setMessage(
        "已完成本地 AES-256-GCM 加密。未上传、未发送；离开页面即丢弃此临时内容。",
      );
    } catch (error) {
      if (live.current)
        setMessage(error instanceof Error ? error.message : "本地加密失败。");
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function open() {
    if (!prepared.current || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const blob = await openPreparedAttachment(prepared.current);
      if (live.current) setUrl(URL.createObjectURL(blob));
    } catch {
      if (live.current) setMessage("附件认证解密失败，未生成可读文件。");
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>附件本地准备</h2>
      <p>
        仅在当前页面内处理，最大 10 MiB。MLS
        密钥封装与授权上传尚未接通，此入口不能发送附件；临时 key
        不导出、不存储、不上传。
      </p>
      <label>
        选择本机文件
        <input
          type="file"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void select(file);
          }}
        />
      </label>
      {bytes !== null && (
        <>
          <p>临时密文：{bytes.toLocaleString()} bytes</p>
          <div className="actions">
            <Button
              variant="secondary"
              isPending={busy}
              onPress={() => {
                void open();
              }}
            >
              本地解密为下载文件
            </Button>
            <Button variant="ghost" isDisabled={busy} onPress={clear}>
              丢弃临时内容
            </Button>
          </div>
        </>
      )}
      {url && (
        <a href={url} download="echo-attachment.bin">
          下载解密后的原文件（包含明文）
        </a>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
