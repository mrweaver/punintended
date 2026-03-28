import "dotenv/config";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import { fileURLToPath } from "url";
import passport from "./auth/passport.js";
import { GoogleGenAI, Type } from "@google/genai";
import {
  pool,
  getAllSessions,
  getSessionById,
  createSession,
  joinSession,
  deleteSession,
  updateSessionChallenge,
  getPunsBySessionAndChallenge,
  createPun,
  updatePunText,
  updatePunScore,
  deletePun,
  getPunById,
  setPunReaction,
  getPunsByAuthor,
  countPunsByAuthorInSession,
  getMinPunCountInSession,
  getMessagesBySession,
  createMessage,
  getCommentsBySession,
  getCommentsByPun,
  createComment,
  getNotificationsByUser,
  createNotification,
  markNotificationRead,
  runMigrations,
} from "./db/database.js";

const pgSession = connectPgSimple(session);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UMAMI_BASE_URL = process.env.UMAMI_BASE_URL || "http://umami:3000";

// --- Gemini AI ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateDailyChallenge() {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: `Generate a unique 'Topic' and 'Focus' for a pun-making game inspired by Punderdome.

    CRITICAL RULE: The Topic and Focus MUST be completely unrelated and contrasting. Do NOT make them similar or logically connected (e.g., do NOT do "Ocean Life" and "Starfish").

    - The 'Topic' should be a broad category (e.g., "Human Body", "Music", "Technology", "History", "Animals").
    - The 'Focus' should be a specific, unrelated object, situation, or place (e.g., "Bread", "The Grocery Store", "A Flat Tire", "Coffee", "Office Supplies").

    The goal is to force players to make creative puns connecting two completely different concepts. Return as JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          focus: { type: Type.STRING },
        },
        required: ["topic", "focus"],
      },
    },
  });
  return JSON.parse(response.text);
}

