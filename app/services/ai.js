/**
 * services/ai.js — Generative AI service layer.
 *
 * Wraps Google Gemini and MiniMax API interactions: daily challenge
 * generation, pun scoring (daily + gauntlet), backwords judging, and
 * clue generation. Has zero Express dependencies so prompts and model
 * configs can be tested independently of the HTTP layer.
 */
import { GoogleGenAI, Type } from "@google/genai";
import {
  getGlobalChallengeForDate,
  saveGlobalChallenge,
  getPastGlobalChallengeTopics,
  popOldestPendingChallenge,
  getAppSetting,
} from "../db/database.js";
import {
  getActiveBackwordsJudgeDefinition,
  getActiveClueGeneratorJudgeDefinition,
  getActivePunJudgeDefinition,
  getBackupPunJudgeDefinition,
  getJudgeSnapshot,
  loadJudgeOverrides,
} from "../lib/aiJudges.js";
import { generateEmbedding, cosineSimilarity } from "./embeddings.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DEFAULT_MODEL = "gemini-3.5-flash";
const MINIMAX_BASE_URL = "https://api.minimax.io/v1";

// ── MiniMax HTTP helper ─────────────────────────────────────────────────────

/**
 * Call the MiniMax OpenAI-compatible chat completions endpoint.
 * Returns { content, thinking } where:
 *   - content: the clean assistant response (JSON string or plain text)
 *   - thinking: the model's chain-of-thought (from <think> tags), or null
 *
 * MiniMax M3 has thinking enabled by default and emits chain-of-thought inside
 * <think>...</think> tags in `content`. We extract and strip those tags so JSON
 * parsing works correctly, and return the thinking separately so callers can
 * surface it in the UI.
 */
async function callMiniMax(model, messages, { temperature = 0.7, jsonMode = false } = {}) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY is not set");

  const body = {
    model,
    messages,
    temperature,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    const err = new Error(`MiniMax API error ${response.status}: ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";

  // Extract <think>…</think> block (may or may not be present depending on model).
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
  const thinking = thinkMatch ? thinkMatch[1].trim() : null;
  const content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  return { content, thinking };
}

function stripMarkdownCodeFences(text) {
  const trimmed = String(text ?? "").trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

function parseJsonObjectFromModelContent(content) {
  const normalized = stripMarkdownCodeFences(content);

  try {
    return JSON.parse(normalized);
  } catch (_err) {
    // Some models prepend prose and then include one JSON object.
    const firstBrace = normalized.indexOf("{");
    const lastBrace = normalized.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = normalized.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw _err;
  }
}

function formatJudgeFailureReason(error) {
  const status = error?.status ?? error?.code ?? error?.error?.code ?? null;
  const message = String(error?.message ?? error ?? "Unknown error").trim();
  const compact = message.length > 500 ? `${message.slice(0, 500)}...` : message;
  return status ? `Judge request failed (${status}): ${compact}` : `Judge request failed: ${compact}`;
}

function formatThinkingForUi(thinking) {
  const raw = String(thinking ?? "").trim();
  if (!raw) return null;

  // Remove any accidental XML-like tags and collapse excessive blank lines.
  const cleaned = raw
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const MAX_UI_CHARS = 1800;
  if (cleaned.length <= MAX_UI_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_UI_CHARS)}\n\n...[thinking truncated]`;
}

// ── Judge override initialisation ─────────────────────────────────────────

let _judgeOverridesLoaded = false;

/**
 * Load persisted judge overrides from DB. Safe to call multiple times;
 * subsequent calls are no-ops after the first successful load.
 */
export async function initJudgeOverrides() {
  if (_judgeOverridesLoaded) return;
  try {
    await loadJudgeOverrides(getAppSetting);
    _judgeOverridesLoaded = true;
  } catch (err) {
    console.error("[AI] Failed to load judge overrides from DB:", err);
  }
}

const PUN_SCORE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description:
        "Internal logic. Evaluate the pun based on: 1) Mechanics/Phonetics, 2) Relevance to Topic/Focus, 3) Originality. Calculate a strict, objective score based on the rubric before finalising.",
    },
    score: {
      type: Type.INTEGER,
      description:
        "The final integer score between 0 and 10 based on the rubric.",
    },
    feedback: {
      type: Type.STRING,
      description:
        "1-2 sentences max. Speak directly to the player using EN-AU spelling. Tone matching: 1-4 gets an elegant roast; 5-6 gets a weary groan; 7-8 gets a nod of approval; 9-10 gets understated respect.",
    },
  },
  required: ["reasoning", "score", "feedback"],
};

