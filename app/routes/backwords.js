import { Router } from "express";
import { ensureAuthenticated } from "../middleware/auth.js";
import {
  createBackwordsGame,
  getBackwordsGameById,
  publishBackwordsGame,
  updateBackwordsGameScores,
  createOrGetBackwordsRun,
  getBackwordsRunById,
  getBackwordsRunByGameAndGuesser,
  submitBackwordsGuess,
  updateBackwordsGuessResult,
  getBackwordsHistory,
  getBackwordsComparison,
  getRecentBackwordsTopics,
} from "../db/database.js";
import {
  getActiveBackwordsJudgeDefinition,
  getActivePunJudgeDefinition,
} from "../lib/aiJudges.js";
import {
  buildBackwordsGuessFallback,
  generateBackwordsAssignment,
  generateClueCandidates,
  judgeBackwordsGuess,
  scorePunText,
} from "../services/ai.js";
import {
  addBackwordsGameClient,
  addBackwordsRunClient,
  broadcastToBackwordsGame,
  broadcastToBackwordsRun,
  removeBackwordsGameClient,
  removeBackwordsRunClient,
} from "../services/sse.js";

const router = Router();

function normalizePhrase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMeaningfulTokens(value) {
  return normalizePhrase(value)
    .split(" ")
    .filter((token) => token.length > 3);
}

function findTargetLeak(clue, targets) {
  const normalizedClue = normalizePhrase(clue);
  if (!normalizedClue) return null;

  for (const target of targets) {
    const normalizedTarget = normalizePhrase(target);
    if (!normalizedTarget) continue;

    if (normalizedClue.includes(normalizedTarget)) {
      return target;
    }

    for (const token of extractMeaningfulTokens(target)) {
      const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
      if (pattern.test(normalizedClue)) {
        return token;
      }
    }
  }

  return null;
}

function sanitizeBackwordsGameForViewer(game, revealTargets) {
  if (revealTargets) return game;

  return {
    ...game,
    topic: null,
    focus: null,
  };
}

function buildCreatorFallbackJudgement(feedback, reasoning) {
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

async function buildGuessFallbackJudgement(
  topic,
  focus,
  guessA,
  guessB,
  reasoning,
) {
  const judge = getActiveBackwordsJudgeDefinition();

  return {
    ...(await buildBackwordsGuessFallback(
      topic,
      focus,
      guessA,
      guessB,
      reasoning,
    )),
    judgeKey: judge.key,
    judgeName: judge.name,
    judgeVersion: judge.version,
    judgeModel: judge.model,
    judgePromptHash: judge.promptHash,
    judgeStatus: judge.status,
    isActive: judge.isActive,
  };
}

function toCreatorResponse(game) {
  return {
    role: "creator",
    game,
    run: null,
  };
}

function toGuesserResponse(game, run) {
  const revealTargets = run.status === "solved" || run.status === "failed";

  return {
    role: "guesser",
    game: sanitizeBackwordsGameForViewer(game, revealTargets),
    run,
  };
}

router.post(
  "/api/backwords/generate",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const past = await getRecentBackwordsTopics();
      const { topic, focus } = await generateBackwordsAssignment(past);
      const game = await createBackwordsGame(req.user.id, topic, focus);
      res.json(toCreatorResponse(game));
    } catch (err) {
      console.error("Failed to generate Backwords assignment:", err);
      res.status(500).json({ error: "Failed to generate Backwords puzzle" });
    }
  },
);

router.get("/api/backwords/history", ensureAuthenticated, async (req, res) => {
  try {
    const history = await getBackwordsHistory(req.user.id, 20);
    res.json(history);
  } catch (err) {
    console.error("Failed to get Backwords history:", err);
    res.status(500).json({ error: "Failed to load Backwords history" });
  }
});

router.get("/api/backwords/:id", ensureAuthenticated, async (req, res) => {
  try {
    const game = await getBackwordsGameById(req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Backwords puzzle not found" });
    }

    if (game.creatorId === req.user.id) {
      return res.json(toCreatorResponse(game));
    }

    if (game.status !== "published") {
      return res.status(404).json({ error: "Backwords puzzle not found" });
    }

    const run = await createOrGetBackwordsRun(game.id, req.user.id);
    res.json(toGuesserResponse(game, run));
  } catch (err) {
    console.error("Failed to start Backwords puzzle:", err);
    res.status(500).json({ error: "Failed to open Backwords puzzle" });
  }
});

const GENERATE_CLUES_RATE_LIMIT = 10;
const GENERATE_CLUES_WINDOW_MS = 60_000;
const generateClueRequestLog = new Map();

function hitClueGenerationRateLimit(gameId) {
  const now = Date.now();
  const entries = (generateClueRequestLog.get(gameId) ?? []).filter(
    (t) => now - t < GENERATE_CLUES_WINDOW_MS,
  );
  if (entries.length >= GENERATE_CLUES_RATE_LIMIT) {
    generateClueRequestLog.set(gameId, entries);
    return true;
  }
  entries.push(now);
  generateClueRequestLog.set(gameId, entries);
  return false;
}

