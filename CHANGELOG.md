# Changelog

All notable changes to PunIntended will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.2.0] - 2026-03-28

### Added
- **Response-Time Speed Score:** Timer starts silently when a user first sees the daily challenge cards. Elapsed time is recorded on pun submission and factored into the ranking score — rewarding quick wit alongside quality.
- **Speed Badge on Pun Cards:** Each pun now shows a ⚡ indicator next to the AI score displaying the author's response time (e.g. "⚡ 42s"). Color-coded green (≤30s), orange (≤2min), or grey (slower).
- **Combined Ranking Formula:** Score now weights AI judgment at 50%, reactions at 35%, and speed at 15%. Puns without a recorded time fall back to the original 60/40 formula — no regression for existing puns.
- **Automatic DB Migration:** `response_time_ms` column added to the `puns` table via an idempotent `ALTER TABLE IF NOT EXISTS` that runs at server startup.

## [1.1.0] - 2026-03-01

### Added
- **Daily Challenge Cards:** AI-generated Topic and Focus cards displayed in GameBoard; session owner can refresh the challenge at any time.
- **Pun Submission:** Textarea with 500-character limit; fair-play enforcement prevents a player submitting again until everyone else has had a turn in multiplayer sessions.
- **AI Scoring:** Gemini 3.1 Flash scores each pun 0–10 with a single line of feedback from "a jaded comedy critic". Scores are applied asynchronously and pushed via SSE.
- **Reaction System:** Five weighted emoji reactions — 🧠 Clever (2pts), 😂 Laugh (2pts), 😩 Groan (1pt), 🔥 Fire (3pts), 🤯 Wild (3pts). One reaction per user per pun.
- **Grouped Pun Board:** Puns grouped by author with unviewed count, best score, and total reactions per group. Sort by Unviewed, Top, or New.
- **Real-time Updates:** SSE stream pushes pun, score, reaction, comment, and session changes to all connected clients instantly.
- **Multiplayer Sessions:** Create or join named sessions; share via QR code or invite link. Players listed in header with avatars.
- **Comments & Chat:** Per-pun comment threads and a session-wide chat sidebar.
- **Google OAuth:** Sign in with Google; session-backed authentication with Passport.js.
- **Share Puns:** Copy-to-clipboard share button formats the pun text, author, and AI score.
- **Notifications:** In-app notification feed for reactions and other events.
- **Profile Page:** View all puns submitted by the authenticated user across sessions.
- **Dark Mode:** Full dark theme with orange (light) and violet (dark) accent colours.
