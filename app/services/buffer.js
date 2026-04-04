/**
 * services/buffer.js — Batched buffer queue with two-stage semantic rejection.
 *
 * Maintains a pool of pre-approved challenges in `pending_challenges`.
 * Refills by generating candidates via Gemini, embedding them via Ollama,
 * and filtering duplicates using pgvector cosine similarity (Stage 1)
 * and optionally a cross-encoder reranker (Stage 2).
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

// --- Configuration ---
const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";
const RERANKER_URL = process.env.RERANKER_URL || "http://reranker:7997";
const SIMILARITY_THRESHOLD = parseFloat(
  process.env.SIMILARITY_THRESHOLD || "0.85",
);
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
 * Generate a 1024-dim embedding via Ollama (qwen3-embedding:0.6b).
 */
async function generateEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "qwen3-embedding:0.6b", input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama embedding failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.embeddings[0];
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
 * Evaluate a single candidate against the existing corpus.
 * Stage 1: cosine similarity via pgvector.
 * Stage 2 (optional): cross-encoder reranking for higher precision.
 */
async function evaluateCandidate(topic, focus, embedding) {
  const vecStr = toVectorString(embedding);
  const similar = await findSimilarChallenges(vecStr, 10);

  if (similar.length === 0) {
    return { approved: true, similarity: 0 };
  }

  let maxSimilarity;

  if (RERANKER_ENABLED) {
    try {
      const queryText = challengeToText(topic, focus);
      const documents = similar.map((s) => challengeToText(s.topic, s.focus));
      const reranked = await rerankCandidates(queryText, documents);
      maxSimilarity = Math.max(...reranked.map((r) => r.relevance_score));
    } catch (err) {
      console.warn(
        "[Buffer] Reranker unavailable, falling back to cosine similarity:",
        err.message,
      );
      maxSimilarity = 1 - similar[0].distance;
    }
  } else {
    maxSimilarity = 1 - similar[0].distance;
  }

  return {
    approved: maxSimilarity < SIMILARITY_THRESHOLD,
    similarity: maxSimilarity,
  };
}

/**
 * Core refill: generate candidates via Gemini, embed, filter, insert.
 */
async function refillBuffer() {
  const count = await getPendingChallengeCount();
  console.log(`[Buffer] Current pending: ${count}, target: ${BUFFER_TARGET}`);

  if (count >= BUFFER_TARGET) {
    console.log("[Buffer] Buffer is healthy, skipping refill.");
    return { approved: 0, rejected: 0 };
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
    return { approved: 0, rejected: 0 };
  }

  let approved = 0;
  let rejected = 0;

  for (const candidate of candidates) {
    try {
      const text = challengeToText(candidate.topic, candidate.focus);
      const embedding = await generateEmbedding(text);
      const result = await evaluateCandidate(
        candidate.topic,
        candidate.focus,
        embedding,
      );

      if (result.approved) {
        await insertPendingChallenge(
          candidate.topic,
          candidate.focus,
          toVectorString(embedding),
        );
        console.log(
          `[Buffer] APPROVED "${candidate.topic} | ${candidate.focus}" (similarity: ${result.similarity.toFixed(3)})`,
        );
        approved++;
      } else {
        console.log(
          `[Buffer] REJECTED "${candidate.topic} | ${candidate.focus}" (similarity: ${result.similarity.toFixed(3)})`,
        );
        rejected++;
      }
    } catch (err) {
      console.error(
        `[Buffer] Error processing "${candidate.topic} | ${candidate.focus}":`,
        err.message,
      );
      rejected++;
    }
  }

  console.log(
    `[Buffer] Refill complete: ${approved} approved, ${rejected} rejected. New total: ${count + approved}`,
  );
  return { approved, rejected };
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
    `[Buffer] Monitor started (interval: ${REFILL_INTERVAL_MS / 3600000}h, min: ${BUFFER_MIN}, target: ${BUFFER_TARGET}, threshold: ${SIMILARITY_THRESHOLD})`,
  );
  console.log(
    `[Buffer] Ollama: ${OLLAMA_URL}, Reranker: ${RERANKER_URL} (${RERANKER_ENABLED ? "enabled" : "disabled"})`,
  );
  setInterval(() => maybeRefillBuffer(), REFILL_INTERVAL_MS);
}
