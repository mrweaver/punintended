/**
 * routes/profile.js — User profile endpoints.
 *
 * Fetches a user's pun history, updates custom display names (with
 * cascading broadcasts to groups, messages, puns, and typing status),
 * and toggles leaderboard anonymity.
 */
import { Router } from "express";
import { ensureAuthenticated, formatAuthUser, MAX_DISPLAY_NAME_LENGTH } from "../middleware/auth.js";
import {
  getEffectiveDisplayName,
  normalizeDisplayNameInput,
  getPunsByAuthor,
  updateCustomDisplayName,
  updateUserPrivacy,
  getGroupIdsByUser,
  getGroupById,
} from "../db/database.js";
import { getAESTDateId } from "../lib/date.js";
import {
  refreshTypingDisplayName,
  broadcastGroupUpdate,
  broadcastMessagesUpdate,
  broadcastPunsUpdate,
} from "../services/sse.js";

const router = Router();

router.get("/api/profile/puns", ensureAuthenticated, async (req, res) => {
  try {
    const puns = await getPunsByAuthor(req.user.id);
    res.json(puns);
  } catch (error) {
    console.error("Failed to get profile puns:", error);
    res.status(500).json({ error: "Failed to get profile puns" });
  }
});

router.put(
  "/api/profile/display-name",
  ensureAuthenticated,
  async (req, res) => {
    const rawDisplayName =
      typeof req.body?.displayName === "string" ? req.body.displayName : "";
    const normalizedDisplayName = normalizeDisplayNameInput(rawDisplayName);

    if ((normalizedDisplayName?.length ?? 0) > MAX_DISPLAY_NAME_LENGTH) {
      return res.status(400).json({
        error: `Display name too long (max ${MAX_DISPLAY_NAME_LENGTH} chars)`,
      });
    }

    try {
      const updatedUser = await updateCustomDisplayName(
        req.user.id,
        normalizedDisplayName,
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      refreshTypingDisplayName(
        req.user.id,
        getEffectiveDisplayName(updatedUser),
      );

      const groupIds = await getGroupIdsByUser(req.user.id);
      for (const groupId of groupIds) {
        const group = await getGroupById(groupId);
        if (!group) continue;

        await broadcastGroupUpdate(groupId);
        await broadcastMessagesUpdate(groupId);
      }

      // Broadcast puns update for today's challenge globally
      const todayId = getAESTDateId();
      await broadcastPunsUpdate(todayId);

      res.json({ user: formatAuthUser(updatedUser) });
    } catch (error) {
      console.error("Failed to update display name:", error);
      res.status(500).json({ error: "Failed to update display name" });
    }
  },
);

router.put("/api/profile/privacy", ensureAuthenticated, async (req, res) => {
  const anonymous = !!req.body?.anonymous;
  try {
    const updatedUser = await updateUserPrivacy(req.user.id, anonymous);
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: formatAuthUser(updatedUser) });
  } catch (error) {
    console.error("Failed to update privacy setting:", error);
    res.status(500).json({ error: "Failed to update privacy setting" });
  }
});

export default router;