router.post(
  "/api/backwords/:id/generate-clues",
  ensureAuthenticated,
  async (req, res) => {
    const rawHuman = Array.isArray(req.body?.humanClues)
      ? req.body.humanClues
      : [];
    const humanClues = rawHuman
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .slice(0, 5);

    if (humanClues.some((c) => c.length > 500)) {
      return res
        .status(400)
        .json({ error: "Clues must be 500 characters or fewer." });
    }

    try {
      const game = await getBackwordsGameById(req.params.id);
      if (!game || game.creatorId !== req.user.id) {
        return res.status(404).json({ error: "Backwords puzzle not found" });
      }

      if (game.status !== "draft") {
        return res.status(409).json({
          error: "This Backwords puzzle has already been published.",
        });
      }

      if (hitClueGenerationRateLimit(game.id)) {
        return res
          .status(429)
          .json({ error: "Too many generations — slow down a moment." });
      }

      const count = Math.max(0, 5 - humanClues.length);
      const generated = await generateClueCandidates(
        game.topic,
        game.focus,
        humanClues,
        count,
      );

      res.json({ generated: generated.map((text) => ({ text })) });
    } catch (err) {
      console.error("Failed to generate Backwords clues:", err);
      res.status(500).json({ error: "Failed to generate clue options" });
    }
  },
);

router.post(
  "/api/backwords/:id/publish",
  ensureAuthenticated,
  async (req, res) => {
    const rawClues = Array.isArray(req.body?.clues) ? req.body.clues : [];
    const parsedClues = rawClues.map((value) => {
      if (typeof value === "string") {
        return { pun_text: value.trim(), source: "human" };
      }
      if (value && typeof value === "object") {
        const text =
          typeof value.pun_text === "string" ? value.pun_text.trim() : "";
        const source = value.source === "ai" ? "ai" : "human";
        return { pun_text: text, source };
      }
      return { pun_text: "", source: "human" };
    });

    if (parsedClues.length !== 3 || parsedClues.some((c) => !c.pun_text)) {
      return res.status(400).json({
        error: "Backwords requires exactly three clue puns.",
      });
    }

    if (parsedClues.some((c) => c.pun_text.length > 500)) {
      return res
        .status(400)
        .json({ error: "Clues must be 500 characters or fewer." });
    }

    const normalizedClues = parsedClues.map((c) => normalizePhrase(c.pun_text));
    if (new Set(normalizedClues).size !== 3) {
      return res.status(400).json({
        error: "Each clue pun must be distinct.",
      });
    }

    try {
      const game = await getBackwordsGameById(req.params.id);
      if (!game || game.creatorId !== req.user.id) {
        return res.status(404).json({ error: "Backwords puzzle not found" });
      }

      if (game.status !== "draft") {
        return res.status(409).json({
          error: "This Backwords puzzle has already been published.",
        });
      }

      for (const { pun_text } of parsedClues) {
        const leak = findTargetLeak(pun_text, [game.topic, game.focus]);
        if (leak) {
          return res.status(400).json({
            error: `Clues cannot explicitly include the hidden answer terms. Remove '${leak}'.`,
          });
        }
      }

      const cluePayload = parsedClues.map((clue) => ({
        pun_text: clue.pun_text,
        source: clue.source,
        ai_score: null,
        ai_feedback: null,
        ai_judge_id: null,
        ai_judge_key: null,
        ai_judge_name: null,
        ai_judge_version: null,
        ai_judge_model: null,
        ai_judged_at: null,
        clue_score: null,
      }));

      const publishedGame = await publishBackwordsGame(
        game.id,
        req.user.id,
        cluePayload,
      );

      res.json(toCreatorResponse(publishedGame));

      Promise.all(
        publishedGame.clues.map((clue) =>
          scorePunText(game.topic, game.focus, clue.pun_text).catch(() =>
            buildCreatorFallbackJudgement(
              "The judge wandered off before scoring this clue.",
              "Backwords clue scoring fell back after an API failure.",
            ),
          ),
        ),
      )
        .then(async (judgements) => {
          const scoredGame = await updateBackwordsGameScores(
            publishedGame.id,
            judgements,
          );
          broadcastToBackwordsGame(
            scoredGame.id,
            "backwords-game-updated",
            scoredGame,
          );
        })
        .catch(async (err) => {
          console.error("Backwords clue scoring failed:", err);
          const judgements = publishedGame.clues.map(() =>
            buildCreatorFallbackJudgement(
              "The judge wandered off before scoring this clue.",
              "Backwords clue scoring failed during async processing.",
            ),
          );
          const scoredGame = await updateBackwordsGameScores(
            publishedGame.id,
            judgements,
          );
          broadcastToBackwordsGame(
            scoredGame.id,
            "backwords-game-updated",
            scoredGame,
          );
        });
    } catch (err) {
      console.error("Failed to publish Backwords puzzle:", err);
      res.status(500).json({ error: "Failed to publish Backwords puzzle" });
    }
  },
);

