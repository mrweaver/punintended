import type { BackwordsRun } from "../api/client";
import { formatFuzzyTime } from "./time";

function getBackwordsRunDurationLabel(run: BackwordsRun) {
  const startedAt = Date.parse(run.createdAt);
  const completedAt = Date.parse(run.updatedAt);

  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) {
    return null;
  }

  const durationMs = completedAt - startedAt;

  if (durationMs < 0) return null;
  return formatFuzzyTime(durationMs);
}

export function buildBackwordsResultsShareMessage(run: BackwordsRun) {
  const attemptsLabel = `${run.attemptsUsed} guess${run.attemptsUsed === 1 ? "" : "es"}`;
  const durationLabel = getBackwordsRunDurationLabel(run);

  if (run.status === "solved") {
    if (durationLabel) {
      return `I solved this Backwords puzzle in ${attemptsLabel} over ${durationLabel} on PunIntended. See how I did.`;
    }

    return `I solved this Backwords puzzle in ${attemptsLabel} on PunIntended. See how I did.`;
  }

  const bestSimilarityLabel = `${run.bestSimilarity ?? 0}% similarity`;

  if (durationLabel) {
    return `I took ${attemptsLabel} over ${durationLabel} and got as close as ${bestSimilarityLabel} on this Backwords puzzle on PunIntended. See how I did.`;
  }

  return `I took ${attemptsLabel} and got as close as ${bestSimilarityLabel} on this Backwords puzzle on PunIntended. See how I did.`;
}