import { useState, useEffect, useCallback } from "react";
import { messagesApi, type ChatMessage } from "../api/client";
import { createSSE } from "../api/sse";

export function useMessages(groupId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const fetchMessages = useCallback(async () => {
    if (!groupId) return;
    const data = await messagesApi.list(groupId);
    setMessages(data);
  }, [groupId]);

  useEffect(() => {
    if (!groupId) {
      setMessages([]);
      return;
    }
    fetchMessages().catch(console.error);
  }, [groupId, fetchMessages]);

  // SSE for message updates — re-fetch to include reactions
  useEffect(() => {
    if (!groupId) return;

    const cleanup = createSSE({
      url: `/api/groups/${groupId}/stream`,
      events: {
        "messages-update": () => {
          fetchMessages().catch(console.error);
        },
      },
    });

    return cleanup;
  }, [groupId, fetchMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!groupId) return;
      await messagesApi.send(groupId, text);
    },
    [groupId],
  );

  const reactToMessage = useCallback(
    async (messageId: string, reaction: string | null) => {
      // Optimistic update
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const oldReaction = msg.myReaction;
          const reactions = { ...(msg.reactions ?? {}) };
          if (oldReaction) {
            reactions[oldReaction] = Math.max(
              0,
              (reactions[oldReaction] ?? 0) - 1,
            );
            if (reactions[oldReaction] === 0) delete reactions[oldReaction];
          }
          if (reaction) {
            reactions[reaction] = (reactions[reaction] ?? 0) + 1;
          }
          return { ...msg, reactions, myReaction: reaction };
        }),
      );
      await messagesApi.react(messageId, reaction);
    },
    [],
  );

  return { messages, sendMessage, reactToMessage };
}
