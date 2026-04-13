/**
 * routes/groups.js — Group management, messaging, and typing presence.
 *
 * CRUD for groups (create, join, rename, delete, kick), the group SSE
 * stream, group chat messages with reaction enrichment, and ephemeral
 * typing status with 10-second auto-expiry.
 */
import { Router } from "express";
import { ensureAuthenticated } from "../middleware/auth.js";
import {
  getEffectiveDisplayName,
  getAllGroups,
  getGroupById,
  createGroup,
  joinGroup,
  deleteGroup,
  renameGroup,
  removePlayerFromGroup,
  getMessagesByGroup,
  createMessage,
} from "../db/database.js";
import {
  addGroupClient,
  removeGroupClient,
  broadcastToGroup,
  broadcastGroupUpdate,
  broadcastMessagesUpdate,
  broadcastTypingUpdate,
  setTypingStatus,
  clearTypingStatus,
  getTypingEntry,
  enrichWithReactions,
} from "../services/sse.js";

const router = Router();

// SSE stream
router.get("/api/groups/:id/stream", ensureAuthenticated, (req, res) => {
  const groupId = req.params.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("\n");

  addGroupClient(groupId, res);

  req.on("close", () => {
    removeGroupClient(groupId, res);
  });
});

// Group CRUD
router.get("/api/groups", ensureAuthenticated, async (req, res) => {
  try {
    const groups = await getAllGroups();
    res.json(groups);
  } catch (error) {
    console.error("Failed to get groups:", error);
    res.status(500).json({ error: "Failed to get groups" });
  }
});

router.post("/api/groups", ensureAuthenticated, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: "Group name required" });

  try {
    const group = await createGroup(name.trim(), req.user.id);
    const fullGroup = await getGroupById(group.id);
    res.json(fullGroup);
  } catch (error) {
    console.error("Failed to create group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
});

router.post("/api/groups/:id/join", ensureAuthenticated, async (req, res) => {
  try {
    await joinGroup(req.params.id, req.user.id);
    const group = await getGroupById(req.params.id);
    broadcastGroupUpdate(req.params.id);
    res.json(group);
  } catch (error) {
    console.error("Failed to join group:", error);
    res.status(500).json({ error: "Failed to join group" });
  }
});

router.delete("/api/groups/:id", ensureAuthenticated, async (req, res) => {
  try {
    const group = await getGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.ownerId !== req.user.id)
      return res.status(403).json({ error: "Only the owner can delete" });

    await deleteGroup(req.params.id);
    broadcastToGroup(req.params.id, "group-deleted", { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete group:", error);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

router.patch("/api/groups/:id", ensureAuthenticated, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: "Name required" });
  try {
    const group = await getGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.ownerId !== req.user.id)
      return res.status(403).json({ error: "Only the owner can rename" });
    await renameGroup(req.params.id, name.trim());
    broadcastGroupUpdate(req.params.id);
    const updated = await getGroupById(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error("Failed to rename group:", error);
    res.status(500).json({ error: "Failed to rename group" });
  }
});

router.delete(
  "/api/groups/:id/players/:uid",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const group = await getGroupById(req.params.id);
      if (!group) return res.status(404).json({ error: "Group not found" });
      if (group.ownerId !== req.user.id)
        return res
          .status(403)
          .json({ error: "Only the owner can kick players" });
      const targetUid = parseInt(req.params.uid, 10);
      if (targetUid === req.user.id)
        return res.status(400).json({ error: "Cannot kick yourself" });
      await removePlayerFromGroup(req.params.id, targetUid);
      broadcastToGroup(req.params.id, "player-kicked", { uid: targetUid });
      broadcastGroupUpdate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to kick player:", error);
      res.status(500).json({ error: "Failed to kick player" });
    }
  },
);

// Typing
router.post("/api/groups/:id/typing", ensureAuthenticated, (req, res) => {
  const { status } = req.body;
  const groupId = req.params.id;
  const { id: userId, photo_url: photoURL } = req.user;
  const name = getEffectiveDisplayName(req.user);

  if (status === "idle") {
    clearTypingStatus(groupId, userId);
  } else if (status === "typing" || status === "submitted") {
    setTypingStatus(groupId, userId, name, photoURL, status);
    if (status === "typing") {
      const updatedAt = Date.now();
      setTimeout(() => {
        const entry = getTypingEntry(groupId, userId);
        if (
          entry &&
          entry.status === "typing" &&
          entry.updatedAt === updatedAt
        ) {
          clearTypingStatus(groupId, userId);
          broadcastTypingUpdate(groupId);
        }
      }, 10000);
    }
  } else {
    return res.status(400).json({ error: "Invalid status" });
  }

  broadcastTypingUpdate(groupId);
  res.json({ success: true });
});

// Messages
router.get(
  "/api/groups/:id/messages",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const messages = await getMessagesByGroup(req.params.id);
      const enriched = await enrichWithReactions(messages, "chat", req.user.id);
      res.json(enriched);
    } catch (error) {
      console.error("Failed to get messages:", error);
      res.status(500).json({ error: "Failed to get messages" });
    }
  },
);

router.post(
  "/api/groups/:id/messages",
  ensureAuthenticated,
  async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim())
      return res.status(400).json({ error: "Message text required" });
    if (text.length > 500)
      return res.status(400).json({ error: "Message too long" });

    try {
      await createMessage(req.params.id, req.user.id, text.trim());
      broadcastMessagesUpdate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to send message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  },
);

export default router;