const BACKWORDS_GUESS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description:
        "Internal logic. Compare both possible mappings between Guess A / Guess B and the hidden Topic / Focus before deciding.",
    },
    matched: {
      type: Type.BOOLEAN,
      description:
        "True only if both hidden targets are semantically matched by the submitted guesses.",
    },
    overallSimilarity: {
      type: Type.INTEGER,
      description:
        "An integer from 0 to 100 representing the overall quality of the best order-independent mapping.",
    },
    topicSimilarity: {
      type: Type.INTEGER,
      description:
        "An integer from 0 to 100 for how closely the mapped guess matches the hidden Topic.",
    },
    focusSimilarity: {
      type: Type.INTEGER,
      description:
        "An integer from 0 to 100 for how closely the mapped guess matches the hidden Focus.",
    },
    topicGuessSlot: {
      type: Type.STRING,
      description:
        "Which submitted concept best maps to the Topic: either 'guessA' or 'guessB'.",
    },
    focusGuessSlot: {
      type: Type.STRING,
      description:
        "Which submitted concept best maps to the Focus: either 'guessA' or 'guessB'.",
    },
    feedback: {
      type: Type.STRING,
      description:
        "One or two sentences for the player explaining how close the guess was without revealing the hidden answer.",
    },
  },
  required: [
    "reasoning",
    "matched",
    "overallSimilarity",
    "topicSimilarity",
    "focusSimilarity",
    "topicGuessSlot",
    "focusGuessSlot",
    "feedback",
  ],
};

function normalizeConceptText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeConcept(value) {
  return normalizeConceptText(value).split(" ").filter(Boolean);
}

function clampPercentage(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function scoreFallbackSimilarity(guess, target) {
  const normalizedGuess = normalizeConceptText(guess);
  const normalizedTarget = normalizeConceptText(target);

  if (!normalizedGuess || !normalizedTarget) return 0;
  if (normalizedGuess === normalizedTarget) return 100;
  if (
    normalizedGuess.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedGuess)
  ) {
    return 85;
  }

  const guessTokens = new Set(tokenizeConcept(guess));
  const targetTokens = new Set(tokenizeConcept(target));
  const overlap = [...guessTokens].filter((token) => targetTokens.has(token));
  const union = new Set([...guessTokens, ...targetTokens]);

  if (union.size === 0) return 0;
  return Math.round((overlap.length / union.size) * 100);
}

const BACKWORDS_EMBEDDING_MATCH_THRESHOLD = 65;

function pickBestMapping(topicA, focusB, topicB, focusA) {
  const optionAB = {
    topicGuessSlot: "guessA",
    focusGuessSlot: "guessB",
    topicSimilarity: topicA,
    focusSimilarity: focusB,
  };
  const optionBA = {
    topicGuessSlot: "guessB",
    focusGuessSlot: "guessA",
    topicSimilarity: topicB,
    focusSimilarity: focusA,
  };
  return optionAB.topicSimilarity + optionAB.focusSimilarity >=
    optionBA.topicSimilarity + optionBA.focusSimilarity
    ? optionAB
    : optionBA;
}

async function buildEmbeddingFallback(topic, focus, guessA, guessB, reasoning) {
  const [topicVec, focusVec, guessAVec, guessBVec] = await Promise.all([
    generateEmbedding(topic),
    generateEmbedding(focus),
    generateEmbedding(guessA),
    generateEmbedding(guessB),
  ]);

  const toPct = (cos) => Math.max(0, Math.min(100, Math.round(cos * 100)));
  const best = pickBestMapping(
    toPct(cosineSimilarity(guessAVec, topicVec)),
    toPct(cosineSimilarity(guessBVec, focusVec)),
    toPct(cosineSimilarity(guessBVec, topicVec)),
    toPct(cosineSimilarity(guessAVec, focusVec)),
  );
  const matched =
    best.topicSimilarity >= BACKWORDS_EMBEDDING_MATCH_THRESHOLD &&
    best.focusSimilarity >= BACKWORDS_EMBEDDING_MATCH_THRESHOLD;
  const overallSimilarity = Math.round(
    (best.topicSimilarity + best.focusSimilarity) / 2,
  );
  const feedback = matched
    ? "The primary judge was unavailable; a semantic similarity check recognised both concepts."
    : "The primary judge was unavailable; a semantic similarity check could not confirm both hidden concepts.";

  return {
    best,
    matched,
    overallSimilarity,
    feedback,
    reasoning: `${reasoning} Scored via local embedding fallback.`,
    mode: "embedding",
  };
}

