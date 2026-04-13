export function formatJudgeLabel(
  judgeName?: string | null,
  judgeVersion?: string | null,
) {
  const normalizedName = judgeName?.trim();

  if (!normalizedName) return null;
  return normalizedName;
}

export function formatJudgeTitle(
  judgeName?: string | null,
  judgeVersion?: string | null,
) {
  const label = formatJudgeLabel(judgeName, judgeVersion);
  return label ? `Judged by ${label}` : null;
}
