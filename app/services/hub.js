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
import { createHmac } from "node:crypto";

function canonicalPayload({
  user_id,
  game_id,
  metric_primary,
  metric_secondary,
  is_daily,
  timestamp_utc,
}) {
  const ordered = {
    game_id,
    is_daily,
    metric_primary,
    metric_secondary,
    timestamp_utc,
    user_id,
  };
  return JSON.stringify(ordered);
}

export function signScore(payload, apiSecret) {
  const canonical = canonicalPayload(payload);
  return createHmac("sha256", apiSecret).update(canonical).digest("hex");
}

function clampInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export async function submitScoreToHub({
  hubUserId,
  aiScore,
  responseTimeMs,
  isDaily,
  playedAt,
}) {
  const hubUrl = process.env.HUB_URL;
  const gameId = process.env.HUB_GAME_ID;
  const apiSecret = process.env.HUB_API_SECRET;
  if (!hubUrl || !gameId || !apiSecret) {
    console.warn(
      "[hub.submitScore] HUB_URL/HUB_GAME_ID/HUB_API_SECRET missing; skipping",
    );
    return null;
  }
  if (!hubUserId) {
    console.warn(
      "[hub.submitScore] author has no hub_user_id; skipping (link on next login)",
    );
    return null;
  }
  if (aiScore === null || aiScore === undefined) {
    return null;
  }

  // Truncate to whole seconds: the hub re-canonicalises via Python
  // `datetime.isoformat()` which uses microsecond precision, while JS Date
  // only has millisecond precision. Whole-second strings round-trip
  // identically through Pydantic parse → isoformat → replace("+00:00", "Z").
  const playedDate =
    playedAt instanceof Date ? playedAt : new Date(playedAt ?? Date.now());
  const timestampUtc = playedDate.toISOString().replace(/\.\d{3}Z$/, "Z");

  const payload = {
    user_id: String(hubUserId),
    game_id: String(gameId),
    metric_primary: clampInt(Number(aiScore) * 100),
    metric_secondary: clampInt(responseTimeMs),
    is_daily: !!isDaily,
    timestamp_utc: timestampUtc,
  };
  const signature = signScore(payload, apiSecret);
  const body = { ...payload, signature };

  try {
    const res = await fetch(`${hubUrl}/api/v1/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[hub.submitScore] ${res.status} ${res.statusText}: ${text}`,
      );
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[hub.submitScore] request failed:", err.message);
    return null;
  }
}
