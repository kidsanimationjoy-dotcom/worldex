/**
 * Integration tests against a REAL, ISOLATED MySQL 8 database.
 *
 * Skipped unless WORLDEX_TEST_DATABASE_URL is set. It is never read from DATABASE_URL, and the suite refuses
 * to run against anything that is not clearly a disposable test database:
 *   - the database name must be "test" or contain a "_test" / "test_" segment (e.g. worldex_test)
 *   - the host must be local, unless WORLDEX_TEST_ALLOW_REMOTE=1
 *   - it must differ from DATABASE_URL (the shared managed database)
 * Start one with scripts/test-db.sh. The migration is applied to THIS test database only.
 *
 * Each test uses freshly generated users/workspaces and the suite deletes them afterwards (FKs cascade).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.WORLDEX_TEST_DATABASE_URL;
const skip = url ? false : "WORLDEX_TEST_DATABASE_URL is not set (see scripts/test-db.sh)";

function assertIsolated(value) {
  const parsed = new URL(value);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!/(^|_)test($|_)/i.test(database)) throw new Error(`Refusing to run: database "${database}" is not clearly a test database`);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  if (!local && process.env.WORLDEX_TEST_ALLOW_REMOTE !== "1") throw new Error(`Refusing to run against non-local host "${parsed.hostname}"`);
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === value) throw new Error("Refusing to run: WORLDEX_TEST_DATABASE_URL equals DATABASE_URL");
}

let pool; let repo; let migrations; let createdUsers = [];
const t0 = "2026-01-01T00:00:00.000Z";
const at = (seconds) => new Date(Date.parse(t0) + seconds * 1000).toISOString();
const uid = (prefix) => `${prefix}-${randomUUID()}`;
const workspace = (id, extra = {}) => ({ id, name: id, kind: "Business", intent: "already-business", description: "", goals: [], country: "", currency: "USD", accent: "blue", logo: "W", createdAt: t0, chats: [], projects: [], tasks: [], files: [], assistantMemory: [], activity: [], accountIds: [], ...extra });
const chat = (id, extra = {}) => ({ id, title: "Chat", createdAt: t0, updatedAt: t0, state: "draft", messages: [{ id: `${id}-m1`, role: "user", text: "hello", createdAt: t0, status: "draft" }], ...extra });
const stateOf = (workspaces, accessPolicies = [], active) => ({ version: 1, onboarded: true, activeWorkspaceId: active ?? workspaces[0].id, crossWorkspaceOverview: false, workspaces, accessPolicies });
async function newUser() {
  const user = await repo.getOrCreateUser({ openId: `test-${randomUUID()}`, displayName: "Test user" });
  createdUsers.push(user.id);
  return user;
}

before(async () => {
  if (skip) return;
  assertIsolated(url);
  const { createPool } = await import("mysql2/promise");
  const { runMigrations } = await import("./migrate.mjs");
  const { createMysqlRepository } = await import("./repository.mjs");
  pool = createPool(url);
  migrations = await runMigrations(pool);
  repo = createMysqlRepository(pool);
});
after(async () => {
  if (!pool) return;
  for (const id of createdUsers) await pool.execute("DELETE FROM users WHERE id=?", [id]);
  await pool.end();
});

test("migration applies to the isolated database and is idempotent", { skip }, async () => {
  const { runMigrations } = await import("./migrate.mjs");
  assert.ok(migrations.length >= 1);
  assert.deepEqual(await runMigrations(pool), migrations);
  const [tables] = await pool.query("SHOW TABLES");
  assert.ok(tables.length >= 15);
});

test("DIAGNOSTIC: how mysql2 binds an array to IN (?) in execute() vs query()", { skip }, async () => {
  const connection = await pool.getConnection();
  const results = {};
  try {
    await connection.query("CREATE TEMPORARY TABLE probe_in_list (id VARCHAR(20) PRIMARY KEY)");
    await connection.query("INSERT INTO probe_in_list VALUES ('a'),('b'),('c')");
    const probe = async (label, run) => { try { const [rows] = await run(); results[label] = `${rows.length} row(s)`; } catch (error) { results[label] = `ERROR ${error.code ?? error.message}`; } };
    await probe("execute(IN (?), [[a,b,c]])  [ORIGINAL pattern]", () => connection.execute("SELECT id FROM probe_in_list WHERE id IN (?)", [["a", "b", "c"]]));
    await probe("query(IN (?), [[a,b,c]])", () => connection.query("SELECT id FROM probe_in_list WHERE id IN (?)", [["a", "b", "c"]]));
    await probe("execute(IN (?,?,?), [a,b,c])  [FIXED pattern]", () => connection.execute("SELECT id FROM probe_in_list WHERE id IN (?,?,?)", ["a", "b", "c"]));
  } finally { connection.release(); }
  console.log("mysql2 array-binding findings:", JSON.stringify(results, null, 2));
  assert.equal(results["execute(IN (?,?,?), [a,b,c])  [FIXED pattern]"], "3 row(s)", "the fixed pattern must work");
});

test("saveState then loadState round-trips workspaces, chats and messages (the fix's real-world effect)", { skip }, async () => {
  const user = await newUser(); const ws = uid("ws"); const c = uid("chat");
  await repo.saveState(user.id, stateOf([workspace(ws, { name: "Alpha", chats: [chat(c)] })]));
  const loaded = await repo.loadState(user.id);
  assert.equal(loaded.workspaces.length, 1);
  assert.equal(loaded.workspaces[0].chats.length, 1, "chat must be found");
  assert.equal(loaded.workspaces[0].chats[0].messages.length, 1, "message must be found");
  assert.equal(loaded.workspaces[0].chats[0].messages[0].text, "hello");
});

test("cross-account isolation: another user cannot overwrite, adopt, or read a workspace/chat by ID", { skip }, async () => {
  const a = await newUser(); const b = await newUser(); const ws = uid("ws"); const c = uid("chat");
  await repo.saveState(a.id, stateOf([workspace(ws, { name: "A-private", chats: [chat(c, { title: "A secret" })] })]));
  await assert.rejects(repo.saveState(b.id, stateOf([workspace(ws, { name: "hijacked" })])), (e) => e.status === 403);
  const ws2 = uid("ws");
  await assert.rejects(repo.saveState(b.id, stateOf([workspace(ws2, { chats: [chat(c, { title: "hijack" })] })])), (e) => e.status === 403);
  const afterA = await repo.loadState(a.id);
  assert.equal(afterA.workspaces[0].name, "A-private");
  assert.equal(afterA.workspaces[0].chats[0].title, "A secret");
  const afterB = await repo.loadState(b.id);
  assert.equal(afterB.workspaces.length, 0, "failed save must roll back completely");
});

test("a new workspace never inherits another workspace's chats or memory", { skip }, async () => {
  const user = await newUser(); const w1 = uid("ws"); const w2 = uid("ws");
  await repo.saveState(user.id, stateOf([workspace(w1, { chats: [chat(uid("chat"))], assistantMemory: ["w1 secret"] }), workspace(w2)]));
  const loaded = await repo.loadState(user.id);
  const second = loaded.workspaces.find((w) => w.id === w2);
  assert.equal(second.chats.length, 0); assert.deepEqual(second.assistantMemory, []);
});

test("sharing intents: owner/targets must be the user's own; revocation persists, is audited, and is never external", { skip }, async () => {
  const a = await newUser(); const b = await newUser(); const wa = uid("ws"); const wa2 = uid("ws"); const wb = uid("ws"); const g = uid("grant");
  await repo.saveState(b.id, stateOf([workspace(wb)]));
  const grant = (targets) => ({ id: g, ownerWorkspaceId: wa, provider: "Shopify", accountLabel: "Store", targetWorkspaceIds: targets, shareWithAll: false, scopes: ["Profile"], createdAt: t0 });
  await assert.rejects(repo.saveState(a.id, stateOf([workspace(wa)], [grant([wb])])), (e) => e.status === 403);
  await repo.saveState(a.id, stateOf([workspace(wa), workspace(wa2)], [grant([wa2])]));
  let [rows] = await pool.execute("SELECT status,external_enforced FROM sharing_grants WHERE id=?", [g]);
  assert.deepEqual([rows[0].status, Number(rows[0].external_enforced)], ["intent", 0]);
  await repo.saveState(a.id, stateOf([workspace(wa), workspace(wa2)], [{ ...grant([wa2]), revokedAt: at(10) }]));
  await repo.saveState(a.id, stateOf([workspace(wa), workspace(wa2)], [grant([wa2])]));
  [rows] = await pool.execute("SELECT status,revoked_at FROM sharing_grants WHERE id=?", [g]);
  assert.equal(rows[0].status, "revoked", "a revoked intent must not be silently re-enabled by a stale snapshot");
  const [audit] = await pool.execute("SELECT action FROM audit_events WHERE user_id=? AND entity_id=?", [a.id, g]);
  assert.ok(audit.some((r) => r.action === "revoked"));
  const loadedB = await repo.loadState(b.id);
  assert.equal(loadedB.accessPolicies.length, 0, "the other account must not see the grant");
});

test("concurrent saves for one user serialize; newest chat update wins regardless of arrival order", { skip }, async () => {
  const user = await newUser(); const ws = uid("ws"); const c = uid("chat");
  await repo.saveState(user.id, stateOf([workspace(ws, { chats: [chat(c)] })]));
  const attempts = Array.from({ length: 20 }, (_, i) => repo.saveState(user.id, stateOf([workspace(ws, { chats: [chat(c, { title: `title-${i}`, updatedAt: at(i + 1) })] })])));
  const settled = await Promise.allSettled(attempts);
  const failures = settled.filter((r) => r.status === "rejected").map((r) => r.reason?.code ?? r.reason?.message);
  assert.deepEqual(failures, [], `unexpected failures: ${failures.join(",")}`);
  const loaded = await repo.loadState(user.id);
  assert.equal(loaded.workspaces[0].chats[0].title, "title-19");
  assert.equal(loaded.workspaces[0].chats[0].messages.length, 1, "message must not be duplicated");
});

test("CHARACTERIZATION (known gap): workspace fields are last-write-wins; a stale snapshot overwrites newer edits", { skip }, async () => {
  const user = await newUser(); const ws = uid("ws");
  await repo.saveState(user.id, stateOf([workspace(ws, { name: "v1" })]));
  await repo.saveState(user.id, stateOf([workspace(ws, { name: "v2-newer" })]));
  await repo.saveState(user.id, stateOf([workspace(ws, { name: "v1-stale" })]));
  const loaded = await repo.loadState(user.id);
  assert.equal(loaded.workspaces[0].name, "v1-stale", "if this fails, a version check was added: update TEST_RESULTS.md and this test");
});

test("AURIX task lifecycle: ownership, single approval, queue claim, completion, assistant message, retry/failure", { skip }, async () => {
  const a = await newUser(); const b = await newUser(); const ws = uid("ws"); const c = uid("chat");
  await repo.saveState(a.id, stateOf([workspace(ws, { chats: [chat(c)] })]));
  await assert.rejects(repo.createTask(b.id, { workspaceId: ws, conversationId: c, inputText: "x" }), (e) => e.status === 404);
  const created = await repo.createTask(a.id, { workspaceId: ws, conversationId: c, inputText: "Research X" });
  assert.equal(created.status, "awaiting_approval");
  await assert.rejects(repo.approveTask(b.id, created.id, "approve"), (e) => e.status === 404);
  await pool.execute("UPDATE aurix_tasks SET status='cancelled' WHERE status='queued' AND id<>?", [created.id]);
  assert.equal((await repo.approveTask(a.id, created.id, "approve")).status, "queued");
  await assert.rejects(repo.approveTask(a.id, created.id, "approve"), (e) => e.status === 409);
  const claimed = await repo.claimTask("worker-test", 60);
  assert.equal(claimed?.id, created.id);
  await repo.completeTask(claimed, "Result text");
  const loaded = await repo.loadState(a.id);
  const messages = loaded.workspaces[0].chats[0].messages;
  assert.ok(messages.some((m) => m.role === "assistant" && m.text === "Result text"));
  assert.equal((await repo.listTasks(a.id, ws))[0].status, "completed");
  assert.deepEqual(await repo.listTasks(b.id, ws), []);

  const t2 = await repo.createTask(a.id, { workspaceId: ws, conversationId: c, inputText: "Fail me" });
  await repo.approveTask(a.id, t2.id, "approve");
  let claim = await repo.claimTask("worker-test", 60);
  await repo.failTask(claim, Object.assign(new Error("temporary"), { code: "llm_upstream_error", retryable: true }));
  assert.equal((await repo.listTasks(a.id, ws)).find((t) => t.id === t2.id).status, "queued", "retryable failure is re-queued");
  await pool.execute("UPDATE aurix_tasks SET next_attempt_at=NULL WHERE id=?", [t2.id]);
  claim = await repo.claimTask("worker-test", 60);
  await repo.failTask(claim, Object.assign(new Error("permanent"), { code: "llm_not_configured", retryable: false }));
  const failed = (await repo.listTasks(a.id, ws)).find((t) => t.id === t2.id);
  assert.equal(failed.status, "failed"); assert.equal(failed.failureCode, "llm_not_configured");
  const t3 = await repo.createTask(a.id, { workspaceId: ws, conversationId: c, inputText: "Reject me" });
  assert.equal((await repo.approveTask(a.id, t3.id, "reject")).status, "cancelled");
});

test("deleteAllWorkspaceData removes only the caller's data", { skip }, async () => {
  const a = await newUser(); const b = await newUser();
  await repo.saveState(a.id, stateOf([workspace(uid("ws"), { chats: [chat(uid("chat"))] })]));
  await repo.saveState(b.id, stateOf([workspace(uid("ws"), { chats: [chat(uid("chat"))] })]));
  await repo.deleteAllWorkspaceData(a.id);
  assert.equal((await repo.loadState(a.id)).workspaces.length, 0);
  assert.equal((await repo.loadState(b.id)).workspaces[0].chats.length, 1);
});
