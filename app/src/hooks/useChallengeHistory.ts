import { useState, useEffect, useCallback } from 'react';
import { sessionsApi, punsApi, type ChallengeHistoryEntry, type Pun } from '../api/client';

const DEFAULT_REACTIONS = {
  clever: 0,
  laugh: 0,
  groan: 0,
  fire: 0,
  wild: 0,
};

export function useChallengeHistory(sessionId: string | null, challengeId?: string | null) {
  const [history, setHistory] = useState<ChallengeHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [punsByDate, setPunsByDate] = useState<Record<string, Pun[]>>({});
  const [loadingDate, setLoadingDate] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    sessionsApi
      .history(sessionId)
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  }, [sessionId, challengeId]);

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
      if (!punsByDate[challengeId] && sessionId) {
        setLoadingDate(challengeId);
        try {
          const result = await punsApi.list(sessionId, challengeId);
          setPunsByDate((prev) => ({
            ...prev,
            [challengeId]: result.map((pun) => ({
              ...pun,
              reactions: pun.reactions || DEFAULT_REACTIONS,
              reactionTotal: pun.reactionTotal || 0,
            })),
          }));
        } catch (err) {
          console.error('Failed to load history puns:', err);
        } finally {
          setLoadingDate(null);
        }
      }
    },
    [expandedDates, punsByDate, sessionId]
  );

  const reactPun = useCallback(async (punId: string, reaction: Parameters<typeof punsApi.react>[1]) => {
    await punsApi.react(punId, reaction);
  }, []);

  return {
    history,
    loadingHistory,
    expandedDates,
    punsByDate,
    loadingDate,
    toggleDate,
    reactPun,
  };
}
