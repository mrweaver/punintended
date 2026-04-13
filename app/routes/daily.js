/**
 * routes/daily.js — Daily challenge, puns, and comments.
 *
 * Handles the global daily challenge lifecycle (get/reveal), pun CRUD
 * with blind-gate logic and async AI scoring, pun reactions with
 * notifications, pun comments, and the daily SSE stream.
 */
import { Router } from "express";
import { ensureAuthenticated } from "../middleware/auth.js";
import {
  getEffectiveDisplayName,
  getChallengeReveal,
  createChallengeReveal,
  hasUserSubmittedForChallenge,
  getPunsForChallenge,
  getPunsForChallengeByGroup,
  createPun,
  updatePunText,
  updatePunScore,
  deletePun,
  getPunById,
  setPunReaction,
  countPunsByAuthorForChallenge,
  getGlobalChallengeForDate,
  getCommentsByPun,
  createComment,
  createNotification,
} from "../db/database.js";
import {
  getAESTDateId,
  isPlausibleLocalDate,
  getRevealElapsedMs,
} from "../lib/date.js";
import { getActivePunJudgeDefinition } from "../lib/aiJudges.js";
import { getOrCreateGlobalChallenge, scorePunText } from "../services/ai.js";
import { maybeRefillBuffer } from "../services/buffer.js";
import {
  addDailyClient,
  removeDailyClient,
  broadcastToUser,
  broadcastPunsUpdate,
  broadcastCommentsUpdate,
  broadcastNotificationUpdate,
  enrichWithReactions,
} from "../services/sse.js";

const router = Router();

function buildRouteFallbackJudgement(feedback, reasoning) {
  const judge = getActivePunJudgeDefinition();

  return {
    score: 0,
    feedback,
    reasoning,
    judgeKey: judge.key,
    judgeName: judge.name,
    judgeVersion: judge.version,
    judgeModel: judge.model,
    judgePromptHash: judge.promptHash,
    judgeStatus: judge.status,
    isActive: judge.isActive,
    status: "completed",
    errorMessage: reasoning,
  };
}

// SSE stream
router.get("/api/daily/stream", ensureAuthenticated, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("\n");

  addDailyClient(res);

  req.on("close", () => {
    removeDailyClient(res);
  });
});

// Daily Challenge
router.get("/api/daily/challenge", ensureAuthenticated, async (req, res) => {
  try {
    const { localDateId } = req.query;
    const dateId =
      localDateId && isPlausibleLocalDate(localDateId)
        ? localDateId
        : getAESTDateId();
    const challenge = await getOrCreateGlobalChallenge(dateId);
    const reveal = await getChallengeReveal(dateId, req.user.id);
    res.json({
      challengeId: dateId,
      ...challenge,
      revealedAt: reveal?.revealedAt ?? null,
    });
    // Async: top up the buffer if it's running low
    maybeRefillBuffer().catch((err) =>
      console.error("[Daily] Async buffer refill failed:", err.message),
    );
  } catch (error) {
    console.error("Failed to get daily challenge:", error);
    res.status(500).json({ error: "Failed to get daily challenge" });
  }
});

router.post(
  "/api/daily/challenge/reveal",
  ensureAuthenticated,
  async (req, res) => {
    const challengeId =
      typeof req.body?.challengeId === "string" ? req.body.challengeId : "";

    if (!isPlausibleLocalDate(challengeId)) {
      return res.status(400).json({ error: "Invalid challenge id" });
    }

    try {
      await getOrCreateGlobalChallenge(challengeId);
      const reveal = await createChallengeReveal(challengeId, req.user.id);

      if (!reveal) {
        return res.status(500).json({ error: "Failed to reveal challenge" });
      }

      broadcastToUser(req.user.id, "challenge-reveal-update", {
        challengeId,
        revealedAt: reveal.revealedAt,
      });

      res.json({ challengeId, revealedAt: reveal.revealedAt });
    } catch (error) {
      console.error("Failed to reveal daily challenge:", error);
      res.status(500).json({ error: "Failed to reveal daily challenge" });
    }
  },
);

// Puns
router.get("/api/daily/puns", ensureAuthenticated, async (req, res) => {
  try {
    const today = getAESTDateId();
    const challengeId = req.query.challengeId || today;
    const groupId = req.query.groupId || null;

    let puns;
    if (groupId) {
      puns = await getPunsForChallengeByGroup(
        challengeId,
        groupId,
        req.user.id,
      );
    } else {
      puns = await getPunsForChallenge(challengeId, req.user.id);
    }

    // Blind gate: for today's challenge, hide other players' puns until user submits
    if (challengeId === today) {
      const submitted = await hasUserSubmittedForChallenge(
        challengeId,
        req.user.id,
      );
      if (!submitted) {
        return res.json(puns.filter((p) => p.authorId === req.user.id));
      }
    }

    res.json(puns);
  } catch (error) {
    console.error("Failed to get puns:", error);
    res.status(500).json({ error: "Failed to get puns" });
  }
});

