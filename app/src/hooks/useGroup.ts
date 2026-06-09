import { useState, useEffect, useCallback } from "react";
import { groupsApi, type Group } from "../api/client";
import { createSSE } from "../api/sse";
import { useAuth } from "../contexts/AuthContext";

const PENDING_GROUP_INTENT_KEY = "pun_pending_group_intent";

type PendingGroupIntent = {
  inviteToken: string | null;
  groupId: string | null;
};

function getIncomingGroupIntent(): PendingGroupIntent | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("invite");
  const groupId = params.get("session") || params.get("group");
  if (!inviteToken && !groupId) return null;
  return { inviteToken, groupId };
}

function readPendingGroupIntent(): PendingGroupIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_GROUP_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      inviteToken:
        typeof parsed?.inviteToken === "string" ? parsed.inviteToken : null,
      groupId: typeof parsed?.groupId === "string" ? parsed.groupId : null,
    };
  } catch {
    localStorage.removeItem(PENDING_GROUP_INTENT_KEY);
    return null;
  }
}

function writePendingGroupIntent(intent: PendingGroupIntent | null) {
  if (typeof window === "undefined") return;
  if (!intent?.inviteToken && !intent?.groupId) {
    localStorage.removeItem(PENDING_GROUP_INTENT_KEY);
    return;
  }
  localStorage.setItem(PENDING_GROUP_INTENT_KEY, JSON.stringify(intent));
}

export function useGroup() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const incomingIntent = getIncomingGroupIntent();
    if (incomingIntent) writePendingGroupIntent(incomingIntent);
  }, []);

  // Load groups on mount
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function hydrateGroups() {
      setLoading(true);

      const incomingIntent = getIncomingGroupIntent();
      const pendingIntent = incomingIntent ?? readPendingGroupIntent();
      const savedGroupId = localStorage.getItem("pun_session_id");
      let targetGroupId = pendingIntent?.groupId || savedGroupId;
      let shouldClearUrl = !!incomingIntent;

      if (pendingIntent?.inviteToken) {
        try {
          const joinedGroup = await groupsApi.acceptInvite(pendingIntent.inviteToken);
          targetGroupId = joinedGroup.id;
          writePendingGroupIntent(null);
        } catch (error) {
          console.error("Failed to accept pending invite:", error);
          writePendingGroupIntent(null);
        }
      }

      try {
        let data = await groupsApi.list();
        if (cancelled) return;

        if (pendingIntent?.groupId) {
          const foundFromIntent = data.find((group) => group.id === pendingIntent.groupId);
          if (
            foundFromIntent &&
            !foundFromIntent.players.some((player) => player.uid === user.uid)
          ) {
            await groupsApi.join(foundFromIntent.id);
            data = await groupsApi.list();
            if (cancelled) return;
          }

          writePendingGroupIntent(null);
        }

        setGroups(data);

        if (targetGroupId) {
          const found = data.find((group) => group.id === targetGroupId);
          if (found) {
            setCurrentGroup(found);
            localStorage.setItem("pun_session_id", found.id);
          } else {
            localStorage.removeItem("pun_session_id");
          }
        }

        if (shouldClearUrl) {
          window.history.replaceState({}, document.title, "/");
        }
      } catch (error) {
        console.error("Failed to load groups:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    hydrateGroups();

    return () => {
      cancelled = true;
    };
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
