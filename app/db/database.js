import pg from "pg";
const { Pool } = pg;

const poolConfig = {
  host: process.env.PGHOST || "punintended-db",
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || "punintended",
  user: process.env.PGUSER || "punintended",
  max: 20,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  ssl: false,
};

if (process.env.PGPASSWORD) {
  poolConfig.password = process.env.PGPASSWORD;
}

const pool = new Pool(poolConfig);

pool.on("connect", () => {
  console.log("Database connected successfully");
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

async function query(text, params, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      lastError = error;
      const isTransient =
        error.code === "ECONNREFUSED" ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "57P03" ||
        error.code === "53300" ||
        error.code === "08006" ||
        error.code === "08003";

      if (!isTransient || attempt >= retries) throw error;

      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.warn(`Query failed (attempt ${attempt}/${retries}), retrying in ${backoffMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

// --- User functions ---

async function findOrCreateUser(googleProfile) {
  const { id: googleId, emails, displayName, photos } = googleProfile;
  const email = emails && emails[0] ? emails[0].value : null;
  const photoUrl = photos && photos[0] ? photos[0].value : null;

  if (!email) throw new Error("Email not provided by Google");

  let result = await query("SELECT * FROM users WHERE google_id = $1", [googleId]);

  if (result.rows.length > 0) {
    result = await query(
      `UPDATE users SET display_name = $1, photo_url = $2, email = $3, updated_at = NOW()
       WHERE google_id = $4 RETURNING *`,
      [displayName, photoUrl, email, googleId]
    );
    return result.rows[0];
  }

  result = await query(
    `INSERT INTO users (google_id, email, display_name, photo_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [googleId, email, displayName, photoUrl]
  );
  return result.rows[0];
}

async function getUserById(userId) {
  const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows[0];
}

// --- Session functions ---

async function createSession(name, ownerId, challenge) {
  const result = await query(
    `INSERT INTO game_sessions (name, owner_id, challenge_topic, challenge_focus, challenge_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, ownerId, challenge.topic, challenge.focus, challenge.challengeId]
  );
  const session = result.rows[0];
  await query(
    `INSERT INTO session_players (session_id, user_id) VALUES ($1, $2)`,
    [session.id, ownerId]
  );
  return session;
}

async function getAllSessions() {
  const result = await query(
    `SELECT gs.*,
       COALESCE(json_agg(
         json_build_object('uid', u.id, 'name', u.display_name, 'photoURL', u.photo_url)
         ORDER BY sp.joined_at
       ) FILTER (WHERE u.id IS NOT NULL), '[]') AS players
     FROM game_sessions gs
     LEFT JOIN session_players sp ON gs.id = sp.session_id
     LEFT JOIN users u ON sp.user_id = u.id
     GROUP BY gs.id
     ORDER BY gs.created_at DESC`
  );
  return result.rows.map(formatSession);
}

async function getSessionById(sessionId) {
  const result = await query(
    `SELECT gs.*,
       COALESCE(json_agg(
         json_build_object('uid', u.id, 'name', u.display_name, 'photoURL', u.photo_url)
         ORDER BY sp.joined_at
       ) FILTER (WHERE u.id IS NOT NULL), '[]') AS players
     FROM game_sessions gs
     LEFT JOIN session_players sp ON gs.id = sp.session_id
     LEFT JOIN users u ON sp.user_id = u.id
     WHERE gs.id = $1
     GROUP BY gs.id`,
    [sessionId]
  );
  return result.rows[0] ? formatSession(result.rows[0]) : null;
}

async function joinSession(sessionId, userId) {
  await query(
    `INSERT INTO session_players (session_id, user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [sessionId, userId]
  );
}

async function deleteSession(sessionId) {
  await query("DELETE FROM game_sessions WHERE id = $1", [sessionId]);
}

async function updateSessionChallenge(sessionId, topic, focus, challengeId) {
  await query(
    `UPDATE game_sessions SET challenge_topic = $1, challenge_focus = $2, challenge_id = $3
     WHERE id = $4`,
    [topic, focus, challengeId, sessionId]
  );
}

function formatSession(row) {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    players: row.players || [],
    challenge: row.challenge_topic
      ? { topic: row.challenge_topic, focus: row.challenge_focus }
      : null,
    challengeId: row.challenge_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Pun functions ---

async function getPunsBySessionAndChallenge(sessionId, challengeId, viewerId = null) {
  const result = await query(
    `SELECT p.*,
       u.display_name AS author_name,
       u.photo_url AS author_photo,
       jsonb_build_object(
         'clever', COUNT(*) FILTER (WHERE pr.reaction = 'clever'),
         'laugh', COUNT(*) FILTER (WHERE pr.reaction = 'laugh'),
         'groan', COUNT(*) FILTER (WHERE pr.reaction = 'groan'),
         'fire', COUNT(*) FILTER (WHERE pr.reaction = 'fire'),
         'wild', COUNT(*) FILTER (WHERE pr.reaction = 'wild')
       ) AS reaction_counts,
       COALESCE(SUM(
         CASE pr.reaction
           WHEN 'clever' THEN 2
           WHEN 'laugh' THEN 2
           WHEN 'groan' THEN 1
           WHEN 'fire' THEN 3
           WHEN 'wild' THEN 3
           ELSE 0
         END
       ), 0) AS reaction_total,
       MAX(pr.reaction) FILTER (WHERE pr.user_id = $3) AS my_reaction
     FROM puns p
     JOIN users u ON p.author_id = u.id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     WHERE p.session_id = $1 AND p.challenge_id = $2
     GROUP BY p.id, u.display_name, u.photo_url
     ORDER BY reaction_total DESC, p.ai_score DESC NULLS LAST, p.created_at DESC`,
    [sessionId, challengeId, viewerId]
  );
  return result.rows.map(formatPun);
}

async function createPun(sessionId, challengeId, authorId, text) {
  const result = await query(
    `INSERT INTO puns (session_id, challenge_id, author_id, text)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [sessionId, challengeId, authorId, text]
  );
  return result.rows[0];
}

async function updatePunText(punId, text) {
  await query(
    `UPDATE puns SET text = $1, ai_score = NULL, ai_feedback = 'Re-evaluating...' WHERE id = $2`,
    [text, punId]
  );
}

async function updatePunScore(punId, score, feedback) {
  await query(
    `UPDATE puns SET ai_score = $1, ai_feedback = $2 WHERE id = $3`,
    [score, feedback, punId]
  );
}

async function deletePun(punId) {
  await query("DELETE FROM puns WHERE id = $1", [punId]);
}

async function getPunById(punId) {
  const result = await query("SELECT * FROM puns WHERE id = $1", [punId]);
  return result.rows[0];
}

async function setPunReaction(punId, userId, reaction) {
  if (!reaction) {
    await query("DELETE FROM pun_reactions WHERE pun_id = $1 AND user_id = $2", [punId, userId]);
    return null;
  }

  const result = await query(
    `INSERT INTO pun_reactions (pun_id, user_id, reaction)
     VALUES ($1, $2, $3)
     ON CONFLICT (pun_id, user_id)
     DO UPDATE SET reaction = EXCLUDED.reaction, updated_at = NOW()
     RETURNING reaction`,
    [punId, userId, reaction]
  );
  return result.rows[0].reaction;
}

async function getPunsByAuthor(authorId) {
  const result = await query(
    `SELECT p.*,
       u.display_name AS author_name,
       u.photo_url AS author_photo,
       jsonb_build_object(
         'clever', COUNT(*) FILTER (WHERE pr.reaction = 'clever'),
         'laugh', COUNT(*) FILTER (WHERE pr.reaction = 'laugh'),
         'groan', COUNT(*) FILTER (WHERE pr.reaction = 'groan'),
         'fire', COUNT(*) FILTER (WHERE pr.reaction = 'fire'),
         'wild', COUNT(*) FILTER (WHERE pr.reaction = 'wild')
       ) AS reaction_counts,
       COALESCE(SUM(
         CASE pr.reaction
           WHEN 'clever' THEN 2
           WHEN 'laugh' THEN 2
           WHEN 'groan' THEN 1
           WHEN 'fire' THEN 3
           WHEN 'wild' THEN 3
           ELSE 0
         END
       ), 0) AS reaction_total,
       NULL::varchar AS my_reaction
     FROM puns p
     JOIN users u ON p.author_id = u.id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     WHERE p.author_id = $1
     GROUP BY p.id, u.display_name, u.photo_url
     ORDER BY p.created_at DESC`,
    [authorId]
  );
  return result.rows.map(formatPun);
}

async function countPunsByAuthorInSession(sessionId, challengeId, authorId) {
  const result = await query(
    "SELECT COUNT(*) FROM puns WHERE session_id = $1 AND challenge_id = $2 AND author_id = $3",
    [sessionId, challengeId, authorId]
  );
  return parseInt(result.rows[0].count, 10);
}

async function getMinPunCountInSession(sessionId, challengeId) {
  const result = await query(
    `SELECT COALESCE(MIN(cnt), 0) AS min_count FROM (
       SELECT COUNT(p.id) AS cnt
       FROM session_players sp
       LEFT JOIN puns p ON p.author_id = sp.user_id AND p.session_id = sp.session_id AND p.challenge_id = $2
       WHERE sp.session_id = $1
       GROUP BY sp.user_id
     ) sub`,
    [sessionId, challengeId]
  );
  return parseInt(result.rows[0].min_count, 10);
}

function formatPun(row) {
  const reactionCounts = row.reaction_counts || {
    clever: 0,
    laugh: 0,
    groan: 0,
    fire: 0,
    wild: 0,
  };

  return {
    id: row.id,
    sessionId: row.session_id,
    challengeId: row.challenge_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorPhoto: row.author_photo,
    text: row.text,
    aiScore: row.ai_score ? parseFloat(row.ai_score) : null,
    aiFeedback: row.ai_feedback,
    reactions: {
      clever: Number(reactionCounts.clever || 0),
      laugh: Number(reactionCounts.laugh || 0),
      groan: Number(reactionCounts.groan || 0),
      fire: Number(reactionCounts.fire || 0),
      wild: Number(reactionCounts.wild || 0),
    },
    reactionTotal: Number(row.reaction_total || 0),
    myReaction: row.my_reaction || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Message functions ---

async function getMessagesBySession(sessionId) {
  const result = await query(
    `SELECT m.*, u.display_name AS user_name, u.photo_url AS user_photo
     FROM messages m
     JOIN users u ON m.user_id = u.id
     WHERE m.session_id = $1
     ORDER BY m.created_at ASC`,
    [sessionId]
  );
  return result.rows.map(formatMessage);
}

async function createMessage(sessionId, userId, text) {
  const result = await query(
    `INSERT INTO messages (session_id, user_id, text) VALUES ($1, $2, $3) RETURNING *`,
    [sessionId, userId, text]
  );
  return result.rows[0];
}

function formatMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.user_photo,
    text: row.text,
    createdAt: row.created_at,
  };
}

// --- Comment functions ---

async function getCommentsBySession(sessionId) {
  const result = await query(
    `SELECT pc.*, u.display_name AS user_name, u.photo_url AS user_photo
     FROM pun_comments pc
     JOIN users u ON pc.user_id = u.id
     WHERE pc.session_id = $1
     ORDER BY pc.created_at ASC`,
    [sessionId]
  );
  return result.rows.map(formatComment);
}

async function getCommentsByPun(punId) {
  const result = await query(
    `SELECT pc.*, u.display_name AS user_name, u.photo_url AS user_photo
     FROM pun_comments pc
     JOIN users u ON pc.user_id = u.id
     WHERE pc.pun_id = $1
     ORDER BY pc.created_at ASC`,
    [punId]
  );
  return result.rows.map(formatComment);
}

async function createComment(punId, sessionId, userId, text) {
  const result = await query(
    `INSERT INTO pun_comments (pun_id, session_id, user_id, text) VALUES ($1, $2, $3, $4) RETURNING *`,
    [punId, sessionId, userId, text]
  );
  return result.rows[0];
}

function formatComment(row) {
  return {
    id: row.id,
    punId: row.pun_id,
    sessionId: row.session_id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.user_photo,
    text: row.text,
    createdAt: row.created_at,
  };
}

// --- Notification functions ---

async function getNotificationsByUser(userId) {
  const result = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows.map(formatNotification);
}

async function createNotification(userId, type, message, link) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, message, link) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, type, message, link || null]
  );
  return result.rows[0];
}

async function markNotificationRead(notificationId) {
  await query("UPDATE notifications SET read = TRUE WHERE id = $1", [notificationId]);
}

function formatNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    message: row.message,
    read: row.read,
    link: row.link,
    createdAt: row.created_at,
  };
}

export {
  pool,
  query,
  findOrCreateUser,
  getUserById,
  createSession,
  getAllSessions,
  getSessionById,
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
};
