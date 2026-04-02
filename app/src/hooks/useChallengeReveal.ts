import { useCallback, useEffect, useMemo, useState } from "react";
import { dailyApi, type DailyChallenge } from "../api/client";
import { createSSE } from "../api/sse";

function parseServerTimestamp(raw: string | null | undefined): number | null {
  if (!raw) return null;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function persistRevealTimestamp(storageKey: string | null, timestamp: number | null) {
  if (!storageKey || typeof window === "undefined") return;

  if (timestamp === null) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, String(timestamp));
}

export function formatElapsedTime(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function formatRevealTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function useChallengeReveal(
  challenge?: Pick<DailyChallenge, "challengeId" | "revealedAt"> | null,
) {
  const challengeId = challenge?.challengeId ?? null;
  const storageKey = useMemo(() => {
    if (!challengeId) return null;
    return `pun-reveal:${challengeId}`;
  }, [challengeId]);

  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const updateRevealState = useCallback(
    (timestamp: number | null) => {
      setRevealedAt(timestamp);
      persistRevealTimestamp(storageKey, timestamp);
      if (timestamp !== null) {
        setNow(Date.now());
      }
    },
    [storageKey],
  );

  useEffect(() => {
    if (!storageKey) {
      setRevealedAt(null);
      return;
    }

    updateRevealState(parseServerTimestamp(challenge?.revealedAt));
  }, [storageKey, challenge?.revealedAt, updateRevealState]);

  const refreshReveal = useCallback(async () => {
    if (!challengeId) return;
    const refreshed = await dailyApi.getChallenge(challengeId);
    updateRevealState(parseServerTimestamp(refreshed.revealedAt));
  }, [challengeId, updateRevealState]);

  useEffect(() => {
    if (!revealedAt) return;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [revealedAt]);

  useEffect(() => {
    if (!challengeId) return;

    const handleFocus = () => {
      refreshReveal().catch(console.error);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshReveal().catch(console.error);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [challengeId, refreshReveal]);

  useEffect(() => {
    if (!challengeId) return;

    const cleanup = createSSE({
      url: "/api/notifications/stream",
      events: {
        "challenge-reveal-update": (data: {
          challengeId?: string;
          revealedAt?: string | null;
        }) => {
          if (data.challengeId !== challengeId) return;
          updateRevealState(parseServerTimestamp(data.revealedAt));
        },
      },
    });

    return cleanup;
  }, [challengeId, updateRevealState]);

  const revealChallenge = useCallback(async () => {
    if (!challengeId) return null;

    const response = await dailyApi.revealChallenge(challengeId);
    const timestamp = parseServerTimestamp(response.revealedAt);
    updateRevealState(timestamp);
    return timestamp;
  }, [challengeId, updateRevealState]);

  return {
    revealedAt,
    isRevealed: revealedAt !== null,
    elapsedMs: revealedAt ? Math.max(0, now - revealedAt) : 0,
    revealChallenge,
  };
}