async function scorePunText(topic, focus, punText) {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: `Score this pun based on the topic '${topic}' and focus '${focus}'. The pun is: "${punText}".
    Evaluate for creativity, humor, and how well it bridges both concepts.
    You are a jaded comedy critic who has heard it all. Be direct. One sentence only. No filler. If it's bad, say so plainly. If it's good, grudgingly admit it. Never use exclamation marks.
    Provide a score from 0 to 10 and your one-sentence feedback. Return as JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
        },
        required: ["score", "feedback"],
      },
    },
  });
  return JSON.parse(response.text);
}

// --- SSE Infrastructure ---
const sessionClients = new Map(); // sessionId -> Set<res>
const notificationClients = new Map(); // userId -> Set<res>

function addSessionClient(sessionId, res) {
  if (!sessionClients.has(sessionId)) sessionClients.set(sessionId, new Set());
  sessionClients.get(sessionId).add(res);
}

function removeSessionClient(sessionId, res) {
  const clients = sessionClients.get(sessionId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) sessionClients.delete(sessionId);
  }
}

function addNotificationClient(userId, res) {
  if (!notificationClients.has(userId)) notificationClients.set(userId, new Set());
  notificationClients.get(userId).add(res);
}

function removeNotificationClient(userId, res) {
  const clients = notificationClients.get(userId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) notificationClients.delete(userId);
  }
}

function broadcastToSession(sessionId, event, data) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected
    }
  }
}

function broadcastToUser(userId, event, data) {
  const clients = notificationClients.get(userId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected
    }
  }
}

// Broadcast full session data to all clients in that session
async function broadcastSessionUpdate(sessionId) {
  const session = await getSessionById(sessionId);
  if (session) broadcastToSession(sessionId, "session-update", session);
}

async function broadcastPunsUpdate(sessionId, challengeId) {
  broadcastToSession(sessionId, "puns-update", {
    challengeId,
    updatedAt: new Date().toISOString(),
  });
}

async function broadcastMessagesUpdate(sessionId) {
  const messages = await getMessagesBySession(sessionId);
  broadcastToSession(sessionId, "messages-update", messages);
}

async function broadcastCommentsUpdate(sessionId) {
  const comments = await getCommentsBySession(sessionId);
  broadcastToSession(sessionId, "comments-update", comments);
}

async function broadcastNotificationUpdate(userId) {
  const notifications = await getNotificationsByUser(userId);
  broadcastToUser(userId, "notifications-update", notifications);
}

// Heartbeat every 30s to prevent proxy timeouts
setInterval(() => {
  for (const [, clients] of sessionClients) {
    for (const client of clients) {
      try {
        client.write(":heartbeat\n\n");
      } catch {
        // Will be cleaned up on close
      }
    }
  }
  for (const [, clients] of notificationClients) {
    for (const client of clients) {
      try {
        client.write(":heartbeat\n\n");
      } catch {
        // Will be cleaned up on close
      }
    }
  }
}, 30000);

// --- Middleware ---
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
        connectSrc: ["'self'", "https://cloudflareinsights.com", "https://static.cloudflareinsights.com"],
        fontSrc: ["'self'"],
      },
    },
  })
);

app.use(
  compression({
    // Do not compress SSE responses; buffering can delay chunks and trigger gateway timeouts.
    filter: (req, res) => {
      const accept = req.headers.accept || "";
      const contentType = String(res.getHeader("Content-Type") || "");
      if (accept.includes("text/event-stream") || contentType.includes("text/event-stream")) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// --- Umami proxy routes ---
app.get("/umami/script.js", async (req, res) => {
  try {
    const upstream = await fetch(`${UMAMI_BASE_URL}/script.js`, {
      headers: {
        "user-agent": req.get("user-agent") || "PunIntended/umami-proxy",
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send("Failed to load analytics script");
    }

    const script = await upstream.text();
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(script);
  } catch (error) {
    console.error("Umami script proxy failed:", error);
    res.status(502).send("Analytics proxy error");
  }
});

app.post("/umami/api/send", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  try {
    const upstream = await fetch(`${UMAMI_BASE_URL}/api/send`, {
      method: "POST",
      headers: {
        "content-type": req.get("content-type") || "application/json",
        "user-agent": req.get("user-agent") || "PunIntended/umami-proxy",
      },
      body: req.body,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    if (upstream.headers.get("content-type")) {
      res.setHeader("Content-Type", upstream.headers.get("content-type"));
    }
    res.send(text);
  } catch (error) {
    console.error("Umami event proxy failed:", error);
    res.status(502).json({ error: "Analytics proxy error" });
  }
});

app.use(express.json());

const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: "session",
    pruneSessionInterval: 15 * 60,
  }),
  secret: process.env.SESSION_SECRET || "change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// --- Auth middleware ---
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

// --- Auth routes ---
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?login=failed" }),
  (req, res) => {
    res.redirect("/?login=success");
  }
);

app.post("/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

app.get("/auth/user", (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({
    user: {
      uid: req.user.id,
      displayName: req.user.display_name,
      photoURL: req.user.photo_url,
      email: req.user.email,
    },
  });
});

// --- SSE routes ---
app.get("/api/sessions/:id/stream", ensureAuthenticated, (req, res) => {
  const sessionId = req.params.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("\n");

  addSessionClient(sessionId, res);

  req.on("close", () => {
    removeSessionClient(sessionId, res);
  });
});

app.get("/api/notifications/stream", ensureAuthenticated, (req, res) => {
  const userId = req.user.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("\n");

  addNotificationClient(userId, res);

  req.on("close", () => {
    removeNotificationClient(userId, res);
  });
});

// --- Session API ---
app.get("/api/sessions", ensureAuthenticated, async (req, res) => {
  try {
    const sessions = await getAllSessions();
    res.json(sessions);
  } catch (error) {
    console.error("Failed to get sessions:", error);
    res.status(500).json({ error: "Failed to get sessions" });
  }
});

app.post("/api/sessions", ensureAuthenticated, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Session name required" });

  try {
    const todayId = new Date().toISOString().split("T")[0];
    const challenge = await generateDailyChallenge();
    const session = await createSession(name.trim(), req.user.id, {
      ...challenge,
      challengeId: todayId,
    });
    const fullSession = await getSessionById(session.id);
    res.json(fullSession);
  } catch (error) {
    console.error("Failed to create session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

app.post("/api/sessions/:id/join", ensureAuthenticated, async (req, res) => {
  try {
    await joinSession(req.params.id, req.user.id);
    const session = await getSessionById(req.params.id);
    broadcastSessionUpdate(req.params.id);
    res.json(session);
  } catch (error) {
    console.error("Failed to join session:", error);
    res.status(500).json({ error: "Failed to join session" });
  }
});

app.delete("/api/sessions/:id", ensureAuthenticated, async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.ownerId !== req.user.id)
      return res.status(403).json({ error: "Only the owner can delete" });

    await deleteSession(req.params.id);
    broadcastToSession(req.params.id, "session-deleted", { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

app.post("/api/sessions/:id/refresh-challenge", ensureAuthenticated, async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.ownerId !== req.user.id)
      return res.status(403).json({ error: "Only the owner can refresh" });

    const todayId = new Date().toISOString().split("T")[0];
    const challenge = await generateDailyChallenge();
    await updateSessionChallenge(req.params.id, challenge.topic, challenge.focus, todayId);

    // Notify other players
    for (const player of session.players) {
      if (player.uid !== req.user.id) {
        await createNotification(
          player.uid,
          "system",
          `The host refreshed the challenge in "${session.name}".`,
          session.id
        );
        broadcastNotificationUpdate(player.uid);
      }
    }

    broadcastSessionUpdate(req.params.id);
    const updated = await getSessionById(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error("Failed to refresh challenge:", error);
    res.status(500).json({ error: "Failed to refresh challenge" });
  }
});

// --- Pun API ---
app.get("/api/sessions/:id/puns", ensureAuthenticated, async (req, res) => {
  try {
    const challengeId = req.query.challengeId || new Date().toISOString().split("T")[0];
    const puns = await getPunsBySessionAndChallenge(req.params.id, challengeId, req.user.id);
    res.json(puns);
  } catch (error) {
    console.error("Failed to get puns:", error);
    res.status(500).json({ error: "Failed to get puns" });
  }
});

app.post("/api/sessions/:id/puns", ensureAuthenticated, async (req, res) => {
  const { text, responseTimeMs } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Pun text required" });
  if (text.length > 500) return res.status(400).json({ error: "Pun too long (max 500 chars)" });
  const validatedResponseTimeMs =
    Number.isInteger(responseTimeMs) && responseTimeMs > 0 ? responseTimeMs : null;

  const sessionId = req.params.id;
  const todayId = new Date().toISOString().split("T")[0];

  try {
    const session = await getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Fair play enforcement: server-side
    if (session.players.length > 1) {
      const myCount = await countPunsByAuthorInSession(sessionId, todayId, req.user.id);
      const minCount = await getMinPunCountInSession(sessionId, todayId);
      if (myCount > minCount) {
        return res.status(429).json({
          error: "Wait for others to catch up! Everyone must submit a pun before you can go again.",
        });
      }
    }

    const pun = await createPun(sessionId, todayId, req.user.id, text.trim(), validatedResponseTimeMs);
    broadcastPunsUpdate(sessionId, todayId);

    // Score asynchronously
    if (session.challenge) {
      scorePunText(session.challenge.topic, session.challenge.focus, text.trim())
        .then(async (result) => {
          await updatePunScore(pun.id, result.score, result.feedback);
          broadcastPunsUpdate(sessionId, todayId);
        })
        .catch((err) => console.error("AI scoring failed:", err));
    }

    res.json({ id: pun.id });
  } catch (error) {
    console.error("Failed to submit pun:", error);
    res.status(500).json({ error: "Failed to submit pun" });
  }
});

app.put("/api/puns/:id", ensureAuthenticated, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Pun text required" });

  try {
    const pun = await getPunById(req.params.id);
    if (!pun) return res.status(404).json({ error: "Pun not found" });
    if (pun.author_id !== req.user.id)
      return res.status(403).json({ error: "Only the author can edit" });

    await updatePunText(req.params.id, text.trim());
    broadcastPunsUpdate(pun.session_id, pun.challenge_id);

    // Re-score
    const session = await getSessionById(pun.session_id);
    if (session?.challenge) {
      scorePunText(session.challenge.topic, session.challenge.focus, text.trim())
        .then(async (result) => {
          await updatePunScore(req.params.id, result.score, result.feedback);
          broadcastPunsUpdate(pun.session_id, pun.challenge_id);
        })
        .catch((err) => console.error("AI re-scoring failed:", err));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to edit pun:", error);
    res.status(500).json({ error: "Failed to edit pun" });
  }
});

app.delete("/api/puns/:id", ensureAuthenticated, async (req, res) => {
  try {
    const pun = await getPunById(req.params.id);
    if (!pun) return res.status(404).json({ error: "Pun not found" });
    if (pun.author_id !== req.user.id)
      return res.status(403).json({ error: "Only the author can delete" });

    const { session_id, challenge_id } = pun;
    await deletePun(req.params.id);
    broadcastPunsUpdate(session_id, challenge_id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete pun:", error);
    res.status(500).json({ error: "Failed to delete pun" });
  }
});

app.post("/api/puns/:id/reaction", ensureAuthenticated, async (req, res) => {
  const { reaction } = req.body;
  const allowedReactions = new Set(["clever", "laugh", "groan", "fire", "wild"]);

  if (reaction !== null && reaction !== undefined && !allowedReactions.has(reaction)) {
    return res.status(400).json({ error: "Invalid reaction" });
  }

  try {
    const pun = await getPunById(req.params.id);
    if (!pun) return res.status(404).json({ error: "Pun not found" });

    const selectedReaction = await setPunReaction(req.params.id, req.user.id, reaction || null);

    // Notify pun author on positive reactions only.
    if (
      selectedReaction &&
      pun.author_id !== req.user.id &&
      ["clever", "laugh", "fire", "wild"].includes(selectedReaction)
    ) {
      const punText =
        pun.text.length > 30 ? pun.text.substring(0, 30) + "..." : pun.text;
      await createNotification(
        pun.author_id,
        "reaction",
        `${req.user.display_name || "Someone"} reacted (${selectedReaction}) to your pun: "${punText}"`,
        pun.session_id
      );
      broadcastNotificationUpdate(pun.author_id);
    }

    broadcastPunsUpdate(pun.session_id, pun.challenge_id);
    res.json({ reaction: selectedReaction });
  } catch (error) {
    console.error("Failed to react:", error);
    res.status(500).json({ error: "Failed to react" });
  }
});

// --- Message API ---
app.get("/api/sessions/:id/messages", ensureAuthenticated, async (req, res) => {
  try {
    const messages = await getMessagesBySession(req.params.id);
    res.json(messages);
  } catch (error) {
    console.error("Failed to get messages:", error);
    res.status(500).json({ error: "Failed to get messages" });
  }
});

app.post("/api/sessions/:id/messages", ensureAuthenticated, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text required" });
  if (text.length > 500) return res.status(400).json({ error: "Message too long" });

  try {
    await createMessage(req.params.id, req.user.id, text.trim());
    broadcastMessagesUpdate(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to send message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// --- Comment API ---
app.get("/api/puns/:id/comments", ensureAuthenticated, async (req, res) => {
  try {
    const comments = await getCommentsByPun(req.params.id);
    res.json(comments);
  } catch (error) {
    console.error("Failed to get comments:", error);
    res.status(500).json({ error: "Failed to get comments" });
  }
});

app.post("/api/puns/:id/comments", ensureAuthenticated, async (req, res) => {
  const { text, sessionId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text required" });
  if (text.length > 500) return res.status(400).json({ error: "Comment too long" });
  if (!sessionId) return res.status(400).json({ error: "Session ID required" });

  try {
    await createComment(req.params.id, sessionId, req.user.id, text.trim());
    broadcastCommentsUpdate(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// --- Notification API ---
app.get("/api/notifications", ensureAuthenticated, async (req, res) => {
  try {
    const notifications = await getNotificationsByUser(req.user.id);
    res.json(notifications);
  } catch (error) {
    console.error("Failed to get notifications:", error);
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

app.put("/api/notifications/:id/read", ensureAuthenticated, async (req, res) => {
  try {
    await markNotificationRead(req.params.id);
    broadcastNotificationUpdate(req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to mark notification:", error);
    res.status(500).json({ error: "Failed to mark notification" });
  }
});

// --- Profile API ---
app.get("/api/profile/puns", ensureAuthenticated, async (req, res) => {
  try {
    const puns = await getPunsByAuthor(req.user.id);
    res.json(puns);
  } catch (error) {
    console.error("Failed to get profile puns:", error);
    res.status(500).json({ error: "Failed to get profile puns" });
  }
});

// --- Health check ---
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Serve React static files ---
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// --- Start server ---
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