function buildJaccardFallback(topic, focus, guessA, guessB, reasoning) {
  const best = pickBestMapping(
    scoreFallbackSimilarity(guessA, topic),
    scoreFallbackSimilarity(guessB, focus),
    scoreFallbackSimilarity(guessB, topic),
    scoreFallbackSimilarity(guessA, focus),
  );
  const matched = best.topicSimilarity === 100 && best.focusSimilarity === 100;
  const overallSimilarity = Math.round(
    (best.topicSimilarity + best.focusSimilarity) / 2,
  );
  const feedback = matched
    ? "Both the primary judge and the semantic fallback were unavailable, but the strict token check recognised both concepts as exact matches."
    : "Both the primary judge and the semantic fallback were unavailable, so a strict token-based check was used and it did not fully match both hidden concepts.";

  return {
    best,
    matched,
    overallSimilarity,
    feedback,
    reasoning: `${reasoning} Scored via token-Jaccard tertiary fallback.`,
    mode: "jaccard",
  };
}

export async function buildBackwordsGuessFallback(
  topic,
  focus,
  guessA,
  guessB,
  reasoning = "Semantic adjudication was unavailable.",
) {
  const judge = getActiveBackwordsJudgeDefinition();
  const judgeSnapshot = getJudgeSnapshot(judge);

  let result;
  try {
    result = await buildEmbeddingFallback(
      topic,
      focus,
      guessA,
      guessB,
      reasoning,
    );
  } catch (embedError) {
    console.error(
      "[Backwords] Embedding fallback failed, using Jaccard tertiary fallback",
      {
        errorName: embedError?.name,
        errorMessage: embedError?.message,
        topic,
        focus,
        guessA,
        guessB,
      },
    );
    result = buildJaccardFallback(topic, focus, guessA, guessB, reasoning);
  }

  return {
    reasoning: result.reasoning,
    matched: result.matched,
    overallSimilarity: result.overallSimilarity,
    topicSimilarity: result.best.topicSimilarity,
    focusSimilarity: result.best.focusSimilarity,
    topicGuessSlot: result.best.topicGuessSlot,
    focusGuessSlot: result.best.focusGuessSlot,
    feedback: result.feedback,
    ...judgeSnapshot,
    status: "completed",
    errorMessage: reasoning,
    fallbackMode: result.mode,
  };
}

export async function generateDailyChallenge(pastChallenges = []) {
  const avoidClause =
    pastChallenges.length > 0
      ? `\n\n    AVOID repeating these past combinations:\n${pastChallenges
          .slice(0, 20)
          .map((c) => `    - Topic: "${c.topic}", Focus: "${c.focus}"`)
          .join("\n")}`
      : "";
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Generate a unique 'Topic' and 'Focus' for a pun-making game inspired by Punderdome.

    RULES:
    1. Topic and Focus MUST be completely unrelated — no logical connection.
    2. Topic: a broad everyday or cultural category. Do NOT use academic disciplines ending in -ology or -ics. Good examples: "Cooking", "Carpentry", "Road Trips", "Weddings", "Tax Returns", "Gardening", "Space Exploration".
    3. Focus: a single common noun or short everyday object/item of 1–3 words. It must be something you could physically point to or hold. Do NOT use gerund phrases, activities, or multi-word situations. Good examples: "Bread", "A Flat Tyre", "Coffee", "Duct Tape", "A Staple Gun", "Sunscreen". Bad examples: ❌ "Assembling a trampoline in the dark" ❌ "Operating a commercial trawler".
    4. The goal is to force players to make creative puns connecting two completely different concepts.

    Return as JSON.${avoidClause}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          focus: { type: Type.STRING },
        },
        required: ["topic", "focus"],
      },
    },
  });
  return JSON.parse(response.text);
}

