/**
 * routes/auth.js — Authentication routes.
 *
 * Google OAuth initiation and callback, session logout, and the
 * /auth/user endpoint that returns the current session user.
 */
import { Router } from "express";
import passport from "../auth/passport.js";
import { formatAuthUser } from "../middleware/auth.js";

const router = Router();

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?login=failed" }),
  (req, res) => {
    res.redirect("/?login=success");
  },
);

router.post("/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
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
