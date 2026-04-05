import { useState, useEffect, useCallback } from 'react';
import { notificationsApi, type AppNotification } from '../api/client';
import { createSSE } from '../api/sse';
import { useAuth } from '../contexts/AuthContext';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    notificationsApi.list().then(setNotifications).catch(console.error);
  }, [user]);

  // SSE for notification updates
  useEffect(() => {
    if (!user) return;

    const cleanup = createSSE({
      url: '/api/notifications/stream',
      events: {
        'notifications-update': (data: AppNotification[]) => setNotifications(data),
      },
    });

    return cleanup;
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (notifications.some((n) => !n.read)) {
      await notificationsApi.markAllRead();
    }
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, markAllRead };
}
