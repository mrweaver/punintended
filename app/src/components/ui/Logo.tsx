export function Logo({
  className = "",
  accent = false,
}: {
  className?: string;
  accent?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 11A6 6 0 1 0 4.8 15.2L3 19l4.5-2.2A6 6 0 0 0 15 11Z" />
      <circle
        cx="15"
        cy="11"
        r="6"
        className={accent ? "fill-accent stroke-none" : ""}
      />
    </svg>
  );
}
