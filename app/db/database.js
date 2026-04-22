import pg from "pg";
import {
  getActivePunJudgeDefinition,
  getBuiltInAiJudges,
  getUnknownAiJudgeDefinition,
} from "../lib/aiJudges.js";

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

function getDbRunner(executor = query) {
  return executor?.query ? executor.query.bind(executor) : query;
}

function normalizeJudgeVersion(version) {
  if (version === undefined || version === null) return null;
  return String(version).trim().replace(/^v/i, "");
}

function hasRecordedJudgeResult(score, feedback) {
  return (
    (score !== null && score !== undefined) ||
    (typeof feedback === "string" && feedback !== "Re-evaluating...")
  );
}

function clampPercentage(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeBackwordsGuessSlot(value, fallback = "guessA") {
  if (value === "guessA" || value === "guessB") return value;
  return fallback;
}

async function upsertAiJudgeDefinition(definition, executor = query) {
  const run = getDbRunner(executor);
  const key = definition?.judgeKey ?? definition?.key;
  const version = normalizeJudgeVersion(
    definition?.judgeVersion ?? definition?.version,
  );
  const judgeConfig = definition?.judgeConfig ?? definition?.config ?? null;

  if (!key || !version) {
    throw new Error("AI judge definitions require both key and version.");
  }

  const result = await run(
    `INSERT INTO ai_judges (
       key,
       name,
       version,
       model,
       system_prompt,
       prompt_hash,
       judge_config,
       status,
       is_active,
       retired_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
     ON CONFLICT (key, version)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, ai_judges.name),
       model = COALESCE(EXCLUDED.model, ai_judges.model),
       system_prompt = COALESCE(EXCLUDED.system_prompt, ai_judges.system_prompt),
       prompt_hash = COALESCE(EXCLUDED.prompt_hash, ai_judges.prompt_hash),
       judge_config = COALESCE(EXCLUDED.judge_config, ai_judges.judge_config),
       status = COALESCE(EXCLUDED.status, ai_judges.status),
       is_active = COALESCE(EXCLUDED.is_active, ai_judges.is_active),
       retired_at = CASE
         WHEN COALESCE(EXCLUDED.is_active, ai_judges.is_active) THEN NULL
         ELSE COALESCE(ai_judges.retired_at, EXCLUDED.retired_at, NOW())
       END
     RETURNING *`,
    [
      key,
      definition?.judgeName ?? definition?.name ?? key,
      version,
      definition?.judgeModel ?? definition?.model ?? null,
      definition?.systemPrompt ?? null,
      definition?.judgePromptHash ?? definition?.promptHash ?? null,
      judgeConfig ? JSON.stringify(judgeConfig) : null,
      definition?.judgeStatus ?? definition?.status ?? "active",
      definition?.isActive ?? false,
      definition?.retiredAt ?? null,
    ],
  );

  return result.rows[0];
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

async function getRecentBackwordsTopics(limit = 20) {
  const result = await query(
    `SELECT topic, focus FROM backwords_games ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows;
}

async function getRecentGauntletTopics(limit = 5) {
  const result = await query(
    `SELECT rounds FROM gauntlets ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows.flatMap((r) => r.rounds ?? []);
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
       aj.model AS ai_judge_model,
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
       LEFT JOIN ai_judges aj ON aj.id = p.ai_judge_id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.challenge_id = $1
       GROUP BY p.id, aj.model, ${displayNameSql("u")}, u.photo_url
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
       aj.model AS ai_judge_model,
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
     LEFT JOIN ai_judges aj ON aj.id = p.ai_judge_id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.challenge_id = $1
     GROUP BY p.id, aj.model, ${displayNameSql("u")}, u.photo_url
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
    `UPDATE puns
     SET text = $1,
         ai_score = NULL,
         ai_feedback = 'Re-evaluating...',
         ai_judge_id = NULL,
         ai_judge_key = NULL,
         ai_judge_name = NULL,
         ai_judge_version = NULL,
         ai_judged_at = NULL
     WHERE id = $2`,
    [text, punId],
  );
}

async function updatePunScore(punId, judgement, options = {}) {
  return withTransaction(async (client) => {
    const punResult = await client.query(
      `SELECT id, challenge_id, text
       FROM puns
       WHERE id = $1
       FOR UPDATE`,
      [punId],
    );

    if (!punResult.rows[0]) throw new Error("Pun not found");

    const pun = punResult.rows[0];
    const challengeResult = await client.query(
      `SELECT topic, focus
       FROM global_daily_challenges
       WHERE challenge_id = $1`,
      [pun.challenge_id],
    );
    const challenge = challengeResult.rows[0] ?? null;
    const judge = await upsertAiJudgeDefinition(judgement, client);
    const judgedAt = judgement?.judgedAt ?? new Date().toISOString();
    const latestJudgement = await client.query(
      `SELECT id FROM pun_judgements WHERE pun_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [punId],
    );

    await client.query(
      `INSERT INTO pun_judgements (
         pun_id,
         judge_id,
         status,
         trigger_type,
         score,
         feedback,
         reasoning,
         pun_text_snapshot,
         challenge_topic_snapshot,
         challenge_focus_snapshot,
         supersedes_judgement_id,
         created_at,
         error_message
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        punId,
        judge.id,
        judgement?.status ?? "completed",
        options?.triggerType ?? "initial",
        judgement?.score ?? null,
        judgement?.feedback ?? null,
        judgement?.reasoning ?? null,
        pun.text,
        challenge?.topic ?? null,
        challenge?.focus ?? null,
        latestJudgement.rows[0]?.id ?? null,
        judgedAt,
        judgement?.errorMessage ?? null,
      ],
    );

    await client.query(
      `UPDATE puns
       SET ai_score = $1,
           ai_feedback = $2,
           ai_judge_id = $3,
           ai_judge_key = $4,
           ai_judge_name = $5,
           ai_judge_version = $6,
           ai_judged_at = $7
       WHERE id = $8`,
      [
        judgement?.score ?? null,
        judgement?.feedback ?? null,
        judge.id,
        judge.key,
        judge.name,
        judge.version,
        judgedAt,
        punId,
      ],
    );
  });
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
       aj.model AS ai_judge_model,
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
     LEFT JOIN ai_judges aj ON aj.id = p.ai_judge_id
     LEFT JOIN pun_reactions pr ON p.id = pr.pun_id
     LEFT JOIN users ru ON pr.user_id = ru.id
     LEFT JOIN global_daily_challenges gdc ON p.challenge_id = gdc.challenge_id
     WHERE p.author_id = $1
     GROUP BY p.id, aj.model, ${displayNameSql("u")}, u.photo_url, gdc.topic, gdc.focus
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
    aiScore:
      row.ai_score === null || row.ai_score === undefined
        ? null
        : parseFloat(row.ai_score),
    aiFeedback: row.ai_feedback,
    aiJudgeKey: row.ai_judge_key || null,
    aiJudgeName: row.ai_judge_name || null,
    aiJudgeVersion: row.ai_judge_version || null,
    aiJudgeModel: row.ai_judge_model || null,
    aiJudgedAt: row.ai_judged_at || null,
    responseTimeMs:
      row.response_time_ms === null || row.response_time_ms === undefined
        ? null
        : Number(row.response_time_ms),
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
  });
}

