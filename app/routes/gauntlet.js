/**
 * routes/gauntlet.js — Gauntlet (rapid-fire) game mode.
 *
 * Generates 5-round gauntlet challenges via AI, manages runs and round
 * submissions with async scoring, auto-finalises completed runs, and
 * serves gauntlet messages, comments, comparison, and history. Includes
 * the per-run SSE stream for real-time score delivery.
 */
import { Router } from "express";
import { ensureAuthenticated } from "../middleware/auth.js";
import {
  createGauntlet,
  getGauntletById,
  createGauntletRun,
  getGauntletRunById,
  submitGauntletRound,
  updateGauntletRoundScore,
  finalizeGauntletRun,
  setGauntletRunScoring,
  getGauntletComparison,
  getUserGauntletHistory,
  getRecentGauntletTopics,
  addGauntletComment,
  getGauntletComments,
  getGauntletMessages,
  createGauntletMessage,
} from "../db/database.js";
import { getActivePunJudgeDefinition } from "../lib/aiJudges.js";
import { generateGauntletPrompts, scorePunText } from "../services/ai.js";
import {
  addGauntletClient,
  removeGauntletClient,
  broadcastToGauntletRun,
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

async function maybeFinalize(runId) {
  const run = await getGauntletRunById(runId);
  if (!run || run.status === "complete") return;
  const allScored =
    run.rounds.length === 5 &&
    run.rounds.every(
      (r) => r.round_score !== null && r.round_score !== undefined,
    );
  if (allScored) {
    const total = run.rounds.reduce((sum, r) => sum + (r.round_score || 0), 0);
    const finalRun = await finalizeGauntletRun(runId, total);
    if (finalRun) {
      broadcastToGauntletRun(runId, "gauntlet-run-complete", finalRun);
    }
  }
}

router.post("/api/gauntlet/generate", ensureAuthenticated, async (req, res) => {
  try {
    const past = await getRecentGauntletTopics();
    const { rounds } = await generateGauntletPrompts(past);
    const gauntlet = await createGauntlet(req.user.id, rounds);
    const run = await createGauntletRun(gauntlet.id, req.user.id);
    res.json({
      gauntletId: gauntlet.id,
      runId: run.id,
      rounds: gauntlet.rounds,
    });
  } catch (err) {
    console.error("Failed to generate gauntlet:", err);
    res.status(500).json({ error: "Failed to generate gauntlet" });
  }
});

router.get("/api/gauntlet/history", ensureAuthenticated, async (req, res) => {
  try {
    const history = await getUserGauntletHistory(req.user.id, 20);
    res.json(history);
  } catch (err) {
    console.error("Failed to get gauntlet history:", err);
    res.status(500).json({ error: "Failed to get history" });
  }
});

router.get("/api/gauntlet/:id", ensureAuthenticated, async (req, res) => {
  try {
    const gauntlet = await getGauntletById(req.params.id);
    if (!gauntlet) return res.status(404).json({ error: "Gauntlet not found" });
    const run = await createGauntletRun(gauntlet.id, req.user.id);
    res.json({
      gauntletId: gauntlet.id,
      runId: run.id,
      rounds: gauntlet.rounds,
    });
  } catch (err) {
    console.error("Failed to start gauntlet:", err);
    res.status(500).json({ error: "Failed to start gauntlet" });
  }
});

router.post(
  "/api/gauntlet/:id/submit-round",
  ensureAuthenticated,
  async (req, res) => {
    const { runId, roundIndex, punText, secondsRemaining } = req.body;
    if (typeof roundIndex !== "number" || roundIndex < 0 || roundIndex > 4)
      return res.status(400).json({ error: "Invalid round index" });
    const cleanText = typeof punText === "string" ? punText.trim() : "";
    if (cleanText.length > 500)
      return res.status(400).json({ error: "Pun too long" });
    // secondsRemaining is client-supplied (V1 - casual game, no global leaderboard).
    // V2 fix: record round_started_at server-side and compute elapsed on submission.
    const validSecs =
      Number.isInteger(secondsRemaining) &&
      secondsRemaining >= 0 &&
      secondsRemaining <= 60
        ? secondsRemaining
        : 0;

    try {
      const gauntlet = await getGauntletById(req.params.id);
      if (!gauntlet)
        return res.status(404).json({ error: "Gauntlet not found" });
      const run = await getGauntletRunById(runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.playerId !== req.user.id)
        return res.status(403).json({ error: "Not your run" });
      if (run.status !== "in_progress")
        return res.status(409).json({ error: "Run no longer in progress" });

      await submitGauntletRound(runId, roundIndex, cleanText, validSecs);
      if (roundIndex === 4) await setGauntletRunScoring(runId);

      res.json({ success: true });

      if (cleanText) {
        const { topic, focus } = gauntlet.rounds[roundIndex];
        scorePunText(topic, focus, cleanText)
          .then(async (result) => {
            console.log(
              `[Gauntlet ${runId} R${roundIndex}] ${result.reasoning}`,
            );
            await updateGauntletRoundScore(runId, roundIndex, result, {
              triggerType: "initial",
            });
            await maybeFinalize(runId);
          })
          .catch(async (err) => {
            console.error(
              `Gauntlet scoring failed run=${runId} round=${roundIndex}:`,
              err,
            );
            await updateGauntletRoundScore(
              runId,
              roundIndex,
              buildRouteFallbackJudgement(
                "The judge fell asleep at the bar. No score for this round.",
                `Route-level gauntlet scoring failure for round ${roundIndex}.`,
              ),
              { triggerType: "initial" },
            );
            await maybeFinalize(runId);
          });
      } else {
        // Timer expired - score as zero immediately, no AI call needed
        await updateGauntletRoundScore(
          runId,
          roundIndex,
          buildRouteFallbackJudgement(
            "Time's up - no pun submitted.",
            "Timer expired before a gauntlet submission was recorded.",
          ),
          { triggerType: "initial" },
        );
        await maybeFinalize(runId);
      }
    } catch (err) {
      console.error("Failed to submit gauntlet round:", err);
      res.status(500).json({ error: "Failed to submit round" });
    }
  },
);

// SSE stream
router.get(
  "/api/gauntlet/:id/run/:runId/stream",
  ensureAuthenticated,
  async (req, res) => {
    const run = await getGauntletRunById(req.params.runId).catch(() => null);
    if (!run) return res.status(404).json({ error: "Run not found" });
    if (run.playerId !== req.user.id)
      return res.status(403).json({ error: "Not your run" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write(":connected\n\n");

    const runId = req.params.runId;
    addGauntletClient(runId, res);

    // Push immediately if scoring already finished before SSE connected
    if (run.status === "complete") {
      broadcastToGauntletRun(runId, "gauntlet-run-complete", run);
    }

    req.on("close", () => removeGauntletClient(runId, res));
  },
);

router.get(
  "/api/gauntlet/:id/run/:runId",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const run = await getGauntletRunById(req.params.runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.playerId !== req.user.id)
        return res.status(403).json({ error: "Not your run" });
      res.json(run);
    } catch (err) {
      console.error("Failed to get gauntlet run:", err);
      res.status(500).json({ error: "Failed to get run" });
    }
  },
);

router.get(
  "/api/gauntlet/:id/comparison",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const comparison = await getGauntletComparison(req.params.id);
      if (!comparison)
        return res.status(404).json({ error: "Gauntlet not found" });
      res.json(comparison);
    } catch (err) {
      console.error("Failed to get gauntlet comparison:", err);
      res.status(500).json({ error: "Failed to get comparison" });
    }
  },
);