export async function getOrCreateGlobalChallenge(dateId) {
  let challenge = await getGlobalChallengeForDate(dateId);
  if (challenge) return challenge;

  // Try the pre-approved buffer first (instant, no LLM call)
  const buffered = await popOldestPendingChallenge();
  if (buffered) {
    await saveGlobalChallenge(
      dateId,
      buffered.topic,
      buffered.focus,
      buffered.embedding,
    );
    challenge = { topic: buffered.topic, focus: buffered.focus };
    console.log(
      `[Daily] Served from buffer: "${buffered.topic} | ${buffered.focus}"`,
    );
  } else {
    // Buffer empty — fall back to live Gemini generation
    console.warn(
      "[Daily] Buffer empty, falling back to live Gemini generation.",
    );
    const past = await getPastGlobalChallengeTopics();
    challenge = await generateDailyChallenge(past);
    await saveGlobalChallenge(dateId, challenge.topic, challenge.focus);
  }

  return challenge;
}

export async function generateChallengeBatch(recentChallenges = []) {
  const avoidClause =
    recentChallenges.length > 0
      ? `\n\nSTRICTLY AVOID repeating or closely resembling these recent combinations:\n${recentChallenges
          .map((c) => `- Topic: "${c.topic}", Focus: "${c.focus}"`)
          .join("\n")}`
      : "";

  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Generate 20 completely unique 'Topic' and 'Focus' pairs for a pun-making game inspired by Punderdome.

    RULES:
    1. Each Topic and Focus MUST be completely unrelated — no logical connection between them.
    2. All 20 Topics must be different from each other. All 20 Focuses must be different from each other.
    3. Topic: a broad everyday or cultural category. Do NOT use academic disciplines ending in -ology or -ics. Aim for maximum variety: e.g., "Cooking", "Carpentry", "Road Trips", "Weddings", "Tax Returns", "Gardening", "Space Exploration", "Dog Training", "Fashion", "Banking".
    4. Focus: a single common noun or short everyday object/item of 1–3 words. It must be something tangible — something you could physically point to or hold. Do NOT use gerund phrases, activities, or multi-word situational descriptions. Good examples: "Bread", "A Flat Tyre", "Coffee", "Duct Tape", "A Staple Gun", "Sunscreen", "A Parking Ticket", "Bubble Wrap", "An Umbrella". Bad examples: ❌ "Assembling a trampoline in the dark" ❌ "A high-stakes televised cooking competition" ❌ "Operating a commercial deep-sea trawler".
    5. Aim for MAXIMUM diversity in both dimensions.

    Return as JSON with a 'challenges' array of exactly 20 objects.${avoidClause}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          challenges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                focus: { type: Type.STRING },
              },
              required: ["topic", "focus"],
            },
          },
        },
        required: ["challenges"],
      },
    },
  });
  return JSON.parse(response.text).challenges;
}

// Detects Gemini free-tier daily-quota exhaustion (HTTP 429 / RESOURCE_EXHAUSTED).
function isQuotaError(error) {
  const status = error?.status ?? error?.code ?? error?.error?.code;
  if (status === 429) return true;
  const message = `${error?.message ?? ""} ${error?.error?.status ?? ""}`;
  return /RESOURCE_EXHAUSTED|too many requests|quota|\b429\b/i.test(message);
}

async function runPunJudge(judge, topic, focus, punText) {
  if (judge.provider === "minimax") {
    const { content, thinking } = await callMiniMax(
      judge.model,
      [
        { role: "system", content: judge.systemPrompt },
        {
          role: "user",
          content: `Evaluate the following submission. Respond with a JSON object containing exactly three fields: "reasoning" (string), "score" (integer 0-10), and "feedback" (1-2 sentences).

[TOPIC]: ${topic}
[FOCUS]: ${focus}
[USER_PUN]: """${punText}"""`,
        },
      ],
      { temperature: judge.config.temperature ?? 0.4, jsonMode: true },
    );
    const parsed = parseJsonObjectFromModelContent(content);
    // Prepend thinking (chain-of-thought) to the model's own reasoning field.
    const uiThinking = formatThinkingForUi(thinking);
    if (uiThinking) {
      parsed.reasoning = `[Thinking]\n${uiThinking}\n\n[Reasoning]\n${parsed.reasoning ?? ""}`;
    }
    return {
      ...parsed,
      ...getJudgeSnapshot(judge),
    };
  }

  const response = await ai.models.generateContent({
    model: judge.model,
    systemInstruction: judge.systemPrompt,

    contents: `Evaluate the following submission:

      [TOPIC]: ${topic}
      [FOCUS]: ${focus}
      [USER_PUN]: """${punText}"""`,

    config: {
      thinkingConfig: {
        thinkingLevel: judge.config.thinkingLevel,
      },
      responseMimeType: "application/json",
      responseSchema: PUN_SCORE_RESPONSE_SCHEMA,
    },
  });

  return {
    ...JSON.parse(response.text),
    ...getJudgeSnapshot(judge),
  };
}

