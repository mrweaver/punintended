import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import {
  findOrCreateUser,
  getUserById,
  setUserHubId,
} from "../db/database.js";

async function linkHubIdentity(localUser, params) {
  if (localUser?.hub_user_id) return localUser;
  const idToken = params?.id_token;
  const hubUrl = process.env.HUB_URL;
  if (!idToken || !hubUrl) return localUser;

  try {
    const res = await fetch(`${hubUrl}/api/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
    if (!res.ok) {
      console.warn(`[passport] hub /auth/google returned ${res.status}`);
      return localUser;
    }
    const body = await res.json();
    const hubUserId = body?.user?.id;
    if (!hubUserId) return localUser;
    const updated = await setUserHubId(localUser.id, hubUserId);
    return updated ?? localUser;
  } catch (err) {
    console.warn("[passport] failed to link hub identity:", err.message);
    return localUser;
  }
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    // 5-arg verify signature includes `params` from the token endpoint, which
    // carries the Google id_token we forward to the hub for identity linking.
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        let user = await findOrCreateUser(profile);
        user = await linkHubIdentity(user, params);
        return done(null, user);
      } catch (error) {
        console.error("Google OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await getUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
