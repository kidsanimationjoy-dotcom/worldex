import test from "node:test";
import assert from "node:assert/strict";
import { buildOAuthState, isTrustedSafeRead } from "./security.mjs";
import { createAuthService } from "./auth-service.mjs";

const origin = "http://localhost:3000";
const env = { MANUS_JWT_SECRET: "test-only-secret", MANUS_PROJECT_ID: "app-1", WORLDEX_ALLOWED_ORIGINS: "" };

function fakeRepo() {
  const users = new Map(); const sessions = new Map();
  return {
    async getOrCreateUser({ provider, openId, email = null, displayName }) {
      const key = `${provider}:${openId}`;
      if (!users.has(key)) users.set(key, { id: `user-${users.size + 1}`, provider, openId, email, displayName });
      return users.get(key);
    },
    async getUserById(id) { return [...users.values()].find((u) => u.id === id) ?? null; },
    async createSession(s) { sessions.set(s.tokenHash, { ...s, expiresAt: s.expiresAt.toISOString(), revokedAt: null }); },
    async createPreviewSession(s) { await this.createSession(s); return sessions.get(s.tokenHash); },
    async getSessionByTokenHash(h) { return sessions.get(h) ?? null; },
    async touchSession() {},
    async revokeSession(h, userId) { const s = sessions.get(h); if (!s || s.userId !== userId || s.revokedAt) return false; s.revokedAt = new Date().toISOString(); return true; },
  };
}
const provider = {
  oauthConfigured: true, llmConfigured: false,
  authorizationUrl: ({ redirectUri, state }) => `https://portal.example/app-auth?redirectUri=${encodeURIComponent(redirectUri)}&state=${state}`,
  exchangeAndIdentify: async () => ({ openId: "open-1", email: null, displayName: "Tester" }),
};

async function signedIn() {
  const repo = fakeRepo();
  const auth = createAuthService({ repo, provider, env });
  const started = auth.startOAuth(origin);
  const login = await auth.finishOAuth({ code: "code-1", state: buildOAuthState(started.redirectUri, started.nonce), nonceCookie: started.nonce, origin });
  return { repo, auth, login };
}

test("a session created by the OAuth callback resolves when the browser sends Origin", async () => {
  const { auth, login } = await signedIn();
  const ctx = await auth.resolveSession(login.token, origin);
  assert.equal(ctx?.user.openId, "open-1");
});

test("same-origin GET requests carry no Origin header; a safe read must still resolve the session", async () => {
  const { auth, login } = await signedIn();
  // Browsers omit Origin on same-origin GET/HEAD, which is how /api/auth/me and GET /api/state are called.
  const ctx = await auth.resolveSession(login.token, undefined, { safeRead: true });
  assert.equal(ctx?.user.openId, "open-1");
  assert.equal(ctx.csrfToken, login.csrfToken);
});

test("a missing Origin is never accepted for anything that is not an explicit safe read", async () => {
  const { auth, login } = await signedIn();
  assert.equal(await auth.resolveSession(login.token, undefined), null);
  assert.equal(await auth.resolveSession(login.token, undefined, { safeRead: false }), null);
});

test("a wrong Origin is rejected even for safe reads", async () => {
  const { auth, login } = await signedIn();
  assert.equal(await auth.resolveSession(login.token, "http://localhost:9999", { safeRead: true }), null);
  assert.equal(await auth.resolveSession(login.token, "https://evil.example", { safeRead: true }), null);
});

test("mutations still require matching Origin and CSRF token", async () => {
  const { auth, login } = await signedIn();
  const ctx = await auth.resolveSession(login.token, origin);
  assert.doesNotThrow(() => auth.verifyMutation({ origin, csrfHeader: login.csrfToken, auth: ctx }));
  assert.throws(() => auth.verifyMutation({ origin: undefined, csrfHeader: login.csrfToken, auth: ctx }), /Request origin/);
  assert.throws(() => auth.verifyMutation({ origin, csrfHeader: "wrong", auth: ctx }), /verification failed/);
});

test("logout revokes the session so the same cookie no longer resolves (session expiry/revocation)", async () => {
  const { auth, login } = await signedIn();
  const ctx = await auth.resolveSession(login.token, origin);
  assert.equal(await auth.logout(ctx), true);
  assert.equal(await auth.resolveSession(login.token, origin), null);
  assert.equal(await auth.resolveSession(login.token, undefined, { safeRead: true }), null);
});

test("an expired session does not resolve", async () => {
  const repo = fakeRepo();
  let clock = Date.now();
  const auth = createAuthService({ repo, provider, env, now: () => clock });
  const started = auth.startOAuth(origin);
  const login = await auth.finishOAuth({ code: "c", state: buildOAuthState(started.redirectUri, started.nonce), nonceCookie: started.nonce, origin });
  assert.ok(await auth.resolveSession(login.token, origin));
  clock += 9 * 60 * 60 * 1000;
  assert.equal(await auth.resolveSession(login.token, origin), null);
});

test("OAuth callback rejects a mismatched nonce and a foreign redirect URI", async () => {
  const repo = fakeRepo();
  const auth = createAuthService({ repo, provider, env });
  const started = auth.startOAuth(origin);
  await assert.rejects(auth.finishOAuth({ code: "c", state: buildOAuthState(started.redirectUri, started.nonce), nonceCookie: "different", origin }), /state could not be verified/);
  await assert.rejects(auth.finishOAuth({ code: "c", state: buildOAuthState("https://evil.example/auth/callback", started.nonce), nonceCookie: started.nonce, origin }), /state could not be verified/);
  await assert.rejects(auth.finishOAuth({ code: "c", state: buildOAuthState(started.redirectUri, started.nonce), nonceCookie: started.nonce, origin: "https://evil.example" }), /not authorized/);
});

test("isTrustedSafeRead only trusts GET/HEAD that are same-origin, user-typed, or from clients that send no fetch metadata", () => {
  assert.equal(isTrustedSafeRead({ method: "GET", secFetchSite: "same-origin" }), true);
  assert.equal(isTrustedSafeRead({ method: "HEAD", secFetchSite: "none" }), true);
  assert.equal(isTrustedSafeRead({ method: "GET", secFetchSite: undefined }), true);
  assert.equal(isTrustedSafeRead({ method: "GET", secFetchSite: "cross-site" }), false);
  assert.equal(isTrustedSafeRead({ method: "GET", secFetchSite: "same-site" }), false);
  assert.equal(isTrustedSafeRead({ method: "POST", secFetchSite: "same-origin" }), false);
  assert.equal(isTrustedSafeRead({ method: "PUT", secFetchSite: undefined }), false);
});
