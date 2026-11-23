import test from "node:test";
import assert from "node:assert/strict";
import { buildOAuthState, constantTimeEqual, csrfTokenForSession, makeCookie, originAllowed, parseOAuthState, sha256, signSessionJwt, verifyPlatformJwt } from "./security.mjs";
import { parseAppState, parseTaskRequest, ValidationError } from "./validation.mjs";

const secret = "test-only-secret";
test("session JWT is valid only for the configured app, signature and lifetime", () => {
  const signed = signSessionJwt({ openId: "user-123", appId: "app-1", secret, nowSeconds: 1000, sid: "sid-1" });
  assert.equal(verifyPlatformJwt(signed.token, { secret, appId: "app-1", nowSeconds: 1001 }).openId, "user-123");
  assert.equal(verifyPlatformJwt(signed.token, { secret: "wrong", appId: "app-1", nowSeconds: 1001 }), null);
  assert.equal(verifyPlatformJwt(signed.token, { secret, appId: "other", nowSeconds: 1001 }), null);
  assert.equal(verifyPlatformJwt(signed.token, { secret, appId: "app-1", nowSeconds: 1000 + 8 * 60 * 60 }), null);
});

test("origin policy rejects lookalikes, paths and non-HTTPS preview origins", () => {
  assert.equal(originAllowed("https://preview.manus.computer"), true);
  assert.equal(originAllowed("http://localhost:3000"), true);
  assert.equal(originAllowed("https://evilmanus.computer"), false);
  assert.equal(originAllowed("https://preview.manus.computer/path"), false);
  assert.equal(originAllowed("http://preview.manus.computer"), false);
});

test("OAuth state, constant-time comparison, CSRF binding and secure cookie attributes", () => {
  const state = buildOAuthState("https://preview.manus.computer/api/auth/oauth/callback", "n-123");
  assert.deepEqual(parseOAuthState(state), { redirectUri: "https://preview.manus.computer/api/auth/oauth/callback", nonce: "n-123" });
  assert.equal(parseOAuthState("bad"), null);
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.notEqual(csrfTokenForSession("s1", sha256("cookie"), secret), csrfTokenForSession("s2", sha256("cookie"), secret));
  const cookie = makeCookie("webdev_app_session", "token", { secure: true, maxAge: 60 });
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=None/);
});

test("state validation drops client copies of server-authored assistant messages", () => {
  const state = parseAppState({ version: 1, onboarded: true, activeWorkspaceId: "ws-1", crossWorkspaceOverview: false, accessPolicies: [], workspaces: [{ id: "ws-1", name: "Test", kind: "Business", intent: "already-business", description: "", goals: [], country: "", currency: "USD", accent: "blue", logo: "T", createdAt: "2026-01-01T00:00:00.000Z", chats: [{ id: "chat-1", title: "Chat", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", state: "completed", messages: [{ id: "u1", role: "user", text: "hello", createdAt: "2026-01-01T00:00:00.000Z", status: "draft" }, { id: "a1", role: "assistant", text: "untrusted client copy", createdAt: "2026-01-01T00:00:01.000Z", status: "completed" }] }], projects: [], tasks: [], files: [], assistantMemory: [], activity: [], accountIds: [] }] });
  assert.deepEqual(state.workspaces[0].chats[0].messages.map((m) => m.id), ["u1"]);
});

test("task input is bounded and requires both workspace and conversation", () => {
  assert.deepEqual(parseTaskRequest({ workspaceId: "w", conversationId: "c", inputText: "Do research" }), { workspaceId: "w", conversationId: "c", inputText: "Do research" });
  assert.throws(() => parseTaskRequest({ workspaceId: "w", conversationId: "c", inputText: " " }), ValidationError);
  assert.throws(() => parseTaskRequest({ workspaceId: "w", conversationId: "c", inputText: "x".repeat(6001) }), ValidationError);
});
