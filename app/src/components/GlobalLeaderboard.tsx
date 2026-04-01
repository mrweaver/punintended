import { useState } from "react";
import { motion } from "motion/react";
import { Swords } from "lucide-react";
import { useGlobalLeaderboard } from "../hooks/useGlobalLeaderboard";
import { Button } from "./ui/Button";
import { GroanBadge } from "./ui/GroanBadge";
import type { LeaderboardEntry, GauntletHistoryEntry } from "../api/client";

interface Props {
  onClose: () => void;
}

type Tab = "today" | "alltime" | "gauntlet";

function scoreColor(score: number) {
  if (score >= 8)
    return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
  if (score >= 6)
    return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20";
  if (score >= 4)
    return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
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
      <div className="shrink-0 pt-0.5">
        <GroanBadge
          count={entry.groanCount}
          groaners={entry.groaners}
          triggerClassName="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-gray-700 transition-colors hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 dark:text-zinc-200 dark:hover:text-violet-300 dark:focus-visible:ring-violet-500"
          countClassName="font-mono font-bold"
        />
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

function GauntletLeaderboardRow({
  rank,
  entry,
}: {
  rank: number;
  entry: GauntletHistoryEntry;
}) {
  const myRank =
    [...entry.participants]
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
      .findIndex((p) => p.totalScore === entry.myScore) + 1;

  return (
    <div className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
      <span className="text-sm font-mono text-gray-400 dark:text-zinc-500 w-6 shrink-0">
        {rank}
      </span>
      <div className="flex -space-x-2 shrink-0">
        {entry.participants.slice(0, 4).map((p, i) => (
          <img
            key={i}
            src={p.playerPhoto}
            alt={p.playerName}
            className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-900"
          />
        ))}
        {entry.participants.length > 4 && (
          <span className="w-7 h-7 rounded-full bg-gray-200 dark:bg-zinc-700 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-zinc-400">
            +{entry.participants.length - 4}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-lg text-gray-900 dark:text-zinc-100">
            {entry.myScore?.toLocaleString() ?? "—"}
          </span>
          <span className="text-xs text-gray-400 dark:text-zinc-500">pts</span>
          {entry.participants.length > 1 && (
            <span className="text-xs font-medium text-orange-600 dark:text-violet-400">
              #{myRank} of {entry.participants.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-zinc-500">
          {new Date(entry.createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
      <Swords className="w-4 h-4 text-orange-400 dark:text-violet-400 shrink-0" />
    </div>
  );
}

export function GlobalLeaderboard({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("today");
  const { daily, allTime, gauntlet, loading } = useGlobalLeaderboard();

  const tabs: Array<{ key: Tab; label: string; emoji: string }> = [
    { key: "today", label: "Today", emoji: "📊" },
    { key: "alltime", label: "All-Time", emoji: "📜" },
    { key: "gauntlet", label: "Gauntlet", emoji: "⚔️" },
  ];

  const emptyMessage =
    tab === "today"
      ? "No puns scored today — yet. Go write one!"
      : tab === "alltime"
        ? "Nothing here yet. The hall of fame awaits."
        : "No gauntlet runs yet. Take the challenge!";

  const tabDescription =
    tab === "today"
      ? "Today's puns ranked by AI score."
      : tab === "alltime"
        ? "The greatest puns ever submitted (7+/10), ranked by groans."
        : "Your gauntlet runs ranked by score.";

  const punEntries = tab === "today" ? (daily?.puns ?? []) : allTime;

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
        {daily && tab !== "gauntlet" && (
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
      ) : tab === "gauntlet" ? (
        gauntlet.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700">
            <p className="text-gray-400 dark:text-zinc-500 italic text-lg">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {gauntlet.map((entry, i) => (
              <GauntletLeaderboardRow
                key={entry.myRunId}
                rank={i + 1}
                entry={entry}
              />
            ))}
          </div>
        )
      ) : punEntries.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700">
          <p className="text-gray-400 dark:text-zinc-500 italic text-lg">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {punEntries.map((entry, i) => (
            <LeaderboardRow key={entry.id} rank={i + 1} entry={entry} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
