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

function normalizeDisplayNameToken(token) {
  if (!token) return token;
  if (/[A-Z]/.test(token) && /[a-z]/.test(token)) return token;
  return token
    .split(/([-'`])/)
    .map((part) => {
      if (!part || /^[\-'`]$/.test(part)) return part;
      const lettersOnly = part.replace(/[^A-Za-z]/g, "");
      if (!lettersOnly) return part;
      if (/[A-Z]/.test(part) && /[a-z]/.test(part)) return part;
      const lowerCased = part.toLowerCase();
      return lowerCased.charAt(0).toUpperCase() + lowerCased.slice(1);
    })
    .join("");
}

function normalizeDisplayNameInput(name) {
  if (typeof name !== "string") return null;
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.split(" ").map(normalizeDisplayNameToken).join(" ");
}

function displayNameSql(alias) {
  return `COALESCE(${alias}.custom_display_name, ${alias}.display_name)`;
}

function getEffectiveDisplayName(user) {
  return (
    normalizeDisplayNameInput(user?.custom_display_name) ??
    normalizeDisplayNameInput(user?.display_name) ??
    "Unknown"
  );
}

// --- User functions ---

async function findOrCreateUser(googleProfile) {
  const { id: googleId, emails, displayName, photos } = googleProfile;
  const email = emails && emails[0] ? emails[0].value : null;
  const photoUrl = photos && photos[0] ? photos[0].value : null;
  const googleDisplayName = normalizeDisplayNameInput(displayName);
  if (!email) throw new Error("Email not provided by Google");

  let result = await query("SELECT * FROM users WHERE google_id = $1", [
    googleId,
  ]);
  if (result.rows.length > 0) {
    result = await query(
      `UPDATE users SET display_name = $1, photo_url = $2, email = $3, updated_at = NOW()
       WHERE google_id = $4 RETURNING *`,
      [googleDisplayName, photoUrl, email, googleId],
    );
    return result.rows[0];
  }

  result = await query(
    `INSERT INTO users (google_id, email, display_name, photo_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [googleId, email, googleDisplayName, photoUrl],
  );
  return result.rows[0];
}

async function getUserById(userId) {
  const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows[0];
}

async function updateCustomDisplayName(userId, customDisplayName) {
  const normalizedDisplayName = normalizeDisplayNameInput(customDisplayName);
  const result = await query(
    `UPDATE users SET custom_display_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [normalizedDisplayName, userId],
  );
  return result.rows[0] ?? null;
}

async function updateUserPrivacy(userId, anonymous) {
  const result = await query(
    `UPDATE users SET anonymous_in_leaderboards = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [!!anonymous, userId],
  );
  return result.rows[0] ?? null;
}

async function getGroupIdsByUser(userId) {
  const result = await query(
    `SELECT group_id FROM group_members WHERE user_id = $1`,
    [userId],
  );
  return result.rows.map((row) => row.group_id);
}

// --- Group functions (Tier 2: social layer) ---

async function createGroup(name, ownerId) {
  const result = await query(
    `INSERT INTO groups (name, owner_id) VALUES ($1, $2) RETURNING *`,
    [name, ownerId],
  );
  const group = result.rows[0];
  await query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [
    group.id,
    ownerId,
  ]);
  return group;
}

async function getAllGroups() {
  const result = await query(
    `SELECT g.*,
       COALESCE(json_agg(
         json_build_object('uid', u.id, 'name', ${displayNameSql("u")}, 'photoURL', u.photo_url)
         ORDER BY gm.joined_at
       ) FILTER (WHERE u.id IS NOT NULL), '[]') AS players
     FROM groups g
     LEFT JOIN group_members gm ON g.id = gm.group_id
     LEFT JOIN users u ON gm.user_id = u.id
     GROUP BY g.id
     ORDER BY g.created_at DESC`,
  );
  return result.rows.map(formatGroup);
}

async function getGroupById(groupId) {
  const result = await query(
    `SELECT g.*,
       COALESCE(json_agg(
         json_build_object('uid', u.id, 'name', ${displayNameSql("u")}, 'photoURL', u.photo_url)
         ORDER BY gm.joined_at
       ) FILTER (WHERE u.id IS NOT NULL), '[]') AS players
     FROM groups g
     LEFT JOIN group_members gm ON g.id = gm.group_id
     LEFT JOIN users u ON gm.user_id = u.id
     WHERE g.id = $1
     GROUP BY g.id`,
    [groupId],
  );
  return result.rows[0] ? formatGroup(result.rows[0]) : null;
}

async function joinGroup(groupId, userId) {
  await query(
    `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [groupId, userId],
  );
}

async function deleteGroup(groupId) {
  await query("DELETE FROM groups WHERE id = $1", [groupId]);
}

async function renameGroup(groupId, name) {
  await query("UPDATE groups SET name = $1 WHERE id = $2", [name, groupId]);
}

async function removePlayerFromGroup(groupId, userId) {
  await query(
    "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId],
  );
}

function formatGroup(row) {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    players: row.players || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Global daily challenge functions ---

async function getGlobalChallengeForDate(dateId) {
  const result = await query(
    `SELECT topic, focus FROM global_daily_challenges WHERE challenge_id = $1`,
    [dateId],
  );
  return result.rows[0] || null;
}

async function saveGlobalChallenge(dateId, topic, focus, embedding = null) {
  if (embedding) {
    await query(
      `INSERT INTO global_daily_challenges (challenge_id, topic, focus, embedding)
       VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT (challenge_id) DO UPDATE SET topic = EXCLUDED.topic, focus = EXCLUDED.focus, embedding = EXCLUDED.embedding`,
      [dateId, topic, focus, embedding],
    );
  } else {
    await query(
      `INSERT INTO global_daily_challenges (challenge_id, topic, focus)
       VALUES ($1, $2, $3)
       ON CONFLICT (challenge_id) DO UPDATE SET topic = EXCLUDED.topic, focus = EXCLUDED.focus`,
      [dateId, topic, focus],
    );
  }
}

async function getPastGlobalChallengeTopics() {
  const result = await query(
    `SELECT topic, focus FROM global_daily_challenges ORDER BY challenge_id DESC`,
  );
  return result.rows;
}

// --- Buffer queue queries ---

async function getPendingChallengeCount() {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM pending_challenges`,
  );
  return result.rows[0].count;
}

async function popOldestPendingChallenge() {
  const result = await query(`
    DELETE FROM pending_challenges
    WHERE id = (
      SELECT id FROM pending_challenges
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING topic, focus, embedding
  `);
  return result.rows[0] || null;
}

async function insertPendingChallenge(topic, focus, embedding) {
  await query(
    `INSERT INTO pending_challenges (topic, focus, embedding)
     VALUES ($1, $2, $3::vector)`,
    [topic, focus, embedding],
  );
}

async function findSimilarChallenges(embedding, limit = 10) {
  const result = await query(
    `SELECT topic, focus, distance FROM (
       SELECT topic, focus, embedding <=> $1::vector AS distance
       FROM global_daily_challenges WHERE embedding IS NOT NULL
       UNION ALL
       SELECT topic, focus, embedding <=> $1::vector AS distance
       FROM pending_challenges
     ) combined
     ORDER BY distance ASC
     LIMIT $2`,
    [embedding, limit],
  );
  return result.rows;
}

async function getRecentChallengesForFilter(limit = 50) {
  const result = await query(
    `SELECT topic, focus FROM global_daily_challenges ORDER BY challenge_id DESC LIMIT $1`,
    [limit],
  );
  return result.rows;
}

async function updateChallengeEmbedding(challengeId, embedding) {
  await query(
    `UPDATE global_daily_challenges SET embedding = $2::vector WHERE challenge_id = $1`,
    [challengeId, embedding],
  );
}

async function getChallengesWithoutEmbedding() {
  const result = await query(
    `SELECT challenge_id, topic, focus FROM global_daily_challenges WHERE embedding IS NULL ORDER BY challenge_id`,
  );
  return result.rows;
}

async function getChallengeReveal(challengeId, userId) {
  const result = await query(
    `SELECT challenge_id, user_id, revealed_at, created_at
     FROM challenge_reveals
     WHERE challenge_id = $1 AND user_id = $2`,
    [challengeId, userId],
  );
  return result.rows[0] ? formatChallengeReveal(result.rows[0]) : null;
}

async function createChallengeReveal(challengeId, userId) {
  const result = await query(
    `INSERT INTO challenge_reveals (challenge_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (challenge_id, user_id) DO NOTHING
     RETURNING challenge_id, user_id, revealed_at, created_at`,
    [challengeId, userId],
  );

  if (result.rows[0]) {
    return formatChallengeReveal(result.rows[0]);
  }

  return getChallengeReveal(challengeId, userId);
}

function formatChallengeReveal(row) {
  return {
    challengeId: row.challenge_id,
    userId: row.user_id,
    revealedAt: row.revealed_at,
    createdAt: row.created_at,
  };
}

// --- Pun functions (Tier 1: global, user-scoped) ---

async function getPunsForChallenge(challengeId, viewerId = null) {
  const result = await query(
    `SELECT p.*,
       ${displayNameSql("u")} AS author_name,
       u.photo_url AS author_photo,
       COUNT(pr.pun_id) AS groan_count,
       COALESCE(
         json_agg(
           json_build_object('uid', ru.id, 'name', ${displayNameSql("ru")})
           ORDER BY LOWER(${displayNameSql("ru")}), ru.id
         ) FILTER (WHERE ru.id IS NOT NULL),
         '[]'::json
       ) AS groaners,
       COUNT(*) FILTER (WHERE pr.user_id = $2) > 0 AS my_groan
     FROM puns p
     JOIN users u ON p.author_id = u.id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.challenge_id = $1
     GROUP BY p.id, ${displayNameSql("u")}, u.photo_url
     ORDER BY groan_count DESC, p.ai_score DESC NULLS LAST, p.created_at DESC`,
    [challengeId, viewerId],
  );
  return result.rows.map(formatPun);
}

async function getPunsForChallengeByGroup(
  challengeId,
  groupId,
  viewerId = null,
) {
  const result = await query(
    `SELECT p.*,
       ${displayNameSql("u")} AS author_name,
       u.photo_url AS author_photo,
       COUNT(pr.pun_id) AS groan_count,
       COALESCE(
         json_agg(
           json_build_object('uid', ru.id, 'name', ${displayNameSql("ru")})
           ORDER BY LOWER(${displayNameSql("ru")}), ru.id
         ) FILTER (WHERE ru.id IS NOT NULL),
         '[]'::json
       ) AS groaners,
       COUNT(*) FILTER (WHERE pr.user_id = $3) > 0 AS my_groan
     FROM puns p
     JOIN users u ON p.author_id = u.id
     JOIN group_members gm ON gm.user_id = p.author_id AND gm.group_id = $2
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.challenge_id = $1
     GROUP BY p.id, ${displayNameSql("u")}, u.photo_url
     ORDER BY groan_count DESC, p.ai_score DESC NULLS LAST, p.created_at DESC`,
    [challengeId, groupId, viewerId],
  );
  return result.rows.map(formatPun);
}

async function createPun(challengeId, authorId, text, responseTimeMs) {
  const result = await query(
    `INSERT INTO puns (challenge_id, author_id, text, response_time_ms)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [challengeId, authorId, text, responseTimeMs ?? null],
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
       ${displayNameSql("u")} AS author_name,
       u.photo_url AS author_photo,
       COUNT(pr.pun_id) AS groan_count,
       COALESCE(
         json_agg(
           json_build_object('uid', ru.id, 'name', ${displayNameSql("ru")})
           ORDER BY LOWER(${displayNameSql("ru")}), ru.id
         ) FILTER (WHERE ru.id IS NOT NULL),
         '[]'::json
       ) AS groaners,
       FALSE AS my_groan,
       gdc.topic AS challenge_topic,
       gdc.focus AS challenge_focus
     FROM puns p
     JOIN users u ON p.author_id = u.id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     LEFT JOIN users ru ON pr.user_id = ru.id
     LEFT JOIN global_daily_challenges gdc ON p.challenge_id = gdc.challenge_id
     WHERE p.author_id = $1
     GROUP BY p.id, ${displayNameSql("u")}, u.photo_url, gdc.topic, gdc.focus
     ORDER BY p.created_at DESC`,
    [authorId],
  );
  return result.rows.map(formatPun);
}

async function hasUserSubmittedForChallenge(challengeId, userId) {
  const result = await query(
    `SELECT 1 FROM puns WHERE challenge_id = $1 AND author_id = $2 LIMIT 1`,
    [challengeId, userId],
  );
  return result.rows.length > 0;
}

async function countPunsByAuthorForChallenge(challengeId, authorId) {
  const result = await query(
    "SELECT COUNT(*) FROM puns WHERE challenge_id = $1 AND author_id = $2",
    [challengeId, authorId],
  );
  return parseInt(result.rows[0].count, 10);
}

function formatPun(row) {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorPhoto: row.author_photo,
    text: row.text,
    aiScore: row.ai_score ? parseFloat(row.ai_score) : null,
    aiFeedback: row.ai_feedback,
    responseTimeMs: row.response_time_ms ? Number(row.response_time_ms) : null,
    groanCount: Number(row.groan_count || 0),
    groaners: formatGroaners(row.groaners),
    myReaction: row.my_groan ? "groan" : null,
    challengeTopic: row.challenge_topic || null,
    challengeFocus: row.challenge_focus || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatGroaners(groaners) {
  if (!Array.isArray(groaners)) return [];
  return groaners
    .map((groaner) => ({
      uid: Number(groaner?.uid),
      name: typeof groaner?.name === "string" ? groaner.name.trim() : "",
    }))
    .filter((groaner) => Number.isFinite(groaner.uid) && groaner.name);
}

// Weekly best scores filtered by group membership
async function getWeeklyBestScores(groupId, weekStart, weekEnd) {
  const result = await query(
    `SELECT
       u.id AS author_id,
       ${displayNameSql("u")} AS author_name,
       u.photo_url AS author_photo,
       p.challenge_id AS date,
       MAX(p.ai_score) AS daily_best
     FROM puns p
     JOIN users u ON u.id = p.author_id
     JOIN group_members gm ON gm.user_id = p.author_id AND gm.group_id = $1
     WHERE p.challenge_id >= $2
       AND p.challenge_id <= $3
       AND p.ai_score IS NOT NULL
     GROUP BY u.id, ${displayNameSql("u")}, u.photo_url, p.challenge_id
     ORDER BY u.id, p.challenge_id`,
    [groupId, weekStart, weekEnd],
  );

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

  return Array.from(playerMap.values()).map((player) => {
    const scores = Object.values(player.dailyScores);
    const sum = scores.reduce((a, b) => a + b, 0);
    const lowest = scores.length > 1 ? Math.min(...scores) : 0;
    return { ...player, weekTotal: parseFloat((sum - lowest).toFixed(1)) };
  });
}

// Global daily ranking
async function getGlobalDailyRanking(challengeId) {
  const result = await query(
    `SELECT p.id, p.text, p.ai_score, p.created_at,
       gdc.topic AS challenge_topic, gdc.focus AS challenge_focus,
       ${displayNameSql("u")} AS author_name, u.photo_url AS author_photo,
       u.anonymous_in_leaderboards,
       COALESCE(
         json_agg(
           json_build_object('uid', ru.id, 'name', ${displayNameSql("ru")})
           ORDER BY LOWER(${displayNameSql("ru")}), ru.id
         ) FILTER (WHERE ru.id IS NOT NULL),
         '[]'::json
       ) AS groaners,
       COUNT(pr.pun_id) AS groan_count
     FROM puns p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN global_daily_challenges gdc ON gdc.challenge_id = p.challenge_id
     LEFT JOIN pun_reactions pr ON pr.pun_id = p.id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.challenge_id = $1 AND p.ai_score IS NOT NULL
     GROUP BY p.id, ${displayNameSql("u")}, u.photo_url, u.anonymous_in_leaderboards, gdc.topic, gdc.focus
     ORDER BY p.ai_score DESC, groan_count DESC, p.created_at ASC
     LIMIT 50`,
    [challengeId],
  );
  return result.rows.map(formatLeaderboardRow);
}

// All-time top groaners
async function getGlobalAllTimeGroaners() {
  const result = await query(
    `SELECT p.id, p.text, p.ai_score, p.challenge_id, p.created_at,
       gdc.topic AS challenge_topic, gdc.focus AS challenge_focus,
       ${displayNameSql("u")} AS author_name, u.photo_url AS author_photo,
       u.anonymous_in_leaderboards,
       COALESCE(
         json_agg(
           json_build_object('uid', ru.id, 'name', ${displayNameSql("ru")})
           ORDER BY LOWER(${displayNameSql("ru")}), ru.id
         ) FILTER (WHERE ru.id IS NOT NULL),
         '[]'::json
       ) AS groaners,
       COUNT(pr.pun_id) AS groan_count
     FROM puns p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN global_daily_challenges gdc ON gdc.challenge_id = p.challenge_id
     LEFT JOIN pun_reactions pr ON pr.pun_id = p.id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.ai_score >= 7.0
     GROUP BY p.id, ${displayNameSql("u")}, u.photo_url, u.anonymous_in_leaderboards, gdc.topic, gdc.focus
     ORDER BY groan_count DESC, p.created_at ASC
     LIMIT 50`,
  );
  return result.rows.map(formatLeaderboardRow);
}

function formatLeaderboardRow(row) {
  const anonymous = !!row.anonymous_in_leaderboards;
  return {
    id: row.id,
    text: row.text,
    aiScore: parseFloat(row.ai_score),
    challengeId: row.challenge_id || null,
    challengeTopic: row.challenge_topic || null,
    challengeFocus: row.challenge_focus || null,
    authorName: anonymous ? "Anonymous Punster" : row.author_name,
    authorPhoto: anonymous ? "" : row.author_photo,
    groanCount: Number(row.groan_count || 0),
    groaners: formatGroaners(row.groaners),
    createdAt: row.created_at,
  };
}

// --- Message functions (group-scoped) ---

async function getMessagesByGroup(groupId) {
  const result = await query(
    `SELECT m.*, ${displayNameSql("u")} AS user_name, u.photo_url AS user_photo
     FROM messages m
     JOIN users u ON m.user_id = u.id
     WHERE m.group_id = $1
     ORDER BY m.created_at ASC`,
    [groupId],
  );
  return result.rows.map(formatMessage);
}

async function createMessage(groupId, userId, text) {
  const result = await query(
    `INSERT INTO messages (group_id, user_id, text) VALUES ($1, $2, $3) RETURNING *`,
    [groupId, userId, text],
  );
  return result.rows[0];
}

function formatMessage(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.user_photo,
    text: row.text,
    createdAt: row.created_at,
  };
}

// --- Comment functions (no group scope) ---

async function getCommentsByPun(punId) {
  const result = await query(
    `SELECT pc.*, ${displayNameSql("u")} AS user_name, u.photo_url AS user_photo
     FROM pun_comments pc
     JOIN users u ON pc.user_id = u.id
     WHERE pc.pun_id = $1
     ORDER BY pc.created_at ASC`,
    [punId],
  );
  return result.rows.map(formatComment);
}

async function getCommentsForPuns(punIds) {
  if (!punIds.length) return [];
  const result = await query(
    `SELECT pc.*, ${displayNameSql("u")} AS user_name, u.photo_url AS user_photo
     FROM pun_comments pc
     JOIN users u ON pc.user_id = u.id
     WHERE pc.pun_id = ANY($1)
     ORDER BY pc.created_at ASC`,
    [punIds],
  );
  return result.rows.map(formatComment);
}

async function createComment(punId, userId, text) {
  const result = await query(
    `INSERT INTO pun_comments (pun_id, user_id, text) VALUES ($1, $2, $3) RETURNING *`,
    [punId, userId, text],
  );
  return result.rows[0];
}

function formatComment(row) {
  return {
    id: row.id,
    punId: row.pun_id,
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

// --- Gauntlet functions (Tier 3) ---

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
  const result = await query(`SELECT * FROM gauntlet_runs WHERE id = $1`, [
    runId,
  ]);
  return result.rows[0] ? formatGauntletRun(result.rows[0]) : null;
}

async function submitGauntletRound(
  runId,
  roundIndex,
  punText,
  secondsRemaining,
) {
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

async function updateGauntletRoundScore(
  runId,
  roundIndex,
  aiScore,
  aiFeedback,
) {
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
  const gauntletResult = await query(`SELECT * FROM gauntlets WHERE id = $1`, [
    gauntletId,
  ]);
  if (!gauntletResult.rows[0]) return null;
  const gauntlet = formatGauntlet(gauntletResult.rows[0]);
  const runsResult = await query(
    `SELECT gr.id, gr.player_id, gr.rounds, gr.total_score, gr.created_at,
            ${displayNameSql("u")} AS player_name, u.photo_url
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
      playerName: row.player_name,
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
           'playerName', ${displayNameSql("u")},
           'playerPhoto', u.photo_url,
           'totalScore', gr.total_score
         ) ORDER BY gr.total_score DESC NULLS LAST
       ) AS participants
     FROM gauntlets g
     JOIN gauntlet_runs my_run ON my_run.gauntlet_id = g.id AND my_run.player_id = $1 AND my_run.status = 'complete'
     JOIN gauntlet_runs gr ON gr.gauntlet_id = g.id AND gr.status = 'complete'
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

async function getGauntletLeaderboard(userId, limit = 50) {
  const result = await query(
    `SELECT
       g.id AS gauntlet_id,
       my_run.id AS my_run_id,
       my_run.total_score AS my_score,
       my_run.created_at AS run_created_at,
       json_agg(
         json_build_object(
           'playerId', gr.player_id,
           'playerName', ${displayNameSql("u")},
           'playerPhoto', u.photo_url,
           'totalScore', gr.total_score
         ) ORDER BY gr.total_score DESC NULLS LAST
       ) AS participants
     FROM gauntlets g
     JOIN gauntlet_runs my_run ON my_run.gauntlet_id = g.id AND my_run.player_id = $1 AND my_run.status = 'complete'
     JOIN gauntlet_runs gr ON gr.gauntlet_id = g.id AND gr.status = 'complete'
     JOIN users u ON u.id = gr.player_id
     GROUP BY g.id, my_run.id, my_run.total_score, my_run.created_at
     ORDER BY my_run.total_score DESC NULLS LAST
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

async function addGauntletComment(
  gauntletId,
  runId,
  roundIndex,
  authorId,
  text,
) {
  const result = await query(
    `INSERT INTO gauntlet_comments (gauntlet_id, run_id, round_index, author_id, text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, gauntlet_id, run_id, round_index, author_id, text, created_at`,
    [gauntletId, runId, roundIndex, authorId, text],
  );
  const row = result.rows[0];
  const userResult = await query(
    `SELECT display_name, custom_display_name, photo_url FROM users WHERE id = $1`,
    [authorId],
  );
  const user = userResult.rows[0];
  return {
    id: row.id,
    gauntletId: row.gauntlet_id,
    runId: row.run_id,
    roundIndex: row.round_index,
    authorId: row.author_id,
    authorName: getEffectiveDisplayName(user),
    authorPhoto: user?.photo_url ?? "",
    text: row.text,
    createdAt: row.created_at,
  };
}

async function getGauntletComments(gauntletId) {
  const result = await query(
    `SELECT gc.id, gc.gauntlet_id, gc.run_id, gc.round_index, gc.author_id,
            gc.text, gc.created_at, ${displayNameSql("u")} AS author_name, u.photo_url
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
    authorName: row.author_name,
    authorPhoto: row.photo_url,
    text: row.text,
    createdAt: row.created_at,
  }));
}

async function getGauntletMessages(gauntletId) {
  const result = await query(
    `SELECT gm.id, gm.gauntlet_id, gm.user_id, gm.text, gm.created_at,
            ${displayNameSql("u")} AS user_name, u.photo_url
     FROM gauntlet_messages gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.gauntlet_id = $1
     ORDER BY gm.created_at ASC`,
    [gauntletId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    gauntletId: row.gauntlet_id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.photo_url,
    text: row.text,
    createdAt: row.created_at,
  }));
}

async function createGauntletMessage(gauntletId, userId, text) {
  const result = await query(
    `INSERT INTO gauntlet_messages (gauntlet_id, user_id, text)
     VALUES ($1, $2, $3)
     RETURNING id, gauntlet_id, user_id, text, created_at`,
    [gauntletId, userId, text],
  );
  const row = result.rows[0];
  const userResult = await query(
    `SELECT display_name, custom_display_name, photo_url FROM users WHERE id = $1`,
    [userId],
  );
  const user = userResult.rows[0];
  return {
    id: row.id,
    gauntletId: row.gauntlet_id,
    userId: row.user_id,
    userName: getEffectiveDisplayName(user),
    userPhoto: user?.photo_url ?? "",
    text: row.text,
    createdAt: row.created_at,
  };
}

async function getMessageReactions(messageIds, messageType) {
  if (!messageIds.length) return {};
  const result = await query(
    `SELECT message_id, reaction, COUNT(*)::int AS count,
       array_agg(user_id) AS user_ids
     FROM message_reactions
     WHERE message_id = ANY($1) AND message_type = $2
     GROUP BY message_id, reaction`,
    [messageIds, messageType],
  );
  const map = {};
  for (const row of result.rows) {
    if (!map[row.message_id])
      map[row.message_id] = { counts: {}, userReactions: {} };
    map[row.message_id].counts[row.reaction] = row.count;
    for (const uid of row.user_ids) {
      map[row.message_id].userReactions[uid] = row.reaction;
    }
  }
  return map;
}

async function setMessageReaction(messageId, messageType, userId, reaction) {
  if (!reaction) {
    await query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND message_type = $2 AND user_id = $3`,
      [messageId, messageType, userId],
    );
    return null;
  }
  const result = await query(
    `INSERT INTO message_reactions (message_id, message_type, user_id, reaction)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (message_id, message_type, user_id)
     DO UPDATE SET reaction = EXCLUDED.reaction, created_at = NOW()
     RETURNING reaction`,
    [messageId, messageType, userId, reaction],
  );
  return result.rows[0].reaction;
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

// --- Migrations ---

async function runMigrations() {
  // --- Structural migration: game_sessions -> groups ---
  const oldTableExists = await query(`
    SELECT 1 FROM pg_class WHERE relname = 'game_sessions' AND relkind = 'r'
  `);

  if (oldTableExists.rows.length > 0) {
    console.log(
      "[Migration] Migrating game_sessions -> groups architecture...",
    );

    await query(`
      CREATE TABLE IF NOT EXISTS groups (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    const groupCount = await query(`SELECT COUNT(*) FROM groups`);
    if (parseInt(groupCount.rows[0].count, 10) === 0) {
      await query(`
        INSERT INTO groups (id, name, owner_id, created_at, updated_at)
        SELECT id, name, owner_id, created_at, updated_at FROM game_sessions
        ON CONFLICT (id) DO NOTHING
      `);
    }

    await query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      )
    `);

    const memberCount = await query(`SELECT COUNT(*) FROM group_members`);
    if (parseInt(memberCount.rows[0].count, 10) === 0) {
      await query(`
        INSERT INTO group_members (group_id, user_id, joined_at)
        SELECT sp.session_id, sp.user_id, sp.joined_at
        FROM session_players sp
        WHERE EXISTS (SELECT 1 FROM groups g WHERE g.id = sp.session_id)
        ON CONFLICT (group_id, user_id) DO NOTHING
      `);
    }

    // Decouple puns from sessions
    const hasPunsSessionId = await query(`
      SELECT 1 FROM information_schema.columns WHERE table_name = 'puns' AND column_name = 'session_id'
    `);
    if (hasPunsSessionId.rows.length > 0) {
      await query(`ALTER TABLE puns DROP COLUMN IF EXISTS session_id`);
    }

    // Drop session_id from pun_comments
    const hasCommentsSessionId = await query(`
      SELECT 1 FROM information_schema.columns WHERE table_name = 'pun_comments' AND column_name = 'session_id'
    `);
    if (hasCommentsSessionId.rows.length > 0) {
      await query(`ALTER TABLE pun_comments DROP COLUMN IF EXISTS session_id`);
    }

    // Migrate messages.session_id -> messages.group_id
    const hasMsgSessionId = await query(`
      SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'session_id'
    `);
    const hasMsgGroupId = await query(`
      SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'group_id'
    `);
    if (hasMsgSessionId.rows.length > 0 && hasMsgGroupId.rows.length === 0) {
      await query(`ALTER TABLE messages RENAME COLUMN session_id TO group_id`);
      await query(
        `ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_session_id_fkey`,
      );
      await query(`
        ALTER TABLE messages ADD CONSTRAINT messages_group_id_fkey
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
      `);
    }

    console.log("[Migration] Structural migration complete.");
  }

  // --- Standard idempotent migrations ---
  await query(
    `ALTER TABLE puns ADD COLUMN IF NOT EXISTS response_time_ms INTEGER`,
  );
  await query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_display_name VARCHAR(255)`,
  );
  await query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymous_in_leaderboards BOOLEAN DEFAULT FALSE`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS challenge_reveals (
      challenge_id VARCHAR(10) NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revealed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (challenge_id, user_id)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_challenge_reveals_user ON challenge_reveals(user_id)`,
  );

  const usersToNormalize = await query(
    `SELECT id, display_name, custom_display_name FROM users`,
  );
  for (const user of usersToNormalize.rows) {
    const nd = normalizeDisplayNameInput(user.display_name);
    const nc = normalizeDisplayNameInput(user.custom_display_name);
    if (nd === user.display_name && nc === user.custom_display_name) continue;
    await query(
      `UPDATE users SET display_name = $1, custom_display_name = $2, updated_at = NOW() WHERE id = $3`,
      [nd, nc, user.id],
    );
  }

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
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'scoring', 'complete')),
      total_score INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_gauntlets_created_by ON gauntlets(created_by)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_gauntlet ON gauntlet_runs(gauntlet_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_player ON gauntlet_runs(player_id)`,
  );
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
  await query(
    `CREATE INDEX IF NOT EXISTS idx_gauntlet_comments_gauntlet ON gauntlet_comments(gauntlet_id)`,
  );
  await query(
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`,
  );
  await query(
    `ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('reaction', 'vote', 'system'))`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS global_daily_challenges (
      challenge_id VARCHAR(10) PRIMARY KEY,
      topic VARCHAR(500) NOT NULL,
      focus VARCHAR(500) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  const alterToTz = (table, col) =>
    query(`
    DO $fn$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = '${table}' AND column_name = '${col}'
          AND data_type = 'timestamp without time zone')
      THEN ALTER TABLE ${table} ALTER COLUMN ${col} TYPE TIMESTAMP WITH TIME ZONE
        USING ${col} AT TIME ZONE 'UTC'; END IF;
    END $fn$
  `);
  await alterToTz("users", "created_at");
  await alterToTz("users", "updated_at");
  await alterToTz("groups", "created_at");
  await alterToTz("groups", "updated_at");
  await alterToTz("group_members", "joined_at");
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
  await alterToTz("challenge_reveals", "revealed_at");
  await alterToTz("challenge_reveals", "created_at");

  await query(`DELETE FROM pun_reactions WHERE reaction != 'groan'`);
  await query(`
    DO $fn$ BEGIN
      ALTER TABLE pun_reactions DROP CONSTRAINT IF EXISTS pun_reactions_reaction_check;
      ALTER TABLE pun_reactions ADD CONSTRAINT pun_reactions_reaction_check CHECK (reaction IN ('groan'));
    END $fn$
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS gauntlet_messages (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      gauntlet_id UUID NOT NULL REFERENCES gauntlets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text VARCHAR(500) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_gauntlet_messages_gauntlet ON gauntlet_messages(gauntlet_id)`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      message_id UUID NOT NULL,
      message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('chat', 'pun_comment', 'gauntlet_message', 'gauntlet_comment')),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction VARCHAR(20) NOT NULL CHECK (reaction IN ('laughing', 'skull', 'thumbs_up', 'groan', 'heart')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(message_id, message_type, user_id)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id, message_type)`,
  );

  // Indexes for three-tier architecture
  await query(
    `CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_puns_challenge ON puns(challenge_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_puns_author_challenge ON puns(author_id, challenge_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`,
  );

  await query(`
    DO $fn$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'groups' AND relkind = 'r') THEN
        DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
        CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $fn$
  `);

  // --- pgvector + buffer queue ---
  await query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await query(
    `ALTER TABLE global_daily_challenges ADD COLUMN IF NOT EXISTS embedding vector(1024)`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS pending_challenges (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      topic VARCHAR(500) NOT NULL,
      focus VARCHAR(500) NOT NULL,
      embedding vector(1024) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

export {
  pool,
  query,
  withTransaction,
  getEffectiveDisplayName,
  normalizeDisplayNameInput,
  runMigrations,
  findOrCreateUser,
  getUserById,
  updateCustomDisplayName,
  updateUserPrivacy,
  getGroupIdsByUser,
  createGroup,
  getAllGroups,
  getGroupById,
  joinGroup,
  deleteGroup,
  renameGroup,
  removePlayerFromGroup,
  getGlobalChallengeForDate,
  saveGlobalChallenge,
  getPastGlobalChallengeTopics,
  getPendingChallengeCount,
  popOldestPendingChallenge,
  insertPendingChallenge,
  findSimilarChallenges,
  getRecentChallengesForFilter,
  updateChallengeEmbedding,
  getChallengesWithoutEmbedding,
  getChallengeReveal,
  createChallengeReveal,
  hasUserSubmittedForChallenge,
  getPunsForChallenge,
  getPunsForChallengeByGroup,
  createPun,
  updatePunText,
  updatePunScore,
  deletePun,
  getPunById,
  setPunReaction,
  getPunsByAuthor,
  countPunsByAuthorForChallenge,
  getWeeklyBestScores,
  getGlobalDailyRanking,
  getGlobalAllTimeGroaners,
  getMessagesByGroup,
  createMessage,
  getCommentsByPun,
  getCommentsForPuns,
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
  getGauntletLeaderboard,
  addGauntletComment,
  getGauntletComments,
  getGauntletMessages,
  createGauntletMessage,
  getMessageReactions,
  setMessageReaction,
};
