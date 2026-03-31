import { useEffect, useRef } from "react";
import { motion } from "motion/react";

export type MessageReaction = "laughing" | "skull" | "thumbs_up" | "groan" | "heart";

const REACTIONS: Array<{ key: MessageReaction; emoji: string }> = [
  { key: "laughing", emoji: "\u{1F602}" },
  { key: "skull", emoji: "\u{1F480}" },
  { key: "thumbs_up", emoji: "\u{1F44D}" },
  { key: "groan", emoji: "\u{1F644}" },
  { key: "heart", emoji: "\u{2764}\u{FE0F}" },
];

export const REACTION_EMOJI_MAP: Record<string, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.emoji]),
);

interface ReactionPickerProps {
  currentReaction: string | null;
  onSelect: (reaction: MessageReaction | null) => void;
  onClose: () => void;
  position?: "above" | "below";
}

export function ReactionPicker({
  currentReaction,
  onSelect,
  onClose,
  position = "above",
}: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick as EventListener);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick as EventListener);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.8, y: position === "above" ? 8 : -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      className={`absolute ${
        position === "above" ? "bottom-full mb-2" : "top-full mt-2"
      } left-0 z-50 flex items-center gap-1 px-2 py-1.5 bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-gray-200 dark:border-zinc-700`}
    >
      {REACTIONS.map((r) => (
        <button
          key={r.key}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(currentReaction === r.key ? null : r.key);
          }}
          className={`w-9 h-9 flex items-center justify-center rounded-full text-lg transition-all hover:scale-125 ${
            currentReaction === r.key
              ? "bg-orange-100 dark:bg-violet-900/40 scale-110"
              : "hover:bg-gray-100 dark:hover:bg-zinc-700"
          }`}
        >
          {r.emoji}
        </button>
      ))}
    </motion.div>
  );
}

export function ReactionSummary({
  reactions,
  onLongPressHandlers,
}: {
  reactions: Record<string, number>;
  onLongPressHandlers?: Record<string, unknown>;
}) {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1" {...onLongPressHandlers}>
      {entries.map(([key, count]) => (
        <span
          key={key}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400"
        >
          <span>{REACTION_EMOJI_MAP[key] ?? key}</span>
          {count > 1 && <span className="font-mono">{count}</span>}
        </span>
      ))}
    </div>
  );
}
