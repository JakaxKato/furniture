export type IconName =
  | "search"
  | "bag"
  | "user"
  | "arrow"
  | "menu"
  | "grid"
  | "box"
  | "truck"
  | "chat"
  | "receipt"
  | "shield"
  | "clock"
  | "check"
  | "bell";
const paths: Record<IconName, string> = {
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  bag: "M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2",
  user: "M20 21v-2a7 7 0 0 0-14 0v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  menu: "M3 6h18M3 12h18M3 18h18",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  box: "m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7 5l10 5",
  truck:
    "M1 4h13v13H1V4Zm13 5h4l4 5v3h-8M7 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  chat: "M21 3H3v14h5l4 4 4-4h5V3ZM7 8h10M7 12h6",
  receipt: "M5 2h14v20l-3-2-4 2-4-2-3 2V2Zm4 5h6M9 11h6M9 15h4",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2",
  check: "m5 12 4 4L19 6",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7Zm4 11a2 2 0 0 0 4 0",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
