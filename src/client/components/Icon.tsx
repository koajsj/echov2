// Original outline glyphs: no external icon assets or downloads.
const paths = {
  chat: "M5 5h14v11H9l-4 4V5Z M9 9h6 M9 12h4",
  people:
    "M16 20v-2a4 4 0 0 0-8 0v2 M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M18 6a3 3 0 0 1 0 6 M19 15a4 4 0 0 1 2 4",
  bookmark: "M7 4h10v16l-5-4-5 4V4Z",
  device: "M6 3h12v18H6V3Z M10 17h4",
  archive: "M4 4h16v4H4V4Z M6 8v12h12V8 M10 12h4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.5 5.5 7 7 M17 17l1.5 1.5 M5.5 18.5 7 17 M17 7l1.5-1.5",
  grid: "M4 4h6v6H4V4Z M14 4h6v6h-6V4Z M4 14h6v6H4v-6Z M14 14h6v6h-6v-6Z",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.1 M4 12h.1 M4 18h.1",
  chart: "M4 4v16h16 M8 15l4-6 4 3 4-7",
  globe:
    "M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6",
  key: "M14 10a5 5 0 1 0-4 4l7 7 3-3-2-2 2-2-2-2-2 2-2-2",
  lock: "M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5V11Z M12 15v2",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
