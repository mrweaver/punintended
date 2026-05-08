/**
 * routes/auth.js — Authentication routes.
 *
 * Three login surfaces share one PunIntended user record:
 *   1. /auth/google — direct Google OAuth via Passport (legacy, still
 *      supported for users who land on pun.cotlone.com directly).
 *   2. /auth/hub    — handoff token from hub.cotlone.com after a LAUNCH
 *      click on the hub dashboard.
 *   3. The shared `lns_session` cookie on `.cotlone.com` issued by either
 *      side (or by another integrated app) — read by ensureAuthenticated.
 *
 * Both Google and hub paths set the cross-subdomain cookie, so logging in
 * via either flow logs the user in everywhere.
 */
import { Router } from "express";
import passport from "../auth/passport.js";
import {
  clearSessionCookie,
  fetchHubMe,
  mintSessionToken,
  setSessionCookie,
  verifyHandoffToken,
} from "../auth/hub.js";
import { findOrCreateUserByHubIdentity } from "../db/database.js";
import { formatAuthUser } from "../middleware/auth.js";

const router = Router();

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?login=failed" }),
  async (req, res) => {
    // Mint a hub-compatible session cookie so the user is also logged in at
    // hub.cotlone.com and any other integrated app. The hub UUID may not
    // exist yet for legacy users — they get linked the first time they
    // come back through the hub.
    try {
      const hubUserId = req.user?.hub_user_id ?? null;
      if (hubUserId) {
        const token = mintSessionToken({
          userId: hubUserId,
          email: req.user?.email ?? null,
        });
        setSessionCookie(res, token);
      }
    } catch (err) {
      console.error("[auth/google/callback] cookie mint failed:", err);
    }
    res.redirect("/?login=success");
  },
);

router.get("/auth/hub", async (req, res) => {
  const handoff = req.query.token || req.query.hub_token;
  if (!handoff || typeof handoff !== "string") {
    return res.redirect("/?login=failed&reason=missing_token");
  }

  let claims;
  try {
    claims = verifyHandoffToken(handoff);
  } catch (err) {
    console.error("[auth/hub] handoff verification failed:", err.message);
    return res.redirect("/?login=failed&reason=bad_token");
  }

  const hubUserId = claims.sub;
  let hubProfile = { email: null, display_name: null, photo_url: null };

  // Mint a session token immediately so we can introspect /auth/me on the hub.
  const sessionToken = mintSessionToken({ userId: hubUserId, email: null });
  try {
    const me = await fetchHubMe(sessionToken);
    hubProfile = {
      email: me.email ?? null,
      display_name: me.display_name ?? me.username ?? null,
      photo_url: me.photo_url ?? null,
    };
  } catch (err) {
    console.warn("[auth/hub] /auth/me lookup failed; proceeding with id only:", err.message);
  }

  let localUser;
  try {
    localUser = await findOrCreateUserByHubIdentity({
      hubUserId,
      email: hubProfile.email,
      displayName: hubProfile.display_name,
      photoUrl: hubProfile.photo_url,
    });
  } catch (err) {
    console.error("[auth/hub] user upsert failed:", err);
    return res.redirect("/?login=failed&reason=user_upsert");
  }

  // If we now know the user's email, retry mint with the real email claim so
  // downstream consumers (and the cookie token) carry it.
  const finalToken = mintSessionToken({
    userId: hubUserId,
    email: localUser.email ?? hubProfile.email ?? null,
  });
  setSessionCookie(res, finalToken);

  // Hydrate Passport's session too so existing req.isAuthenticated() guards
  // keep working without a refactor.
  req.login(localUser, (err) => {
    if (err) {
      console.error("[auth/hub] passport session hydrate failed:", err);
      return res.redirect("/?login=failed&reason=session");
    }
    res.redirect("/?login=success");
  });
});

router.post("/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      clearSessionCookie(res);
      res.json({ success: true });
    });
  });
});

router.get("/auth/user", (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({
    user: formatAuthUser(req.user),
  });
});

export default router;
