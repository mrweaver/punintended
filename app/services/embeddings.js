/**
 * services/embeddings.js — Local Ollama embedding helpers.
 *
 * Thin wrapper around Ollama's qwen3-embedding:0.6b (1024-dim). Used by the
 * challenge buffer for dedup and by the Backwords fallback judge for semantic
 * similarity scoring when the primary Gemini judge drops out.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";

export async function generateEmbedding(text) {
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

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
