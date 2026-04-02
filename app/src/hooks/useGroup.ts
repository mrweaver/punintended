import { useState, useEffect, useCallback } from "react";
import { groupsApi, type Group } from "../api/client";
import { createSSE } from "../api/sse";
import { useAuth } from "../contexts/AuthContext";

export function useGroup() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  // Load groups on mount
  useEffect(() => {
    if (!user) return;
    groupsApi
      .list()
      .then((data) => {
        setGroups(data);

        // Restore group from URL or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const groupIdFromUrl =
          urlParams.get("session") || urlParams.get("group");
        const savedGroupId = localStorage.getItem("pun_session_id");
        const targetId = groupIdFromUrl || savedGroupId;

        if (targetId) {
          const found = data.find((g) => g.id === targetId);
          if (found) {
            setCurrentGroup(found);
            // Auto-join if from URL
            if (
              groupIdFromUrl &&
              !found.players.some((p) => p.uid === user.uid)
            ) {
              groupsApi.join(found.id).catch(console.error);
            }
            if (groupIdFromUrl) {
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname,
              );
            }
          } else {
            localStorage.removeItem("pun_session_id");
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  // SSE for current group
  useEffect(() => {
    if (!currentGroup?.id) return;

    const cleanup = createSSE({
      url: `/api/groups/${currentGroup.id}/stream`,
      events: {
        "group-update": (data: Group) => {
          setCurrentGroup(data);
          setGroups((prev) => prev.map((g) => (g.id === data.id ? data : g)));
        },
        "group-deleted": () => {
          setCurrentGroup(null);
          localStorage.removeItem("pun_session_id");
          setGroups((prev) => prev.filter((g) => g.id !== currentGroup.id));
        },
        "player-kicked": (data: { uid: number }) => {
          if (data.uid === user?.uid) {
            setCurrentGroup(null);
            localStorage.removeItem("pun_session_id");
          }
        },
      },
    });

    return cleanup;
  }, [currentGroup?.id]);

  const createNewGroup = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const group = await groupsApi.create(name);
      setGroups((prev) => [group, ...prev]);
      setCurrentGroup(group);
      localStorage.setItem("pun_session_id", group.id);
    } finally {
      setLoading(false);
    }
  }, []);

  const joinExistingGroup = useCallback(async (group: Group) => {
    await groupsApi.join(group.id).catch(() => {});
    const updated = await groupsApi.list();
    setGroups(updated);
    const fresh = updated.find((g) => g.id === group.id) || group;
    setCurrentGroup(fresh);
    localStorage.setItem("pun_session_id", group.id);
  }, []);

  const joinGroupById = useCallback(async (id: string) => {
    await groupsApi.join(id);
    const updated = await groupsApi.list();
    setGroups(updated);
    const fresh = updated.find((g) => g.id === id);
    if (fresh) {
      setCurrentGroup(fresh);
      localStorage.setItem("pun_session_id", fresh.id);
    }
  }, []);

  const leaveGroup = useCallback(() => {
    setCurrentGroup(null);
    localStorage.removeItem("pun_session_id");
  }, []);

  const deleteExistingGroup = useCallback(
    async (groupId: string) => {
      await groupsApi.delete(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (currentGroup?.id === groupId) {
        setCurrentGroup(null);
        localStorage.removeItem("pun_session_id");
      }
    },
    [currentGroup?.id],
  );

  const renameCurrentGroup = useCallback(
    async (groupId: string, name: string) => {
      const updated = await groupsApi.rename(groupId, name);
      setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setCurrentGroup(updated);
    },
    [],
  );

  const kickPlayer = useCallback(async (groupId: string, uid: number) => {
    await groupsApi.kickPlayer(groupId, uid);
  }, []);

  return {
    groups,
    currentGroup,
    loading,
    createNewGroup,
    joinExistingGroup,
    joinGroupById,
    leaveGroup,
    deleteExistingGroup,
    renameCurrentGroup,
    kickPlayer,
    // Backward compat aliases
    sessions: groups,
    currentSession: currentGroup,
  };
}
