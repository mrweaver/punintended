import { useState, useEffect, useCallback } from 'react';
import { messagesApi, type ChatMessage } from '../api/client';
import { createSSE } from '../api/sse';

export function useMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const fetchMessages = useCallback(async () => {
    if (!sessionId) return;
    const data = await messagesApi.list(sessionId);
    setMessages(data);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    fetchMessages().catch(console.error);
  }, [sessionId, fetchMessages]);

  // SSE for message updates — re-fetch to include reactions
  useEffect(() => {
    if (!sessionId) return;

    const cleanup = createSSE({
      url: `/api/sessions/${sessionId}/stream`,
      events: {
        'messages-update': () => {
          fetchMessages().catch(console.error);
        },
      },
    });

    return cleanup;
  }, [sessionId, fetchMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId) return;
      await messagesApi.send(sessionId, text);
    },
    [sessionId]
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
            reactions[oldReaction] = Math.max(0, (reactions[oldReaction] ?? 0) - 1);
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
