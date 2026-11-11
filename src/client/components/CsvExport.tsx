import { useState } from "react";
import { Button } from "@heroui/react";
import { DownloadFile } from "./DownloadFile";

export function CsvExport({
  columns,
  rows,
  name,
}: {
  columns: readonly string[];
  rows: readonly Record<string, unknown>[];
  name: string;
}) {
  const [file, setFile] = useState<Blob | null>(null);
  function prepare() {
    if (!confirm("导出当前页可见的管理元数据？文件包含个人信息，请妥善保管。"))
      return;
    const cell = (value: unknown) => {
      const text =
        value === undefined
          ? "缺失"
          : value === null
            ? "未记录"
            : String(value);
      // Quote every cell and neutralize spreadsheet formulas, including leading controls/space.
      const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    setFile(
      new Blob(
        [
          "\uFEFF",
          [
            columns.map(cell).join(","),
            ...rows.map((row) =>
              columns.map((column) => cell(row[column])).join(","),
            ),
          ].join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
  }
  return (
    <div className="actions">
      <Button
        variant="secondary"
        isDisabled={rows.length === 0}
        onPress={prepare}
      >
        准备当前页 CSV
      </Button>
      {file && (
        <>
          <DownloadFile blob={file} name={name} label="下载已准备的 CSV 快照" />
          <Button variant="ghost" onPress={() => setFile(null)}>
            释放下载
          </Button>
        </>
      )}
    </div>
  );
}
