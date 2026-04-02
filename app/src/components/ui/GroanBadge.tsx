import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Groaner } from "../../api/client";

interface GroanBadgeProps {
  count: number;
  groaners?: Groaner[];
  showIcon?: boolean;
  triggerClassName?: string;
  iconClassName?: string;
  countClassName?: string;
  popoverAlign?: "left" | "right";
  popoverPosition?: "above" | "below";
  maxVisibleNames?: number;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function GroanBadge({
  count,
  groaners = [],
  showIcon = true,
  triggerClassName,
  iconClassName,
  countClassName,
  popoverAlign = "left",
  popoverPosition = "above",
  maxVisibleNames = 3,
  onClick,
}: GroanBadgeProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const canOpen = count > 0;

  const uniqueGroaners = useMemo(() => {
    const seen = new Set<number>();

    return groaners.filter((groaner) => {
      if (!groaner?.name || seen.has(groaner.uid)) return false;
      seen.add(groaner.uid);
      return true;
    });
  }, [groaners]);

  const compactGroanerNames = useMemo(
    () => getCompactGroanerNames(uniqueGroaners),
    [uniqueGroaners],
  );

  const visibleGroanerNames = compactGroanerNames.slice(0, maxVisibleNames);
  const remainingCount = Math.max(
    0,
    compactGroanerNames.length - visibleGroanerNames.length,
  );
  const summaryText = useMemo(
    () => buildGroanSummary(visibleGroanerNames, remainingCount, count),
    [visibleGroanerNames, remainingCount, count],
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        if (canOpen) setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        aria-describedby={canOpen && open ? popoverId : undefined}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1 rounded-md text-sm font-semibold text-accent transition-colors hover:text-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        }
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event);
          if (!canOpen) return;
          setOpen((current) => !current);
        }}
        onFocus={() => {
          if (canOpen) setOpen(true);
        }}
        onBlur={() => {
          window.requestAnimationFrame(() => {
            if (!wrapperRef.current?.contains(document.activeElement)) {
              setOpen(false);
            }
          });
        }}
      >
        {showIcon && (
          <span className={iconClassName ?? "text-base leading-none"}>🙄</span>
        )}
        <span className={countClassName ?? "font-medium leading-none"}>
          {count}
        </span>
      </button>

      <AnimatePresence>
        {canOpen && open && (
          <motion.div
            id={popoverId}
            role="tooltip"
            initial={{
              opacity: 0,
              scale: 0.96,
              y: popoverPosition === "above" ? 6 : -6,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: popoverPosition === "above" ? 4 : -4,
            }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 min-w-40 max-w-64 rounded-2xl border border-border-strong bg-surface px-3 py-2 shadow-lg ${
              popoverPosition === "above" ? "bottom-full mb-2" : "top-full mt-2"
            } ${popoverAlign === "right" ? "right-0" : "left-0"}`}
          >
            <p className="text-sm font-medium text-text whitespace-nowrap">
              {summaryText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim();
}

function getCompactGroanerNames(groaners: Groaner[]) {
  const parsedGroaners = groaners.map((groaner) => ({
    fullName: groaner.name,
    firstName: getFirstName(groaner.name),
    lastInitial: getLastInitial(groaner.name),
  }));

  const firstNameGroups = new Map<string, typeof parsedGroaners>();

  parsedGroaners.forEach((groaner) => {
    const group = firstNameGroups.get(groaner.firstName) ?? [];
    group.push(groaner);
    firstNameGroups.set(groaner.firstName, group);
  });

  return parsedGroaners.map((groaner) => {
    const group = firstNameGroups.get(groaner.firstName) ?? [];

    if (group.length <= 1) {
      return groaner.firstName;
    }

    if (!groaner.lastInitial) {
      return groaner.fullName;
    }

    const lastInitialMatches = group.filter(
      (candidate) => candidate.lastInitial === groaner.lastInitial,
    );

    if (lastInitialMatches.length === 1) {
      return `${groaner.firstName} ${groaner.lastInitial}.`;
    }

    return groaner.fullName;
  });
}

function getLastInitial(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  return parts[parts.length - 1][0]?.toUpperCase() ?? null;
}

function buildGroanSummary(
  names: string[],
  remainingCount: number,
  count: number,
) {
  if (names.length === 0) {
    return `${count} ${count === 1 ? "person groaned" : "people groaned"}`;
  }

  const visibleNames = formatNameList(names);
  const moreText = remainingCount > 0 ? ` and ${remainingCount} more` : "";
  const verb = names.length + remainingCount === 1 ? "groaned" : "groaned";

  return `${visibleNames}${moreText} ${verb}`;
}

function formatNameList(names: string[]) {
  if (!names || names.length === 0) return "";

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
