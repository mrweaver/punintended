import { useState, useEffect, useCallback } from 'react';
import { sessionsApi, type Session } from '../api/client';
import { createSSE } from '../api/sse';
import { useAuth } from '../contexts/AuthContext';

export function useSession() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Load sessions on mount
  useEffect(() => {
    if (!user) return;
    sessionsApi
      .list()
      .then((data) => {
        setSessions(data);

        // Restore session from URL or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const sessionIdFromUrl = urlParams.get('session');
        const savedSessionId = localStorage.getItem('pun_session_id');
        const targetId = sessionIdFromUrl || savedSessionId;

        if (targetId) {
          const found = data.find((s) => s.id === targetId);
          if (found) {
            setCurrentSession(found);
            // Auto-join if from URL
            if (sessionIdFromUrl && !found.players.some((p) => p.uid === user.uid)) {
              sessionsApi.join(found.id).catch(console.error);
            }
            if (sessionIdFromUrl) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } else {
            localStorage.removeItem('pun_session_id');
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  // SSE for current session
  useEffect(() => {
    if (!currentSession?.id) return;

    const cleanup = createSSE({
      url: `/api/sessions/${currentSession.id}/stream`,
      events: {
        'session-update': (data: Session) => {
          setCurrentSession(data);
          setSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)));
        },
        'session-deleted': () => {
          setCurrentSession(null);
          localStorage.removeItem('pun_session_id');
          setSessions((prev) => prev.filter((s) => s.id !== currentSession.id));
        },
      },
    });

    return cleanup;
  }, [currentSession?.id]);

  const createNewSession = useCallback(
    async (name: string) => {
      setLoading(true);
      try {
        const session = await sessionsApi.create(name);
        setSessions((prev) => [session, ...prev]);
        setCurrentSession(session);
        localStorage.setItem('pun_session_id', session.id);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const joinExistingSession = useCallback(async (session: Session) => {
    await sessionsApi.join(session.id).catch(() => {});
    const updated = await sessionsApi.list();
    setSessions(updated);
    const fresh = updated.find((s) => s.id === session.id) || session;
    setCurrentSession(fresh);
    localStorage.setItem('pun_session_id', session.id);
  }, []);

  const leaveSession = useCallback(() => {
    setCurrentSession(null);
    localStorage.removeItem('pun_session_id');
  }, []);

  const deleteExistingSession = useCallback(
    async (sessionId: string) => {
      await sessionsApi.delete(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        localStorage.removeItem('pun_session_id');
      }
    },
    [currentSession?.id]
  );

  const refreshChallenge = useCallback(async () => {
    if (!currentSession) return;
    setLoading(true);
    try {
      const updated = await sessionsApi.refreshChallenge(currentSession.id);
      setCurrentSession(updated);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  return {
    sessions,
    currentSession,
    loading,
    createNewSession,
    joinExistingSession,
    leaveSession,
    deleteExistingSession,
    refreshChallenge,
  };
}
