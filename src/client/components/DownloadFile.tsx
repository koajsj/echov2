import { Button } from "@heroui/react";

export function DownloadFile({
  blob,
  name,
  label,
}: {
  blob: Blob;
  name: string;
  label: string;
}) {
  function download() {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    try {
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      // Let the browser start consuming the URL before releasing this click's URL.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
  return (
    <Button type="button" variant="secondary" onPress={download}>
      {label}
    </Button>
  );
}
