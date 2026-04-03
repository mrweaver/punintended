/**
 * server.js — Application entry point.
 *
 * Bootstrap-only: loads environment, applies middleware, mounts all route
 * modules, serves the React SPA, and starts the HTTP server after running
 * database migrations.
 */
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "./db/database.js";
import { applyMiddleware } from "./middleware/index.js";
import { startHeartbeat } from "./services/sse.js";
import analyticsRoutes from "./routes/analytics.js";
import authRoutes from "./routes/auth.js";
import dailyRoutes from "./routes/daily.js";
import gauntletRoutes from "./routes/gauntlet.js";
import groupsRoutes from "./routes/groups.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import notificationRoutes from "./routes/notifications.js";
import profileRoutes from "./routes/profile.js";
import reactionRoutes from "./routes/reactions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
applyMiddleware(app);

// --- Routes ---
// Analytics proxy must be registered before express.json() body parsing kicks in
// for the raw body handler, but applyMiddleware already sets up json parsing.
// The analytics router uses its own express.raw() middleware on its POST route.
app.use(analyticsRoutes);
app.use(authRoutes);
app.use(dailyRoutes);
app.use(groupsRoutes);
app.use(gauntletRoutes);
app.use(notificationRoutes);
app.use(leaderboardRoutes);
app.use(profileRoutes);
app.use(reactionRoutes);

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// --- Serve React static files ---
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// --- Start ---
startHeartbeat();

runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`PunIntended server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Migration failed, aborting startup:", err);
    process.exit(1);
  });
