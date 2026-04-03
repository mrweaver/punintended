/**
 * middleware/auth.js — Authentication helpers.
 *
 * Exports the ensureAuthenticated guard used by every protected route,
 * the formatAuthUser serialiser for session user objects, and the
 * MAX_DISPLAY_NAME_LENGTH constant.
 */
import { getEffectiveDisplayName } from "../db/database.js";

export const MAX_DISPLAY_NAME_LENGTH = 255;

export function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

export function formatAuthUser(user) {
  if (!user) return null;

  return {
    uid: user.id,
    displayName: getEffectiveDisplayName(user),
    customDisplayName: user.custom_display_name ?? null,
    googleDisplayName: user.display_name ?? null,
    photoURL: user.photo_url,
    email: user.email,
    anonymousInLeaderboards: !!user.anonymous_in_leaderboards,
  };
}
