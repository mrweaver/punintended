import "dotenv/config";
import { getBestDailyHubScores, pool } from "../db/database.js";
import { submitScoreToHub } from "../services/hub.js";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    fromChallengeId: null,
    toChallengeId: null,
    limit: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith("--from=")) {
      options.fromChallengeId = arg.slice("--from=".length);
      continue;
    }
    if (arg.startsWith("--to=")) {
      options.toChallengeId = arg.slice("--to=".length);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = await getBestDailyHubScores(options);

  console.log(
    `[hub backfill] loaded ${rows.length} daily-best row(s)` +
      (options.dryRun ? " [dry-run]" : ""),
  );

  let submitted = 0;
  let failed = 0;

  for (const row of rows) {
    const summary = `${row.challengeId} author=${row.authorId} pun=${row.punId} score=${row.aiScore}`;

    if (options.dryRun) {
      console.log(`[hub backfill] would submit ${summary}`);
      submitted += 1;
      continue;
    }

    const result = await submitScoreToHub({
      hubUserId: row.hubUserId,
      aiScore: row.aiScore,
      responseTimeMs: row.responseTimeMs,
      isDaily: true,
      playedAt: row.playedAt,
    });

    if (!result) {
      failed += 1;
      console.warn(`[hub backfill] failed ${summary}`);
      continue;
    }

    submitted += 1;
    console.log(
      `[hub backfill] submitted ${summary} score_id=${result.score_id} xp=${result.new_xp} streak=${result.current_streak}`,
    );
  }

  console.log(
    `[hub backfill] done submitted=${submitted} failed=${failed} total=${rows.length}`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[hub backfill] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });