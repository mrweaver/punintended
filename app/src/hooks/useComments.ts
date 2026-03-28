import { useState, useEffect, useCallback } from 'react';
import { commentsApi, type PunComment } from '../api/client';
import { createSSE } from '../api/sse';

export function useComments(sessionId: string | null) {
  const [comments, setComments] = useState<PunComment[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setComments([]);
      return;
    }
    // Load all comments for the session at once
    // The SSE will keep them up to date
  }, [sessionId]);

  // SSE for comment updates
  useEffect(() => {
    if (!sessionId) return;

    const cleanup = createSSE({
      url: `/api/sessions/${sessionId}/stream`,
      events: {
        'comments-update': (data: PunComment[]) => setComments(data),
      },
    });

    return cleanup;
  }, [sessionId]);

  const addComment = useCallback(
    async (punId: string, text: string) => {
      if (!sessionId) return;
      await commentsApi.add(punId, sessionId, text);
    },
    [sessionId]
  );

  const getCommentsForPun = useCallback(
    (punId: string) => {
      return comments.filter((c) => c.punId === punId);
    },
    [comments]
  );

  return { comments, addComment, getCommentsForPun };
}
