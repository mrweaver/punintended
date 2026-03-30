import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { History, ChevronRight } from "lucide-react";
import { gauntletApi, type GauntletHistoryEntry } from "../api/client";

interface GauntletHistoryProps {
  onViewComparison: (gauntletId: string) => void;
}

function Avatar({ src, name }: { src: string; name: string }) {
  return src ? (
    <img
      src={src}
      alt={name}
      title={name}
      className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-zinc-900"
    />
  ) : (
    <div
      title={name}
      className="w-6 h-6 rounded-full bg-orange-200 dark:bg-violet-800 ring-2 ring-white dark:ring-zinc-900 flex items-center justify-center text-xs font-bold"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GauntletHistory({ onViewComparison }: GauntletHistoryProps) {
  const [history, setHistory] = useState<GauntletHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gauntletApi
      .history()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center text-sm text-gray-400 dark:text-zinc-600 py-4">
        Loading history...
      </div>
    );
  }

  if (history.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-400 dark:text-zinc-500">
        <History className="w-3.5 h-3.5" />
        Past Gauntlets
      </div>

      {history.map((entry, i) => {
        const multiPlayer = entry.participants.length > 1;
        const myRank = multiPlayer
          ? [...entry.participants]
              .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
              .findIndex((p) => p.totalScore === entry.myScore) + 1
          : null;

        return (
          <motion.button
            key={entry.gauntletId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onViewComparison(entry.gauntletId)}
            className="w-full text-left bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center gap-3 hover:border-orange-300 dark:hover:border-violet-600 transition-colors group"
          >
            {/* Avatars */}
            <div className="flex -space-x-1.5 shrink-0">
              {entry.participants.slice(0, 4).map((p) => (
                <Avatar key={p.playerId} src={p.playerPhoto} name={p.playerName} />
              ))}
              {entry.participants.length > 4 && (
                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 ring-2 ring-white dark:ring-zinc-900 flex items-center justify-center text-xs text-zinc-500">
                  +{entry.participants.length - 4}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-orange-600 dark:text-violet-400">
                  {(entry.myScore ?? 0).toLocaleString()}
                </span>
                {myRank === 1 && multiPlayer && (
                  <span className="text-xs text-orange-500 dark:text-violet-400">
                    #1
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-zinc-500 truncate">
                {formatDate(entry.createdAt)}
                {multiPlayer && ` · ${entry.participants.length} players`}
              </p>
            </div>

            <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-500 dark:group-hover:text-violet-400 shrink-0 transition-colors" />
          </motion.button>
        );
      })}
    </div>
  );
}