// Player stats for a specific group
async function getPlayerGroupStats(groupId, userId) {
  const result = await query(
    `WITH group_puns AS (
      SELECT p.challenge_id, p.author_id, MAX(p.ai_score) as max_score
      FROM puns p
      JOIN group_members gm ON gm.user_id = p.author_id AND gm.group_id = $1
      WHERE p.ai_score IS NOT NULL
      GROUP BY p.challenge_id, p.author_id
    ),
    challenge_winners AS (
      SELECT challenge_id, MAX(max_score) as winning_score, AVG(max_score) as average_score
      FROM group_puns
      GROUP BY challenge_id
    ),
    user_puns AS (
      SELECT p.challenge_id, MAX(p.ai_score) as user_score
      FROM puns p
      WHERE p.author_id = $2 AND p.ai_score IS NOT NULL
      GROUP BY p.challenge_id
    ),
    recent_history AS (
      SELECT up.challenge_id as date, up.user_score, cw.winning_score, cw.average_score as group_average
      FROM user_puns up
      LEFT JOIN challenge_winners cw ON cw.challenge_id = up.challenge_id
      ORDER BY up.challenge_id DESC
      LIMIT 7
    )
    SELECT
      (SELECT COUNT(*) FROM user_puns) as total_submissions,
      (SELECT AVG(user_score) FROM user_puns) as average_score,
      (SELECT COUNT(*) 
       FROM user_puns up 
       JOIN challenge_winners cw ON up.challenge_id = cw.challenge_id 
       WHERE up.user_score = cw.winning_score) as wins,
      (SELECT json_agg(row_to_json(rh)) FROM (SELECT * FROM recent_history ORDER BY date ASC) rh) as recent_efforts`
  , [groupId, userId]);

  const row = result.rows[0] || {};
  return {
    totalSubmissions: parseInt(row.total_submissions || 0, 10),
    averageScore: row.average_score ? parseFloat(row.average_score).toFixed(1) : null,
    wins: parseInt(row.wins || 0, 10),
    recentEfforts: row.recent_efforts || [],
  };
}

