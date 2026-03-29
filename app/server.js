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
  saveChallengeToHistory,
  getChallengeHistory,
  getPastChallengeTopics,
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
  createGauntlet,
  getGauntletById,
  createGauntletRun,
  getGauntletRunById,
  submitGauntletRound,
  updateGauntletRoundScore,
  finalizeGauntletRun,
  setGauntletRunScoring,
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

    CRITICAL RULE: The Topic and Focus MUST be completely unrelated and contrasting. Do NOT make them logically connected (e.g., do NOT do "Ocean Life" and "Starfish").

    - The 'Topic' should be a broad category (e.g., "Human Body", "IT Infrastructure", "History", "Power Tools").
    - The 'Focus' should be a specific, unrelated object, situation, or place (e.g., "Bread", "A Flat Tire", "Coffee", "A Retaining Wall").

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
    contents: `Evaluate this pun. Topic: '${topic}'. Focus: '${focus}'. Pun: "${punText}".
    
    Persona Tone & Mechanics:
    You are a sharp, dry, and deadpan judge. Your humour is rooted in British and Australian comedic sensibilities: understated sarcasm, affectionate mockery ("taking the piss"), and a slightly weary but sharp intellect. 
    
    CRITICAL NEGATIVE PROMPT: Do NOT use forced colloquialisms, slang (e.g., "mate", "crikey", "blimey", "cheers"), or cultural stereotypes (no mentions of pubs, pints, kangaroos, or regional tropes). The humour must rely purely on dry, structural wit and deadpan delivery, not caricature.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasoning: {
            type: Type.STRING,
            description:
              "Internal logic. Briefly analyze if the pun phonetically or semantically links the Topic and Focus. Do not show to the user.",
          },
          score: {
            type: Type.INTEGER,
            description:
              "Score 0-10. CRITICAL RULE: To score 7 or above, the submission MUST contain actual phonetic wordplay. Acronyms or purely logical jokes without phonetic puns are clever, but must be capped at a maximum score of 6.",
          },
          feedback: {
            type: Type.STRING,
            description:
              "1-2 sentences max. Speak directly to the player using Australian English spelling (e.g., humour, realise). Tone matching: 0-3 gets an elegant, deadpan roast; 4-6 gets a weary groan; 7-10 gets understated, grudging respect. Do not use exclamation marks to feign excitement.",
          },
        },
        required: ["reasoning", "score", "feedback"],
      },
    },
  });
  return JSON.parse(response.text);
}

async function generateGauntletPrompts() {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: `Generate 5 completely unique 'Topic' and 'Focus' pairs for a rapid-fire pun-making game.

    CRITICAL RULES:
    1. All 5 pairs must be completely unrelated — no logical connections between Topic and Focus.
    2. All 5 Topics must be different from each other.
    3. All 5 Focuses must be different from each other.
    4. Topics: broad categories (e.g., "Human Body", "Medieval History", "Power Tools").
    5. Focuses: specific, unrelated objects or situations (e.g., "A Parking Ticket", "Sourdough Bread").

    Use Australian English spelling throughout. Return as JSON with a 'rounds' array of exactly 5 objects.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          rounds: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                focus: { type: Type.STRING },
              },
              required: ["topic", "focus"],
            },
          },
        },
        required: ["rounds"],
      },
    },
  });
  return JSON.parse(response.text);
}

// --- SSE Infrastructure ---
const sessionClients = new Map(); // sessionId -> Set<res>
const notificationClients = new Map(); // userId -> Set<res>
const gauntletClients = new Map(); // runId -> Set<res>

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
  if (!notificationClients.has(userId))
    notificationClients.set(userId, new Set());
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

function addGauntletClient(runId, res) {
  if (!gauntletClients.has(runId)) gauntletClients.set(runId, new Set());
  gauntletClients.get(runId).add(res);
}

function removeGauntletClient(runId, res) {
  const clients = gauntletClients.get(runId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) gauntletClients.delete(runId);
  }
}

