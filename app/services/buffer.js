/**
 * services/buffer.js — Batched buffer queue with novelty-sort selection.
 *
 * Maintains a pool of pre-approved challenges in `pending_challenges`.
 * Refills by generating candidates via Gemini, embedding them via Ollama,
 * scoring each against the corpus (cosine similarity + optional reranker),
 * then sorting by novelty and slicing the most diverse candidates to fill
 * the buffer. A high sanity ceiling rejects only near-exact duplicates.
 */
import {
  getPendingChallengeCount,
  insertPendingChallenge,
  findSimilarChallenges,
  getRecentChallengesForFilter,
  getChallengesWithoutEmbedding,
  updateChallengeEmbedding,
} from "../db/database.js";
import { generateChallengeBatch } from "./ai.js";
import { generateEmbedding } from "./embeddings.js";

// --- Configuration ---
const RERANKER_URL = process.env.RERANKER_URL || "http://reranker:7997";
const SANITY_CEILING = parseFloat(process.env.SANITY_CEILING || "0.95");
const BUFFER_MIN = parseInt(process.env.BUFFER_MIN_SIZE || "5", 10);
const BUFFER_TARGET = BUFFER_MIN * 3;
const RERANKER_ENABLED = process.env.RERANKER_ENABLED !== "false";
const REFILL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let isRefilling = false;

/**
 * Convert a topic/focus pair to a single text string for embedding.
 */
function challengeToText(topic, focus) {
  return `Topic: ${topic} | Focus: ${focus}`;
}

/**
 * Convert a float array to pgvector string format.
 */
function toVectorString(embedding) {
  return `[${embedding.join(",")}]`;
}

/**
 * Stage 2: Cross-encoder reranking via Infinity (jina-reranker-v3).
 */
