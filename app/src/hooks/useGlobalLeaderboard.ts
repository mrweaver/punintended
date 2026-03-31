import { useState, useEffect, useCallback } from "react";
import {
  leaderboardApi,
  type DailyLeaderboard,
  type LeaderboardEntry,
  type GauntletHistoryEntry,
} from "../api/client";

export function useGlobalLeaderboard() {
  const [daily, setDaily] = useState<DailyLeaderboard | null>(null);
  const [allTime, setAllTime] = useState<LeaderboardEntry[]>([]);
  const [gauntlet, setGauntlet] = useState<GauntletHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll().catch(console.error);
    const onFocus = () => fetchAll().catch(console.error);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAll]);

  return { daily, allTime, gauntlet, loading, refresh: fetchAll };
}