function broadcastToGauntletRun(runId, event, data) {
  const clients = gauntletClients.get(runId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      removeGauntletClient(runId, client);
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
  for (const [, clients] of gauntletClients) {
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
        connectSrc: [
          "'self'",
          "https://cloudflareinsights.com",
          "https://static.cloudflareinsights.com",
        ],
        fontSrc: ["'self'"],
      },
    },
  }),
);

app.use(
  compression({
    // Do not compress SSE responses; buffering can delay chunks and trigger gateway timeouts.
    filter: (req, res) => {
      const accept = req.headers.accept || "";
      const contentType = String(res.getHeader("Content-Type") || "");
      if (
        accept.includes("text/event-stream") ||
        contentType.includes("text/event-stream")
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
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
      return res
        .status(upstream.status)
        .send("Failed to load analytics script");
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

app.post(
  "/umami/api/send",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
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
  },
);

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
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?login=failed" }),
  (req, res) => {
    res.redirect("/?login=success");
  },
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
  if (!name || !name.trim())
    return res.status(400).json({ error: "Session name required" });

  try {
    const todayId = new Date().toISOString().split("T")[0];
    const challenge = await generateDailyChallenge();
    const session = await createSession(name.trim(), req.user.id, {
      ...challenge,
      challengeId: todayId,
    });
    await saveChallengeToHistory(
      session.id,
      todayId,
      challenge.topic,
      challenge.focus,
    );
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

app.post(
  "/api/sessions/:id/refresh-challenge",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const session = await getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.ownerId !== req.user.id)
        return res.status(403).json({ error: "Only the owner can refresh" });

      const todayId = new Date().toISOString().split("T")[0];
      const pastChallenges = await getPastChallengeTopics(req.params.id);
      const challenge = await generateDailyChallenge(pastChallenges);
      await updateSessionChallenge(
        req.params.id,
        challenge.topic,
        challenge.focus,
        todayId,
      );
      await saveChallengeToHistory(
        req.params.id,
        todayId,
        challenge.topic,
        challenge.focus,
      );

      // Notify other players
      for (const player of session.players) {
        if (player.uid !== req.user.id) {
          await createNotification(
            player.uid,
            "system",
            `The host refreshed the challenge in "${session.name}".`,
            session.id,
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
  },
);

app.get("/api/sessions/:id/history", ensureAuthenticated, async (req, res) => {
  try {
    const history = await getChallengeHistory(req.params.id);
    res.json(history);
  } catch (error) {
    console.error("Failed to get challenge history:", error);
    res.status(500).json({ error: "Failed to get challenge history" });
  }
});

// --- Pun API ---
app.get("/api/sessions/:id/puns", ensureAuthenticated, async (req, res) => {
  try {
    const challengeId =
      req.query.challengeId || new Date().toISOString().split("T")[0];
    const puns = await getPunsBySessionAndChallenge(
      req.params.id,
      challengeId,
      req.user.id,
    );
    res.json(puns);
  } catch (error) {
    console.error("Failed to get puns:", error);
    res.status(500).json({ error: "Failed to get puns" });
  }
});

app.post("/api/sessions/:id/puns", ensureAuthenticated, async (req, res) => {
  const { text, responseTimeMs } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ error: "Pun text required" });
  if (text.length > 500)
    return res.status(400).json({ error: "Pun too long (max 500 chars)" });
  const validatedResponseTimeMs =
    Number.isInteger(responseTimeMs) && responseTimeMs > 0
      ? responseTimeMs
      : null;

  const sessionId = req.params.id;
  const todayId = new Date().toISOString().split("T")[0];

  try {
    const session = await getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Fair play enforcement: server-side
    if (session.players.length > 1) {
      const myCount = await countPunsByAuthorInSession(
        sessionId,
        todayId,
        req.user.id,
      );
      const minCount = await getMinPunCountInSession(sessionId, todayId);
      if (myCount > minCount) {
        return res.status(429).json({
          error:
            "Wait for others to catch up! Everyone must submit a pun before you can go again.",
        });
      }
    }

    const pun = await createPun(
      sessionId,
      todayId,
      req.user.id,
      text.trim(),
      validatedResponseTimeMs,
    );
    broadcastPunsUpdate(sessionId, todayId);

    // Score asynchronously
    if (session.challenge) {
      scorePunText(
        session.challenge.topic,
        session.challenge.focus,
        text.trim(),
      )
        .then(async (result) => {
          // OPTIONAL: Log the reasoning for your own server diagnostics
          console.log(`[Pun ID: ${pun.id}] AI Reasoning: ${result.reasoning}`);

          await updatePunScore(pun.id, result.score, result.feedback);
          broadcastPunsUpdate(sessionId, todayId);
        })
        .catch(async (err) => {
          console.error("AI scoring failed:", err);
          // OPTIONAL: Write a fallback state to the DB so the frontend doesn't hang
          await updatePunScore(
            pun.id,
            0,
            "The judge fell asleep at the bar. Please edit and resubmit!",
          );
          broadcastPunsUpdate(sessionId, todayId);
        });
    }

    res.json({ id: pun.id });
  } catch (error) {
    console.error("Failed to submit pun:", error);
    res.status(500).json({ error: "Failed to submit pun" });
  }
});

app.put("/api/puns/:id", ensureAuthenticated, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ error: "Pun text required" });

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
      scorePunText(
        session.challenge.topic,
        session.challenge.focus,
        text.trim(),
      )
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
  const allowedReactions = new Set([
    "clever",
    "laugh",
    "groan",
    "fire",
    "wild",
  ]);

  if (
    reaction !== null &&
    reaction !== undefined &&
    !allowedReactions.has(reaction)
  ) {
    return res.status(400).json({ error: "Invalid reaction" });
  }

  try {
    const pun = await getPunById(req.params.id);
    if (!pun) return res.status(404).json({ error: "Pun not found" });

    const selectedReaction = await setPunReaction(
      req.params.id,
      req.user.id,
      reaction || null,
    );

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
        pun.session_id,
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

app.post(
  "/api/sessions/:id/messages",
  ensureAuthenticated,
  async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim())
      return res.status(400).json({ error: "Message text required" });
    if (text.length > 500)
      return res.status(400).json({ error: "Message too long" });

    try {
      await createMessage(req.params.id, req.user.id, text.trim());
      broadcastMessagesUpdate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to send message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  },
);

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
  if (!text || !text.trim())
    return res.status(400).json({ error: "Comment text required" });
  if (text.length > 500)
    return res.status(400).json({ error: "Comment too long" });
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

app.put(
  "/api/notifications/:id/read",
  ensureAuthenticated,
  async (req, res) => {
    try {
      await markNotificationRead(req.params.id);
      broadcastNotificationUpdate(req.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to mark notification:", error);
      res.status(500).json({ error: "Failed to mark notification" });
    }
  },
);

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


// --- Gauntlet routes ---

async function maybeFinalize(runId) {
  const run = await getGauntletRunById(runId);
  if (!run || run.status === "complete") return;
  const allScored =
    run.rounds.length === 5 &&
    run.rounds.every(
      (r) => r.round_score !== null && r.round_score !== undefined,
    );
  if (allScored) {
    const total = run.rounds.reduce((sum, r) => sum + (r.round_score || 0), 0);
    const finalRun = await finalizeGauntletRun(runId, total);
    if (finalRun) {
      broadcastToGauntletRun(runId, "gauntlet-run-complete", finalRun);
    }
  }
}

app.post("/api/gauntlet/generate", ensureAuthenticated, async (req, res) => {
  try {
    const { rounds } = await generateGauntletPrompts();
    const gauntlet = await createGauntlet(req.user.id, rounds);
    const run = await createGauntletRun(gauntlet.id, req.user.id);
    res.json({ gauntletId: gauntlet.id, runId: run.id, rounds: gauntlet.rounds });
  } catch (err) {
    console.error("Failed to generate gauntlet:", err);
    res.status(500).json({ error: "Failed to generate gauntlet" });
  }
});

app.get("/api/gauntlet/:id", ensureAuthenticated, async (req, res) => {
  try {
    const gauntlet = await getGauntletById(req.params.id);
    if (!gauntlet) return res.status(404).json({ error: "Gauntlet not found" });
    const run = await createGauntletRun(gauntlet.id, req.user.id);
    res.json({ gauntletId: gauntlet.id, runId: run.id, rounds: gauntlet.rounds });
  } catch (err) {
    console.error("Failed to start gauntlet:", err);
    res.status(500).json({ error: "Failed to start gauntlet" });
  }
});

app.post(
  "/api/gauntlet/:id/submit-round",
  ensureAuthenticated,
  async (req, res) => {
    const { runId, roundIndex, punText, secondsRemaining } = req.body;
    if (typeof roundIndex !== "number" || roundIndex < 0 || roundIndex > 4)
      return res.status(400).json({ error: "Invalid round index" });
    const cleanText = typeof punText === "string" ? punText.trim() : "";
    if (cleanText.length > 500)
      return res.status(400).json({ error: "Pun too long" });
    // secondsRemaining is client-supplied (V1 - casual game, no global leaderboard).
    // V2 fix: record round_started_at server-side and compute elapsed on submission.
    const validSecs =
      Number.isInteger(secondsRemaining) &&
      secondsRemaining >= 0 &&
      secondsRemaining <= 60
        ? secondsRemaining
        : 0;

    try {
      const gauntlet = await getGauntletById(req.params.id);
      if (!gauntlet)
        return res.status(404).json({ error: "Gauntlet not found" });
      const run = await getGauntletRunById(runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.playerId !== req.user.id)
        return res.status(403).json({ error: "Not your run" });
      if (run.status !== "in_progress")
        return res.status(409).json({ error: "Run no longer in progress" });

      await submitGauntletRound(runId, roundIndex, cleanText, validSecs);
      if (roundIndex === 4) await setGauntletRunScoring(runId);

      res.json({ success: true });

      if (cleanText) {
        const { topic, focus } = gauntlet.rounds[roundIndex];
        scorePunText(topic, focus, cleanText)
          .then(async ({ score, feedback, reasoning }) => {
            console.log(`[Gauntlet ${runId} R${roundIndex}] ${reasoning}`);
            await updateGauntletRoundScore(runId, roundIndex, score, feedback);
            await maybeFinalize(runId);
          })
          .catch(async (err) => {
            console.error(
              `Gauntlet scoring failed run=${runId} round=${roundIndex}:`,
              err,
            );
            await updateGauntletRoundScore(
              runId,
              roundIndex,
              0,
              "The judge fell asleep at the bar. No score for this round.",
            );
            await maybeFinalize(runId);
          });
      } else {
        // Timer expired - score as zero immediately, no AI call needed
        await updateGauntletRoundScore(
          runId,
          roundIndex,
          0,
          "Time's up - no pun submitted.",
        );
        await maybeFinalize(runId);
      }
    } catch (err) {
      console.error("Failed to submit gauntlet round:", err);
      res.status(500).json({ error: "Failed to submit round" });
    }
  },
);

app.get(
  "/api/gauntlet/:id/run/:runId/stream",
  ensureAuthenticated,
  async (req, res) => {
    const run = await getGauntletRunById(req.params.runId).catch(() => null);
    if (!run) return res.status(404).json({ error: "Run not found" });
    if (run.playerId !== req.user.id)
      return res.status(403).json({ error: "Not your run" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(":connected\n\n");

    const runId = req.params.runId;
    addGauntletClient(runId, res);

    // Push immediately if scoring already finished before SSE connected
    if (run.status === "complete") {
      broadcastToGauntletRun(runId, "gauntlet-run-complete", run);
    }

    req.on("close", () => removeGauntletClient(runId, res));
  },
);

app.get(
  "/api/gauntlet/:id/run/:runId",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const run = await getGauntletRunById(req.params.runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.playerId !== req.user.id)
        return res.status(403).json({ error: "Not your run" });
      res.json(run);
    } catch (err) {
      console.error("Failed to get gauntlet run:", err);
      res.status(500).json({ error: "Failed to get run" });
    }
  },
);

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
