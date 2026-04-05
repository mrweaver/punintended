// src/utils/time.ts

export const formatFuzzyTime = (ms: number | null | undefined): string | null => {
  if (ms == null || ms < 0) return null;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 365) return "over a year";
  if (days >= 30) return "over a month";
  if (days >= 7) return "over a week";

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  
  return `${seconds}s`;
};