import { useState, useEffect, useCallback } from 'react';
import { messagesApi, type ChatMessage } from '../api/client';
import { createSSE } from '../api/sse';

export function useMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    messagesApi.list(sessionId).then(setMessages).catch(console.error);
  }, [sessionId]);

  // SSE for message updates
  useEffect(() => {
    if (!sessionId) return;

    const cleanup = createSSE({
      url: `/api/sessions/${sessionId}/stream`,
      events: {
        'messages-update': (data: ChatMessage[]) => setMessages(data),
      },
    });

    return cleanup;
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId) return;
      await messagesApi.send(sessionId, text);
    },
    [sessionId]
  );

  return { messages, sendMessage };
}
