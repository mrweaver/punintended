import { Info } from "lucide-react";
import { formatJudgeTitle } from "../../utils/judge";

interface JudgeHintProps {
  judgeName?: string | null;
  judgeVersion?: string | null;
  className?: string;
  iconClassName?: string;
}

export function JudgeHint({
  judgeName,
  judgeVersion,
  className,
  iconClassName,
}: JudgeHintProps) {
  const title = formatJudgeTitle(judgeName, judgeVersion);

  if (!title) return null;

  return (
    <span
      title={title}
      aria-label={title}
      className={
        className ??
        "inline-flex items-center text-current/65 hover:text-current focus-within:text-current"
      }
    >
      <Info className={iconClassName ?? "h-3.5 w-3.5"} />
      <span className="sr-only">{title}</span>
    </span>
  );
}