router.post(
  "/api/backwords/:id/guess",
  ensureAuthenticated,
  async (req, res) => {
    const { runId, guessA, guessB } = req.body ?? {};
    const cleanGuessA = typeof guessA === "string" ? guessA.trim() : "";
    const cleanGuessB = typeof guessB === "string" ? guessB.trim() : "";

    if (!cleanGuessA || !cleanGuessB) {
      return res.status(400).json({
        error: "Both guessed concepts are required.",
      });
    }

    if (cleanGuessA.length > 120 || cleanGuessB.length > 120) {
      return res.status(400).json({
        error: "Each guessed concept must be 120 characters or fewer.",
      });
    }

    if (normalizePhrase(cleanGuessA) === normalizePhrase(cleanGuessB)) {
      return res.status(400).json({
        error: "Submit two distinct concepts.",
      });
    }

    try {
      const game = await getBackwordsGameById(req.params.id);
      if (!game || game.status !== "published") {
        return res.status(404).json({ error: "Backwords puzzle not found" });
      }

      if (game.creatorId === req.user.id) {
        return res.status(403).json({
          error: "You cannot guess your own Backwords puzzle.",
        });
      }

      const run = await getBackwordsRunById(runId);
      if (!run || run.gameId !== game.id || run.guesserId !== req.user.id) {
        return res.status(404).json({ error: "Backwords run not found" });
      }

      if (run.status === "judging") {
        return res
          .status(409)
          .json({ error: "This guess is still being judged." });
      }

      if (run.status === "solved" || run.status === "failed") {
        return res.status(409).json({
          error: "This Backwords run has already been resolved.",
        });
      }

      if (run.attemptsUsed >= 3) {
        return res.status(409).json({
          error: "You have used all three guesses for this puzzle.",
        });
      }

      const pendingRun = await submitBackwordsGuess(
        run.id,
        cleanGuessA,
        cleanGuessB,
        run.attemptsUsed,
      );

      res.json({ success: true, run: pendingRun });

      judgeBackwordsGuess(game.topic, game.focus, cleanGuessA, cleanGuessB)
        .then(async (judgement) => {
          const updatedRun = await updateBackwordsGuessResult(
            run.id,
            run.attemptsUsed,
            judgement,
            { triggerType: "initial" },
          );
          broadcastToBackwordsRun(
            updatedRun.id,
            "backwords-run-updated",
            updatedRun,
          );
        })
        .catch(async (err) => {
          console.error("Backwords guess judging failed:", err);
          const fallback = await buildGuessFallbackJudgement(
            game.topic,
            game.focus,
            cleanGuessA,
            cleanGuessB,
            "Backwords semantic judging failed during async processing.",
          );
          const updatedRun = await updateBackwordsGuessResult(
            run.id,
            run.attemptsUsed,
            fallback,
            { triggerType: "initial" },
          );
          broadcastToBackwordsRun(
            updatedRun.id,
            "backwords-run-updated",
            updatedRun,
          );
        });
    } catch (err) {
      console.error("Failed to submit Backwords guess:", err);
      res.status(500).json({ error: "Failed to submit Backwords guess" });
    }
  },
);

router.get(
  "/api/backwords/:id/stream",
  ensureAuthenticated,
  async (req, res) => {
    const game = await getBackwordsGameById(req.params.id).catch(() => null);
    if (!game || game.creatorId !== req.user.id) {
      return res.status(404).json({ error: "Backwords puzzle not found" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write(":connected\n\n");

    addBackwordsGameClient(game.id, res);

    if (game.creatorScore !== null && game.creatorScore !== undefined) {
      broadcastToBackwordsGame(game.id, "backwords-game-updated", game);
    }

    req.on("close", () => removeBackwordsGameClient(game.id, res));
  },
);

router.get(
  "/api/backwords/:id/run/:runId/stream",
  ensureAuthenticated,
  async (req, res) => {
    const run = await getBackwordsRunById(req.params.runId).catch(() => null);
    if (!run || run.gameId !== req.params.id || run.guesserId !== req.user.id) {
      return res.status(404).json({ error: "Backwords run not found" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write(":connected\n\n");

    addBackwordsRunClient(run.id, res);

    if (run.status !== "judging") {
      broadcastToBackwordsRun(run.id, "backwords-run-updated", run);
    }

    req.on("close", () => removeBackwordsRunClient(run.id, res));
  },
);

router.get(
  "/api/backwords/:id/comparison",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const comparison = await getBackwordsComparison(req.params.id);
      if (!comparison) {
        return res.status(404).json({ error: "Backwords puzzle not found" });
      }

      let viewerRole = "guesser";

      if (comparison.game.creatorId === req.user.id) {
        viewerRole = "creator";
      } else {
        const run = await getBackwordsRunByGameAndGuesser(
          comparison.game.id,
          req.user.id,
        );
        if (!run || (run.status !== "solved" && run.status !== "failed")) {
          return res.status(403).json({
            error: "Finish this Backwords puzzle before viewing full results.",
          });
        }
      }

      res.json({
        ...comparison,
        viewerRole,
      });
    } catch (err) {
      console.error("Failed to load Backwords comparison:", err);
      res.status(500).json({ error: "Failed to load Backwords comparison" });
    }
  },
);

export default router;
