import { useState, useEffect, useCallback, useRef } from 'react';
import { sessionsApi, type Session } from '../api/client';
import { createSSE } from '../api/sse';
import { useAuth } from '../contexts/AuthContext';

function getLocalDateId() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

export function useSession() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const autoRefreshedRef = useRef<string | null>(null); // tracks sessionId already auto-refreshed

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

  // Auto-refresh stale challenge when session is set (any player can trigger global challenge)
  useEffect(() => {
    if (!currentSession || !user) return;

    const today = getLocalDateId();
    const isStale = currentSession.challengeId && currentSession.challengeId < today;

    if (!isStale) return;

    if (autoRefreshedRef.current !== currentSession.id) {
      autoRefreshedRef.current = currentSession.id;
      setLoading(true);
      sessionsApi
        .refreshChallenge(currentSession.id, today)
        .then((updated) => {
          setCurrentSession(updated);
          setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [currentSession?.id, currentSession?.challengeId, user]);

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

  return {
    sessions,
    currentSession,
    loading,
    createNewSession,
    joinExistingSession,
    leaveSession,
    deleteExistingSession,
  };
}
