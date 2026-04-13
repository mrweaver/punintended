export function formatJudgeLabel(
  judgeName?: string | null,
  judgeVersion?: string | null,
) {
  const normalizedName = judgeName?.trim();
  const normalizedVersion = judgeVersion?.trim().replace(/^v/i, "");

  if (!normalizedName) return null;
  if (!normalizedVersion) return normalizedName;
  return `${normalizedName} v${normalizedVersion}`;
}

export function formatJudgeTitle(
  judgeName?: string | null,
  judgeVersion?: string | null,
) {
  const label = formatJudgeLabel(judgeName); //Name only for improved readability in the title attribute, where space is limited and "vX.Y" may not add much value.
  return label ? `Judged by ${label}` : null;
}
