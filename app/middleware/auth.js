/**
 * middleware/auth.js — Authentication helpers.
 *
 * Exports:
 *   - hydrateFromHubSession: global middleware that opportunistically
 *     populates req.user from the shared `lns_session` cookie (or
 *     Authorization: Bearer) when Passport hasn't already.
 *   - ensureAuthenticated: per-route guard for protected endpoints.
 *   - formatAuthUser: serialiser for /auth/user.
 *
 * The hub session uses a JWT signed with HUB_JWT_SECRET, scope `"session"`.
 * Either cookie or Bearer is acceptable; the cookie is what other
 * integrated apps and the hub itself set, so SSO across `*.cotlone.com`
 * works without per-app re-login.
 */
import {
  findOrCreateUserByHubIdentity,
  getEffectiveDisplayName,
  getUserByHubId,
} from "../db/database.js";
import {
  fetchHubMe,
  readSessionToken,
  verifySessionToken,
} from "../auth/hub.js";

export const MAX_DISPLAY_NAME_LENGTH = 255;

export async function hydrateFromHubSession(req, _res, next) {
  if (req.user) return next();
  const token = readSessionToken(req);
  if (!token) return next();

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch (err) {
    return next();
  }

  try {
    const hubUserId = payload.sub;
    let user = await getUserByHubId(hubUserId);
    if (!user) {
      let profile = {
        email: payload.email ?? null,
        display_name: null,
        photo_url: null,
      };
      try {
        const me = await fetchHubMe(token);
        profile = {
          email: me.email ?? profile.email,
          display_name: me.display_name ?? me.username ?? null,
          photo_url: me.photo_url ?? null,
        };
      } catch (_err) {
        // Non-fatal — JWT claims are sufficient to create a placeholder.
      }
      user = await findOrCreateUserByHubIdentity({
        hubUserId,
        email: profile.email,
        displayName: profile.display_name,
        photoUrl: profile.photo_url,
      });
    }
    req.user = user;
    req.hubSessionPayload = payload;
  } catch (err) {
    console.error("[hydrateFromHubSession] failed:", err);
  }
  next();
}

export function ensureAuthenticated(req, res, next) {
  if (req.user) return next();
  if (req.isAuthenticated && req.isAuthenticated()) return next();
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
