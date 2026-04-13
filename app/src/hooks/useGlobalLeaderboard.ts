import { useState, useEffect, useCallback } from "react";
import {
  leaderboardApi,
  type DailyLeaderboard,
  type LeaderboardEntry,
  type GauntletHistoryEntry,
  type AuthUser,
} from "../api/client";

export function useGlobalLeaderboard() {
  const [daily, setDaily] = useState<DailyLeaderboard | null>(null);
  const [allTime, setAllTime] = useState<LeaderboardEntry[]>([]);
  const [gauntlet, setGauntlet] = useState<GauntletHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const [dailyData, allTimeData, gauntletData] = await Promise.all([
        leaderboardApi.daily(),
        leaderboardApi.allTime(),
        leaderboardApi.gauntlet(),
      ]);
      setDaily(dailyData);
      setAllTime(allTimeData);
      setGauntlet(gauntletData);
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll().catch(console.error);
    const onFocus = () => fetchAll(true).catch(console.error);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAll]);

  const optimisticUpdateReact = useCallback(
    (punId: string, newReaction: "groan" | null, user: AuthUser | null) => {
      if (!user) return;
      const updateEntries = (entries: LeaderboardEntry[]) =>
        entries.map((entry) => {
          if (entry.id !== punId) return entry;

          const groaners = entry.groaners ? [...entry.groaners] : [];
          let newCount = entry.groanCount;
          
          // Remove if existed
          const existingIndex = groaners.findIndex((g) => g.uid === user.uid);
          if (existingIndex !== -1) {
            groaners.splice(existingIndex, 1);
            newCount--;
          }
          
          if (newReaction === "groan") {
            groaners.push({ uid: user.uid, name: user.displayName });
            newCount++;
          }
          
          return {
            ...entry,
            myReaction: newReaction,
            groanCount: newCount,
            groaners,
          };
        });

      setAllTime((prev) => updateEntries(prev));
      setDaily((prev) => (prev ? { ...prev, puns: updateEntries(prev.puns) } : null));
    },
    [],
  );

  return { daily, allTime, gauntlet, loading, refresh: fetchAll, optimisticUpdateReact };
}
