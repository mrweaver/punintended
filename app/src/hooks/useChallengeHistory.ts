import { useState, useCallback } from "react";
import { punsApi, type Pun } from "../api/client";

/**
 * Simplified challenge history - loads puns for past dates.
 * Challenge history is no longer stored per-group; past challenges
 * can be browsed by date using the global daily puns API.
 */
export function useChallengeHistory(groupId?: string | null) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [punsByDate, setPunsByDate] = useState<Record<string, Pun[]>>({});
  const [loadingDate, setLoadingDate] = useState<string | null>(null);

  const toggleDate = useCallback(
    async (challengeId: string) => {
      const next = new Set(expandedDates);
      if (next.has(challengeId)) {
        next.delete(challengeId);
        setExpandedDates(next);
        return;
      }
      next.add(challengeId);
      setExpandedDates(next);

      // Load puns for this date if not already loaded
      if (!punsByDate[challengeId]) {
        setLoadingDate(challengeId);
        try {
          const result = await punsApi.list(challengeId, groupId || undefined);
          setPunsByDate((prev) => ({ ...prev, [challengeId]: result }));
        } catch (err) {
          console.error("Failed to load history puns:", err);
        } finally {
          setLoadingDate(null);
        }
      }
    },
    [expandedDates, punsByDate, groupId],
  );

  const reactPun = useCallback(
    async (punId: string, reaction: Parameters<typeof punsApi.react>[1]) => {
      await punsApi.react(punId, reaction);
    },
    [],
  );

  return {
    expandedDates,
    punsByDate,
    loadingDate,
    toggleDate,
    reactPun,
  };
}
