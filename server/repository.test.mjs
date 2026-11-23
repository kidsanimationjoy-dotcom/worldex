import test from "node:test";
import assert from "node:assert/strict";
import { createMysqlRepository } from "./repository.mjs";

/**
 * In-memory pool that models prepared statements: every `?` binds exactly one scalar. An array bound to `IN (?)`
 * is NOT expanded (mysql2 execute() semantics), so it matches nothing. This lets the tests catch code that only
 * works when the driver expands arrays, and lets us check tenant-ownership logic without a real database.
 */
function fakePool({ owners = {}, conversationOwners = {} } = {}) {
  const calls = [];
  const listFrom = (sql, params, marker) => {
    const at = sql.indexOf(marker); if (at < 0) return null;
    const before = (sql.slice(0, at).match(/\?/g) ?? []).length;
    const count = (sql.slice(at).match(/\?/g) ?? []).length;
    return params.slice(before, before + count);
  };
  const record = (sql, params = []) => {
    calls.push({ sql, params });
    const marks = (sql.match(/\?/g) ?? []).length;
    assert.equal(marks, params.length, `placeholder/param mismatch in: ${sql}`);
    params.forEach((p) => assert.ok(p === null || typeof p !== "object" || p instanceof Date, `non-scalar bound parameter in: ${sql}`));
  };
  const answer = (sql, params) => {
    if (/SELECT cross_workspace_overview,active_workspace_id FROM users/.test(sql)) return [{ cross_workspace_overview: 0, active_workspace_id: null }];
    if (/SELECT \* FROM workspaces WHERE user_id=\?/.test(sql)) return Object.entries(owners).filter(([, u]) => u === params[0]).map(([id]) => ({ id, name: id, kind: "Business", intent: "already-business", description: "", goals: "[]", country: "", currency: "USD", accent: "blue", logo: "W", assistant_memory: "[]", created_at: new Date() }));
    if (/FROM conversations WHERE user_id=\?/.test(sql)) return [{ id: "chat-a", workspace_id: "ws-a", title: "t", status: "draft", created_at: new Date(), updated_at: new Date(), archived_at: null }];
    if (/FROM sharing_grants WHERE user_id=\?/.test(sql)) return [{ id: "grant-1", owner_workspace_id: "ws-a", provider: "Shopify", account_label: "x", share_with_all: 0, created_at: new Date(), revoked_at: null }];
    if (/FROM workspaces WHERE id IN \(/.test(sql)) { const ids = listFrom(sql, params, "IN ("); return ids.filter((id) => id in owners).map((id) => ({ id, user_id: owners[id] })); }
    if (/FROM workspaces WHERE user_id=\? AND id IN/.test(sql)) return params.slice(1).filter((id) => owners[id] === params[0]).map((id) => ({ id }));
    if (/FROM conversations WHERE id IN \(/.test(sql)) { const ids = listFrom(sql, params, "IN ("); return ids.filter((id) => id in conversationOwners).map((id) => ({ id, user_id: conversationOwners[id].user, workspace_id: conversationOwners[id].workspace })); }
    return [];
  };
  const run = async (sql, params) => { record(sql, params); return [answer(sql, params ?? [])]; };
  const connection = { execute: run, query: run, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => { calls.rolledBack = true; }, release: () => {} };
  return { calls, execute: run, query: run, getConnection: async () => connection };
}

const t0 = "2026-01-01T00:00:00.000Z";
const workspace = (id, extra = {}) => ({ id, name: id, kind: "Business", intent: "already-business", description: "", goals: [], country: "", currency: "USD", accent: "blue", logo: "W", createdAt: t0, chats: [], projects: [], tasks: [], files: [], assistantMemory: [], activity: [], accountIds: [], ...extra });
const chat = (id) => ({ id, title: "Chat", createdAt: t0, updatedAt: t0, state: "draft", messages: [{ id: `${id}-m1`, role: "user", text: "hi", createdAt: t0, status: "draft" }] });
const richState = () => ({ version: 1, onboarded: true, activeWorkspaceId: "ws-a", crossWorkspaceOverview: false,
  workspaces: [workspace("ws-a", { chats: [chat("chat-a")], projects: [{ id: "p1", title: "P", type: "Game brief", description: "", targets: [], createdAt: t0, status: "Local draft" }], tasks: [{ id: "t1", title: "T", state: "draft" }], files: [{ id: "f1", name: "f", createdAt: t0 }], activity: [{ id: "e1", label: "x", createdAt: t0 }] }), workspace("ws-b")],
  accessPolicies: [{ id: "grant-1", ownerWorkspaceId: "ws-a", provider: "Shopify", accountLabel: "x", targetWorkspaceIds: ["ws-b"], shareWithAll: false, scopes: ["Profile"], createdAt: t0 }] });

test("saveState binds only scalar parameters (no arrays for IN lists)", async () => {
  const pool = fakePool({ owners: { "ws-a": "user-1", "ws-b": "user-1" } });
  await createMysqlRepository(pool).saveState("user-1", richState());
  assert.ok(pool.calls.length > 10);
  assert.ok(pool.calls.some((c) => /IN \(\?,\?\)/.test(c.sql) || /IN \(\?\)/.test(c.sql)), "expected IN lists to be exercised");
});

test("loadState binds only scalar parameters and returns the user's chats", async () => {
  const pool = fakePool({ owners: { "ws-a": "user-1", "ws-b": "user-1" } });
  const state = await createMysqlRepository(pool).loadState("user-1");
  assert.equal(state.workspaces.length, 2);
  assert.equal(state.workspaces.find((w) => w.id === "ws-a").chats.length, 1, "chat rows must be found, not silently dropped");
  assert.deepEqual(state.accessPolicies[0].targetWorkspaceIds, []);
});

test("cross-account isolation: saving a workspace id owned by another user is rejected and rolled back", async () => {
  const pool = fakePool({ owners: { "ws-a": "user-2", "ws-b": "user-1" } });
  await assert.rejects(createMysqlRepository(pool).saveState("user-1", richState()), (error) => error.status === 403);
  assert.equal(pool.calls.rolledBack, true);
});

test("cross-account isolation: a chat id already owned by another workspace/user is rejected", async () => {
  const pool = fakePool({ owners: { "ws-a": "user-1", "ws-b": "user-1" }, conversationOwners: { "chat-a": { user: "user-2", workspace: "ws-z" } } });
  await assert.rejects(createMysqlRepository(pool).saveState("user-1", richState()), (error) => error.status === 403);
});

test("sharing intent whose target workspace is not owned by the user is rejected", async () => {
  const pool = fakePool({ owners: { "ws-a": "user-1", "ws-b": "user-2" } });
  const state = richState();
  await assert.rejects(createMysqlRepository(pool).saveState("user-1", state), (error) => error.status === 403);
});
