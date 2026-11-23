import { randomUUID } from "node:crypto";
import { buildOAuthState, constantTimeEqual, csrfTokenForSession, originAllowed, parseOAuthState, randomToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, sha256, signSessionJwt, verifyPlatformJwt } from "./security.mjs";

export function createAuthService({ repo, provider, env = process.env, now = () => Date.now(), uuid = randomUUID }) {
  const secret = env.MANUS_JWT_SECRET;
  const appId = env.MANUS_PROJECT_ID;
  const originOptions = { allowedOrigins: env.WORLDEX_ALLOWED_ORIGINS ?? "", allowLocal: true };
  const configurationReady = Boolean(secret && appId && provider);

  function requireOrigin(origin) {
    if (!originAllowed(origin, originOptions)) throw authError(403, "origin_not_allowed", "This application origin is not authorized");
    return origin;
  }

  function startOAuth(origin) {
    requireOrigin(origin);
    if (!provider?.oauthConfigured) throw authError(503, "oauth_not_configured", "Manus OAuth is not configured in this runtime");
    const nonce = randomToken(32);
    const redirectUri = `${origin}/auth/callback`;
    const state = buildOAuthState(redirectUri, nonce);
    return { authorizationUrl: provider.authorizationUrl({ redirectUri, nonce, state }), nonce, redirectUri, secure: new URL(origin).protocol === "https:" };
  }

  async function finishOAuth({ code, state, nonceCookie, origin }) {
    requireOrigin(origin);
    if (!provider?.oauthConfigured || !configurationReady) throw authError(503, "oauth_not_configured", "Authentication is not configured in this runtime");
    if (typeof code !== "string" || code.length < 1 || code.length > 4096) throw authError(400, "invalid_code", "OAuth callback code is invalid");
    const parsed = parseOAuthState(state);
    if (!parsed || parsed.redirectUri !== `${origin}/auth/callback` || !constantTimeEqual(parsed.nonce, nonceCookie ?? "")) throw authError(400, "oauth_state_mismatch", "OAuth state could not be verified");
    const identity = await provider.exchangeAndIdentify({ code, redirectUri: parsed.redirectUri });
    const user = await repo.getOrCreateUser({ provider: "manus", openId: identity.openId, email: identity.email, displayName: identity.displayName });
    const sessionId = uuid();
    const signed = signSessionJwt({ openId: identity.openId, appId, secret, nowSeconds: Math.floor(now() / 1000), sid: sessionId });
    const tokenHash = sha256(signed.token);
    const csrfToken = csrfTokenForSession(sessionId, tokenHash, secret);
    await repo.createSession({ id: sessionId, userId: user.id, tokenHash, csrfHash: sha256(csrfToken), origin, expiresAt: signed.expiresAt });
    return { user, token: signed.token, tokenHash, csrfToken, sessionId, expiresAt: signed.expiresAt, secure: new URL(origin).protocol === "https:" };
  }

  async function resolveSession(token, origin, { safeRead = false } = {}) {
    if (!configurationReady || !token) return null;
    const claims = verifyPlatformJwt(token, { secret, appId, nowSeconds: Math.floor(now() / 1000) });
    if (!claims) return null;
    const tokenHash = sha256(token);
    let session = await repo.getSessionByTokenHash(tokenHash);
    if (!session) {
      if (claims.sid || !originAllowed(origin, originOptions)) return null;
      const user = await repo.getOrCreateUser({ provider: "manus", openId: claims.openId, displayName: "WORLDEX operator" });
      const id = uuid();
      const csrfToken = csrfTokenForSession(id, tokenHash, secret);
      session = await repo.createPreviewSession({ id, userId: user.id, tokenHash, csrfHash: sha256(csrfToken), origin, expiresAt: new Date(claims.exp * 1000) });
    }
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= now()) return null;
    if (claims.sid && claims.sid !== session.id) return null;
    // A missing Origin is only tolerated for explicit safe reads; the session stays bound to the origin it was issued for.
    const effectiveOrigin = origin == null && safeRead ? session.origin : origin;
    if (session.origin !== effectiveOrigin || !originAllowed(effectiveOrigin, originOptions)) return null;
    const user = await repo.getUserById(session.userId);
    if (!user || user.openId !== claims.openId) return null;
    const csrfToken = csrfTokenForSession(session.id, tokenHash, secret);
    if (!constantTimeEqual(sha256(csrfToken), session.csrfHash)) return null;
    await repo.touchSession(session.id);
    return { user, session, tokenHash, csrfToken, claims };
  }

  function verifyMutation({ origin, csrfHeader, auth }) {
    if (!auth || !origin || origin !== auth.session.origin || !originAllowed(origin, originOptions)) throw authError(403, "csrf_origin_mismatch", "Request origin does not match this session");
    if (!constantTimeEqual(csrfHeader ?? "", auth.csrfToken)) throw authError(403, "csrf_token_invalid", "Request verification failed");
  }

  async function logout(auth) {
    if (!auth) return false;
    return repo.revokeSession(auth.tokenHash, auth.user.id);
  }

  return { requireOrigin, startOAuth, finishOAuth, resolveSession, verifyMutation, logout, cookieName: SESSION_COOKIE, sessionMaxAgeSeconds: SESSION_MAX_AGE_SECONDS, configurationReady };
}

export function authError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
