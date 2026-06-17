/**
 * lib/punRetry.js — Cooldown policy for re-scoring puns whose AI judging failed.
 *
 * When the judge falls over, the pun is recorded with a placeholder score and a
 * `failed` judgement (see services/ai.js — buildPunScoreFallback). Any user may
 * trigger a re-score, but to avoid hammering a quota-exhausted model the wait
 * between attempts escalates with each consecutive failure since the last
 * successful score: 5m → 15m → 30m → 60m, then held at 60m.
 *
 * Pure functions, no DB/Express deps, so the policy can be unit-tested and shared
 * between the route (enforcement) and any future surface.
 */

// Escalating backoff in minutes, indexed by how many times scoring has already
// failed. The last entry is the ceiling for all further attempts.
const RETRY_BACKOFF_MINUTES = [5, 15, 30, 60];

const MINUTE_MS = 60 * 1000;

/**
 * How long to wait after the Nth consecutive failure before the next retry.
 * @param {number} failureCount - consecutive failed scorings since last success (>= 1).
 * @returns {number} cooldown in milliseconds.
 */
export function getRetryCooldownMs(failureCount) {
  if (!Number.isFinite(failureCount) || failureCount < 1) {
    return RETRY_BACKOFF_MINUTES[0] * MINUTE_MS;
  }
  const index = Math.min(
    Math.floor(failureCount) - 1,
    RETRY_BACKOFF_MINUTES.length - 1,
  );
  return RETRY_BACKOFF_MINUTES[index] * MINUTE_MS;
}

/**
 * Resolve whether a failed pun may be re-scored right now.
 *
 * @param {object} state
 * @param {number} state.failureCount - consecutive failed scorings since last success.
 * @param {Date|string|number|null} state.lastFailedAt - timestamp of the most recent failed attempt.
 * @param {Date|number} [now] - current time (injectable for tests).
 * @returns {{ eligible: boolean, cooldownMs: number, nextRetryAt: string|null, retryAfterMs: number }}
 */
export function getRetryEligibility({ failureCount, lastFailedAt }, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const cooldownMs = getRetryCooldownMs(failureCount);

  const lastMs = lastFailedAt ? new Date(lastFailedAt).getTime() : NaN;
  if (!Number.isFinite(lastMs)) {
    // No recorded failure time — allow immediately.
    return { eligible: true, cooldownMs, nextRetryAt: null, retryAfterMs: 0 };
  }

  const nextMs = lastMs + cooldownMs;
  const retryAfterMs = Math.max(0, nextMs - nowMs);
  return {
    eligible: retryAfterMs === 0,
    cooldownMs,
    nextRetryAt: new Date(nextMs).toISOString(),
    retryAfterMs,
  };
}

export const PUN_RETRY_BACKOFF_MINUTES = RETRY_BACKOFF_MINUTES;
