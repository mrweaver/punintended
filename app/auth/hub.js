/**
 * auth/hub.js — Loom & Skullcap hub integration helpers.
 *
 * Thin re-export of the shared Node hub client package so sibling apps use
 * the same handoff/session primitives.
 */
export {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  fetchHubMe,
  mintSessionToken,
  readSessionToken,
  setSessionCookie,
  verifyHandoffToken,
  verifyHubToken,
  verifySessionToken,
} from "@cotlone/loom-hub-client";
