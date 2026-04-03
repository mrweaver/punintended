/**
 * middleware/index.js — Express middleware stack.
 *
 * Configures and applies Helmet (CSP), compression (with SSE exclusion),
 * JSON body parsing, PostgreSQL-backed sessions, and Passport
 * authentication initialisation.
 */
import compression from "compression";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import express from "express";
import passport from "../auth/passport.js";
import { pool } from "../db/database.js";

const pgSession = connectPgSimple(session);

export function applyMiddleware(app) {
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
          connectSrc: [
            "'self'",
            "https://cloudflareinsights.com",
            "https://static.cloudflareinsights.com",
          ],
          fontSrc: ["'self'"],
        },
      },
    }),
  );

  app.use(
    compression({
      // Do not compress SSE responses; buffering can delay chunks and trigger gateway timeouts.
      filter: (req, res) => {
        const accept = req.headers.accept || "";
        const contentType = String(res.getHeader("Content-Type") || "");
        if (
          accept.includes("text/event-stream") ||
          contentType.includes("text/event-stream")
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  app.use(express.json());

  const sessionMiddleware = session({
    store: new pgSession({
      pool,
      tableName: "session",
      pruneSessionInterval: 15 * 60,
    }),
    secret: process.env.SESSION_SECRET || "change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());
}
