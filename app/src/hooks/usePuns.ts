import { useState, useEffect, useCallback, useMemo } from "react";
import { punsApi, type Pun, type PunReaction } from "../api/client";
import { createSSE } from "../api/sse";

export type PunSortMode = "unviewed" | "top" | "new";

export function getPunScore(pun: Pun) {
  return pun.aiScore || 0;
}

export function usePuns(
  challengeId: string,
  viewerId?: number,
  groupId?: string | null,
) {
  const [puns, setPuns] = useState<Pun[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sortMode, setSortMode] = useState<PunSortMode>("unviewed");
  const viewedStorageKey = useMemo(() => {
    if (!challengeId || !viewerId) return null;
    return `pun-viewed:${challengeId}:${viewerId}`;
  }, [challengeId, viewerId]);

  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!viewedStorageKey) {
      setViewedIds(new Set());
      return;
    }

    try {
      const raw = localStorage.getItem(viewedStorageKey);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setViewedIds(new Set(parsed));
    } catch {
      setViewedIds(new Set());
    }
  }, [viewedStorageKey]);

  const persistViewedIds = useCallback(
    (next: Set<string>) => {
      if (!viewedStorageKey) return;
      localStorage.setItem(viewedStorageKey, JSON.stringify(Array.from(next)));
    },
    [viewedStorageKey],
  );

  const fetchPuns = useCallback(async () => {
    if (!challengeId) {
      setPuns([]);
      return;
    }

    const result = await punsApi.list(challengeId, groupId || undefined);
    setPuns(result);
  }, [challengeId, groupId]);

  // Fetch initial puns
  useEffect(() => {
    fetchPuns().catch(console.error);
  }, [fetchPuns]);

  // SSE for pun updates (global daily stream)
  useEffect(() => {
    if (!challengeId) return;

    const cleanup = createSSE({
      url: `/api/daily/stream`,
      events: {
        "puns-update": () => {
          fetchPuns().catch(console.error);
        },
        "comments-update": () => {
          // Comments updated; pun hooks don't need to react but other hooks might
        },
      },
    });

    return cleanup;
  }, [challengeId, fetchPuns]);

  // Count unviewed puns for badge display
  const unviewedCount = useMemo(
    () => puns.filter((p) => !viewedIds.has(p.id)).length,
    [puns, viewedIds],
  );

  const sortedPuns = useMemo(() => {
    const decoratedPuns = puns.map((pun) => ({
      ...pun,
      viewed: viewedIds.has(pun.id),
    }));

    return [...decoratedPuns].sort((a, b) => {
      const timeSort =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

      if (sortMode === "new") return timeSort;

      const scoreDiff = getPunScore(b) - getPunScore(a);
      if (sortMode === "top") {
        if (scoreDiff !== 0) return scoreDiff;
        return timeSort;
      }

      // 'unviewed': unread floats to top, then by score, then by time
      if (Boolean(a.viewed) !== Boolean(b.viewed)) {
        return a.viewed ? 1 : -1;
      }
      if (scoreDiff !== 0) return scoreDiff;
      return timeSort;
    });
  }, [puns, sortMode, viewedIds]);

  const submitPun = useCallback(
    async (text: string, responseTimeMs?: number | null) => {
      if (!challengeId) return;
      setSubmitting(true);
      try {
        await punsApi.submit(text, responseTimeMs ?? null);
      } finally {
        setSubmitting(false);
      }
    },
    [challengeId],
  );

  const editPun = useCallback(async (punId: string, text: string) => {
    setSubmitting(true);
    try {
      await punsApi.edit(punId, text);
    } finally {
      setSubmitting(false);
    }
  }, []);

  const deletePun = useCallback(async (punId: string) => {
    await punsApi.delete(punId);
  }, []);

  const reactPun = useCallback(
    async (punId: string, reaction: PunReaction | null) => {
      await punsApi.react(punId, reaction);
    },
    [],
  );

  const markPunViewed = useCallback(
    (punId: string) => {
      setViewedIds((prev) => {
        if (prev.has(punId)) return prev;
        const next = new Set(prev);
        next.add(punId);
        persistViewedIds(next);
        return next;
      });
    },
    [persistViewedIds],
  );

  return {
    puns: sortedPuns,
    unviewedCount,
    sortMode,
    setSortMode,
    submitting,
    submitPun,
    editPun,
    deletePun,
    reactPun,
    markPunViewed,
  };
}
