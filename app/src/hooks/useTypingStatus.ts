import { useState, useEffect, useCallback, useRef } from "react";
import { sessionsApi, type TypingPlayer } from "../api/client";
import { createSSE } from "../api/sse";

export function useTypingStatus(sessionId: string | null) {
  const [typingPlayers, setTypingPlayers] = useState<TypingPlayer[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    return createSSE({
      url: `/api/sessions/${sessionId}/stream`,
      events: {
        "typing-update": (data: TypingPlayer[]) => setTypingPlayers(data),
      },
    });
  }, [sessionId]);

  const reportTyping = useCallback(
    (status: "typing" | "idle" | "submitted") => {
      if (!sessionId) return;
      sessionsApi.reportTyping(sessionId, status).catch(() => {});
    },
    [sessionId],
  );

  const onTextChange = useCallback(
    (hasText: boolean) => {
      if (!sessionId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (hasText) {
        reportTyping("typing");
        debounceRef.current = setTimeout(() => reportTyping("idle"), 8000);
      } else {
        reportTyping("idle");
      }
    },
    [sessionId, reportTyping],
  );

  return { typingPlayers, reportTyping, onTextChange };
}
