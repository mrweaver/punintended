/**
 * auth/hub.js — Loom & Skullcap hub integration helpers.
 *
 * Verifies handoff and session JWTs minted by the hub (HS256, signed with
 * the shared HUB_JWT_SECRET) and mints PunIntended-side session JWTs in the
 * same shape so the `lns_session` cookie is interchangeable across every
 * `*.cotlone.com` app.
 */
import jwt from "jsonwebtoken";

const SESSION_COOKIE_NAME = "lns_session";
const SESSION_COOKIE_DOMAIN = ".cotlone.com";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

function requireSecret() {
  const secret = process.env.HUB_JWT_SECRET;
  if (!secret) throw new Error("HUB_JWT_SECRET is not configured");
  return secret;
}

function requireAppId() {
  const appId = process.env.HUB_GAME_ID;
  if (!appId) throw new Error("HUB_GAME_ID is not configured");
  return appId;
}

export function verifyHubToken(token, requiredScope) {
  const payload = jwt.verify(token, requireSecret(), {
    algorithms: ["HS256"],
  });
  if (payload.scope !== requiredScope) {
    throw new Error(`Wrong token scope: ${payload.scope}`);
  }
  return payload;
}

export function verifyHandoffToken(token) {
  const payload = verifyHubToken(token, "handoff");
  if (payload.app_id !== requireAppId()) {
    throw new Error("Handoff token issued for a different app");
  }
  if (!payload.sub) {
    throw new Error("Handoff token missing subject");
  }
  return payload;
}

export function verifySessionToken(token) {
  return verifyHubToken(token, "session");
}

export function mintSessionToken({ userId, email }) {
  return jwt.sign(
    { sub: String(userId), email: email ?? null, scope: "session" },
    requireSecret(),
    { algorithm: "HS256", expiresIn: SESSION_TTL_SECONDS },
  );
}

export function readSessionToken(req) {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const header = req.headers?.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    domain: SESSION_COOKIE_DOMAIN,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    domain: SESSION_COOKIE_DOMAIN,
    path: "/",
  });
}

export async function fetchHubMe(sessionToken) {
  const hubUrl = process.env.HUB_URL;
  if (!hubUrl) throw new Error("HUB_URL is not configured");
  const res = await fetch(`${hubUrl}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) {
    throw new Error(`Hub /auth/me returned ${res.status}`);
  }
  return res.json();
}
