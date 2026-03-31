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

  const reactToComment = useCallback(
    async (commentId: string, reaction: string | null) => {
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c;
          const oldReaction = c.myReaction;
          const reactions = { ...(c.reactions ?? {}) };
          if (oldReaction) {
            reactions[oldReaction] = Math.max(0, (reactions[oldReaction] ?? 0) - 1);
            if (reactions[oldReaction] === 0) delete reactions[oldReaction];
          }
          if (reaction) {
            reactions[reaction] = (reactions[reaction] ?? 0) + 1;
          }
          return { ...c, reactions, myReaction: reaction };
        }),
      );
      await commentsApi.react(commentId, reaction);
    },
    [],
  );

  const getCommentsForPun = useCallback(
    (punId: string) => {
      return comments.filter((c) => c.punId === punId);
    },
    [comments]
  );

  return { comments, addComment, reactToComment, getCommentsForPun };
}
