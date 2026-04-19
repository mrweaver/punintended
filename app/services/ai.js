/**
 * services/ai.js — Generative AI service layer.
 *
 * Wraps all Google Gemini API interactions: daily challenge generation,
 * pun scoring (used by both daily and gauntlet modes), and gauntlet
 * prompt generation. Has zero Express dependencies so prompts and model
 * configs can be tested independently of the HTTP layer.
 */
import { GoogleGenAI, Type } from "@google/genai";
import {
  getGlobalChallengeForDate,
  saveGlobalChallenge,
  getPastGlobalChallengeTopics,
  popOldestPendingChallenge,
} from "../db/database.js";
import {
  getActiveBackwordsJudgeDefinition,
  getActiveClueGeneratorJudgeDefinition,
  getActivePunJudgeDefinition,
  getJudgeSnapshot,
} from "../lib/aiJudges.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";

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

export function buildBackwordsGuessFallback(
  topic,
  focus,
  guessA,
  guessB,
  reasoning = "Semantic adjudication was unavailable.",
) {
  const judge = getActiveBackwordsJudgeDefinition();
  const judgeSnapshot = getJudgeSnapshot(judge);

  const options = [
    {
      topicGuessSlot: "guessA",
      focusGuessSlot: "guessB",
      topicSimilarity: scoreFallbackSimilarity(guessA, topic),
      focusSimilarity: scoreFallbackSimilarity(guessB, focus),
    },
    {
      topicGuessSlot: "guessB",
      focusGuessSlot: "guessA",
      topicSimilarity: scoreFallbackSimilarity(guessB, topic),
      focusSimilarity: scoreFallbackSimilarity(guessA, focus),
    },
  ];

  const best = options.sort((left, right) => {
    const leftTotal = left.topicSimilarity + left.focusSimilarity;
    const rightTotal = right.topicSimilarity + right.focusSimilarity;
    return rightTotal - leftTotal;
  })[0];

  const matched = best.topicSimilarity === 100 && best.focusSimilarity === 100;
  const overallSimilarity = Math.round(
    (best.topicSimilarity + best.focusSimilarity) / 2,
  );
  const feedback = matched
    ? "The semantic judge dropped out, but the fallback check still recognised both concepts as exact matches."
    : "The semantic judge dropped out, so this guess was checked with a stricter fallback and did not fully match both hidden concepts.";

  return {
    reasoning,
    matched,
    overallSimilarity,
    topicSimilarity: best.topicSimilarity,
    focusSimilarity: best.focusSimilarity,
    topicGuessSlot: best.topicGuessSlot,
    focusGuessSlot: best.focusGuessSlot,
    feedback,
    ...judgeSnapshot,
    status: "completed",
    errorMessage: reasoning,
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

    CRITICAL RULE: The Topic and Focus MUST be completely unrelated and contrasting. Do NOT make them logically connected (e.g., do NOT do "Ocean Life" and "Starfish").

    - The 'Topic' should be a broad category (e.g., "Human Body", "IT Infrastructure", "History", "Power Tools").
    - The 'Focus' should be a specific, unrelated object, situation, or place (e.g., "Bread", "A Flat Tire", "Coffee", "A Retaining Wall").

    The goal is to force players to make creative puns connecting two completely different concepts. Return as JSON.${avoidClause}`,
    config: {
      temperature: 0.95, // Elevated for higher variance across the 20 pairs
      topK: 64, // Widened pool for more diverse everyday objects
      topP: 0.95, // Standard cutoff to prevent total gibberish
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

    CRITICAL RULES:
    1. Each Topic and Focus MUST be completely unrelated and contrasting. Do NOT make them logically connected.
    2. All 20 Topics must be different from each other.
    3. All 20 Focuses must be different from each other.
    4. Topics: broad categories (e.g., "Human Body", "IT Infrastructure", "History", "Power Tools", "Marine Biology").
    5. Focuses: specific, unrelated objects, situations, or places (e.g., "Bread", "A Flat Tire", "Coffee", "A Retaining Wall").
    6. Aim for MAXIMUM diversity — cover a wide range of knowledge domains and everyday situations.

    The goal is to force players to make creative puns connecting two completely different concepts. Return as JSON with a 'challenges' array of exactly 20 objects.${avoidClause}`,
    config: {
      temperature: 0.95,
      topK: 64,
      topP: 0.95,
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

export async function scorePunText(topic, focus, punText) {
  const judge = getActivePunJudgeDefinition();
  const judgeSnapshot = getJudgeSnapshot(judge);

  try {
    const response = await ai.models.generateContent({
      model: judge.model,
      systemInstruction: judge.systemPrompt,

      contents: `Evaluate the following submission:

      [TOPIC]: ${topic}
      [FOCUS]: ${focus}
      [USER_PUN]: """${punText}"""`,

      config: {
        temperature: judge.config.temperature,
        thinkingConfig: {
          thinkingLevel: judge.config.thinkingLevel,
        },
        responseMimeType: "application/json",
        responseSchema: PUN_SCORE_RESPONSE_SCHEMA,
      },
    });

    return {
      ...JSON.parse(response.text),
      ...judgeSnapshot,
    };
  } catch (error) {
    console.error("AI Judging failed:", error);
    return {
      reasoning: "API failure or timeout.",
      score: 5,
      feedback:
        "I was prepared to offer a blistering critique, but my analytical faculties encountered a systemic failure. We shall record a perfectly mediocre 5 and proceed.",
      ...judgeSnapshot,
    };
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

    CRITICAL RULES:
    1. All 5 pairs must be completely unrelated — no logical connections between Topic and Focus.
    2. All 5 Topics must be different from each other.
    3. All 5 Focuses must be different from each other.
    4. Topics: broad categories (e.g., "Human Body", "Medieval History", "Power Tools").
    5. Focuses: specific, unrelated objects or situations (e.g., "A Parking Ticket", "Sourdough Bread").

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

    CRITICAL RULES:
    1. Topic and Focus must be clearly distinct concepts.
    2. Topic should be a broad category or domain.
    3. Focus should be a more specific object, situation, or place.
    4. The pair should be fertile enough that a clever player could write three clue-puns that bridge both concepts.
    5. Use Australian English spelling.

    Return as JSON with keys 'topic' and 'focus'.${avoidClause}`,
    config: {
      temperature: 0.85,
      topK: 48,
      topP: 0.9,
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

  const response = await ai.models.generateContent({
    model: judge.model,
    systemInstruction: judge.systemPrompt,
    contents: `Generate exactly ${count} additional pun clues for this Backwords puzzle.

    [TOPIC]: ${topic}
    [FOCUS]: ${focus}
    [EXISTING_HUMAN_PUNS]:
    ${humanBlock}`,
    config: {
      temperature: judge.config.temperature,
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

export async function judgeBackwordsGuess(topic, focus, guessA, guessB) {
  const judge = getActiveBackwordsJudgeDefinition();
  const judgeSnapshot = getJudgeSnapshot(judge);

  try {
    const response = await ai.models.generateContent({
      model: judge.model,
      systemInstruction: judge.systemPrompt,
      contents: `Evaluate the following Backwords guess.

      [TOPIC]: ${topic}
      [FOCUS]: ${focus}
      [GUESS_A]: """${guessA}"""
      [GUESS_B]: """${guessB}"""`,
      config: {
        temperature: judge.config.temperature,
        thinkingConfig: {
          thinkingLevel: judge.config.thinkingLevel,
        },
        responseMimeType: "application/json",
        responseSchema: BACKWORDS_GUESS_RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);

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
    console.error("Backwords judging failed:", error);
    return buildBackwordsGuessFallback(
      topic,
      focus,
      guessA,
      guessB,
      "Backwords semantic adjudication failed due to an API error or timeout.",
    );
  }
}
