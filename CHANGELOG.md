# Changelog

All notable changes to PunIntended will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.9.0] - 2026-03-31

### Added

- **Rename Group:** Group hosts can click the pencil icon next to the group name to rename it inline; the change broadcasts to all players via SSE.
- **Kick Players:** Group hosts can hover a player avatar and click the ✕ button to remove them from the group; kicked players are automatically returned to the lobby.

### Fixed

- **Profile Modal Crash:** Opening the user account modal no longer throws "Cannot convert undefined or null to object" — reaction totals now correctly use `groanCount`.

## [1.8.0] - 2026-03-31

### Added

- **Gauntlet Comparison View:** After completing a run, "View Comparison" opens a side-by-side breakdown of all participants' puns and scores, round by round.
- **Per-Pun Comment Threads:** Each pun in the comparison view has a collapsible comment thread — click to expand, Enter to post.
- **Gauntlet History:** Past completed gauntlets persist in the idle lobby as a scrollable history list with avatars, scores, and rankings; click any entry to open its comparison.
- **Logo Navigation:** Clicking the PunIntended logo from gauntlet, leaderboard, or session views navigates back to the lobby.
- **About Modal — Gauntlet Section:** Expanded to cover the comparison view, comment threads, history, speed-bonus mechanics, and the challenge-a-mate flow.

## [1.7.0] - 2026-03-30

### Added

- **Groan Reaction:** Single always-visible 😩 Groan button on every pun card replaces the hidden 5-reaction picker; Groans appear on global leaderboards.
- **Weekly Group Leaderboard:** Collapsible Mon–Sun panel in the game board showing each player's daily-best scores; lowest day dropped automatically.
- **Global Leaderboards:** New page (Trophy icon in header) with three tabs — Daily Crown (10/10 puns by groans), Hall of Shame (≤2/10 puns), and All-Time Groaners.
- **Player Leaderboard Bar:** Live top-3 bar above the pun feed showing each player's best AI score for the day.
- **Typing Presence:** Ghost cards in the pun feed show when other players are typing or have submitted.
- **Score Audio Cues:** Web Audio API tones play when the current user's pun receives an AI score.
- **Join by Invite Code:** Lobby redesigned with join-by-code as the primary action; Gauntlet demoted to a slim strip.

### Changed

- **3 Submissions Per Day:** Players get up to 3 attempts per challenge; remaining count shown below the submit button; form disables at 0.
- **AEST Midnight Rollover:** Daily challenges now roll over at midnight Australia/Sydney time instead of UTC midnight.
- **Daily-Best Scoring:** The leaderboard bar shows the highest AI score from a player's attempts, not the average.
- **Speed Scoring Removed:** Response-time bonuses and the ⚡ speed badge have been removed.
- **About Modal:** Rewritten with current game rules, Quick Start section, expandable details, and live version number.

### Fixed

- **Pun Feed 500 Error:** `MAX(uuid)` aggregate (unsupported in PostgreSQL) replaced with `COUNT(*) FILTER (...)` in the puns query.
- **History Pun Display:** Removed stale `reactions`/`reactionTotal` mapping in `useChallengeHistory` that was shadowing valid pun data.

## [1.6.0] - 2026-03-30

### Added

- **Global Daily Challenge:** Single shared challenge per calendar day across all groups; all players see the same Topic/Focus regardless of which group they're in.
- **Blind Submission Gate:** Players cannot see other submissions until they've submitted their own pun, preventing anchoring bias.

### Changed

- **Sessions → Groups:** Renamed "sessions" to "groups" throughout the UI and codebase for clarity.

### Fixed

- **Changelog Serving:** `changelog.md` now served from `public/` so the ChangelogModal can fetch it in production builds.
- **Markdown Lint:** Resolved markdown formatting issues in changelog entries.

## [1.5.1] - 2026-03-30

### Fixed

- **Daily Puzzle Persistence:** Challenge no longer regenerates on every page refresh — the server now reuses the stored challenge for the current day instead of calling the AI each time.
- **Timezone Handling:** Day boundaries now follow host local time rather than server UTC, preventing spurious stale-challenge triggers for users in UTC+ zones.
- **Pun Date Alignment:** Pun submissions are now filed under the session's active `challengeId` rather than server UTC, keeping puns correctly linked to the displayed challenge.
- **Date Label:** A formatted date (e.g. "Monday, March 30, 2026") is now shown beneath the "Today's Challenge" heading.

## [1.5.0] - 2026-03-30

### Added

- **The Gauntlet:** Solo mode — 5 AI-generated rounds, 60 seconds each, scored by Gemini with a time bonus for fast submissions. Share your result link to challenge friends.
- **Markdown Changelog:** ChangelogModal now renders `changelog.md` via react-markdown with collapsible version sections.

### Changed

- **AI Scoring Persona:** Deadpan British-Australian tone; no forced slang or cultural caricature. Feedback calibrated by score band: roast for 0–3, weary groan for 4–6, grudging respect for 7–10.
- **PunCard Reactions:** Compact layout with a toggle-to-reveal reaction picker; share button removed; reactions reordered.

## [1.4.0] - 2026-03-29

### Added

- **Ctrl+Enter to Submit:** Keyboard shortcut to submit a pun without reaching for the mouse. Hint shown in the tip text below the textarea.
- **Mobile Sign-Out:** Sign Out button added to the Profile modal on small screens (header logout button is hidden on mobile to save space).
- **Mobile Chat Modal:** ChatBox supports a bottom-sheet modal mode on mobile with drag handle and close button.

### Changed

- **AI Scoring Ceiling for Non-Phonetic Puns:** Acronym redefinitions and purely logical jokes are now capped at 6/10. The AI feedback cheekily explains the ceiling if phonetic wordplay is missing.
- **Timestamp Fix:** All timestamps now display in the user's local timezone. Previously, a pg type-parsing quirk caused UTC times to be treated as local, showing e.g. 3 AM instead of 2 PM.

## [1.3.0] - 2026-03-29

### Added

- **Challenge History Panel:** Sessions now record every challenge played. A history panel in the GameBoard lets players browse past Topic/Focus pairs and the puns submitted for each.
- **Smarter Challenge Refresh:** When the owner refreshes the challenge, past topics are passed to the AI so repeats are avoided within the same session.
- **Stale Challenge Auto-Refresh:** Owners loading a session with yesterday's challenge get a silent auto-refresh on page load. Non-owners see a "waiting for host" banner until the host acts.
- **AI Judge Persona:** Gemini scoring prompt updated to a witty pub trivia host persona with Australian English spelling. Adds a private `reasoning` field for server diagnostics and a graceful fallback message if scoring fails.
- **Flat Pun List:** Puns are now displayed in a single flat list (unread first, then by score/time) rather than grouped by author. `unviewedCount` surfaces as a badge.

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
