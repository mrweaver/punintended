import { useState, useCallback } from "react";
import { commentsApi, type PunComment } from "../api/client";

export function useComments() {
  const [commentsByPun, setCommentsByPun] = useState<
    Record<string, PunComment[]>
  >({});

  const loadCommentsForPun = useCallback(async (punId: string) => {
    const data = await commentsApi.list(punId);
    setCommentsByPun((prev) => ({ ...prev, [punId]: data }));
  }, []);

  const addComment = useCallback(
    async (punId: string, text: string) => {
      await commentsApi.add(punId, text);
      await loadCommentsForPun(punId);
    },
    [loadCommentsForPun],
  );

  const reactToComment = useCallback(
    async (commentId: string, punId: string, reaction: string | null) => {
      setCommentsByPun((prev) => {
        const punComments = prev[punId] || [];
        return {
          ...prev,
          [punId]: punComments.map((c) => {
            if (c.id !== commentId) return c;
            const oldReaction = c.myReaction;
            const reactions = { ...(c.reactions ?? {}) };
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
            return { ...c, reactions, myReaction: reaction };
          }),
        };
      });
      await commentsApi.react(commentId, reaction);
    },
    [],
  );

  const getCommentsForPun = useCallback(
    (punId: string) => {
      return commentsByPun[punId] || [];
    },
    [commentsByPun],
  );

  return {
    commentsByPun,
    loadCommentsForPun,
    addComment,
    reactToComment,
    getCommentsForPun,
  };
}