// Global daily ranking
async function getGlobalDailyRanking(challengeId, viewerId) {
  const result = await query(
    `SELECT p.id, p.text, p.ai_score, p.ai_judge_name, p.ai_judge_version, p.created_at,
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
       COUNT(pr.pun_id) AS groan_count,
       COUNT(pr.pun_id) FILTER (WHERE pr.user_id = $2) > 0 AS my_groan
     FROM puns p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN global_daily_challenges gdc ON gdc.challenge_id = p.challenge_id
     LEFT JOIN pun_reactions pr ON pr.pun_id = p.id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.challenge_id = $1 AND p.ai_score IS NOT NULL
     GROUP BY p.id, ${displayNameSql("u")}, u.photo_url, u.anonymous_in_leaderboards, gdc.topic, gdc.focus
     ORDER BY p.ai_score DESC, groan_count DESC, p.created_at ASC
     LIMIT 50`,
    [challengeId, viewerId],
  );
  return result.rows.map(formatLeaderboardRow);
}

// All-time top groaners
async function getGlobalAllTimeGroaners(viewerId) {
  const result = await query(
    `SELECT p.id, p.text, p.ai_score, p.ai_judge_name, p.ai_judge_version, p.challenge_id, p.created_at,
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
       COUNT(pr.pun_id) AS groan_count,
       COUNT(pr.pun_id) FILTER (WHERE pr.user_id = $1) > 0 AS my_groan
     FROM puns p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN global_daily_challenges gdc ON gdc.challenge_id = p.challenge_id
     LEFT JOIN pun_reactions pr ON pr.pun_id = p.id
     LEFT JOIN users ru ON pr.user_id = ru.id
     WHERE p.ai_score >= 7.0
     GROUP BY p.id, ${displayNameSql("u")}, u.photo_url, u.anonymous_in_leaderboards, gdc.topic, gdc.focus
     ORDER BY groan_count DESC, p.created_at ASC
     LIMIT 50`,
    [viewerId],
  );
  return result.rows.map(formatLeaderboardRow);
}

