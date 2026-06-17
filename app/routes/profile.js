/**
 * routes/profile.js — User profile endpoints.
 *
 * Fetches a user's pun history, updates custom display names (with
 * cascading broadcasts to groups, messages, puns, and typing status),
 * and toggles leaderboard anonymity. Also hosts developer-only admin
 * endpoints for live judge configuration.
 */
import { Router } from "express";
import { ensureAuthenticated, formatAuthUser, isDeveloperEmail, MAX_DISPLAY_NAME_LENGTH } from "../middleware/auth.js";
import {
  getEffectiveDisplayName,
  normalizeDisplayNameInput,
  getPunsByAuthor,
  updateCustomDisplayName,
  updateUserPrivacy,
  getGroupIdsByUser,
  getGroupById,
  getAppSetting,
  setAppSetting,
} from "../db/database.js";
import { getAESTDateId } from "../lib/date.js";
import {
  refreshTypingDisplayName,
  broadcastGroupUpdate,
  broadcastMessagesUpdate,
  broadcastPunsUpdate,
} from "../services/sse.js";
import {
  getBuiltInAiJudges,
  getActiveJudgesByRole,
  setJudgeOverride,
  clearJudgeOverride,
  JUDGE_ROLES,
} from "../lib/aiJudges.js";

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

// ── Developer-only: judge configuration ─────────────────────────────────────

function ensureDeveloper(req, res, next) {
  if (!isDeveloperEmail(req.user?.email)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/**
 * GET /api/admin/judge-settings
 * Returns the full judge catalogue plus the currently active judge per role.
 */
router.get(
  "/api/admin/judge-settings",
  ensureAuthenticated,
  ensureDeveloper,
  async (_req, res) => {
    try {
      const judges = getBuiltInAiJudges().map((j) => ({
        key: j.key,
        name: j.name,
        version: j.version,
        model: j.model,
        provider: j.provider ?? "gemini",
        status: j.status,
        isActive: j.isActive,
        responseSchemaVersion: j.config?.responseSchemaVersion ?? null,
      }));
      const activeByRole = getActiveJudgesByRole();
      res.json({ judges, activeByRole, roles: JUDGE_ROLES });
    } catch (error) {
      console.error("Failed to fetch judge settings:", error);
      res.status(500).json({ error: "Failed to fetch judge settings" });
    }
  },
);

/**
 * PUT /api/admin/judge-settings
 * Body: { role: string, judgeKey: string | null }
 * Pass judgeKey = null to reset a role to its built-in default.
 */
router.put(
  "/api/admin/judge-settings",
  ensureAuthenticated,
  ensureDeveloper,
  async (req, res) => {
    const { role, judgeKey } = req.body ?? {};

    if (!role || !Object.values(JUDGE_ROLES).includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    try {
      if (judgeKey === null || judgeKey === undefined || judgeKey === "") {
        clearJudgeOverride(role);
        await setAppSetting(role, "");
        console.log(`[Admin] Judge role "${role}" reset to default`);
      } else {
        setJudgeOverride(role, judgeKey); // throws if key unknown
        await setAppSetting(role, judgeKey);
        console.log(`[Admin] Judge role "${role}" set to "${judgeKey}"`);
      }
      res.json({ activeByRole: getActiveJudgesByRole() });
    } catch (error) {
      console.error("Failed to update judge setting:", error);
      const msg = error.message?.startsWith("Unknown judge")
        ? error.message
        : "Failed to update judge setting";
      res.status(400).json({ error: msg });
    }
  },
);

export default router;
