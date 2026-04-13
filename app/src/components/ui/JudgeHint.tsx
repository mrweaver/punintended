import { useId, useState } from "react";
import { Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatJudgeLabel, formatJudgeTitle } from "../../utils/judge";

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
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const label = formatJudgeLabel(judgeName, judgeVersion);
  const title = formatJudgeTitle(judgeName, judgeVersion);

  if (!label || !title) return null;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        aria-describedby={open ? tooltipId : undefined}
        aria-label={title}
        className={`${
          className ??
          "inline-flex items-center text-current/65 hover:text-current focus-within:text-current"
        } gap-1`}
      >
        <span className="font-bold">{label}</span>
        <Info className={iconClassName ?? "h-3.5 w-3.5"} />
        <span className="sr-only">{title}</span>
      </span>

      <AnimatePresence>
        {open && (
          <motion.span
            id={tooltipId}
            role="tooltip"
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-max max-w-56 rounded-2xl border border-border-strong bg-surface px-3 py-2 shadow-lg"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              AI Judge
            </span>
            <span className="block text-sm font-semibold text-text whitespace-nowrap">
              {label}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
