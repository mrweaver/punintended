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
      console.warn(
        `Query failed (attempt ${attempt}/${retries}), retrying in ${backoffMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- User functions ---

async function findOrCreateUser(googleProfile) {
  const { id: googleId, emails, displayName, photos } = googleProfile;
  const email = emails && emails[0] ? emails[0].value : null;
  const photoUrl = photos && photos[0] ? photos[0].value : null;

  if (!email) throw new Error("Email not provided by Google");

  let result = await query("SELECT * FROM users WHERE google_id = $1", [
    googleId,
  ]);

  if (result.rows.length > 0) {
    result = await query(
      `UPDATE users SET display_name = $1, photo_url = $2, email = $3, updated_at = NOW()
       WHERE google_id = $4 RETURNING *`,
      [displayName, photoUrl, email, googleId],
    );
    return result.rows[0];
  }

  result = await query(
    `INSERT INTO users (google_id, email, display_name, photo_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [googleId, email, displayName, photoUrl],
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
    [name, ownerId, challenge.topic, challenge.focus, challenge.challengeId],
  );
  const session = result.rows[0];
  await query(
    `INSERT INTO session_players (session_id, user_id) VALUES ($1, $2)`,
    [session.id, ownerId],
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
     ORDER BY gs.created_at DESC`,
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
    [sessionId],
  );
  return result.rows[0] ? formatSession(result.rows[0]) : null;
}

async function joinSession(sessionId, userId) {
  await query(
    `INSERT INTO session_players (session_id, user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [sessionId, userId],
  );
}

async function deleteSession(sessionId) {
  await query("DELETE FROM game_sessions WHERE id = $1", [sessionId]);
}

async function updateSessionChallenge(sessionId, topic, focus, challengeId) {
  await query(
    `UPDATE game_sessions SET challenge_topic = $1, challenge_focus = $2, challenge_id = $3
     WHERE id = $4`,
    [topic, focus, challengeId, sessionId],
  );
}

async function renameSession(sessionId, name) {
  await query("UPDATE game_sessions SET name = $1 WHERE id = $2", [name, sessionId]);
}

async function removePlayerFromSession(sessionId, userId) {
  await query(
    "DELETE FROM session_players WHERE session_id = $1 AND user_id = $2",
    [sessionId, userId],
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

// --- Migrations ---

async function runMigrations() {
  await query(
    `ALTER TABLE puns ADD COLUMN IF NOT EXISTS response_time_ms INTEGER`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS session_challenge_history (
      session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      challenge_id VARCHAR(10) NOT NULL,
      topic VARCHAR(500) NOT NULL,
      focus VARCHAR(500) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (session_id, challenge_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS gauntlets (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rounds JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS gauntlet_runs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      gauntlet_id UUID NOT NULL REFERENCES gauntlets(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rounds JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'scoring', 'complete')),
      total_score INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_gauntlets_created_by ON gauntlets(created_by)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_gauntlet ON gauntlet_runs(gauntlet_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_player ON gauntlet_runs(player_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS gauntlet_comments (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      gauntlet_id UUID NOT NULL REFERENCES gauntlets(id) ON DELETE CASCADE,
      run_id UUID NOT NULL REFERENCES gauntlet_runs(id) ON DELETE CASCADE,
      round_index INTEGER NOT NULL CHECK (round_index >= 0 AND round_index <= 4),
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text VARCHAR(280) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_gauntlet_comments_gauntlet ON gauntlet_comments(gauntlet_id)`);
  // Fix notifications constraint — original DB was created without 'reaction' type
  await query(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check
  `);
  await query(`
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('reaction', 'vote', 'system'))
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS global_daily_challenges (
      challenge_id VARCHAR(10) PRIMARY KEY,
      topic VARCHAR(500) NOT NULL,
      focus VARCHAR(500) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  // Migrate bare TIMESTAMP columns to TIMESTAMP WITH TIME ZONE.
  // USING ... AT TIME ZONE 'UTC' preserves stored values (they were always UTC).
  const alterToTz = (table, col) => query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = '${table}' AND column_name = '${col}'
          AND data_type = 'timestamp without time zone')
      THEN ALTER TABLE ${table} ALTER COLUMN ${col} TYPE TIMESTAMP WITH TIME ZONE
        USING ${col} AT TIME ZONE 'UTC'; END IF;
    END $$
  `);
  await alterToTz("users", "created_at");
  await alterToTz("users", "updated_at");
  await alterToTz("game_sessions", "created_at");
  await alterToTz("game_sessions", "updated_at");
  await alterToTz("session_players", "joined_at");
  await alterToTz("puns", "created_at");
  await alterToTz("puns", "updated_at");
  await alterToTz("pun_reactions", "created_at");
  await alterToTz("pun_reactions", "updated_at");
  await alterToTz("messages", "created_at");
  await alterToTz("pun_comments", "created_at");
  await alterToTz("notifications", "created_at");
  await alterToTz("gauntlets", "created_at");
  await alterToTz("gauntlet_runs", "created_at");
  await alterToTz("gauntlet_runs", "updated_at");

  // Migrate pun_reactions constraint from 5 reactions to groan-only.
  // Existing non-groan reactions are deleted first to satisfy the new constraint.
  await query(`DELETE FROM pun_reactions WHERE reaction != 'groan'`);
  await query(`
    DO $$ BEGIN
      ALTER TABLE pun_reactions DROP CONSTRAINT IF EXISTS pun_reactions_reaction_check;
      ALTER TABLE pun_reactions ADD CONSTRAINT pun_reactions_reaction_check
        CHECK (reaction IN ('groan'));
    END $$
  `);
}

// --- Challenge history functions ---

async function saveChallengeToHistory(sessionId, challengeId, topic, focus) {
  await query(
    `INSERT INTO session_challenge_history (session_id, challenge_id, topic, focus)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, challenge_id) DO UPDATE SET topic = EXCLUDED.topic, focus = EXCLUDED.focus`,
    [sessionId, challengeId, topic, focus],
  );
}

async function getChallengeHistory(sessionId) {
  const result = await query(
    `SELECT sch.session_id, sch.challenge_id, sch.topic, sch.focus, sch.created_at,
       COUNT(p.id)::int AS pun_count
     FROM session_challenge_history sch
     LEFT JOIN puns p ON p.session_id = sch.session_id AND p.challenge_id = sch.challenge_id
     WHERE sch.session_id = $1
     GROUP BY sch.session_id, sch.challenge_id, sch.topic, sch.focus, sch.created_at
     ORDER BY sch.challenge_id DESC`,
    [sessionId],
  );
  return result.rows.map((row) => ({
    challengeId: row.challenge_id,
    topic: row.topic,
    focus: row.focus,
    punCount: row.pun_count,
    createdAt: row.created_at,
  }));
}

async function getPastChallengeTopics(sessionId) {
  const result = await query(
    `SELECT topic, focus FROM session_challenge_history WHERE session_id = $1 ORDER BY challenge_id DESC`,
    [sessionId],
  );
  return result.rows.map((row) => ({ topic: row.topic, focus: row.focus }));
}

async function getChallengeForDate(sessionId, challengeId) {
  const result = await query(
    `SELECT topic, focus FROM session_challenge_history WHERE session_id = $1 AND challenge_id = $2`,
    [sessionId, challengeId],
  );
  return result.rows[0] || null;
}

// --- Global daily challenge functions ---

async function getGlobalChallengeForDate(dateId) {
  const result = await query(
    `SELECT topic, focus FROM global_daily_challenges WHERE challenge_id = $1`,
    [dateId],
  );
  return result.rows[0] || null;
}

async function saveGlobalChallenge(dateId, topic, focus) {
  await query(
    `INSERT INTO global_daily_challenges (challenge_id, topic, focus)
     VALUES ($1, $2, $3)
     ON CONFLICT (challenge_id) DO UPDATE SET topic = EXCLUDED.topic, focus = EXCLUDED.focus`,
    [dateId, topic, focus],
  );
}

async function getPastGlobalChallengeTopics() {
  const result = await query(
    `SELECT topic, focus FROM global_daily_challenges ORDER BY challenge_id DESC`,
  );
  return result.rows;
}

// --- Pun functions ---

async function getPunsBySessionAndChallenge(
  sessionId,
  challengeId,
  viewerId = null,
) {
  const result = await query(
    `SELECT p.*,
       u.display_name AS author_name,
       u.photo_url AS author_photo,
       COUNT(pr.pun_id) AS groan_count,
       COUNT(*) FILTER (WHERE pr.user_id = $3) > 0 AS my_groan
     FROM puns p
     JOIN users u ON p.author_id = u.id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     WHERE p.session_id = $1 AND p.challenge_id = $2
     GROUP BY p.id, u.display_name, u.photo_url
     ORDER BY groan_count DESC, p.ai_score DESC NULLS LAST, p.created_at DESC`,
    [sessionId, challengeId, viewerId],
  );
  return result.rows.map(formatPun);
}

async function createPun(
  sessionId,
  challengeId,
  authorId,
  text,
  responseTimeMs,
) {
  const result = await query(
    `INSERT INTO puns (session_id, challenge_id, author_id, text, response_time_ms)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [sessionId, challengeId, authorId, text, responseTimeMs ?? null],
  );
  return result.rows[0];
}

async function updatePunText(punId, text) {
  await query(
    `UPDATE puns SET text = $1, ai_score = NULL, ai_feedback = 'Re-evaluating...' WHERE id = $2`,
    [text, punId],
  );
}

async function updatePunScore(punId, score, feedback) {
  await query(`UPDATE puns SET ai_score = $1, ai_feedback = $2 WHERE id = $3`, [
    score,
    feedback,
    punId,
  ]);
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
    await query(
      "DELETE FROM pun_reactions WHERE pun_id = $1 AND user_id = $2",
      [punId, userId],
    );
    return null;
  }

  const result = await query(
    `INSERT INTO pun_reactions (pun_id, user_id, reaction)
     VALUES ($1, $2, $3)
     ON CONFLICT (pun_id, user_id)
     DO UPDATE SET reaction = EXCLUDED.reaction, updated_at = NOW()
     RETURNING reaction`,
    [punId, userId, reaction],
  );
  return result.rows[0].reaction;
}

async function getPunsByAuthor(authorId) {
  const result = await query(
    `SELECT p.*,
       u.display_name AS author_name,
       u.photo_url AS author_photo,
       COUNT(pr.pun_id) AS groan_count,
       FALSE AS my_groan
     FROM puns p
     JOIN users u ON p.author_id = u.id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     WHERE p.author_id = $1
     GROUP BY p.id, u.display_name, u.photo_url
     ORDER BY p.created_at DESC`,
    [authorId],
  );
  return result.rows.map(formatPun);
}

async function hasUserSubmittedForChallenge(sessionId, challengeId, userId) {
  const result = await query(
    `SELECT 1 FROM puns WHERE session_id = $1 AND challenge_id = $2 AND author_id = $3 LIMIT 1`,
    [sessionId, challengeId, userId],
  );
  return result.rows.length > 0;
}

async function countPunsByAuthorInSession(sessionId, challengeId, authorId) {
  const result = await query(
    "SELECT COUNT(*) FROM puns WHERE session_id = $1 AND challenge_id = $2 AND author_id = $3",
    [sessionId, challengeId, authorId],
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
    [sessionId, challengeId],
  );
  return parseInt(result.rows[0].min_count, 10);
}

function formatPun(row) {
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
    groanCount: Number(row.groan_count || 0),
    myReaction: row.my_groan ? "groan" : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Returns each player's best AI score per day for a given week, plus weekly total (drop lowest).
async function getWeeklyBestScores(sessionId, weekStart, weekEnd) {
  const result = await query(
    `SELECT
       u.id AS author_id,
       u.display_name AS author_name,
       u.photo_url AS author_photo,
       p.challenge_id AS date,
       MAX(p.ai_score) AS daily_best
     FROM puns p
     JOIN users u ON u.id = p.author_id
     WHERE p.session_id = $1
       AND p.challenge_id >= $2
       AND p.challenge_id <= $3
       AND p.ai_score IS NOT NULL
     GROUP BY u.id, u.display_name, u.photo_url, p.challenge_id
     ORDER BY u.id, p.challenge_id`,
    [sessionId, weekStart, weekEnd],
  );

  // Group rows by player
  const playerMap = new Map();
  for (const row of result.rows) {
    const key = row.author_id;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        authorId: row.author_id,
        authorName: row.author_name,
        authorPhoto: row.author_photo,
        dailyScores: {},
      });
    }
    playerMap.get(key).dailyScores[row.date] = parseFloat(row.daily_best);
  }

  // Compute weekly total: sum of daily bests minus the single lowest
  return Array.from(playerMap.values()).map((player) => {
    const scores = Object.values(player.dailyScores);
    const sum = scores.reduce((a, b) => a + b, 0);
    const lowest = scores.length > 1 ? Math.min(...scores) : 0;
    return { ...player, weekTotal: parseFloat((sum - lowest).toFixed(1)) };
  });
}

// Global leaderboard: perfect 10s for a given challenge date, ordered by groan count
async function getGlobalDailyLeaderboard(challengeId) {
  const result = await query(
    `SELECT p.id, p.text, p.ai_score, p.created_at,
       u.display_name AS author_name, u.photo_url AS author_photo,
       gs.name AS session_name,
       COUNT(pr.pun_id) AS groan_count
     FROM puns p
     JOIN users u ON u.id = p.author_id
     JOIN game_sessions gs ON gs.id = p.session_id
     LEFT JOIN pun_reactions pr ON pr.pun_id = p.id
     WHERE p.challenge_id = $1 AND p.ai_score >= 9.5
     GROUP BY p.id, u.display_name, u.photo_url, gs.name
     ORDER BY groan_count DESC, p.created_at ASC
     LIMIT 50`,
    [challengeId],
  );
  return result.rows.map(formatLeaderboardRow);
}

// Global leaderboard: shame list (low scores) for a given challenge date
async function getGlobalShameLeaderboard(challengeId) {
  const result = await query(
    `SELECT p.id, p.text, p.ai_score, p.created_at,
       u.display_name AS author_name, u.photo_url AS author_photo,
       gs.name AS session_name,
       COUNT(pr.pun_id) AS groan_count
     FROM puns p
     JOIN users u ON u.id = p.author_id
     JOIN game_sessions gs ON gs.id = p.session_id
     LEFT JOIN pun_reactions pr ON pr.pun_id = p.id
     WHERE p.challenge_id = $1 AND p.ai_score <= 2
     GROUP BY p.id, u.display_name, u.photo_url, gs.name
     ORDER BY groan_count DESC, p.created_at ASC
     LIMIT 50`,
    [challengeId],
  );
  return result.rows.map(formatLeaderboardRow);
}

// All-time: perfect 10s across all time, ordered by total groans
async function getGlobalAllTimeGroaners() {
  const result = await query(
    `SELECT p.id, p.text, p.ai_score, p.challenge_id, p.created_at,
       u.display_name AS author_name, u.photo_url AS author_photo,
       gs.name AS session_name,
       COUNT(pr.pun_id) AS groan_count
     FROM puns p
     JOIN users u ON u.id = p.author_id
     JOIN game_sessions gs ON gs.id = p.session_id
     LEFT JOIN pun_reactions pr ON pr.pun_id = p.id
     WHERE p.ai_score >= 9.5
     GROUP BY p.id, u.display_name, u.photo_url, gs.name
     ORDER BY groan_count DESC, p.created_at ASC
     LIMIT 50`,
  );
  return result.rows.map(formatLeaderboardRow);
}

function formatLeaderboardRow(row) {
  return {
    id: row.id,
    text: row.text,
    aiScore: parseFloat(row.ai_score),
    challengeId: row.challenge_id || null,
    authorName: row.author_name,
    authorPhoto: row.author_photo,
    sessionName: row.session_name,
    groanCount: Number(row.groan_count || 0),
    createdAt: row.created_at,
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
    [sessionId],
  );
  return result.rows.map(formatMessage);
}

async function createMessage(sessionId, userId, text) {
  const result = await query(
    `INSERT INTO messages (session_id, user_id, text) VALUES ($1, $2, $3) RETURNING *`,
    [sessionId, userId, text],
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
    [sessionId],
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
    [punId],
  );
  return result.rows.map(formatComment);
}

async function createComment(punId, sessionId, userId, text) {
  const result = await query(
    `INSERT INTO pun_comments (pun_id, session_id, user_id, text) VALUES ($1, $2, $3, $4) RETURNING *`,
    [punId, sessionId, userId, text],
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
    [userId],
  );
  return result.rows.map(formatNotification);
}

async function createNotification(userId, type, message, link) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, message, link) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, type, message, link || null],
  );
  return result.rows[0];
}

async function markNotificationRead(notificationId) {
  await query("UPDATE notifications SET read = TRUE WHERE id = $1", [
    notificationId,
  ]);
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

// --- Gauntlet functions ---

async function createGauntlet(userId, rounds) {
  const result = await query(
    `INSERT INTO gauntlets (created_by, rounds) VALUES ($1, $2) RETURNING *`,
    [userId, JSON.stringify(rounds)],
  );
  return formatGauntlet(result.rows[0]);
}

async function getGauntletById(id) {
  const result = await query(`SELECT * FROM gauntlets WHERE id = $1`, [id]);
  return result.rows[0] ? formatGauntlet(result.rows[0]) : null;
}

async function createGauntletRun(gauntletId, playerId) {
  const result = await query(
    `INSERT INTO gauntlet_runs (gauntlet_id, player_id) VALUES ($1, $2) RETURNING *`,
    [gauntletId, playerId],
  );
  return formatGauntletRun(result.rows[0]);
}

async function getGauntletRunById(runId) {
  const result = await query(`SELECT * FROM gauntlet_runs WHERE id = $1`, [runId]);
  return result.rows[0] ? formatGauntletRun(result.rows[0]) : null;
}

// Atomic JSONB append — WHERE clause on array length guards against out-of-order submissions
async function submitGauntletRound(runId, roundIndex, punText, secondsRemaining) {
  const newEntry = {
    pun_text: punText,
    ai_score: null,
    ai_feedback: null,
    seconds_remaining: secondsRemaining,
    round_score: null,
  };
  const result = await query(
    `UPDATE gauntlet_runs
     SET rounds = rounds || $1::jsonb
     WHERE id = $2 AND jsonb_array_length(rounds) = $3
     RETURNING *`,
    [JSON.stringify([newEntry]), runId, roundIndex],
  );
  if (!result.rows[0]) throw new Error("Round index mismatch or run not found");
  return formatGauntletRun(result.rows[0]);
}

// Transaction + FOR UPDATE serialises concurrent Gemini scoring callbacks.
// Without the lock, two callbacks that SELECT before either UPDATEs would
// silently overwrite each other's scores.
async function updateGauntletRoundScore(runId, roundIndex, aiScore, aiFeedback) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT rounds FROM gauntlet_runs WHERE id = $1 FOR UPDATE`,
      [runId],
    );
    if (!rows[0]) throw new Error("Run not found");
    const rounds = rows[0].rounds;
    const round = rounds[roundIndex];
    const baseScore = aiScore * 100;
    const timeBonus = aiScore >= 5 ? (round.seconds_remaining || 0) * 10 : 0;
    rounds[roundIndex] = {
      ...round,
      ai_score: aiScore,
      ai_feedback: aiFeedback,
      round_score: baseScore + timeBonus,
    };
    const result = await client.query(
      `UPDATE gauntlet_runs SET rounds = $1::jsonb WHERE id = $2 RETURNING *`,
      [JSON.stringify(rounds), runId],
    );
    return formatGauntletRun(result.rows[0]);
  });
}

// SQL-level status guard prevents double-finalization from concurrent callbacks
async function finalizeGauntletRun(runId, totalScore) {
  const result = await query(
    `UPDATE gauntlet_runs
     SET status = 'complete', total_score = $1, updated_at = NOW()
     WHERE id = $2 AND status != 'complete'
     RETURNING *`,
    [totalScore, runId],
  );
  return result.rows[0] ? formatGauntletRun(result.rows[0]) : null;
}

async function setGauntletRunScoring(runId) {
  const result = await query(
    `UPDATE gauntlet_runs SET status = 'scoring' WHERE id = $1 RETURNING *`,
    [runId],
  );
  return formatGauntletRun(result.rows[0]);
}

async function getGauntletComparison(gauntletId) {
  const gauntletResult = await query(`SELECT * FROM gauntlets WHERE id = $1`, [gauntletId]);
  if (!gauntletResult.rows[0]) return null;
  const gauntlet = formatGauntlet(gauntletResult.rows[0]);

  const runsResult = await query(
    `SELECT gr.id, gr.player_id, gr.rounds, gr.total_score, gr.created_at,
            u.display_name, u.photo_url
     FROM gauntlet_runs gr
     JOIN users u ON u.id = gr.player_id
     WHERE gr.gauntlet_id = $1 AND gr.status = 'complete'
     ORDER BY gr.total_score DESC NULLS LAST`,
    [gauntletId],
  );

  return {
    ...gauntlet,
    runs: runsResult.rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.display_name,
      playerPhoto: row.photo_url,
      rounds: row.rounds,
      totalScore: row.total_score,
      createdAt: row.created_at,
    })),
  };
}

async function getUserGauntletHistory(userId, limit = 20) {
  const result = await query(
    `SELECT
       g.id AS gauntlet_id,
       my_run.id AS my_run_id,
       my_run.total_score AS my_score,
       my_run.created_at AS run_created_at,
       json_agg(
         json_build_object(
           'playerId', gr.player_id,
           'playerName', u.display_name,
           'playerPhoto', u.photo_url,
           'totalScore', gr.total_score
         ) ORDER BY gr.total_score DESC NULLS LAST
       ) AS participants
     FROM gauntlets g
     JOIN gauntlet_runs my_run
       ON my_run.gauntlet_id = g.id
      AND my_run.player_id = $1
      AND my_run.status = 'complete'
     JOIN gauntlet_runs gr
       ON gr.gauntlet_id = g.id AND gr.status = 'complete'
     JOIN users u ON u.id = gr.player_id
     GROUP BY g.id, my_run.id, my_run.total_score, my_run.created_at
     ORDER BY my_run.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  return result.rows.map((row) => ({
    gauntletId: row.gauntlet_id,
    myRunId: row.my_run_id,
    myScore: row.my_score,
    createdAt: row.run_created_at,
    participants: row.participants,
  }));
}

async function addGauntletComment(gauntletId, runId, roundIndex, authorId, text) {
  const result = await query(
    `INSERT INTO gauntlet_comments (gauntlet_id, run_id, round_index, author_id, text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, gauntlet_id, run_id, round_index, author_id, text, created_at`,
    [gauntletId, runId, roundIndex, authorId, text],
  );
  const row = result.rows[0];
  const userResult = await query(`SELECT display_name, photo_url FROM users WHERE id = $1`, [authorId]);
  const user = userResult.rows[0];
  return {
    id: row.id,
    gauntletId: row.gauntlet_id,
    runId: row.run_id,
    roundIndex: row.round_index,
    authorId: row.author_id,
    authorName: user?.display_name ?? 'Unknown',
    authorPhoto: user?.photo_url ?? '',
    text: row.text,
    createdAt: row.created_at,
  };
}

async function getGauntletComments(gauntletId) {
  const result = await query(
    `SELECT gc.id, gc.gauntlet_id, gc.run_id, gc.round_index, gc.author_id,
            gc.text, gc.created_at, u.display_name, u.photo_url
     FROM gauntlet_comments gc
     JOIN users u ON u.id = gc.author_id
     WHERE gc.gauntlet_id = $1
     ORDER BY gc.created_at ASC`,
    [gauntletId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    gauntletId: row.gauntlet_id,
    runId: row.run_id,
    roundIndex: row.round_index,
    authorId: row.author_id,
    authorName: row.display_name,
    authorPhoto: row.photo_url,
    text: row.text,
    createdAt: row.created_at,
  }));
}

function formatGauntlet(row) {
  return {
    id: row.id,
    createdBy: row.created_by,
    rounds: row.rounds,
    createdAt: row.created_at,
  };
}

function formatGauntletRun(row) {
  return {
    id: row.id,
    gauntletId: row.gauntlet_id,
    playerId: row.player_id,
    rounds: row.rounds,
    status: row.status,
    totalScore: row.total_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export {
  pool,
  query,
  withTransaction,
  runMigrations,
  findOrCreateUser,
  getUserById,
  createSession,
  getAllSessions,
  getSessionById,
  joinSession,
  deleteSession,
  updateSessionChallenge,
  renameSession,
  removePlayerFromSession,
  saveChallengeToHistory,
  getChallengeHistory,
  getPastChallengeTopics,
  getChallengeForDate,
  getGlobalChallengeForDate,
  saveGlobalChallenge,
  getPastGlobalChallengeTopics,
  hasUserSubmittedForChallenge,
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
  getWeeklyBestScores,
  getGlobalDailyLeaderboard,
  getGlobalShameLeaderboard,
  getGlobalAllTimeGroaners,
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
  getGauntletComparison,
  getUserGauntletHistory,
  addGauntletComment,
  getGauntletComments,
};
