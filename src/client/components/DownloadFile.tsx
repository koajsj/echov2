import { useEffect, useState } from "react";

export function DownloadFile({
  blob,
  name,
  label,
}: {
  blob: Blob;
  name: string;
  label: string;
}) {
  const [link, setLink] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setLink({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return link?.blob === blob ? (
    <a href={link.url} download={name}>
      {label}
    </a>
  ) : (
    <span role="status">正在准备下载链接…</span>
  );
}
