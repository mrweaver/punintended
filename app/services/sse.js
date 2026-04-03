/**
 * services/sse.js — Server-Sent Events and real-time state.
 *
 * Manages SSE client connections (groups, daily, notifications, gauntlet),
 * low- and high-level broadcast functions, ephemeral typing presence,
 * reaction enrichment, and the 30-second heartbeat interval.
 *
 * All in-memory Maps are private to this module. Route files interact
 * only through exported functions, making it the single swap-point for
 * a future Redis pub/sub backend.
 */
import {
  getGroupById,
  getMessagesByGroup,
  getNotificationsByUser,
  getMessageReactions,
} from "../db/database.js";
import { getAESTDateId } from "../lib/date.js";

// --- Client Maps ---
const groupClients = new Map(); // groupId -> Set<res>
const dailyClients = new Set(); // global daily challenge subscribers
const notificationClients = new Map(); // userId -> Set<res>
const gauntletClients = new Map(); // runId -> Set<res>

// Ephemeral typing presence store: groupId -> Map<userId, {name, photoURL, status, updatedAt}>
const typingStatus = new Map();

// --- Client Management ---

export function addGroupClient(groupId, res) {
  if (!groupClients.has(groupId)) groupClients.set(groupId, new Set());
  groupClients.get(groupId).add(res);
}

export function removeGroupClient(groupId, res) {
  const clients = groupClients.get(groupId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) groupClients.delete(groupId);
  }
}

export function addDailyClient(res) {
  dailyClients.add(res);
}

export function removeDailyClient(res) {
  dailyClients.delete(res);
}

export function addNotificationClient(userId, res) {
  if (!notificationClients.has(userId))
    notificationClients.set(userId, new Set());
  notificationClients.get(userId).add(res);
}

export function removeNotificationClient(userId, res) {
  const clients = notificationClients.get(userId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) notificationClients.delete(userId);
  }
}

export function addGauntletClient(runId, res) {
  if (!gauntletClients.has(runId)) gauntletClients.set(runId, new Set());
  gauntletClients.get(runId).add(res);
}

export function removeGauntletClient(runId, res) {
  const clients = gauntletClients.get(runId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) gauntletClients.delete(runId);
  }
}

// --- Low-level Broadcast ---

export function broadcastToGroup(groupId, event, data) {
  const clients = groupClients.get(groupId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected
    }
  }
}

export function broadcastToDaily(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of dailyClients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected
    }
  }
}

export function broadcastToGauntletRun(runId, event, data) {
  const clients = gauntletClients.get(runId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      removeGauntletClient(runId, client);
    }
  }
}

export function broadcastToUser(userId, event, data) {
  const clients = notificationClients.get(userId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected
    }
  }
}

// --- High-level Broadcast (fetch from DB then broadcast) ---

export async function broadcastGroupUpdate(groupId) {
  const group = await getGroupById(groupId);
  if (group) broadcastToGroup(groupId, "group-update", group);
}

export async function broadcastPunsUpdate(challengeId) {
  broadcastToDaily("puns-update", {
    challengeId,
    updatedAt: new Date().toISOString(),
  });
}

export async function broadcastMessagesUpdate(groupId) {
  const messages = await getMessagesByGroup(groupId);
  broadcastToGroup(groupId, "messages-update", messages);
}

export async function broadcastCommentsUpdate(challengeId) {
  const todayId = getAESTDateId();
  if (challengeId === todayId) {
    broadcastToDaily("comments-update", {
      challengeId,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function broadcastNotificationUpdate(userId) {
  const notifications = await getNotificationsByUser(userId);
  broadcastToUser(userId, "notifications-update", notifications);
}

export function broadcastTypingUpdate(groupId) {
  const statusMap = typingStatus.get(groupId);
  const data = statusMap
    ? Array.from(statusMap.entries()).map(([uid, info]) => ({
        uid: Number(uid),
        ...info,
      }))
    : [];
  broadcastToGroup(groupId, "typing-update", data);
}

// --- Typing Status ---

export function setTypingStatus(groupId, userId, name, photoURL, status) {
  if (!typingStatus.has(groupId)) typingStatus.set(groupId, new Map());
  typingStatus
    .get(groupId)
    .set(String(userId), { name, photoURL, status, updatedAt: Date.now() });
}

export function clearTypingStatus(groupId, userId) {
  typingStatus.get(groupId)?.delete(String(userId));
}

export function refreshTypingDisplayName(userId, name) {
  const userKey = String(userId);

  for (const [groupId, statusMap] of typingStatus.entries()) {
    const existing = statusMap.get(userKey);
    if (!existing) continue;

    statusMap.set(userKey, { ...existing, name });
    broadcastTypingUpdate(groupId);
  }
}

export function getTypingEntry(groupId, userId) {
  return typingStatus.get(groupId)?.get(String(userId));
}

// --- Reactions ---

export const ALLOWED_MESSAGE_REACTIONS = [
  "laughing",
  "skull",
  "thumbs_up",
  "groan",
  "heart",
];

export async function enrichWithReactions(items, messageType, viewerUserId) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id);
  const reactionsMap = await getMessageReactions(ids, messageType);
  return items.map((item) => {
    const data = reactionsMap[item.id];
    return {
      ...item,
      reactions: data?.counts ?? {},
      myReaction: data?.userReactions?.[viewerUserId] ?? null,
    };
  });
}

// --- Heartbeat ---

export function startHeartbeat() {
  setInterval(() => {
    for (const [, clients] of groupClients) {
      for (const client of clients) {
        try {
          client.write(":heartbeat\n\n");
        } catch {
          // Will be cleaned up on close
        }
      }
    }
    for (const client of dailyClients) {
      try {
        client.write(":heartbeat\n\n");
      } catch {
        // Will be cleaned up on close
      }
    }
    for (const [, clients] of notificationClients) {
      for (const client of clients) {
        try {
          client.write(":heartbeat\n\n");
        } catch {
          // Will be cleaned up on close
        }
      }
    }
    for (const [, clients] of gauntletClients) {
      for (const client of clients) {
        try {
          client.write(":heartbeat\n\n");
        } catch {
          // Will be cleaned up on close
        }
      }
    }
  }, 30000);
}
