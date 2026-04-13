/**
 * routes/leaderboard.js — Leaderboard endpoints.
 *
 * Group weekly scores, global daily rankings, all-time groaners, and
 * the per-user gauntlet leaderboard. All read-only.
 */
import { Router } from "express";
import { ensureAuthenticated } from "../middleware/auth.js";
import {
  getWeeklyBestScores,
  getGlobalDailyRanking,
  getGlobalAllTimeGroaners,
  getGauntletLeaderboard,
} from "../db/database.js";
import { getAESTDateId } from "../lib/date.js";

const router = Router();

router.get(
  "/api/groups/:id/weekly-scores",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const { weekStart, weekEnd } = req.query;
      if (!weekStart || !weekEnd) {
        return res
          .status(400)
          .json({ error: "weekStart and weekEnd required" });
      }
      const scores = await getWeeklyBestScores(
        req.params.id,
        weekStart,
        weekEnd,
      );
      res.json(scores);
    } catch (error) {
      console.error("Failed to get weekly scores:", error);
      res.status(500).json({ error: "Failed to get weekly scores" });
    }
  },
);

router.get("/api/leaderboard/daily", ensureAuthenticated, async (req, res) => {
  try {
    const date = req.query.date || getAESTDateId();
    const puns = await getGlobalDailyRanking(date, req.user.id);
    res.json({ date, puns });
  } catch (error) {
    console.error("Failed to get daily leaderboard:", error);
    res.status(500).json({ error: "Failed to get daily leaderboard" });
  }
});

router.get(
  "/api/leaderboard/alltime",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const groaners = await getGlobalAllTimeGroaners(req.user.id);
      res.json(groaners);
    } catch (error) {
      console.error("Failed to get all-time leaderboard:", error);
      res.status(500).json({ error: "Failed to get all-time leaderboard" });
    }
  },
);

router.get(
  "/api/leaderboard/gauntlet",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const entries = await getGauntletLeaderboard(req.user.id);
      res.json(entries);
    } catch (error) {
      console.error("Failed to get gauntlet leaderboard:", error);
      res.status(500).json({ error: "Failed to get gauntlet leaderboard" });
    }
  },
);

export default router;
