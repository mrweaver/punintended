import { useState, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { leaderboardApi, type WeeklyScore, type Pun } from "../api/client";

interface Props {
  groupId: string;
  puns: Pun[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    weekStart: monday.toLocaleDateString("en-CA"),
    weekEnd: sunday.toLocaleDateString("en-CA"),
    days: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toLocaleDateString("en-CA");
    }),
  };
}

export function WeeklyLeaderboard({ groupId, puns }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [scores, setScores] = useState<WeeklyScore[]>([]);
  const [loading, setLoading] = useState(false);
  const { weekStart, weekEnd, days } = getWeekBounds();

  const fetchScores = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leaderboardApi.weekly(groupId, weekStart, weekEnd);
      setScores(data);
    } finally {
      setLoading(false);
    }
  }, [groupId, weekStart, weekEnd]);

  useEffect(() => {
    if (isOpen) fetchScores().catch(console.error);
  }, [isOpen, fetchScores, puns]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="flex items-center gap-2">📅 This Week</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform text-gray-400 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 dark:border-zinc-800 overflow-x-auto">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-6">Loading...</p>
          ) : scores.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-zinc-500 italic py-6">
              No scored puns this week yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-zinc-800">
                  <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-zinc-400 w-8">
                    #
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-zinc-400">
                    Player
                  </th>
                  {days.map((d, i) => (
                    <th
                      key={d}
                      className="px-2 py-2 font-medium text-gray-500 dark:text-zinc-400 text-center"
                    >
                      {DAY_LABELS[i]}
                    </th>
                  ))}
                  <th className="px-4 py-2 font-medium text-gray-500 dark:text-zinc-400 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {scores.map((row, i) => {
                  const dayEntries = days.map((d) => ({
                    date: d,
                    score: row.dailyScores[d] ?? null,
                  }));
                  const scored = dayEntries.filter((e) => e.score !== null);
                  const minScore =
                    scored.length > 0
                      ? Math.min(...scored.map((e) => e.score!))
                      : null;
                  const minDate =
                    scored.length > 1
                      ? scored.find((e) => e.score === minScore)?.date
                      : null;

                  return (
                    <tr
                      key={row.authorId}
                      className="border-b border-gray-50 dark:border-zinc-800/50 last:border-0"
                    >
                      <td className="px-4 py-3 text-gray-400 dark:text-zinc-500 font-mono text-xs">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={row.authorPhoto}
                            className="w-6 h-6 rounded-full"
                            alt={row.authorName}
                          />
                          <span className="font-medium text-gray-800 dark:text-zinc-200 truncate max-w-[80px]">
                            {row.authorName.split(" ")[0]}
                          </span>
                        </div>
                      </td>
                      {dayEntries.map(({ date, score }) => (
                        <td key={date} className="px-2 py-3 text-center">
                          {score !== null ? (
                            <span
                              className={`font-mono text-xs ${
                                date === minDate
                                  ? "line-through text-gray-400 dark:text-zinc-600"
                                  : "text-orange-600 dark:text-violet-400"
                              }`}
                            >
                              {score.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-200 dark:text-zinc-700">
                              –
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold font-mono text-sm text-orange-600 dark:text-violet-400">
                        {row.weekTotal.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
