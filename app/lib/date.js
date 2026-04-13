/**
 * lib/date.js — Date and time utilities.
 *
 * Pure functions for canonical AEST date handling, client date validation,
 * and reveal-elapsed-time calculations. No external dependencies.
 */

// Canonical server date — always AEST/AEDT (Australia/Sydney handles DST automatically).
export function getAESTDateId() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Sydney",
  });
}

export function isValidDateId(dateId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) return false;

  const [year, month, day] = dateId.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Returns true if dateId is within 1 day of the current AEST date.
export function isPlausibleLocalDate(dateId) {
  if (!isValidDateId(dateId)) return false;
  const serverDate = getAESTDateId();
  const serverMs = new Date(serverDate + "T00:00:00Z").getTime();
  const claimedMs = new Date(dateId + "T00:00:00Z").getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.abs(claimedMs - serverMs) <= oneDayMs;
}

export function getRevealElapsedMs(revealedAt) {
  const parsed = new Date(revealedAt).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Date.now() - parsed);
}