function buildScoreFiveFallback(judge, error) {
  return buildPunScoreFallback({
    judge,
    reasoning: formatJudgeFailureReason(error ?? new Error("API failure or timeout.")),
    feedback:
      "My analytical faculties have collapsed into a regrettable heap, so I shall record a perfectly neutral 5 and proceed with dignity.",
    failed: true,
  });
}

export function buildPunScoreFallback({
  judge = getActivePunJudgeDefinition(),
  feedback =
    "My analytical faculties have collapsed into a regrettable heap, so I shall record a perfectly neutral 5 and proceed with dignity.",
  reasoning = "Pun scoring infrastructure fallback applied.",
  // When true, the judgement is recorded as "failed" so the score-5 placeholder
  // is distinguishable from a genuine 5 and can be retried later. See lib/punRetry.js.
  failed = false,
} = {}) {
  return {
    score: 5,
    feedback,
    reasoning,
    ...getJudgeSnapshot(judge),
    status: failed ? "failed" : "completed",
    errorMessage: reasoning,
  };
}

export async function scorePunText(topic, focus, punText) {
  const judge = getActivePunJudgeDefinition();

  try {
    return await runPunJudge(judge, topic, focus, punText);
  } catch (error) {
    // On daily-quota exhaustion, retry with the dedicated backup judge (lite model).
    if (isQuotaError(error)) {
      const backupJudge = getBackupPunJudgeDefinition();
      console.warn(
        `[AI] Pun judge "${judge.key}" hit its quota; falling back to backup judge "${backupJudge.key}" (${backupJudge.model}).`,
      );
      try {
        return await runPunJudge(backupJudge, topic, focus, punText);
      } catch (backupError) {
        console.error(
          "AI Judging failed (backup judge also failed):",
          backupError,
        );
        return buildScoreFiveFallback(judge, backupError);
      }
    }

    console.error("AI Judging failed:", error);
    return buildScoreFiveFallback(judge, error);
  }
}

export async function generateGauntletPrompts(pastChallenges = []) {
  const avoidClause =
    pastChallenges.length > 0
      ? `\n\n    AVOID repeating these past combinations:\n${pastChallenges
          .slice(0, 25)
          .map((c) => `    - Topic: "${c.topic}", Focus: "${c.focus}"`)
          .join("\n")}`
      : "";
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Generate 5 completely unique 'Topic' and 'Focus' pairs for a rapid-fire pun-making game.

    RULES:
    1. All 5 pairs must be completely unrelated — no logical connections between Topic and Focus.
    2. All 5 Topics must be different from each other. All 5 Focuses must be different from each other.
    3. Topic: a broad everyday or cultural category. Do NOT use academic disciplines ending in -ology or -ics. Good examples: "Cooking", "Weddings", "Surfing", "Tax Returns", "Carpentry".
    4. Focus: a single common noun or short everyday object/item of 1–3 words. Tangible — something you could physically point to. Do NOT use gerund phrases or multi-word situations. Good examples: "Duct Tape", "A Flat Tyre", "Sunscreen", "Bubble Wrap", "A Staple Gun". Bad examples: ❌ "A high-stakes cooking competition" ❌ "Assembling furniture in the dark".

    Use Australian English spelling throughout. Return as JSON with a 'rounds' array of exactly 5 objects.${avoidClause}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          rounds: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                focus: { type: Type.STRING },
              },
              required: ["topic", "focus"],
            },
          },
        },
        required: ["rounds"],
      },
    },
  });
  return JSON.parse(response.text);
}

