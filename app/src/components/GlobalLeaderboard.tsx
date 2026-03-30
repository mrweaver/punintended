import { useState } from "react";
import { motion } from "motion/react";
import { useGlobalLeaderboard } from "../hooks/useGlobalLeaderboard";
import { Button } from "./ui/Button";
import type { LeaderboardEntry } from "../api/client";

interface Props {
  onClose: () => void;
}

type Tab = "crown" | "shame" | "alltime";

function scoreColor(score: number) {
  if (score >= 9.5)
    return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
  if (score >= 7)
    return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20";
  return "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
}

function LeaderboardRow({
  rank,
  entry,
}: {
  rank: number;
  entry: LeaderboardEntry;
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
      <span className="text-sm font-mono text-gray-400 dark:text-zinc-500 w-6 shrink-0 pt-0.5">
        {rank}
      </span>
      <div className="flex items-center gap-1 text-sm shrink-0 pt-0.5">
        <span>😩</span>
        <span className="font-mono font-bold text-gray-700 dark:text-zinc-200">
          {entry.groanCount}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-serif italic text-gray-800 dark:text-zinc-200 mb-1">
          "
          {entry.text.length > 100
            ? entry.text.slice(0, 100) + "…"
            : entry.text}
          "
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <img
            src={entry.authorPhoto}
            className="w-5 h-5 rounded-full"
            alt={entry.authorName}
          />
          <span className="text-xs text-gray-500 dark:text-zinc-400">
            {entry.authorName}
          </span>
          {entry.sessionName && (
            <span className="text-[10px] text-gray-400 dark:text-zinc-600 font-mono">
              · {entry.sessionName}
            </span>
          )}
        </div>
      </div>
      <span
        className={`text-xs font-bold font-mono px-2 py-1 rounded-lg shrink-0 ${scoreColor(entry.aiScore)}`}
      >
        {entry.aiScore}/10
      </span>
    </div>
  );
}

export function GlobalLeaderboard({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("crown");
  const { daily, allTime, loading } = useGlobalLeaderboard();

  const tabs: Array<{ key: Tab; label: string; emoji: string }> = [
    { key: "crown", label: "Daily Crown", emoji: "🏆" },
    { key: "shame", label: "Hall of Shame", emoji: "🍅" },
    { key: "alltime", label: "All-Time", emoji: "📜" },
  ];

  const entries =
    tab === "crown"
      ? (daily?.crown ?? [])
      : tab === "shame"
        ? (daily?.shame ?? [])
        : allTime;

  const emptyMessage =
    tab === "crown"
      ? "No perfect 10s today — yet. Go write one!"
      : tab === "shame"
        ? "No shameful entries today. Impressive."
        : "Nothing here yet. The hall of fame awaits.";

  const tabDescription =
    tab === "crown"
      ? "Perfect 10/10 puns from today, ranked by groans received."
      : tab === "shame"
        ? "Today's lowest-scoring puns (≤2/10), proudly displayed."
        : "The greatest puns ever submitted, ranked by groans. Eternal glory awaits.";

  return (
    <motion.div
      key="global-leaderboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="space-y-6"
    >
      <Button variant="ghost" onClick={onClose} className="-ml-4">
        ← Back to Lobby
      </Button>

      <div>
        <h1 className="text-3xl sm:text-4xl font-serif italic font-bold dark:text-zinc-100 mb-1">
          Leaderboards
        </h1>
        {daily && (
          <p className="text-sm font-mono text-gray-400 dark:text-zinc-500">
            {new Date(daily.date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-orange-500 dark:bg-violet-600 text-white shadow-sm"
                : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 hover:border-orange-300 dark:hover:border-violet-600"
            }`}
          >
            <span>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500 dark:text-zinc-400 italic">
        {tabDescription}
      </p>

      {loading ? (
        <div className="text-center py-16 text-gray-400 dark:text-zinc-500">
          Loading...
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700">
          <p className="text-gray-400 dark:text-zinc-500 italic text-lg">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {entries.map((entry, i) => (
            <LeaderboardRow key={entry.id} rank={i + 1} entry={entry} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