function formatLeaderboardRow(row) {
  const anonymous = !!row.anonymous_in_leaderboards;
  return {
    id: row.id,
    text: row.text,
    aiScore: parseFloat(row.ai_score),
    aiJudgeName: row.ai_judge_name || null,
    aiJudgeVersion: row.ai_judge_version || null,
    challengeId: row.challenge_id || null,
    challengeTopic: row.challenge_topic || null,
    challengeFocus: row.challenge_focus || null,
    authorName: anonymous ? "Anonymous Punster" : row.author_name,
    authorPhoto: anonymous ? "" : row.author_photo,
    groanCount: Number(row.groan_count || 0),
    groaners: formatGroaners(row.groaners),
    myReaction: row.my_groan ? "groan" : null,
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

async function markAllNotificationsRead(userId) {
  await query(
    "UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE",
    [userId],
  );
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
    ai_judge_id: null,
    ai_judge_key: null,
    ai_judge_name: null,
    ai_judge_version: null,
    ai_judge_model: null,
    ai_judged_at: null,
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
  judgement,
  options = {},
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT gr.rounds, g.rounds AS prompts
       FROM gauntlet_runs gr
       JOIN gauntlets g ON g.id = gr.gauntlet_id
       WHERE gr.id = $1
       FOR UPDATE`,
      [runId],
    );
    if (!rows[0]) throw new Error("Run not found");
    const rounds = rows[0].rounds;
    const round = rounds[roundIndex];
    const judge = await upsertAiJudgeDefinition(judgement, client);
    const judgedAt = judgement?.judgedAt ?? new Date().toISOString();
    const aiScore = judgement?.score ?? null;
    const aiFeedback = judgement?.feedback ?? null;
    const baseScore = (aiScore ?? 0) * 100;
    const timeBonus =
      (aiScore ?? 0) >= 5 ? (round.seconds_remaining || 0) * 10 : 0;
    const latestJudgement = await client.query(
      `SELECT id
       FROM gauntlet_round_judgements
       WHERE run_id = $1 AND round_index = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [runId, roundIndex],
    );
    const prompt = rows[0].prompts?.[roundIndex] ?? {};

    await client.query(
      `INSERT INTO gauntlet_round_judgements (
         run_id,
         round_index,
         judge_id,
         status,
         trigger_type,
         score,
         feedback,
         reasoning,
         pun_text_snapshot,
         challenge_topic_snapshot,
         challenge_focus_snapshot,
         seconds_remaining,
         supersedes_judgement_id,
         created_at,
         error_message
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        runId,
        roundIndex,
        judge.id,
        judgement?.status ?? "completed",
        options?.triggerType ?? "initial",
        aiScore,
        aiFeedback,
        judgement?.reasoning ?? null,
        round?.pun_text ?? null,
        prompt.topic ?? null,
        prompt.focus ?? null,
        round?.seconds_remaining ?? null,
        latestJudgement.rows[0]?.id ?? null,
        judgedAt,
        judgement?.errorMessage ?? null,
      ],
    );

    rounds[roundIndex] = {
      ...round,
      ai_score: aiScore,
      ai_feedback: aiFeedback,
      ai_judge_id: judge.id,
      ai_judge_key: judge.key,
      ai_judge_name: judge.name,
      ai_judge_version: judge.version,
      ai_judge_model: judge.model,
      ai_judged_at: judgedAt,
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

// --- Backwords functions ---

async function createBackwordsGame(creatorId, topic, focus) {
  const result = await query(
    `INSERT INTO backwords_games (creator_id, topic, focus)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [creatorId, topic, focus],
  );

  return getBackwordsGameById(result.rows[0].id);
}

async function getBackwordsGameById(gameId) {
  const result = await query(
    `SELECT bg.*, ${displayNameSql("u")} AS creator_name, u.photo_url
     FROM backwords_games bg
     JOIN users u ON u.id = bg.creator_id
     WHERE bg.id = $1`,
    [gameId],
  );

  return result.rows[0] ? formatBackwordsGame(result.rows[0]) : null;
}

async function publishBackwordsGame(gameId, creatorId, clues) {
  const result = await query(
    `UPDATE backwords_games
     SET clues = $1::jsonb,
         status = 'published',
         updated_at = NOW()
     WHERE id = $2 AND creator_id = $3 AND status = 'draft'
     RETURNING id`,
    [JSON.stringify(clues), gameId, creatorId],
  );

  if (!result.rows[0]) {
    throw new Error("Backwords game not found or already published");
  }

  return getBackwordsGameById(result.rows[0].id);
}

async function updateBackwordsGameScores(gameId, judgements) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT bg.*, ${displayNameSql("u")} AS creator_name, u.photo_url
       FROM backwords_games bg
       JOIN users u ON u.id = bg.creator_id
       WHERE bg.id = $1
       FOR UPDATE`,
      [gameId],
    );

    if (!rows[0]) throw new Error("Backwords game not found");

    const clues = rows[0].clues || [];
    let creatorScore = 0;
    const nextClues = [];

    for (let index = 0; index < clues.length; index++) {
      const clue = clues[index];
      const judgement = judgements[index] ?? {};
      const judge = await upsertAiJudgeDefinition(judgement, client);
      const judgedAt = judgement?.judgedAt ?? new Date().toISOString();
      const aiScore = judgement?.score ?? 0;
      const clueScore = aiScore * 100;
      creatorScore += clueScore;

      nextClues.push({
        ...clue,
        ai_score: aiScore,
        ai_feedback: judgement?.feedback ?? null,
        ai_judge_id: judge.id,
        ai_judge_key: judge.key,
        ai_judge_name: judge.name,
        ai_judge_version: judge.version,
        ai_judge_model: judge.model,
        ai_judged_at: judgedAt,
        clue_score: clueScore,
      });
    }

    const updated = await client.query(
      `UPDATE backwords_games
       SET clues = $1::jsonb,
           creator_score = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(nextClues), creatorScore, gameId],
    );

    return formatBackwordsGame({
      ...updated.rows[0],
      creator_name: rows[0].creator_name,
      photo_url: rows[0].photo_url,
    });
  });
}

async function getBackwordsRunById(runId) {
  const result = await query(
    `SELECT br.*, ${displayNameSql("u")} AS guesser_name, u.photo_url
     FROM backwords_runs br
     JOIN users u ON u.id = br.guesser_id
     WHERE br.id = $1`,
    [runId],
  );

  return result.rows[0] ? formatBackwordsRun(result.rows[0]) : null;
}

async function getBackwordsRunByGameAndGuesser(gameId, guesserId) {
  const result = await query(
    `SELECT br.*, ${displayNameSql("u")} AS guesser_name, u.photo_url
     FROM backwords_runs br
     JOIN users u ON u.id = br.guesser_id
     WHERE br.game_id = $1 AND br.guesser_id = $2`,
    [gameId, guesserId],
  );

  return result.rows[0] ? formatBackwordsRun(result.rows[0]) : null;
}

async function createOrGetBackwordsRun(gameId, guesserId) {
  await query(
    `INSERT INTO backwords_runs (game_id, guesser_id)
     VALUES ($1, $2)
     ON CONFLICT (game_id, guesser_id) DO NOTHING`,
    [gameId, guesserId],
  );

  return getBackwordsRunByGameAndGuesser(gameId, guesserId);
}

