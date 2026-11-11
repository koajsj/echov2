import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";

// Hand-built SVG charts. No chart library is installed and no download is
// authorized, so the components render real series directly. Every series is
// optional-safe: an empty array renders the shared empty state, never a fake
// zero line.

export interface ChartDatum {
  bucket: string;
  value: number;
}
export function ChartFrame({
  title,
  kind,
  description,
  children,
}: {
  title: string;
  kind: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel chart-panel" aria-label={title}>
      <header className="section-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{kind}</p>
        </div>
      </header>
      <p className="chart-note">{description}</p>
      {children}
    </section>
  );
}
function emptySeries(
  series: {
    bucket: string;
    value: number;
  }[],
) {
  return series.length === 0;
}
function points(series: ChartDatum[], width: number, height: number) {
  const max = Math.max(1, ...series.map((item) => item.value));
  const start = Date.parse(series[0]?.bucket ?? "");
  const end = Date.parse(series.at(-1)?.bucket ?? "");
  return series.map((item) => ({
    x:
      series.length > 1 && end > start
        ? 28 +
          ((Date.parse(item.bucket) - start) / (end - start)) * (width - 56)
        : width / 2,
    y: height - (item.value / max) * height,
    label: item.bucket,
    value: item.value,
  }));
}
function Axis({
  width,
  height,
  series,
}: {
  width: number;
  height: number;
  series: ChartDatum[];
}) {
  const labels = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const group = labels.current;
    const svg = group?.ownerSVGElement;
    if (!group || !svg) return;
    // SVG viewBox scales text too: keep the screen size of the shared meta token.
    const update = () => {
      const scale = svg.getScreenCTM()?.a;
      if (scale && scale > 0)
        group.style.fontSize = `${parseFloat(getComputedStyle(svg).fontSize) / scale}px`;
    };
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const max = Math.max(1, ...series.map((item) => item.value));
  return (
    <g ref={labels} aria-hidden="true">
      <line x1="0" y1={height} x2={width} y2={height} className="chart-axis" />
      <text x="0" y="12" className="chart-label">
        {max.toLocaleString()}
      </text>
      <text x="0" y={height - 4} className="chart-label">
        0
      </text>
      <text x="28" y={height + 18} className="chart-label">
        {series[0]?.bucket.slice(0, 16)}
      </text>
      <text
        x={width - 28}
        y={height + 18}
        textAnchor="end"
        className="chart-label"
      >
        {series.at(-1)?.bucket.slice(0, 16)}
      </text>
    </g>
  );
}
export function LineChart({
  series,
  height = 180,
  label = "数值",
}: {
  series: ChartDatum[];
  height?: number;
  label?: string;
}) {
  const width = 640;
  const marks = useMemo(() => points(series, width, height), [series, height]);
  if (emptySeries(series)) return <ChartEmpty label={`${label}序列为空`} />;
  const path = marks
    .map((mark, index) => `${index === 0 ? "M" : "L"}${mark.x},${mark.y}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 24}`}
      className="chart"
      role="img"
      aria-label={label}
    >
      <Axis width={width} height={height} series={series} />
      <path d={path} className="chart-line" />
      {marks.map((mark) => (
        <circle
          key={mark.label}
          cx={mark.x}
          cy={mark.y}
          r="4"
          className="chart-dot"
          tabIndex={0}
        >
          <title>{`${mark.label}: ${mark.value}`}</title>
        </circle>
      ))}
    </svg>
  );
}
function ChartEmpty({ label }: { label: string }) {
  return (
    <p className="chart-empty" role="status">
      {label}：此范围没有观测记录，不绘制虚假趋势。
    </p>
  );
}