router.get(
  "/api/gauntlet/:id/messages",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const messages = await getGauntletMessages(req.params.id);
      const enriched = await enrichWithReactions(
        messages,
        "gauntlet_message",
        req.user.id,
      );
      res.json(enriched);
    } catch (err) {
      console.error("Failed to get gauntlet messages:", err);
      res.status(500).json({ error: "Failed to get messages" });
    }
  },
);

router.post(
  "/api/gauntlet/:id/messages",
  ensureAuthenticated,
  async (req, res) => {
    const cleanText =
      typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!cleanText || cleanText.length > 500)
      return res
        .status(400)
        .json({ error: "Message must be 1–500 characters" });
    try {
      const message = await createGauntletMessage(
        req.params.id,
        req.user.id,
        cleanText,
      );
      res.json(message);
    } catch (err) {
      console.error("Failed to create gauntlet message:", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  },
);

router.get(
  "/api/gauntlet/:id/comments",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const comments = await getGauntletComments(req.params.id);
      res.json(comments);
    } catch (err) {
      console.error("Failed to get gauntlet comments:", err);
      res.status(500).json({ error: "Failed to get comments" });
    }
  },
);

router.post(
  "/api/gauntlet/:id/comments",
  ensureAuthenticated,
  async (req, res) => {
    const { runId, roundIndex, text } = req.body;
    if (typeof roundIndex !== "number" || roundIndex < 0 || roundIndex > 4)
      return res.status(400).json({ error: "Invalid round index" });
    const cleanText = typeof text === "string" ? text.trim() : "";
    if (!cleanText || cleanText.length > 280)
      return res
        .status(400)
        .json({ error: "Comment must be 1–280 characters" });
    try {
      const run = await getGauntletRunById(runId);
      if (!run || run.gauntletId !== req.params.id)
        return res.status(404).json({ error: "Run not found" });
      const comment = await addGauntletComment(
        req.params.id,
        runId,
        roundIndex,
        req.user.id,
        cleanText,
      );
      res.json(comment);
    } catch (err) {
      console.error("Failed to add gauntlet comment:", err);
      res.status(500).json({ error: "Failed to add comment" });
    }
  },
);

export default router;
