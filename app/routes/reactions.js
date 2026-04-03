/**
 * routes/reactions.js — Message reaction endpoints.
 *
 * Handles setting/clearing reactions on chat messages, pun comments,
 * and gauntlet messages. Validates against the allowed reaction set
 * (laughing, skull, thumbs_up, groan, heart).
 */
import { Router } from "express";
import { ensureAuthenticated } from "../middleware/auth.js";
import { setMessageReaction } from "../db/database.js";
import { ALLOWED_MESSAGE_REACTIONS } from "../services/sse.js";

const router = Router();

router.post(
  "/api/messages/:id/reaction",
  ensureAuthenticated,
  async (req, res) => {
    const { reaction } = req.body;
    if (reaction !== null && !ALLOWED_MESSAGE_REACTIONS.includes(reaction))
      return res.status(400).json({ error: "Invalid reaction" });
    try {
      const result = await setMessageReaction(
        req.params.id,
        "chat",
        req.user.id,
        reaction,
      );
      res.json({ reaction: result });
    } catch (error) {
      console.error("Failed to set message reaction:", error);
      res.status(500).json({ error: "Failed to set reaction" });
    }
  },
);

router.post(
  "/api/comments/:id/reaction",
  ensureAuthenticated,
  async (req, res) => {
    const { reaction } = req.body;
    if (reaction !== null && !ALLOWED_MESSAGE_REACTIONS.includes(reaction))
      return res.status(400).json({ error: "Invalid reaction" });
    try {
      const result = await setMessageReaction(
        req.params.id,
        "pun_comment",
        req.user.id,
        reaction,
      );
      res.json({ reaction: result });
    } catch (error) {
      console.error("Failed to set comment reaction:", error);
      res.status(500).json({ error: "Failed to set reaction" });
    }
  },
);

router.post(
  "/api/gauntlet/messages/:id/reaction",
  ensureAuthenticated,
  async (req, res) => {
    const { reaction } = req.body;
    if (reaction !== null && !ALLOWED_MESSAGE_REACTIONS.includes(reaction))
      return res.status(400).json({ error: "Invalid reaction" });
    try {
      const result = await setMessageReaction(
        req.params.id,
        "gauntlet_message",
        req.user.id,
        reaction,
      );
      res.json({ reaction: result });
    } catch (error) {
      console.error("Failed to set gauntlet message reaction:", error);
      res.status(500).json({ error: "Failed to set reaction" });
    }
  },
);

export default router;
