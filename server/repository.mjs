import { randomUUID } from "node:crypto";

const iso = (value) => value == null ? undefined : new Date(value).toISOString();
const sqlDate = (value) => new Date(value).toISOString().slice(0, 23).replace("T", " ");
// Prepared statements bind one scalar per "?", so IN lists must be expanded explicitly (never bind an array).
const marks = (list) => list.map(() => "?").join(",");
const json = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "string") { try { return JSON.parse(value); } catch { return fallback; } }
  return value;
};

export function createMysqlRepository(pool) {
  return {
    async getOrCreateUser({ provider = "manus", openId, email = null, displayName = "WORLDEX operator" }) {
      const id = randomUUID();
      await pool.execute("INSERT INTO users (id, provider, provider_subject, email, display_name) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE email=COALESCE(VALUES(email), email), display_name=VALUES(display_name), updated_at=UTC_TIMESTAMP(3)", [id, provider, openId, email, displayName]);
      const [rows] = await pool.execute("SELECT id, provider, provider_subject, email, display_name, cross_workspace_overview FROM users WHERE provider=? AND provider_subject=? LIMIT 1", [provider, openId]);
      return mapUser(rows[0]);
    },
    async getUserById(id) {
      const [rows] = await pool.execute("SELECT id, provider, provider_subject, email, display_name, cross_workspace_overview FROM users WHERE id=? LIMIT 1", [id]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async health() {
      await pool.query("SELECT 1 AS ready");
      return true;
    },
    async ownsWorkspace(userId, workspaceId) {
      const [rows] = await pool.execute("SELECT id FROM workspaces WHERE id=? AND user_id=? LIMIT 1", [workspaceId, userId]);
      return rows.length === 1;
    },
    async createSession({ id, userId, tokenHash, csrfHash, origin, expiresAt }) {
      await pool.execute("INSERT INTO app_sessions (id,user_id,token_hash,csrf_hash,origin,expires_at) VALUES (?,?,?,?,?,?)", [id, userId, tokenHash, csrfHash, origin, sqlDate(expiresAt)]);
    },
    async getSessionByTokenHash(tokenHash) {
      const [rows] = await pool.execute("SELECT id,user_id,token_hash,csrf_hash,origin,expires_at,revoked_at FROM app_sessions WHERE token_hash=? LIMIT 1", [tokenHash]);
      const row = rows[0];
      return row ? { id: row.id, userId: row.user_id, tokenHash: row.token_hash, csrfHash: row.csrf_hash, origin: row.origin, expiresAt: iso(row.expires_at), revokedAt: row.revoked_at ? iso(row.revoked_at) : null } : null;
    },
    async createPreviewSession({ id, userId, tokenHash, csrfHash, origin, expiresAt }) {
      await pool.execute("INSERT IGNORE INTO app_sessions (id,user_id,token_hash,csrf_hash,origin,expires_at) VALUES (?,?,?,?,?,?)", [id, userId, tokenHash, csrfHash, origin, sqlDate(expiresAt)]);
      return this.getSessionByTokenHash(tokenHash);
    },
    async bindSessionOrigin(id, origin) {
      await pool.execute("UPDATE app_sessions SET origin=? WHERE id=? AND origin=''", [origin, id]);
      const [rows] = await pool.execute("SELECT origin FROM app_sessions WHERE id=?", [id]);
      return rows[0]?.origin ?? null;
    },
    async touchSession(id) { await pool.execute("UPDATE app_sessions SET last_seen_at=UTC_TIMESTAMP(3) WHERE id=? AND revoked_at IS NULL", [id]); },
    async revokeSession(tokenHash, userId) {
      const [result] = await pool.execute("UPDATE app_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE token_hash=? AND user_id=? AND revoked_at IS NULL", [tokenHash, userId]);
      return result.affectedRows > 0;
    },
    async createOAuthTransaction(transaction) {
      await pool.execute("DELETE FROM oauth_transactions WHERE expires_at<=UTC_TIMESTAMP(3)");
      await pool.execute(
        "INSERT INTO oauth_transactions (state_hash,user_id,workspace_id,provider,redirect_origin,redirect_uri,scopes,verifier_ciphertext,expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [transaction.stateHash,transaction.userId,transaction.workspaceId,transaction.provider,transaction.redirectOrigin,transaction.redirectUri,JSON.stringify(transaction.scopes),transaction.verifierCiphertext,sqlDate(transaction.expiresAt)],
      );
    },
    async getOAuthTransaction(stateHash) {
      const [rows] = await pool.execute("SELECT state_hash,user_id,workspace_id,provider,redirect_origin,redirect_uri,scopes,verifier_ciphertext,expires_at FROM oauth_transactions WHERE state_hash=? AND expires_at>UTC_TIMESTAMP(3) LIMIT 1", [stateHash]);
      const row=rows[0];
      return row ? {
        stateHash:row.state_hash,userId:row.user_id,workspaceId:row.workspace_id,provider:row.provider,
        redirectOrigin:row.redirect_origin,redirectUri:row.redirect_uri,scopes:json(row.scopes,[]),
        verifierCiphertext:row.verifier_ciphertext,expiresAt:iso(row.expires_at),
      } : null;
    },
    async deleteOAuthTransaction(stateHash) {
      const [result]=await pool.execute("DELETE FROM oauth_transactions WHERE state_hash=?", [stateHash]);
      return result.affectedRows>0;
    },
    async saveProviderConnection(connection) {
      await pool.execute(
        `INSERT INTO provider_connections
          (id,user_id,workspace_id,provider,provider_account_id,account_label,scope_categories,provider_scopes,access_token_ciphertext,refresh_token_ciphertext,token_type,expires_at,status,connected_at,disconnected_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'connected',UTC_TIMESTAMP(3),NULL)
         ON DUPLICATE KEY UPDATE account_label=VALUES(account_label),scope_categories=VALUES(scope_categories),provider_scopes=VALUES(provider_scopes),
          access_token_ciphertext=VALUES(access_token_ciphertext),refresh_token_ciphertext=VALUES(refresh_token_ciphertext),
          token_type=VALUES(token_type),expires_at=VALUES(expires_at),status='connected',updated_at=UTC_TIMESTAMP(3),disconnected_at=NULL`,
        [connection.id,connection.userId,connection.workspaceId,connection.provider,connection.providerAccountId,connection.accountLabel,JSON.stringify(connection.scopeCategories),JSON.stringify(connection.providerScopes),connection.accessTokenCiphertext,connection.refreshTokenCiphertext,connection.tokenType,connection.expiresAt?sqlDate(connection.expiresAt):null],
      );
      const [rows]=await pool.execute(
        "SELECT id,provider,provider_account_id,account_label,scope_categories,provider_scopes,status,expires_at,connected_at,updated_at FROM provider_connections WHERE user_id=? AND workspace_id=? AND provider=? AND provider_account_id=? LIMIT 1",
        [connection.userId,connection.workspaceId,connection.provider,connection.providerAccountId],
      );
      return mapProviderConnection(rows[0]);
    },
    async listProviderConnections(userId, workspaceId) {
      const [rows]=await pool.execute(
        "SELECT id,provider,provider_account_id,account_label,scope_categories,provider_scopes,status,expires_at,connected_at,updated_at FROM provider_connections WHERE user_id=? AND workspace_id=? ORDER BY connected_at DESC",
        [userId,workspaceId],
      );
      return rows.map(mapProviderConnection);
    },
    async disconnectProviderConnection(userId, workspaceId, connectionId) {
      const connection=await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows]=await connection.execute("SELECT id,provider FROM provider_connections WHERE id=? AND user_id=? AND workspace_id=? AND status='connected' FOR UPDATE", [connectionId,userId,workspaceId]);
        if (!rows.length) { await connection.commit(); return false; }
        await connection.execute("UPDATE provider_connections SET status='disconnected',access_token_ciphertext=NULL,refresh_token_ciphertext=NULL,disconnected_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND workspace_id=?", [connectionId,userId,workspaceId]);
        await connection.execute("INSERT INTO audit_events (user_id,workspace_id,entity_type,entity_id,action,detail,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))", [userId,workspaceId,"provider_connection",connectionId,"disconnected",JSON.stringify({provider:rows[0].provider,localTokensDeleted:true})]);
        await connection.commit();
        return true;
      } catch(error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async loadState(userId) {
      const [userRows] = await pool.execute("SELECT cross_workspace_overview,active_workspace_id FROM users WHERE id=?", [userId]);
      if (!userRows.length) throw forbidden("Account not found");
      const [workspaceRows] = await pool.execute("SELECT * FROM workspaces WHERE user_id=? ORDER BY created_at ASC", [userId]);
      const ids = workspaceRows.map((w) => w.id);
      if (!ids.length) return { version: 1, onboarded: false, activeWorkspaceId: null, workspaces: [], accessPolicies: [], crossWorkspaceOverview: Boolean(userRows[0].cross_workspace_overview) };
      const [chatRows] = await pool.execute(`SELECT * FROM conversations WHERE user_id=? AND workspace_id IN (${marks(ids)}) ORDER BY updated_at DESC`, [userId, ...ids]);
      const chatIds = chatRows.map((row) => row.id);
      const [messageRows] = chatIds.length ? await pool.execute(`SELECT * FROM messages WHERE user_id=? AND workspace_id IN (${marks(ids)}) AND conversation_id IN (${marks(chatIds)}) ORDER BY created_at ASC`, [userId, ...ids, ...chatIds]) : [[]];
      const [projectRows] = await pool.execute(`SELECT * FROM projects WHERE user_id=? AND workspace_id IN (${marks(ids)})`, [userId, ...ids]);
      const [taskRows] = await pool.execute(`SELECT id,workspace_id,title,status FROM workspace_tasks WHERE user_id=? AND workspace_id IN (${marks(ids)})`, [userId, ...ids]);
      const [fileRows] = await pool.execute(`SELECT id,workspace_id,name,created_at FROM workspace_files WHERE user_id=? AND workspace_id IN (${marks(ids)})`, [userId, ...ids]);
      const [activityRows] = await pool.execute(`SELECT id,workspace_id,label,created_at FROM workspace_activity WHERE user_id=? AND workspace_id IN (${marks(ids)}) ORDER BY created_at DESC`, [userId, ...ids]);
      const chatsByWorkspace = group(chatRows, "workspace_id");
      const messagesByChat = group(messageRows, "conversation_id");
      const projectsByWorkspace = group(projectRows, "workspace_id");
      const tasksByWorkspace = group(taskRows, "workspace_id");
      const filesByWorkspace = group(fileRows, "workspace_id");
      const activityByWorkspace = group(activityRows, "workspace_id");
      const workspaces = workspaceRows.map((row) => ({
        id: row.id, name: row.name, kind: row.kind, intent: row.intent, description: row.description,
        goals: json(row.goals, []), country: row.country, currency: row.currency, accent: row.accent, logo: row.logo,
        createdAt: iso(row.created_at),
        chats: (chatsByWorkspace.get(row.id) ?? []).map((chat) => ({ id: chat.id, title: chat.title, createdAt: iso(chat.created_at), updatedAt: iso(chat.updated_at), archivedAt: chat.archived_at ? iso(chat.archived_at) : undefined, state: chat.status, messages: (messagesByChat.get(chat.id) ?? []).map((m) => ({ id: m.id, role: m.role, text: m.body, createdAt: iso(m.created_at), status: m.status })) })),
        projects: (projectsByWorkspace.get(row.id) ?? []).map((p) => ({ id: p.id, title: p.title, type: p.project_type, description: p.description, targets: json(p.targets, []), createdAt: iso(p.created_at), status: p.status })),
        tasks: (tasksByWorkspace.get(row.id) ?? []).map((t) => ({ id: t.id, title: t.title, state: t.status })),
        files: (filesByWorkspace.get(row.id) ?? []).map((f) => ({ id: f.id, name: f.name, createdAt: iso(f.created_at) })),
        assistantMemory: json(row.assistant_memory, []), activity: (activityByWorkspace.get(row.id) ?? []).map((a) => ({ id: a.id, label: a.label, createdAt: iso(a.created_at) })),
        accountIds: [],
      }));
      const [grantRows] = await pool.execute(`SELECT * FROM sharing_grants WHERE user_id=? AND owner_workspace_id IN (${marks(ids)}) ORDER BY created_at DESC`, [userId, ...ids]);
      const grantIds = grantRows.map((g) => g.id);
      const [targetRows] = grantIds.length ? await pool.execute(`SELECT grant_id,workspace_id FROM sharing_grant_targets WHERE user_id=? AND grant_id IN (${marks(grantIds)})`, [userId, ...grantIds]) : [[]];
      const [scopeRows] = grantIds.length ? await pool.execute(`SELECT grant_id,scope FROM sharing_grant_scopes WHERE grant_id IN (${marks(grantIds)})`, [...grantIds]) : [[]];
      const targets = group(targetRows, "grant_id"); const scopes = group(scopeRows, "grant_id");
      return {
        version: 1, onboarded: true, activeWorkspaceId: workspaces.some((w) => w.id === userRows[0].active_workspace_id) ? userRows[0].active_workspace_id : workspaces[0]?.id ?? null, workspaces,
        accessPolicies: grantRows.map((g) => ({ id: g.id, ownerWorkspaceId: g.owner_workspace_id, provider: g.provider, accountLabel: g.account_label, targetWorkspaceIds: (targets.get(g.id) ?? []).map((t) => t.workspace_id), shareWithAll: Boolean(g.share_with_all), scopes: (scopes.get(g.id) ?? []).map((s) => s.scope), createdAt: iso(g.created_at), revokedAt: g.revoked_at ? iso(g.revoked_at) : undefined })),
        crossWorkspaceOverview: Boolean(userRows[0].cross_workspace_overview),
      };
    },
    async saveState(userId, state) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
        const workspaceIds = state.workspaces.map((w) => w.id);
        if (workspaceIds.length) {
          const [existing] = await connection.execute(`SELECT id,user_id FROM workspaces WHERE id IN (${marks(workspaceIds)}) FOR UPDATE`, workspaceIds);
          if (existing.some((row) => row.user_id !== userId)) throw forbidden("A submitted workspace is owned by another account");
        }
        await connection.execute("UPDATE users SET cross_workspace_overview=?,active_workspace_id=? WHERE id=?", [state.crossWorkspaceOverview ? 1 : 0, state.activeWorkspaceId, userId]);
        for (const w of state.workspaces) {
          await connection.execute(`INSERT INTO workspaces (id,user_id,name,kind,intent,description,goals,country,currency,accent,logo,assistant_memory,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE name=VALUES(name),kind=VALUES(kind),intent=VALUES(intent),description=VALUES(description),goals=VALUES(goals),country=VALUES(country),currency=VALUES(currency),accent=VALUES(accent),logo=VALUES(logo),assistant_memory=VALUES(assistant_memory),updated_at=UTC_TIMESTAMP(3)`,
            [w.id,userId,w.name,w.kind,w.intent,w.description,JSON.stringify(w.goals),w.country,w.currency,w.accent,w.logo,JSON.stringify(w.assistantMemory),sqlDate(w.createdAt)]);
        }
        for (const w of state.workspaces) {
          const chatIds = w.chats.map((c) => c.id);
          await assertNoForeign(connection, "conversations", chatIds, userId, w.id, "Chat belongs to another workspace or account");
          await assertNoForeign(connection, "projects", w.projects.map((p) => p.id), userId, w.id, "Project belongs to another workspace or account");
          await assertNoForeign(connection, "workspace_tasks", w.tasks.map((t) => t.id), userId, w.id, "Task belongs to another workspace or account");
          await assertNoForeign(connection, "workspace_files", w.files.map((f) => f.id), userId, w.id, "File belongs to another workspace or account");
          await assertNoForeign(connection, "workspace_activity", w.activity.map((a) => a.id), userId, w.id, "Activity belongs to another workspace or account");
          for (const chat of w.chats) {
            const updated = sqlDate(chat.updatedAt);
            await connection.execute(`INSERT INTO conversations (id,user_id,workspace_id,title,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?)
              ON DUPLICATE KEY UPDATE title=IF(VALUES(updated_at)>=updated_at,VALUES(title),title),status=IF(VALUES(updated_at)>=updated_at,VALUES(status),status),archived_at=IF(VALUES(updated_at)>=updated_at,VALUES(archived_at),archived_at),updated_at=GREATEST(updated_at,VALUES(updated_at))`,
              [chat.id,userId,w.id,chat.title,chat.state,sqlDate(chat.createdAt),updated,chat.archivedAt ? sqlDate(chat.archivedAt) : null]);
            const messageIds = chat.messages.map((m) => m.id);
            await assertNoForeign(connection, "messages", messageIds, userId, w.id, "Message belongs to another workspace or account");
            for (const message of chat.messages) await connection.execute(`INSERT INTO messages (id,user_id,workspace_id,conversation_id,role,body,status,created_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE body=body`, [message.id,userId,w.id,chat.id,message.role,message.text,message.status,sqlDate(message.createdAt)]);
          }
          for (const project of w.projects) await connection.execute(`INSERT INTO projects (id,user_id,workspace_id,title,project_type,description,targets,status,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),description=VALUES(description),targets=VALUES(targets)`, [project.id,userId,w.id,project.title,project.type,project.description,JSON.stringify(project.targets),project.status,sqlDate(project.createdAt)]);
          for (const task of w.tasks) await connection.execute(`INSERT INTO workspace_tasks (id,user_id,workspace_id,title,status) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),status=VALUES(status)`, [task.id,userId,w.id,task.title,task.state]);
          for (const file of w.files) await connection.execute("INSERT INTO workspace_files (id,user_id,workspace_id,name,created_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name)", [file.id,userId,w.id,file.name,sqlDate(file.createdAt)]);
          for (const event of w.activity) await connection.execute("INSERT IGNORE INTO workspace_activity (id,user_id,workspace_id,label,created_at) VALUES (?,?,?,?,?)", [event.id,userId,w.id,event.label,sqlDate(event.createdAt)]);
        }
        const grantIds = state.accessPolicies.map((g) => g.id);
        if (grantIds.length) {
          const [existingGrants] = await connection.execute(`SELECT id,user_id FROM sharing_grants WHERE id IN (${marks(grantIds)}) FOR UPDATE`, grantIds);
          if (existingGrants.some((row) => row.user_id !== userId)) throw forbidden("A sharing intent belongs to another account");
        }
        for (const grant of state.accessPolicies) {
          const [owners] = await connection.execute(`SELECT id FROM workspaces WHERE user_id=? AND id IN (${marks([grant.ownerWorkspaceId,...grant.targetWorkspaceIds])})`, [userId,grant.ownerWorkspaceId,...grant.targetWorkspaceIds]);
          if (new Set(owners.map((r) => r.id)).size !== new Set([grant.ownerWorkspaceId,...grant.targetWorkspaceIds]).size) throw forbidden("Sharing intent target is not owned by this account");
          await connection.execute(`INSERT INTO sharing_grants (id,user_id,owner_workspace_id,provider,account_label,share_with_all,status,external_enforced,created_at,revoked_at) VALUES (?,?,?,?,?,?,?,0,?,?) ON DUPLICATE KEY UPDATE account_label=VALUES(account_label),revoked_at=COALESCE(revoked_at,VALUES(revoked_at)),status=IF(revoked_at IS NOT NULL OR VALUES(revoked_at) IS NOT NULL,'revoked','intent')`, [grant.id,userId,grant.ownerWorkspaceId,grant.provider,grant.accountLabel,grant.shareWithAll?1:0,grant.revokedAt?"revoked":"intent",sqlDate(grant.createdAt),grant.revokedAt?sqlDate(grant.revokedAt):null]);
          for (const targetId of grant.targetWorkspaceIds) await connection.execute("INSERT IGNORE INTO sharing_grant_targets (grant_id,user_id,workspace_id) VALUES (?,?,?)", [grant.id,userId,targetId]);
          for (const scope of grant.scopes) await connection.execute("INSERT IGNORE INTO sharing_grant_scopes (grant_id,scope) VALUES (?,?)", [grant.id,scope]);
          if (grant.revokedAt) await connection.execute("INSERT INTO audit_events (user_id,workspace_id,entity_type,entity_id,action,detail,created_at) VALUES (?,?,?,?,?,?,?)", [userId,grant.ownerWorkspaceId,"sharing_intent",grant.id,"revoked",JSON.stringify({externalEnforced:false}),sqlDate(grant.revokedAt)]);
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async deleteAllWorkspaceData(userId) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id FROM workspaces WHERE user_id=? FOR UPDATE", [userId]);
        await connection.execute("INSERT INTO audit_events (user_id,entity_type,entity_id,action,detail,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(3))", [userId,"account","workspace-data","deleted_all",JSON.stringify({workspaceCount:rows.length})]);
        await connection.execute("DELETE FROM aurix_tasks WHERE user_id=?", [userId]);
        await connection.execute("DELETE FROM workspaces WHERE user_id=?", [userId]);
        await connection.execute("UPDATE users SET cross_workspace_overview=0 WHERE id=?", [userId]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async createTask(userId, { workspaceId, conversationId, inputText }) {
      const id = `task-${randomUUID()}`;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id FROM conversations WHERE id=? AND user_id=? AND workspace_id=? FOR UPDATE", [conversationId,userId,workspaceId]);
        if (!rows.length) throw notFound("Conversation not found in this workspace");
        await connection.execute("INSERT INTO aurix_tasks (id,user_id,workspace_id,conversation_id,input_text,status,max_attempts,created_at,updated_at) VALUES (?,?,?,?,?,'awaiting_approval',3,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))", [id,userId,workspaceId,conversationId,inputText]);
        await connection.execute("INSERT INTO audit_events (user_id,workspace_id,entity_type,entity_id,action,detail,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))", [userId,workspaceId,"aurix_task",id,"approval_requested",JSON.stringify({inputChars:inputText.length})]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
      return { id, workspaceId, conversationId, status: "awaiting_approval", attempts: 0 };
    },
    async approveTask(userId, taskId, decision) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT * FROM aurix_tasks WHERE id=? AND user_id=? FOR UPDATE", [taskId,userId]);
        const task = rows[0];
        if (!task) throw notFound("Task not found");
        if (task.status !== "awaiting_approval") throw conflict("Task is not awaiting approval");
        await connection.execute("INSERT INTO task_approvals (task_id,user_id,decision,decided_at) VALUES (?,?,?,UTC_TIMESTAMP(3))", [taskId,userId,decision]);
        const status = decision === "approve" ? "queued" : "cancelled";
        await connection.execute("UPDATE aurix_tasks SET status=?,approved_at=IF(?='approve',UTC_TIMESTAMP(3),approved_at),next_attempt_at=IF(?='approve',UTC_TIMESTAMP(3),NULL),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?", [status,decision,decision,taskId,userId]);
        await connection.execute("INSERT INTO audit_events (user_id,workspace_id,entity_type,entity_id,action,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(3))", [userId,task.workspace_id,"aurix_task",taskId,decision==="approve"?"approved":"rejected"]);
        await connection.commit();
        return { id: taskId, status };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async listTasks(userId, workspaceId) {
      const [rows] = await pool.execute("SELECT id,workspace_id,conversation_id,kind,status,result_text,failure_code,failure_message,attempts,created_at,updated_at FROM aurix_tasks WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC LIMIT 100", [userId,workspaceId]);
      return rows.map((row) => ({ id:row.id,workspaceId:row.workspace_id,conversationId:row.conversation_id,kind:row.kind,status:row.status,resultText:row.result_text,failureCode:row.failure_code,failureMessage:row.failure_message,attempts:Number(row.attempts),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at) }));
    },
    async claimTask(workerId, leaseSeconds = 90) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("UPDATE aurix_tasks SET status='failed',failure_code='lease_expired',failure_message='Worker lease expired after the retry limit',updated_at=UTC_TIMESTAMP(3) WHERE status='running' AND lease_until<UTC_TIMESTAMP(3) AND attempts>=max_attempts");
        const [rows] = await connection.query("SELECT * FROM aurix_tasks WHERE ((status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=UTC_TIMESTAMP(3))) OR (status='running' AND lease_until<UTC_TIMESTAMP(3))) AND attempts<max_attempts ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
        const task = rows[0];
        if (!task) { await connection.commit(); return null; }
        const attempt = Number(task.attempts) + 1;
        await connection.execute("UPDATE aurix_tasks SET status='running',attempts=?,lease_owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND),updated_at=UTC_TIMESTAMP(3) WHERE id=?", [attempt,workerId,leaseSeconds,task.id]);
        await connection.execute("INSERT INTO task_attempts (task_id,attempt_no,status,started_at) VALUES (?,?,'running',UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE status='running',started_at=UTC_TIMESTAMP(3)", [task.id,attempt]);
        await connection.commit();
        return { id:task.id,userId:task.user_id,workspaceId:task.workspace_id,conversationId:task.conversation_id,inputText:task.input_text,attempt,maxAttempts:Number(task.max_attempts),workerId };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async completeTask(task, resultText) {
      const connection=await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("UPDATE aurix_tasks SET status='completed',result_text=?,failure_code=NULL,failure_message=NULL,lease_until=NULL,lease_owner=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running' AND lease_owner=?", [resultText,task.id,task.workerId]);
        await connection.execute("UPDATE task_attempts SET status='completed',finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND attempt_no=?", [task.id,task.attempt]);
        await connection.execute("INSERT INTO messages (id,user_id,workspace_id,conversation_id,role,body,status,created_at) VALUES (?,?,?,?,? ,?,'completed',UTC_TIMESTAMP(3))", [`aurix-${task.id}`,task.userId,task.workspaceId,task.conversationId,"assistant",resultText]);
        await connection.execute("UPDATE conversations SET updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND workspace_id=?", [task.conversationId,task.userId,task.workspaceId]);
        await connection.execute("INSERT INTO audit_events (user_id,workspace_id,entity_type,entity_id,action,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(3))", [task.userId,task.workspaceId,"aurix_task",task.id,"completed"]);
        await connection.commit();
      } catch(error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async failTask(task, error) {
      const transient = Boolean(error?.retryable) && task.attempt < task.maxAttempts;
      const backoffSeconds = Math.min(300, 2 ** task.attempt * 5);
      const status = transient ? "queued" : "failed";
      const connection=await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("UPDATE aurix_tasks SET status=?,failure_code=?,failure_message=?,next_attempt_at=IF(?='queued',DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND),NULL),lease_until=NULL,lease_owner=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running' AND lease_owner=?", [status,error?.code??"provider_error",String(error?.message??"Provider request failed").slice(0,500),status,backoffSeconds,task.id,task.workerId]);
        await connection.execute("UPDATE task_attempts SET status='failed',finished_at=UTC_TIMESTAMP(3),failure_code=?,failure_message=? WHERE task_id=? AND attempt_no=?", [error?.code??"provider_error",String(error?.message??"Provider request failed").slice(0,500),task.id,task.attempt]);
        await connection.execute("INSERT INTO audit_events (user_id,workspace_id,entity_type,entity_id,action,detail,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))", [task.userId,task.workspaceId,"aurix_task",task.id,transient?"retry_scheduled":"failed",JSON.stringify({attempt:task.attempt,code:error?.code??"provider_error"})]);
        await connection.commit();
      } catch(error2) { await connection.rollback(); throw error2; }
      finally { connection.release(); }
    },
    async consumeRateLimit(bucketKey, limit, windowSeconds) {
      await pool.execute(`INSERT INTO rate_limit_buckets (bucket_key,hits,reset_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${Number(windowSeconds)} SECOND)) ON DUPLICATE KEY UPDATE hits=IF(reset_at<=UTC_TIMESTAMP(3),1,hits+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${Number(windowSeconds)} SECOND),reset_at)`, [bucketKey]);
      const [rows] = await pool.execute("SELECT hits,reset_at FROM rate_limit_buckets WHERE bucket_key=?", [bucketKey]);
      return { allowed:Number(rows[0]?.hits??0)<=limit, resetAt:rows[0]?.reset_at };
    },
    async setTaskWorkerInfo() {},
  };
}

function mapProviderConnection(row) {
  if (!row) return null;
  return {
    id:row.id,provider:row.provider,providerAccountId:row.provider_account_id,accountLabel:row.account_label,
    scopeCategories:json(row.scope_categories,[]),providerScopes:json(row.provider_scopes,[]),status:row.status,
    expiresAt:row.expires_at?iso(row.expires_at):null,connectedAt:iso(row.connected_at),updatedAt:iso(row.updated_at),
  };
}
function group(rows, key) { const map = new Map(); for (const row of rows) { const list = map.get(row[key]) ?? []; list.push(row); map.set(row[key], list); } return map; }
async function assertNoForeign(connection, table, ids, userId, workspaceId, message) {
  if (!ids.length) return;
  const [rows] = await connection.execute(`SELECT id,user_id,workspace_id FROM ${table} WHERE id IN (${marks(ids)}) FOR UPDATE`, ids);
  if (rows.some((row) => row.user_id !== userId || row.workspace_id !== workspaceId)) throw forbidden(message);
}
function mapUser(row) { return { id:row.id,provider:row.provider,openId:row.provider_subject,email:row.email,displayName:row.display_name,crossWorkspaceOverview:Boolean(row.cross_workspace_overview) }; }
export function forbidden(message) { const error=new Error(message); error.status=403; error.code="forbidden"; return error; }
export function notFound(message) { const error=new Error(message); error.status=404; error.code="not_found"; return error; }
export function conflict(message) { const error=new Error(message); error.status=409; error.code="conflict"; return error; }
