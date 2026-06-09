/**
 * services/hub.js — Score submission to the Loom & Skullcap hub.
 *
 * Mirrors the hub's canonical_payload + verify pair exactly:
 *   backend/app/services/hmac_sig.py — JSON encoded with sorted keys and no
 *   whitespace, signed HMAC-SHA256, hex-encoded.
 *
 * Wire field is `game_id` (the hub kept this name when the table was
 * renamed from `games` to `apps` so existing signatures keep verifying).
 *
 * Submission is fire-and-forget. Failures log but do not bubble up — a
 * dropped hub score should never block the user's local pun submission
 * flow.
 */
import {
  signLegacyScorePayload,
  signSessionScorePayload,
  submitScoreToHub as submitScoreToHubBase,
} from "@cotlone/loom-hub-client";

export function signScore(payload, apiSecret) {
  return signLegacyScorePayload(payload, apiSecret);
}

export function signSessionScore(payload, apiSecret) {
  return signSessionScorePayload(payload, apiSecret);
}

export async function submitScoreToHub({
  hubSessionToken,
  hubUserId,
  aiScore,
  responseTimeMs,
  isDaily,
  playedAt,
}) {
  return submitScoreToHubBase({
    hubSessionToken,
    hubUserId,
    metricPrimary: Number(aiScore) * 10,
    metricSecondary: responseTimeMs,
    isDaily,
    playedAt,
  });
}