export async function generateBackwordsAssignment(pastChallenges = []) {
  const avoidClause =
    pastChallenges.length > 0
      ? `\n\n    AVOID repeating these past combinations:\n${pastChallenges
          .slice(0, 20)
          .map((c) => `    - Topic: "${c.topic}", Focus: "${c.focus}"`)
          .join("\n")}`
      : "";
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Generate one hidden Topic and one hidden Focus for a reverse-engineering pun game called Backwords.

    RULES:
    1. Topic and Focus must be clearly distinct concepts with no logical connection.
    2. Topic: a broad everyday or cultural category (not an -ology or -ics discipline). E.g., "Cooking", "Carpentry", "Banking", "Fashion".
    3. Focus: a single common noun or short everyday object of 1–3 words — tangible, not a gerund phrase or situation. E.g., "A Sticky Note", "Bubble Wrap", "A Traffic Cone".
    4. The pair should be fertile enough that a clever player could write three clue-puns bridging both concepts.
    5. Use Australian English spelling.

    Return as JSON with keys 'topic' and 'focus'.${avoidClause}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          focus: { type: Type.STRING },
        },
        required: ["topic", "focus"],
      },
    },
  });

  return JSON.parse(response.text);
}

function normalizeClueText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExpToken(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTargetLeak(clueText, targets) {
  const normalizedClue = normalizeClueText(clueText);
  if (!normalizedClue) return false;

  for (const target of targets) {
    const normalizedTarget = normalizeClueText(target);
    if (!normalizedTarget) continue;
    if (normalizedClue.includes(normalizedTarget)) return true;

    const tokens = normalizedTarget.split(" ").filter((t) => t.length > 3);
    for (const token of tokens) {
      const pattern = new RegExp(`\\b${escapeRegExpToken(token)}\\b`, "i");
      if (pattern.test(normalizedClue)) return true;
    }
  }

  return false;
}

async function runClueGeneration(topic, focus, humanClues, count) {
  const judge = getActiveClueGeneratorJudgeDefinition();
  const humanBlock = humanClues.length
    ? humanClues.map((clue, i) => `${i + 1}. ${clue}`).join("\n")
    : "(none)";

  if (judge.provider === "minimax") {
    const { content } = await callMiniMax(
      judge.model,
      [
        { role: "system", content: judge.systemPrompt },
        {
          role: "user",
          content: `Generate exactly ${count} additional pun clues for this Backwords puzzle. Respond with a JSON object with a single field "puns" containing an array of exactly ${count} strings.

[TOPIC]: ${topic}
[FOCUS]: ${focus}
[EXISTING_HUMAN_PUNS]:
${humanBlock}`,
        },
      ],
      { temperature: judge.config.temperature ?? 0.9, jsonMode: true },
    );
    const parsed = parseJsonObjectFromModelContent(content);
    return Array.isArray(parsed.puns) ? parsed.puns : [];
  }

  const response = await ai.models.generateContent({
    model: judge.model,
    systemInstruction: judge.systemPrompt,
    contents: `Generate exactly ${count} additional pun clues for this Backwords puzzle.

    [TOPIC]: ${topic}
    [FOCUS]: ${focus}
    [EXISTING_HUMAN_PUNS]:
    ${humanBlock}`,
    config: {
      thinkingConfig: {
        thinkingLevel: judge.config.thinkingLevel,
      },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          puns: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["puns"],
      },
    },
  });

  const parsed = JSON.parse(response.text);
  return Array.isArray(parsed.puns) ? parsed.puns : [];
}

export async function generateClueCandidates(topic, focus, humanClues, count) {
  if (count <= 0) return [];

  const targets = [topic, focus];
  const humanNormalized = new Set(
    humanClues.map((clue) => normalizeClueText(clue)).filter(Boolean),
  );

  const filterCandidates = (raw) => {
    const out = [];
    const seen = new Set(humanNormalized);
    for (const item of raw) {
      const text = typeof item === "string" ? item.trim() : "";
      if (!text || text.length > 500) continue;
      const normalized = normalizeClueText(text);
      if (!normalized || seen.has(normalized)) continue;
      if (containsTargetLeak(text, targets)) continue;
      seen.add(normalized);
      out.push(text);
      if (out.length === count) break;
    }
    return out;
  };

  try {
    const firstPass = await runClueGeneration(topic, focus, humanClues, count);
    let filtered = filterCandidates(firstPass);
    if (filtered.length < count) {
      const needed = count - filtered.length;
      const secondPass = await runClueGeneration(
        topic,
        focus,
        [...humanClues, ...filtered],
        needed,
      );
      filtered = [...filtered, ...filterCandidates(secondPass)].slice(0, count);
    }
    return filtered;
  } catch (error) {
    console.error("Clue generation failed:", error);
    return [];
  }
}