async function rerankCandidates(queryText, documents) {
  const res = await fetch(`${RERANKER_URL}/v1/rerank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jinaai/jina-reranker-v3",
      query: queryText,
      documents,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Reranker failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.results;
}

/**
 * Score a candidate's similarity against the existing corpus.
 * Returns a number 0–1 (higher = more similar to existing challenges).
 */
async function scoreCandidate(topic, focus, embedding) {
  const vecStr = toVectorString(embedding);
  const limit = RERANKER_ENABLED ? 10 : 1;
  const similar = await findSimilarChallenges(vecStr, limit);

  if (similar.length === 0) return 0;

  if (RERANKER_ENABLED) {
    try {
      const queryText = challengeToText(topic, focus);
      const documents = similar.map((s) => challengeToText(s.topic, s.focus));
      const reranked = await rerankCandidates(queryText, documents);
      return Math.max(...reranked.map((r) => r.relevance_score));
    } catch (err) {
      console.warn(
        "[Buffer] Reranker unavailable, falling back to cosine similarity:",
        err.message,
      );
    }
  }

  return 1 - similar[0].distance;
}

/**
 * Core refill: generate candidates via Gemini, embed, score, novelty-sort, slice.
 */
async function refillBuffer() {
  const count = await getPendingChallengeCount();
  const slotsNeeded = BUFFER_TARGET - count;
  console.log(
    `[Buffer] Current pending: ${count}, target: ${BUFFER_TARGET}, slots needed: ${slotsNeeded}`,
  );

  if (slotsNeeded <= 0) {
    console.log("[Buffer] Buffer is healthy, skipping refill.");
    return { accepted: 0, ceilingRejected: 0, skipped: 0 };
  }

  const recent = await getRecentChallengesForFilter(50);
  console.log(
    `[Buffer] Soft filter: ${recent.length} recent challenges loaded.`,
  );

  let candidates;
  try {
    candidates = await generateChallengeBatch(recent);
    console.log(`[Buffer] LLM generated ${candidates.length} candidates.`);
  } catch (err) {
    console.error("[Buffer] LLM batch generation failed:", err.message);
    return { accepted: 0, ceilingRejected: 0, skipped: 0 };
  }

  // --- Score all candidates ---
  const scored = [];
  let embedFailures = 0;

  for (const candidate of candidates) {
    try {
      const text = challengeToText(candidate.topic, candidate.focus);
      const embedding = await generateEmbedding(text);
      const similarity = await scoreCandidate(
        candidate.topic,
        candidate.focus,
        embedding,
      );
      scored.push({ ...candidate, embedding, similarity });
    } catch (err) {
      console.warn(
        `[Buffer] Embed failed for "${candidate.topic} | ${candidate.focus}": ${err.message}`,
      );
      embedFailures++;
    }
  }

  console.log(
    `[Buffer] Scored ${scored.length} candidates (${embedFailures} embed failures).`,
  );

  // --- Sanity ceiling: reject near-exact duplicates ---
  const ceilingRejected = scored.filter((c) => c.similarity >= SANITY_CEILING);
  const viable = scored.filter((c) => c.similarity < SANITY_CEILING);

  if (ceilingRejected.length > 0) {
    console.log(
      `[Buffer] Ceiling-rejected: ${ceilingRejected.length} (>= ${SANITY_CEILING.toFixed(3)})`,
    );
    for (const c of ceilingRejected) {
      console.log(
        `[Buffer]   ✗ "${c.topic} | ${c.focus}" (${c.similarity.toFixed(3)})`,
      );
    }
  }

  if (viable.length === 0) {
    console.log("[Buffer] No viable candidates after ceiling filter.");
    return { accepted: 0, ceilingRejected: ceilingRejected.length, skipped: 0 };
  }

  // --- Sort by novelty (lowest similarity first) and slice ---
  viable.sort((a, b) => a.similarity - b.similarity);
  const toAccept = viable.slice(0, slotsNeeded);
  const skipped = viable.length - toAccept.length;

  console.log(
    `[Buffer] Sorted ${viable.length} by novelty. Similarity range: ${viable[0].similarity.toFixed(3)} – ${viable[viable.length - 1].similarity.toFixed(3)}`,
  );
  console.log(
    `[Buffer] Accepting top ${toAccept.length} to fill buffer (target: ${BUFFER_TARGET}).`,
  );

  // --- Insert winners ---
  for (const c of toAccept) {
    await insertPendingChallenge(c.topic, c.focus, toVectorString(c.embedding));
    console.log(
      `[Buffer]   ✓ "${c.topic} | ${c.focus}" (${c.similarity.toFixed(3)})`,
    );
  }

  console.log(
    `[Buffer] Refill complete: ${toAccept.length} accepted, ${ceilingRejected.length} ceiling-rejected, ${skipped} skipped (over target). New total: ${count + toAccept.length}`,
  );
  return {
    accepted: toAccept.length,
    ceilingRejected: ceilingRejected.length,
    skipped,
  };
}

/**
 * Guarded refill trigger — prevents concurrent refills.
 */
export async function maybeRefillBuffer() {
  if (isRefilling) return;
  isRefilling = true;
  try {
    const count = await getPendingChallengeCount();
    if (count < BUFFER_MIN) {
      console.log(
        `[Buffer] Buffer low (${count}/${BUFFER_MIN}), triggering refill...`,
      );
      await refillBuffer();
    }
  } catch (err) {
    console.error("[Buffer] Refill check failed:", err.message);
  } finally {
    isRefilling = false;
  }
}

/**
 * Backfill embeddings for existing challenges that lack them.
 * Runs once on startup so historical challenges participate in similarity search.
 */
export async function backfillEmbeddings() {
  try {
    const rows = await getChallengesWithoutEmbedding();
    if (rows.length === 0) {
      console.log("[Buffer] All existing challenges have embeddings.");
      return;
    }
    console.log(
      `[Buffer] Backfilling embeddings for ${rows.length} existing challenges...`,
    );
    let success = 0;
    for (const row of rows) {
      try {
        const text = challengeToText(row.topic, row.focus);
        const embedding = await generateEmbedding(text);
        await updateChallengeEmbedding(
          row.challenge_id,
          toVectorString(embedding),
        );
        success++;
      } catch (err) {
        console.warn(
          `[Buffer] Failed to embed challenge ${row.challenge_id}:`,
          err.message,
        );
      }
    }
    console.log(
      `[Buffer] Backfill complete: ${success}/${rows.length} embedded.`,
    );
  } catch (err) {
    console.error("[Buffer] Backfill failed:", err.message);
  }
}

/**
 * Start periodic buffer monitoring (safety net).
 */
export function startBufferMonitor() {
  console.log(
    `[Buffer] Monitor started (interval: ${REFILL_INTERVAL_MS / 3600000}h, min: ${BUFFER_MIN}, target: ${BUFFER_TARGET}, ceiling: ${SANITY_CEILING})`,
  );
  console.log(
    `[Buffer] Reranker: ${RERANKER_URL} (${RERANKER_ENABLED ? "enabled" : "disabled"})`,
  );
  setInterval(() => maybeRefillBuffer(), REFILL_INTERVAL_MS);
}
