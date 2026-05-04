import { useState, useCallback } from "react";
import { punsApi, dailyApi, type Pun } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

/**
 * Simplified challenge history - loads puns for past dates.
 * Challenge history is no longer stored per-group; past challenges
 * can be browsed by date using the global daily puns API.
 */
export function useChallengeHistory(groupId?: string | null) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [punsByDate, setPunsByDate] = useState<Record<string, Pun[]>>({});
  const [challengesByDate, setChallengesByDate] = useState<Record<string, any>>({});
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const { user } = useAuth();

  const loadDate = useCallback(
    async (challengeId: string) => {
      setLoadingDate(challengeId);
      try {
        const [punsResult, challengeResult] = await Promise.all([
          punsApi.list(challengeId, groupId || undefined),
          dailyApi.getChallenge(challengeId),
        ]);
        setPunsByDate((prev) => ({ ...prev, [challengeId]: punsResult }));
        setChallengesByDate((prev) => ({
          ...prev,
          [challengeId]: challengeResult,
        }));
      } catch (err) {
        console.error("Failed to load history puns or challenge:", err);
      } finally {
        setLoadingDate(null);
      }
    },
    [groupId],
  );

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

      // Load puns and challenge metadata for this date if not already loaded
      if (!punsByDate[challengeId]) {
        await loadDate(challengeId);
      }
    },
    [expandedDates, punsByDate, loadDate],
  );

  const reactPun = useCallback(
    async (punId: string, reaction: Parameters<typeof punsApi.react>[1], dateId: string) => {
      // Optimistic update
      if (user) {
        setPunsByDate((prev) => {
          const puns = prev[dateId];
          if (!puns) return prev;

          const nextPuns = puns.map((pun) => {
            if (pun.id !== punId) return pun;
            
            const groaners = pun.groaners ? [...pun.groaners] : [];
            let newCount = pun.groanCount;
            
            const existingIndex = groaners.findIndex((g) => g.uid === user.uid);
            if (existingIndex !== -1) {
              groaners.splice(existingIndex, 1);
              newCount--;
            }
            
            if (reaction === "groan") {
              groaners.push({ uid: user.uid, name: user.displayName });
              newCount++;
            }
            
            return {
              ...pun,
              myReaction: reaction,
              groanCount: newCount,
              groaners,
            };
          });

          return { ...prev, [dateId]: nextPuns };
        });
      }

      try {
        await punsApi.react(punId, reaction);
      } catch (err) {
        console.error("Failed to react to history pun:", err);
        // Revert on failure
        await loadDate(dateId);
      }
    },
    [user, loadDate],
  );

  return {
    expandedDates,
    punsByDate,
    challengesByDate,
    loadingDate,
    toggleDate,
    refreshDate: loadDate,
    reactPun,
  };
}
