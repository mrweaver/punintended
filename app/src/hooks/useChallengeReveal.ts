import { useCallback, useEffect, useMemo, useState } from "react";

function parseStoredTimestamp(raw: string | null): number | null {
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

export function useChallengeReveal(challengeId?: string | null) {
  const storageKey = useMemo(() => {
    if (!challengeId) return null;
    return `pun-reveal:${challengeId}`;
  }, [challengeId]);

  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setRevealedAt(null);
      return;
    }

    setRevealedAt(
      parseStoredTimestamp(window.localStorage.getItem(storageKey)),
    );
  }, [storageKey]);

  useEffect(() => {
    if (!revealedAt) return;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [revealedAt]);

  const revealChallenge = useCallback(() => {
    if (!storageKey || typeof window === "undefined") return null;

    const timestamp = Date.now();
    window.localStorage.setItem(storageKey, String(timestamp));
    setRevealedAt(timestamp);
    setNow(timestamp);
    return timestamp;
  }, [storageKey]);

  return {
    revealedAt,
    isRevealed: revealedAt !== null,
    elapsedMs: revealedAt ? Math.max(0, now - revealedAt) : 0,
    revealChallenge,
  };
}
