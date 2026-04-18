import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BookOpenText, History, Search } from "lucide-react";
import {
  backwordsApi,
  type BackwordsHistory as BackwordsHistoryData,
} from "../api/client";

interface BackwordsHistoryProps {
  onViewComparison: (gameId: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof History;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-400 dark:text-zinc-500">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

export function BackwordsHistory({ onViewComparison }: BackwordsHistoryProps) {
  const [history, setHistory] = useState<BackwordsHistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    backwordsApi
      .history()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-4 text-center text-sm text-gray-400 dark:text-zinc-600">
        Loading history...
      </div>
    );
  }

  if (!history) return null;

  const hasEntries = history.authored.length > 0 || history.guessed.length > 0;
  if (!hasEntries) return null;

  return (
    <div className="space-y-6">
      {history.authored.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={BookOpenText} label="Authored Puzzles" />
          {history.authored.map((entry, index) => (
            <motion.button
              key={entry.gameId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onViewComparison(entry.gameId)}
              className="w-full rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-left transition-colors hover:border-orange-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {entry.topic} + {entry.focus}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
                    {formatDate(entry.createdAt)} · {entry.solvedCount}/
                    {entry.totalGuessers} solved
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-mono font-bold text-orange-600 dark:text-violet-400">
                    {(entry.creatorScore ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                    clue score
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {history.guessed.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Search} label="Solved And Failed" />
          {history.guessed.map((entry, index) => (
            <motion.button
              key={entry.runId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onViewComparison(entry.gameId)}
              className="w-full rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-left transition-colors hover:border-orange-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-600"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {entry.topic} + {entry.focus}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
                    By {entry.creatorName} · {formatDate(entry.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-mono font-bold ${
                      entry.status === "solved"
                        ? "text-green-600 dark:text-green-400"
                        : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {entry.bestSimilarity ?? 0}%
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                    {entry.status === "solved"
                      ? `solved in ${entry.attemptsUsed}`
                      : `failed in ${entry.attemptsUsed}`}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}