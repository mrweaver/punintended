/**
 * routes/notifications.js — User notification endpoints.
 *
 * Lists a user's notifications, marks them as read, and provides the
 * per-user SSE stream for real-time notification delivery.
 */
import { Router } from "express";
import { ensureAuthenticated } from "../middleware/auth.js";
import {
  getNotificationsByUser,
  markNotificationRead,
} from "../db/database.js";
import {
  addNotificationClient,
  removeNotificationClient,
  broadcastNotificationUpdate,
} from "../services/sse.js";

const router = Router();

// SSE stream
router.get("/api/notifications/stream", ensureAuthenticated, (req, res) => {
  const userId = req.user.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("\n");

  addNotificationClient(userId, res);

  req.on("close", () => {
    removeNotificationClient(userId, res);
  });
});

router.get("/api/notifications", ensureAuthenticated, async (req, res) => {
  try {
    const notifications = await getNotificationsByUser(req.user.id);
    res.json(notifications);
  } catch (error) {
    console.error("Failed to get notifications:", error);
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

router.put(
  "/api/notifications/:id/read",
  ensureAuthenticated,
  async (req, res) => {
    try {
      await markNotificationRead(req.params.id);
      broadcastNotificationUpdate(req.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to mark notification:", error);
      res.status(500).json({ error: "Failed to mark notification" });
    }
  },
);

export default router;