router.post("/api/daily/puns", ensureAuthenticated, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ error: "Pun text required" });
  if (text.length > 500)
    return res.status(400).json({ error: "Pun too long (max 500 chars)" });

  try {
    const todayId = getAESTDateId();
    const targetChallengeId =
      req.body.challengeId && isPlausibleLocalDate(req.body.challengeId)
        ? req.body.challengeId
        : todayId;

    const challenge = await getOrCreateGlobalChallenge(targetChallengeId);
    let canonicalResponseTimeMs = null;

    if (targetChallengeId === todayId) {
      const reveal = await getChallengeReveal(todayId, req.user.id);

      if (!reveal) {
        return res.status(403).json({
          error: "Reveal today's challenge before submitting a pun.",
        });
      }
      canonicalResponseTimeMs = getRevealElapsedMs(reveal.revealedAt);
    }

    // Hard cap: 3 submissions per player per day (global)
    const myCount = await countPunsByAuthorForChallenge(
      targetChallengeId,
      req.user.id,
    );
    if (myCount >= 3) {
      return res.status(429).json({
        error: "You've used all 3 of your submissions for this challenge.",
      });
    }

    const pun = await createPun(
      targetChallengeId,
      req.user.id,
      text.trim(),
      canonicalResponseTimeMs,
    );
    broadcastPunsUpdate(targetChallengeId);

    // Score asynchronously
    scorePunText(challenge.topic, challenge.focus, text.trim())
      .then(async (result) => {
        console.log(`[Pun ID: ${pun.id}] AI Reasoning: ${result.reasoning}`);
        await updatePunScore(pun.id, result, { triggerType: "initial" });
        broadcastPunsUpdate(targetChallengeId);
      })
      .catch(async (err) => {
        console.error("AI scoring failed:", err);
        await updatePunScore(
          pun.id,
          buildRouteFallbackJudgement(
            "The judge fell asleep at the bar. Please edit and resubmit!",
            "Route-level scoring failure during initial pun submission.",
          ),
          { triggerType: "initial" },
        );
        broadcastPunsUpdate(targetChallengeId);
      });

    res.json({ id: pun.id });
  } catch (error) {
    console.error("Failed to submit pun:", error);
    res.status(500).json({ error: "Failed to submit pun" });
  }
});

router.put("/api/puns/:id", ensureAuthenticated, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ error: "Pun text required" });

  try {
    const pun = await getPunById(req.params.id);
    if (!pun) return res.status(404).json({ error: "Pun not found" });
    if (pun.author_id !== req.user.id)
      return res.status(403).json({ error: "Only the author can edit" });

    await updatePunText(req.params.id, text.trim());
    broadcastPunsUpdate(pun.challenge_id);

    // Re-score
    const challenge = await getGlobalChallengeForDate(pun.challenge_id);
    if (challenge) {
      scorePunText(challenge.topic, challenge.focus, text.trim())
        .then(async (result) => {
          await updatePunScore(req.params.id, result, {
            triggerType: "edit_rescore",
          });
          broadcastPunsUpdate(pun.challenge_id);
        })
        .catch(async (err) => {
          console.error("AI re-scoring failed:", err);
          await updatePunScore(
            req.params.id,
            buildRouteFallbackJudgement(
              "The judge nodded off mid-revision. Try editing again shortly.",
              "Route-level scoring failure during pun re-score.",
            ),
            { triggerType: "edit_rescore" },
          );
          broadcastPunsUpdate(pun.challenge_id);
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to edit pun:", error);
    res.status(500).json({ error: "Failed to edit pun" });
  }
});

router.delete("/api/puns/:id", ensureAuthenticated, async (req, res) => {
  try {
    const pun = await getPunById(req.params.id);
    if (!pun) return res.status(404).json({ error: "Pun not found" });
    if (pun.author_id !== req.user.id)
      return res.status(403).json({ error: "Only the author can delete" });

    const { challenge_id } = pun;
    await deletePun(req.params.id);
    broadcastPunsUpdate(challenge_id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete pun:", error);
    res.status(500).json({ error: "Failed to delete pun" });
  }
});

router.post("/api/puns/:id/reaction", ensureAuthenticated, async (req, res) => {
  const { reaction } = req.body;

  // Only "groan" is accepted; null/undefined clears the reaction
  if (reaction !== null && reaction !== undefined && reaction !== "groan") {
    return res.status(400).json({ error: "Invalid reaction" });
  }

  try {
    const pun = await getPunById(req.params.id);
    if (!pun) return res.status(404).json({ error: "Pun not found" });

    const selectedReaction = await setPunReaction(
      req.params.id,
      req.user.id,
      reaction || null,
    );

    // Notify pun author when someone groans at their pun (positive in this game)
    if (selectedReaction && pun.author_id !== req.user.id) {
      const punText =
        pun.text.length > 30 ? pun.text.substring(0, 30) + "..." : pun.text;
      await createNotification(
        pun.author_id,
        "reaction",
        `${getEffectiveDisplayName(req.user)} groaned at your pun: "${punText}"`,
        null,
      );
      broadcastNotificationUpdate(pun.author_id);
    }

    broadcastPunsUpdate(pun.challenge_id);
    res.json({ reaction: selectedReaction });
  } catch (error) {
    console.error("Failed to react:", error);
    res.status(500).json({ error: "Failed to react" });
  }
});

// Comments
router.get("/api/puns/:id/comments", ensureAuthenticated, async (req, res) => {
  try {
    const comments = await getCommentsByPun(req.params.id);
    const enriched = await enrichWithReactions(
      comments,
      "pun_comment",
      req.user.id,
    );
    res.json(enriched);
  } catch (error) {
    console.error("Failed to get comments:", error);
    res.status(500).json({ error: "Failed to get comments" });
  }
});

router.post("/api/puns/:id/comments", ensureAuthenticated, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ error: "Comment text required" });
  if (text.length > 500)
    return res.status(400).json({ error: "Comment too long" });

  try {
    await createComment(req.params.id, req.user.id, text.trim());
    const pun = await getPunById(req.params.id);
    if (pun) broadcastCommentsUpdate(pun.challenge_id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

export default router;
