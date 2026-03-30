import { useState, useEffect, useCallback } from "react";
import {
  leaderboardApi,
  type DailyLeaderboard,
  type LeaderboardEntry,
} from "../api/client";

export function useGlobalLeaderboard() {
  const [daily, setDaily] = useState<DailyLeaderboard | null>(null);
  const [allTime, setAllTime] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dailyData, allTimeData] = await Promise.all([
        leaderboardApi.daily(),
        leaderboardApi.allTime(),
      ]);
      setDaily(dailyData);
      setAllTime(allTimeData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll().catch(console.error);
    const onFocus = () => fetchAll().catch(console.error);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAll]);

  return { daily, allTime, loading, refresh: fetchAll };
}
