import { useState, useEffect, useCallback, useRef } from "react";
import { groupsApi, type TypingPlayer } from "../api/client";
import { createSSE } from "../api/sse";

export function useTypingStatus(groupId: string | null) {
  const [typingPlayers, setTypingPlayers] = useState<TypingPlayer[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!groupId) return;
    return createSSE({
      url: `/api/groups/${groupId}/stream`,
      events: {
        "typing-update": (data: TypingPlayer[]) => setTypingPlayers(data),
      },
    });
  }, [groupId]);

  const reportTyping = useCallback(
    (status: "typing" | "idle" | "submitted") => {
      if (!groupId) return;
      groupsApi.reportTyping(groupId, status).catch(() => {});
    },
    [groupId],
  );

  const onTextChange = useCallback(
    (hasText: boolean) => {
      if (!groupId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (hasText) {
        reportTyping("typing");
        debounceRef.current = setTimeout(() => reportTyping("idle"), 8000);
      } else {
        reportTyping("idle");
      }
    },
    [groupId, reportTyping],
  );

  return { typingPlayers, reportTyping, onTextChange };
}