async function submitBackwordsGuess(runId, guessA, guessB, attemptIndex) {
  const newEntry = {
    guess_a: guessA,
    guess_b: guessB,
    matched: null,
    overall_similarity: null,
    topic_similarity: null,
    focus_similarity: null,
    mapped_topic_guess: null,
    mapped_focus_guess: null,
    topic_guess_text: null,
    focus_guess_text: null,
    feedback: null,
    ai_judge_id: null,
    ai_judge_key: null,
    ai_judge_name: null,
    ai_judge_version: null,
    ai_judge_model: null,
    ai_judged_at: null,
    submitted_at: new Date().toISOString(),
  };

  const result = await query(
    `UPDATE backwords_runs
     SET attempts = attempts || $1::jsonb,
         status = 'judging',
         attempts_used = attempts_used + 1,
         updated_at = NOW()
     WHERE id = $2
       AND status = 'in_progress'
       AND attempts_used < 3
       AND jsonb_array_length(attempts) = $3
     RETURNING *`,
    [JSON.stringify([newEntry]), runId, attemptIndex],
  );

  if (!result.rows[0]) {
    throw new Error("Backwords guess could not be recorded");
  }

  return getBackwordsRunById(result.rows[0].id);
}

async function updateBackwordsGuessResult(
  runId,
  attemptIndex,
  judgement,
  options = {},
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT br.*, bg.topic, bg.focus,
              ${displayNameSql("u")} AS guesser_name, u.photo_url
       FROM backwords_runs br
       JOIN backwords_games bg ON bg.id = br.game_id
       JOIN users u ON u.id = br.guesser_id
       WHERE br.id = $1
       FOR UPDATE`,
      [runId],
    );

    if (!rows[0]) throw new Error("Backwords run not found");

    const attempts = rows[0].attempts || [];
    const attempt = attempts[attemptIndex];

    if (!attempt) throw new Error("Backwords attempt not found");

    const judge = await upsertAiJudgeDefinition(judgement, client);
    const judgedAt = judgement?.judgedAt ?? new Date().toISOString();
    const matched = Boolean(judgement?.matched);
    const topicSimilarity = clampPercentage(judgement?.topicSimilarity);
    const focusSimilarity = clampPercentage(judgement?.focusSimilarity);
    const overallSimilarity = clampPercentage(
      judgement?.overallSimilarity ??
        Math.round((topicSimilarity + focusSimilarity) / 2),
    );
    const topicGuessSlot = normalizeBackwordsGuessSlot(
      judgement?.topicGuessSlot,
      "guessA",
    );
    let focusGuessSlot = normalizeBackwordsGuessSlot(
      judgement?.focusGuessSlot,
      topicGuessSlot === "guessA" ? "guessB" : "guessA",
    );

    if (focusGuessSlot === topicGuessSlot) {
      focusGuessSlot = topicGuessSlot === "guessA" ? "guessB" : "guessA";
    }

    const topicGuessText =
      topicGuessSlot === "guessA" ? attempt.guess_a : attempt.guess_b;
    const focusGuessText =
      focusGuessSlot === "guessA" ? attempt.guess_a : attempt.guess_b;

    const latestJudgement = await client.query(
      `SELECT id
       FROM backwords_guess_judgements
       WHERE run_id = $1 AND attempt_index = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [runId, attemptIndex],
    );

    await client.query(
      `INSERT INTO backwords_guess_judgements (
         run_id,
         attempt_index,
         judge_id,
         status,
         trigger_type,
         matched,
         overall_similarity,
         topic_similarity,
         focus_similarity,
         guess_a_snapshot,
         guess_b_snapshot,
         mapped_topic_guess,
         mapped_focus_guess,
         challenge_topic_snapshot,
         challenge_focus_snapshot,
         feedback,
         reasoning,
         supersedes_judgement_id,
         created_at,
         error_message
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
       )`,
      [
        runId,
        attemptIndex,
        judge.id,
        judgement?.status ?? "completed",
        options?.triggerType ?? "initial",
        matched,
        overallSimilarity,
        topicSimilarity,
        focusSimilarity,
        attempt.guess_a,
        attempt.guess_b,
        topicGuessSlot,
        focusGuessSlot,
        rows[0].topic,
        rows[0].focus,
        judgement?.feedback ?? null,
        judgement?.reasoning ?? null,
        latestJudgement.rows[0]?.id ?? null,
        judgedAt,
        judgement?.errorMessage ?? null,
      ],
    );

    attempts[attemptIndex] = {
      ...attempt,
      matched,
      overall_similarity: overallSimilarity,
      topic_similarity: topicSimilarity,
      focus_similarity: focusSimilarity,
      mapped_topic_guess: topicGuessSlot,
      mapped_focus_guess: focusGuessSlot,
      topic_guess_text: topicGuessText,
      focus_guess_text: focusGuessText,
      feedback: judgement?.feedback ?? null,
      ai_judge_id: judge.id,
      ai_judge_key: judge.key,
      ai_judge_name: judge.name,
      ai_judge_version: judge.version,
      ai_judge_model: judge.model,
      ai_judged_at: judgedAt,
    };

    const bestSimilarity = attempts.reduce((best, currentAttempt) => {
      return Math.max(best, currentAttempt?.overall_similarity ?? 0);
    }, 0);
    const nextStatus = matched
      ? "solved"
      : attemptIndex >= 2
        ? "failed"
        : "in_progress";
    const matchedOnAttempt = matched
      ? attemptIndex + 1
      : rows[0].matched_on_attempt;

    const updated = await client.query(
      `UPDATE backwords_runs
       SET attempts = $1::jsonb,
           status = $2,
           best_similarity = $3,
           matched_on_attempt = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify(attempts),
        nextStatus,
        bestSimilarity || null,
        matchedOnAttempt,
        runId,
      ],
    );

    return formatBackwordsRun({
      ...updated.rows[0],
      guesser_name: rows[0].guesser_name,
      photo_url: rows[0].photo_url,
    });
  });
}

async function getBackwordsHistory(userId, limit = 20) {
  const authoredResult = await query(
    `SELECT bg.id, bg.topic, bg.focus, bg.clues, bg.creator_score,
            bg.created_at,
            COUNT(br.id)::int AS total_guessers,
            COUNT(*) FILTER (WHERE br.status = 'solved')::int AS solved_count
     FROM backwords_games bg
     LEFT JOIN backwords_runs br ON br.game_id = bg.id
     WHERE bg.creator_id = $1 AND bg.status = 'published'
     GROUP BY bg.id
     ORDER BY bg.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  const guessedResult = await query(
    `SELECT br.id AS run_id, br.game_id, br.status, br.attempts_used,
            br.best_similarity, br.matched_on_attempt,
            br.created_at AS run_created_at,
            bg.clues, bg.topic, bg.focus, bg.creator_score,
            ${displayNameSql("u")} AS creator_name, u.photo_url
     FROM backwords_runs br
     JOIN backwords_games bg ON bg.id = br.game_id
     JOIN users u ON u.id = bg.creator_id
     WHERE br.guesser_id = $1 AND br.status IN ('solved', 'failed')
     ORDER BY br.updated_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  return {
    authored: authoredResult.rows.map((row) => ({
      gameId: row.id,
      topic: row.topic,
      focus: row.focus,
      clues: row.clues,
      creatorScore: row.creator_score,
      createdAt: row.created_at,
      totalGuessers: row.total_guessers,
      solvedCount: row.solved_count,
    })),
    guessed: guessedResult.rows.map((row) => ({
      gameId: row.game_id,
      runId: row.run_id,
      clues: row.clues,
      topic: row.topic,
      focus: row.focus,
      creatorScore: row.creator_score,
      creatorName: row.creator_name,
      creatorPhoto: row.photo_url,
      status: row.status,
      attemptsUsed: row.attempts_used,
      bestSimilarity: row.best_similarity,
      matchedOnAttempt: row.matched_on_attempt,
      createdAt: row.run_created_at,
    })),
  };
}

async function getBackwordsComparison(gameId) {
  const game = await getBackwordsGameById(gameId);
  if (!game || game.status !== "published") return null;

  const runsResult = await query(
    `SELECT br.*, ${displayNameSql("u")} AS guesser_name, u.photo_url
     FROM backwords_runs br
     JOIN users u ON u.id = br.guesser_id
     WHERE br.game_id = $1
     ORDER BY CASE br.status
       WHEN 'solved' THEN 0
       WHEN 'failed' THEN 1
       WHEN 'judging' THEN 2
       ELSE 3
     END,
     br.matched_on_attempt ASC NULLS LAST,
     br.best_similarity DESC NULLS LAST,
     br.updated_at DESC`,
    [gameId],
  );

  return {
    game,
    runs: runsResult.rows.map((row) => formatBackwordsRun(row)),
    totalGuessers: runsResult.rows.length,
    solvedCount: runsResult.rows.filter((row) => row.status === "solved")
      .length,
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

function formatBackwordsGame(row, options = {}) {
  const includeTargets = options.includeTargets ?? true;

  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name ?? null,
    creatorPhoto: row.photo_url ?? "",
    topic: includeTargets ? row.topic : null,
    focus: includeTargets ? row.focus : null,
    clues: row.clues,
    creatorScore: row.creator_score,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatBackwordsRun(row) {
  return {
    id: row.id,
    gameId: row.game_id,
    guesserId: row.guesser_id,
    guesserName: row.guesser_name ?? null,
    guesserPhoto: row.photo_url ?? "",
    attempts: row.attempts,
    status: row.status,
    attemptsUsed: row.attempts_used,
    bestSimilarity: row.best_similarity,
    matchedOnAttempt: row.matched_on_attempt,
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
  await query(`
    CREATE TABLE IF NOT EXISTS ai_judges (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      key VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      version VARCHAR(50) NOT NULL,
      model VARCHAR(255),
      system_prompt TEXT,
      prompt_hash VARCHAR(64),
      judge_config JSONB,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'legacy')),
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      retired_at TIMESTAMP WITH TIME ZONE,
      UNIQUE (key, version)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_ai_judges_active ON ai_judges(is_active)`,
  );
  await query(
    `ALTER TABLE puns ADD COLUMN IF NOT EXISTS ai_judge_id UUID REFERENCES ai_judges(id) ON DELETE SET NULL`,
  );
  await query(
    `ALTER TABLE puns ADD COLUMN IF NOT EXISTS ai_judge_key VARCHAR(100)`,
  );
  await query(
    `ALTER TABLE puns ADD COLUMN IF NOT EXISTS ai_judge_name VARCHAR(255)`,
  );
  await query(
    `ALTER TABLE puns ADD COLUMN IF NOT EXISTS ai_judge_version VARCHAR(50)`,
  );
  await query(
    `ALTER TABLE puns ADD COLUMN IF NOT EXISTS ai_judged_at TIMESTAMP WITH TIME ZONE`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS pun_judgements (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      pun_id UUID NOT NULL REFERENCES puns(id) ON DELETE CASCADE,
      judge_id UUID REFERENCES ai_judges(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'initial',
      score NUMERIC(3,1),
      feedback TEXT,
      reasoning TEXT,
      pun_text_snapshot TEXT,
      challenge_topic_snapshot VARCHAR(500),
      challenge_focus_snapshot VARCHAR(500),
      supersedes_judgement_id UUID REFERENCES pun_judgements(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      error_message TEXT
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_pun_judgements_pun ON pun_judgements(pun_id, created_at DESC)`,
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
    CREATE TABLE IF NOT EXISTS gauntlet_round_judgements (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      run_id UUID NOT NULL REFERENCES gauntlet_runs(id) ON DELETE CASCADE,
      round_index INTEGER NOT NULL CHECK (round_index >= 0 AND round_index <= 4),
      judge_id UUID REFERENCES ai_judges(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'initial',
      score NUMERIC(3,1),
      feedback TEXT,
      reasoning TEXT,
      pun_text_snapshot TEXT,
      challenge_topic_snapshot VARCHAR(500),
      challenge_focus_snapshot VARCHAR(500),
      seconds_remaining INTEGER,
      supersedes_judgement_id UUID REFERENCES gauntlet_round_judgements(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      error_message TEXT
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_gauntlet_round_judgements_run ON gauntlet_round_judgements(run_id, round_index, created_at DESC)`,
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
  for (const judge of getBuiltInAiJudges()) {
    await upsertAiJudgeDefinition(judge);
  }

  const activeJudge = await upsertAiJudgeDefinition(
    getActivePunJudgeDefinition(),
  );
  const unknownJudge = await upsertAiJudgeDefinition(
    getUnknownAiJudgeDefinition(),
  );
  const aiJudgeModelsByIdResult = await query(
    `SELECT id, model FROM ai_judges`,
  );
  const aiJudgeModelsById = new Map(
    aiJudgeModelsByIdResult.rows.map((row) => [row.id, row.model || null]),
  );

  await query(
    `UPDATE ai_judges
     SET is_active = CASE WHEN id = $1 THEN TRUE ELSE FALSE END,
         retired_at = CASE
           WHEN id = $1 THEN NULL
           WHEN status = 'legacy' THEN retired_at
           ELSE COALESCE(retired_at, NOW())
         END`,
    [activeJudge.id],
  );

  await query(
    `UPDATE puns
     SET ai_judge_id = $1,
         ai_judge_key = $2,
         ai_judge_name = $3,
         ai_judge_version = $4,
         ai_judged_at = COALESCE(ai_judged_at, updated_at, created_at)
     WHERE ai_judge_id IS NULL
       AND (ai_score IS NOT NULL OR (ai_feedback IS NOT NULL AND ai_feedback != 'Re-evaluating...'))`,
    [
      unknownJudge.id,
      unknownJudge.key,
      unknownJudge.name,
      unknownJudge.version,
    ],
  );

  const gauntletRunsToBackfill = await query(
    `SELECT id, rounds, created_at, updated_at FROM gauntlet_runs WHERE jsonb_array_length(rounds) > 0`,
  );

  for (const row of gauntletRunsToBackfill.rows) {
    let changed = false;
    const nextRounds = (row.rounds || []).map((round) => {
      if (
        !round ||
        !hasRecordedJudgeResult(round.ai_score, round.ai_feedback)
      ) {
        return round;
      }

      const nextRound = { ...round };

      if (!nextRound.ai_judge_key) {
        nextRound.ai_judge_id = unknownJudge.id;
        nextRound.ai_judge_key = unknownJudge.key;
        nextRound.ai_judge_name = unknownJudge.name;
        nextRound.ai_judge_version = unknownJudge.version;
        nextRound.ai_judged_at =
          nextRound.ai_judged_at || row.updated_at || row.created_at || null;
        changed = true;
      }

      if (!nextRound.ai_judge_model) {
        nextRound.ai_judge_model =
          aiJudgeModelsById.get(nextRound.ai_judge_id) ?? unknownJudge.model;
        changed = true;
      }

      return nextRound;
    });

    if (!changed) continue;

    await query(`UPDATE gauntlet_runs SET rounds = $1::jsonb WHERE id = $2`, [
      JSON.stringify(nextRounds),
      row.id,
    ]);
  }

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
  await alterToTz("puns", "ai_judged_at");
  await alterToTz("pun_reactions", "created_at");
  await alterToTz("pun_reactions", "updated_at");
  await alterToTz("messages", "created_at");
  await alterToTz("pun_comments", "created_at");
  await alterToTz("notifications", "created_at");
  await alterToTz("gauntlets", "created_at");
  await alterToTz("gauntlet_runs", "created_at");
  await alterToTz("gauntlet_runs", "updated_at");
  await alterToTz("backwords_games", "created_at");
  await alterToTz("backwords_games", "updated_at");
  await alterToTz("backwords_runs", "created_at");
  await alterToTz("backwords_runs", "updated_at");
  await alterToTz("challenge_reveals", "revealed_at");
  await alterToTz("challenge_reveals", "created_at");
  await alterToTz("ai_judges", "created_at");
  await alterToTz("ai_judges", "retired_at");
  await alterToTz("pun_judgements", "created_at");
  await alterToTz("gauntlet_round_judgements", "created_at");
  await alterToTz("backwords_guess_judgements", "created_at");

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
    CREATE TABLE IF NOT EXISTS backwords_games (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic VARCHAR(500) NOT NULL,
      focus VARCHAR(500) NOT NULL,
      clues JSONB NOT NULL DEFAULT '[]',
      creator_score INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_backwords_games_creator ON backwords_games(creator_id)`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS backwords_runs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      game_id UUID NOT NULL REFERENCES backwords_games(id) ON DELETE CASCADE,
      guesser_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attempts JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'judging', 'solved', 'failed')),
      attempts_used INTEGER NOT NULL DEFAULT 0,
      best_similarity INTEGER,
      matched_on_attempt INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (game_id, guesser_id)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_backwords_runs_game ON backwords_runs(game_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_backwords_runs_guesser ON backwords_runs(guesser_id)`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS backwords_guess_judgements (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      run_id UUID NOT NULL REFERENCES backwords_runs(id) ON DELETE CASCADE,
      attempt_index INTEGER NOT NULL CHECK (attempt_index >= 0 AND attempt_index <= 2),
      judge_id UUID REFERENCES ai_judges(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'initial',
      matched BOOLEAN NOT NULL DEFAULT FALSE,
      overall_similarity INTEGER,
      topic_similarity INTEGER,
      focus_similarity INTEGER,
      guess_a_snapshot TEXT,
      guess_b_snapshot TEXT,
      mapped_topic_guess VARCHAR(20),
      mapped_focus_guess VARCHAR(20),
      challenge_topic_snapshot VARCHAR(500),
      challenge_focus_snapshot VARCHAR(500),
      feedback TEXT,
      reasoning TEXT,
      supersedes_judgement_id UUID REFERENCES backwords_guess_judgements(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      error_message TEXT
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_backwords_guess_judgements_run ON backwords_guess_judgements(run_id, attempt_index, created_at DESC)`,
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
  getRecentBackwordsTopics,
  getRecentGauntletTopics,
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
  getPlayerGroupStats,
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
  markAllNotificationsRead,
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
  createBackwordsGame,
  getBackwordsGameById,
  publishBackwordsGame,
  updateBackwordsGameScores,
  createOrGetBackwordsRun,
  getBackwordsRunById,
  getBackwordsRunByGameAndGuesser,
  submitBackwordsGuess,
  updateBackwordsGuessResult,
  getBackwordsHistory,
  getBackwordsComparison,
  getMessageReactions,
  setMessageReaction,
};
