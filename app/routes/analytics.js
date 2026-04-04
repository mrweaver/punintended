/**
 * routes/analytics.js — Umami analytics proxy.
 *
 * Proxies the Umami tracking script and event ingestion endpoint so the
 * browser only ever talks to the app's own origin, avoiding ad-blocker
 * interference.
 */
import { Router } from "express";

const router = Router();
const UMAMI_BASE_URL = process.env.UMAMI_BASE_URL || "http://umami:3000";

router.get("/umami/script.js", async (req, res) => {
  try {
    const upstream = await fetch(`${UMAMI_BASE_URL}/script.js`, {
      headers: {
        "user-agent": req.get("user-agent") || "PunIntended/umami-proxy",
      },
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .send("Failed to load analytics script");
    }

    const script = await upstream.text();
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(script);
  } catch (error) {
    console.error("Umami script proxy failed:", error);
    res.status(502).send("Analytics proxy error");
  }
});

router.post("/umami/api/send", async (req, res) => {
  try {
    const upstream = await fetch(`${UMAMI_BASE_URL}/api/send`, {
      method: "POST",
      headers: {
        "content-type": req.get("content-type") || "application/json",
        "user-agent": req.get("user-agent") || "PunIntended/umami-proxy",
      },
      body: Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    if (upstream.headers.get("content-type")) {
      res.setHeader("Content-Type", upstream.headers.get("content-type"));
    }
    res.send(text);
  } catch (error) {
    console.error("Umami event proxy failed:", error);
    res.status(502).json({ error: "Analytics proxy error" });
  }
});

export default router;