const BACKWORDS_RETRY_DELAYS_MS = [400, 1200];

const BACKWORDS_JSON_INSTRUCTION = `Respond with a JSON object containing exactly these fields: "reasoning" (string), "matched" (boolean), "overallSimilarity" (integer 0-100), "topicSimilarity" (integer 0-100), "focusSimilarity" (integer 0-100), "topicGuessSlot" ("guessA" or "guessB"), "focusGuessSlot" ("guessA" or "guessB"), "feedback" (string).`;

export async function judgeBackwordsGuess(topic, focus, guessA, guessB) {
  const judge = getActiveBackwordsJudgeDefinition();
  const judgeSnapshot = getJudgeSnapshot(judge);
  const attempts = BACKWORDS_RETRY_DELAYS_MS.length + 1;
  let lastError = null;
  let lastRawResponse = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      let parsed;

      if (judge.provider === "minimax") {
        const { content, thinking } = await callMiniMax(
          judge.model,
          [
            { role: "system", content: judge.systemPrompt },
            {
              role: "user",
              content: `Evaluate the following Backwords guess. ${BACKWORDS_JSON_INSTRUCTION}\n\n[TOPIC]: ${topic}\n[FOCUS]: ${focus}\n[GUESS_A]: """${guessA}"""\n[GUESS_B]: """${guessB}"""`,
            },
          ],
          { temperature: judge.config.temperature ?? 0.1, jsonMode: true },
        );
        lastRawResponse = content;
        parsed = parseJsonObjectFromModelContent(content);
        const uiThinking = formatThinkingForUi(thinking);
        if (uiThinking) {
          parsed.reasoning = `[Thinking]\n${uiThinking}\n\n[Reasoning]\n${parsed.reasoning ?? ""}`;
        }
      } else {
        const response = await ai.models.generateContent({
          model: judge.model,
          systemInstruction: judge.systemPrompt,
          contents: `Evaluate the following Backwords guess.

      [TOPIC]: ${topic}
      [FOCUS]: ${focus}
      [GUESS_A]: """${guessA}"""
      [GUESS_B]: """${guessB}"""`,
          config: {
            thinkingConfig: {
              thinkingLevel: judge.config.thinkingLevel,
            },
            responseMimeType: "application/json",
            responseSchema: BACKWORDS_GUESS_RESPONSE_SCHEMA,
          },
        });
        lastRawResponse = response?.text ?? null;
        parsed = JSON.parse(lastRawResponse);
      }

      return {
        reasoning: parsed.reasoning,
        matched: Boolean(parsed.matched),
        overallSimilarity: clampPercentage(parsed.overallSimilarity),
        topicSimilarity: clampPercentage(parsed.topicSimilarity),
        focusSimilarity: clampPercentage(parsed.focusSimilarity),
        topicGuessSlot: parsed.topicGuessSlot === "guessB" ? "guessB" : "guessA",
        focusGuessSlot: parsed.focusGuessSlot === "guessA" ? "guessA" : "guessB",
        feedback: parsed.feedback,
        ...judgeSnapshot,
      };
    } catch (error) {
      lastError = error;
      const delayMs = BACKWORDS_RETRY_DELAYS_MS[attempt];
      if (delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error("[Backwords] judgeBackwordsGuess failed after retries", {
    errorName: lastError?.name,
    errorMessage: lastError?.message,
    errorStatus: lastError?.status ?? lastError?.code ?? null,
    errorStack: lastError?.stack,
    rawResponse: lastRawResponse,
    attempts,
    input: { topic, focus, guessA, guessB },
    judge: {
      key: judge.key,
      version: judge.version,
      model: judge.model,
      promptHash: judge.promptHash,
    },
  });

  return await buildBackwordsGuessFallback(
    topic,
    focus,
    guessA,
    guessB,
    "Backwords semantic adjudication failed due to an API error or timeout.",
  );
}
