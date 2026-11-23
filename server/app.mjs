import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { constantTimeEqual, csrfTokenForSession, isTrustedSafeRead, makeCookie, OAUTH_NONCE_COOKIE, parseOAuthState, SESSION_COOKIE, sha256 } from "./security.mjs";
import { authError } from "./auth-service.mjs";
import { ValidationError, parseAppState, parseTaskRequest } from "./validation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const cookieValue = (request, name) => {
  const prefix = `${name}=`;
  for (const item of (request.headers.cookie ?? "").split(";")) {
    const value = item.trim();
    if (value.startsWith(prefix)) { try { return decodeURIComponent(value.slice(prefix.length)); } catch { return null; } }
  }
  return null;
};
const json = (response, status, body) => response.status(status).json(body);

export function createApp({ repo, auth, provider, connections, env = process.env, logger = console, staticDirectory = resolvePath(root, "dist") }) {
  if (!repo || !auth) throw new Error("Repository and authentication service are required");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    const origin = req.get("Origin");
    if (origin) {
      if (!auth.requireOrigin) return json(res, 403, { error: { code: "origin_not_allowed", message: "Origin is not allowed" } });
      try { auth.requireOrigin(origin); } catch (error) { return json(res, error.status ?? 403, { error: { code: error.code ?? "origin_not_allowed", message: error.message } }); }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-CSRF-Token");
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: "1mb", strict: true }));

  const rate = async (request, response, key, limit, windowSeconds) => {
    const identity = request.ip || request.socket.remoteAddress || "unknown";
    try {
      const bucket = sha256(`${key}:${identity}`);
      const result = await repo.consumeRateLimit(bucket, limit, windowSeconds);
      if (!result.allowed) { response.setHeader("Retry-After", String(windowSeconds)); json(response, 429, { error: { code: "rate_limited", message: "Too many requests. Try again shortly." } }); return false; }
      return true;
    } catch (error) {
      logger.error?.("Rate limiter unavailable", { code: error?.code ?? "rate_limit_store_error" });
      json(response, 503, { error: { code: "rate_limit_unavailable", message: "Request temporarily unavailable" } });
      return false;
    }
  };

  const loadAuth = async (request, required = true) => {
    const token = cookieValue(request, SESSION_COOKIE);
    const authContext = await auth.resolveSession(token, request.get("Origin"), { safeRead: isTrustedSafeRead({ method: request.method, secFetchSite: request.get("Sec-Fetch-Site") }) });
    if (!authContext && required) throw authError(401, "authentication_required", "Sign in to continue");
    request.auth = authContext;
    return authContext;
  };
  const requireMutation = (request) => auth.verifyMutation({ origin: request.get("Origin"), csrfHeader: request.get("X-CSRF-Token"), auth: request.auth });
  const run = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

  app.get("/api/health", run(async (_req, res) => {
    await repo.health();
    json(res, 200, { status: "ok", database: "ready" });
  }));
  app.get("/api/status", (_req, res) => json(res, 200, { authConfigured: Boolean(env.MANUS_PROJECT_ID && env.MANUS_OAUTH_API_URL && env.MANUS_OAUTH_PORTAL_URL && env.MANUS_JWT_SECRET), databaseConfigured: Boolean(env.DATABASE_URL), llmConfigured: Boolean(provider?.llmConfigured), llmVerified: false, authProvider: "Manus OAuth", localPasswords: false, connectorTokenEncryptionConfigured: Boolean(connections?.isEncryptionConfigured), connectorProviders: connections?.listProviders().map(({id,name,configured,supportedScopes})=>({id,name,configured,supportedScopes})) ?? [] }));

  app.post("/api/auth/oauth/start", run(async (req, res) => {
    if (!(await rate(req, res, "oauth-start", 10, 600))) return;
    const started = auth.startOAuth(req.get("Origin"));
    res.setHeader("Set-Cookie", makeCookie(OAUTH_NONCE_COOKIE, started.nonce, { secure: started.secure, maxAge: 300 }));
    json(res, 200, { authorizationUrl: started.authorizationUrl });
  }));
  app.get("/auth/callback", run(async (req,res) => {
    if (!(await rate(req,res,"manus-oauth-browser-callback",10,600))) return;
    const state=typeof req.query.state==="string"?req.query.state:"";
    const parsed=parseOAuthState(state);
    if (!parsed || typeof parsed.redirectUri!=="string") throw authError(400,"oauth_state_invalid","The sign-in response could not be verified");
    let origin;
    try {
      const redirect=new URL(parsed.redirectUri);
      origin=redirect.origin;
      if (redirect.href!==`${origin}/auth/callback`) throw new Error("redirect mismatch");
      auth.requireOrigin(origin);
    } catch { throw authError(400,"oauth_redirect_invalid","The sign-in redirect is not allowed"); }
    const nonceCookie=cookieValue(req,OAUTH_NONCE_COOKIE);
    if (!constantTimeEqual(parsed.nonce,nonceCookie??"")) throw authError(400,"oauth_state_mismatch","The sign-in response could not be verified");
    if (typeof req.query.error==="string") {
      res.setHeader("Set-Cookie",makeCookie(OAUTH_NONCE_COOKIE,"",{secure:new URL(origin).protocol==="https:",maxAge:0}));
      const failed=new URL("/",origin); failed.searchParams.set("worldex_auth","failed");
      return res.redirect(303,failed.toString());
    }
    const result=await auth.finishOAuth({code:req.query.code,state,nonceCookie,origin});
    const secure=result.secure;
    res.setHeader("Set-Cookie",[
      makeCookie(SESSION_COOKIE,result.token,{secure,maxAge:auth.sessionMaxAgeSeconds}),
      makeCookie(OAUTH_NONCE_COOKIE,"",{secure,maxAge:0}),
    ]);
    const success=new URL("/",origin); success.searchParams.set("worldex_auth","connected");
    return res.redirect(303,success.toString());
  }));
  app.post("/api/auth/oauth/callback", run(async (req, res) => {
    if (!(await rate(req, res, "oauth-callback", 10, 600))) return;
    const result = await auth.finishOAuth({ code: req.body?.code, state: req.body?.state, nonceCookie: cookieValue(req, OAUTH_NONCE_COOKIE), origin: req.get("Origin") });
    const cookie = makeCookie(SESSION_COOKIE, result.token, { secure: result.secure, maxAge: auth.sessionMaxAgeSeconds });
    const cleared = makeCookie(OAUTH_NONCE_COOKIE, "", { secure: result.secure, maxAge: 0 });
    res.setHeader("Set-Cookie", [cookie, cleared]);
    json(res, 200, { authenticated: true, user: result.user, csrfToken: result.csrfToken });
  }));
  app.get("/api/auth/me", run(async (req, res) => {
    const current = await loadAuth(req, false);
    json(res, 200, current ? { authenticated: true, user: current.user, csrfToken: current.csrfToken } : { authenticated: false });
  }));
  app.post("/api/auth/logout", run(async (req, res) => {
    const current = await loadAuth(req, true);
    requireMutation(req);
    await auth.logout(current);
    const secure = new URL(current.session.origin).protocol === "https:";
    res.setHeader("Set-Cookie", makeCookie(SESSION_COOKIE, "", { secure, maxAge: 0 }));
    json(res, 200, { ok: true });
  }));

  app.get("/api/connections/providers", run(async (req,res) => {
    await loadAuth(req,true);
    if (!connections) throw authError(503,"connectors_unavailable","Provider connections are not configured");
    json(res,200,{providers:connections.listProviders()});
  }));
  app.get("/api/connections", run(async (req,res) => {
    await loadAuth(req,true);
    if (!connections) throw authError(503,"connectors_unavailable","Provider connections are not configured");
    const workspaceId=typeof req.query.workspaceId==="string"?req.query.workspaceId:"";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    if (!(await repo.ownsWorkspace(req.auth.user.id,workspaceId))) throw authError(404,"workspace_not_found","Workspace not found");
    json(res,200,{connections:await repo.listProviderConnections(req.auth.user.id,workspaceId)});
  }));
  app.post("/api/connections/:provider/start", run(async (req,res) => {
    await loadAuth(req,true); requireMutation(req);
    if (!connections) throw authError(503,"connectors_unavailable","Provider connections are not configured");
    if (!(await rate(req,res,`connector-start:${req.auth.user.id}`,10,600))) return;
    const workspaceId=typeof req.body?.workspaceId==="string"?req.body.workspaceId:"";
    const scopes=req.body?.scopes;
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    if (!(await repo.ownsWorkspace(req.auth.user.id,workspaceId))) throw authError(404,"workspace_not_found","Workspace not found");
    const started=await connections.start({userId:req.auth.user.id,workspaceId,providerId:req.params.provider,requestedScopes:scopes,redirectOrigin:req.auth.session.origin});
    json(res,200,started);
  }));
  app.get("/api/connections/oauth/callback/:provider", run(async (req,res) => {
    if (!connections) throw authError(503,"connectors_unavailable","Provider connections are not configured");
    const state=typeof req.query.state==="string"?req.query.state:"";
    const transaction=await connections.getTransaction(state);
    if (!transaction || transaction.provider!==req.params.provider) throw authError(400,"oauth_state_invalid","The authorization request expired or could not be verified");
    const token=cookieValue(req,SESSION_COOKIE);
    const callbackAuth=await auth.resolveSession(token,transaction.redirectOrigin,{safeRead:true});
    if (!callbackAuth || callbackAuth.user.id!==transaction.userId) {
      await connections.cancel(state);
      const returnUrl=new URL("/",transaction.redirectOrigin);
      returnUrl.searchParams.set("worldex_oauth","signin");
      return res.redirect(303,returnUrl.toString());
    }
    const returnUrl=new URL("/",transaction.redirectOrigin);
    returnUrl.searchParams.set("worldex_oauth","failed");
    returnUrl.searchParams.set("provider",transaction.provider);
    if (typeof req.query.error==="string") {
      await connections.cancel(state);
      returnUrl.searchParams.set("reason","denied");
      return res.redirect(303,returnUrl.toString());
    }
    try {
      await connections.complete({providerId:transaction.provider,state,code:req.query.code});
      returnUrl.searchParams.set("worldex_oauth","connected");
      returnUrl.searchParams.delete("reason");
    } catch (error) {
      logger.warn?.("Provider authorization did not complete",{provider:transaction.provider,code:error?.code??"oauth_failed"});
      returnUrl.searchParams.set("reason","setup");
    }
    return res.redirect(303,returnUrl.toString());
  }));
  app.delete("/api/connections/:connectionId", run(async (req,res) => {
    await loadAuth(req,true); requireMutation(req);
    if (!connections) throw authError(503,"connectors_unavailable","Provider connections are not configured");
    const workspaceId=typeof req.body?.workspaceId==="string"?req.body.workspaceId:"";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    if (!(await repo.ownsWorkspace(req.auth.user.id,workspaceId))) throw authError(404,"workspace_not_found","Workspace not found");
    const revocation=await connections.revokeConnection({userId:req.auth.user.id,workspaceId,connectionId:req.params.connectionId});
    if (!(await repo.disconnectProviderConnection(req.auth.user.id,workspaceId,req.params.connectionId))) throw authError(404,"connection_not_found","Connection not found");
    json(res,200,{ok:true,providerAccessRevoked:revocation.revoked,providerRevocationSupported:revocation.supported,localTokensDeleted:true});
  }));

  app.get("/api/state", run(async (req, res) => {
    await loadAuth(req, true);
    json(res, 200, await repo.loadState(req.auth.user.id));
  }));
  app.put("/api/state", run(async (req, res) => {
    await loadAuth(req, true); requireMutation(req);
    if (!(await rate(req, res, `state-write:${req.auth.user.id}`, 120, 60))) return;
    const state = parseAppState(req.body);
    await repo.saveState(req.auth.user.id, state);
    json(res, 200, { ok: true, savedAt: new Date().toISOString() });
  }));
  app.delete("/api/state", run(async (req, res) => {
    await loadAuth(req, true); requireMutation(req);
    await repo.deleteAllWorkspaceData(req.auth.user.id);
    json(res, 200, { ok: true, version: 1, onboarded: false, activeWorkspaceId: null, workspaces: [], accessPolicies: [], crossWorkspaceOverview: false });
  }));

  app.get("/api/tasks", run(async (req, res) => {
    await loadAuth(req, true);
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    if (!(await repo.ownsWorkspace(req.auth.user.id, workspaceId))) throw authError(404, "workspace_not_found", "Workspace not found");
    json(res, 200, { tasks: await repo.listTasks(req.auth.user.id, workspaceId), providerConfigured: Boolean(provider?.llmConfigured), providerVerified: false });
  }));
  app.post("/api/tasks", run(async (req, res) => {
    await loadAuth(req, true); requireMutation(req);
    if (!(await rate(req, res, `task-create:${req.auth.user.id}`, 10, 60))) return;
    if (!provider?.llmConfigured) throw authError(503, "llm_not_configured", "AURIX requires a configured server-side model provider");
    const input = parseTaskRequest(req.body);
    if (!(await repo.ownsWorkspace(req.auth.user.id, input.workspaceId))) throw authError(404, "workspace_not_found", "Workspace not found");
    json(res, 201, await repo.createTask(req.auth.user.id, input));
  }));
  app.post("/api/tasks/:taskId/approval", run(async (req, res) => {
    await loadAuth(req, true); requireMutation(req);
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "reject") throw new ValidationError("decision must be approve or reject");
    if (!(await rate(req, res, `task-approval:${req.auth.user.id}`, 60, 60))) return;
    if (decision === "approve" && !provider?.llmConfigured) throw authError(503, "llm_not_configured", "AURIX provider is not configured; task was not queued");
    json(res, 200, await repo.approveTask(req.auth.user.id, req.params.taskId, decision));
  }));

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = Number.isInteger(error?.status) ? error.status : error?.type === "entity.parse.failed" ? 400 : 500;
    const code = error?.code ?? (status === 400 ? "invalid_request" : status === 500 ? "internal_error" : "request_rejected");
    if (status >= 500) logger.error?.("WORLDEX API failure", { code });
    json(res, status, { error: { code, message: status >= 500 ? "Request could not be completed" : error.message } });
  });

  if (staticDirectory) {
    app.use(express.static(staticDirectory, { index: "index.html", dotfiles: "deny", fallthrough: true }));
    app.get(/^(?!\/api\/).*/, (_req, res, next) => res.sendFile(resolvePath(staticDirectory, "index.html"), (error) => error && next(error)));
  }
  return app;
}

export function parseCookie(request, name) { return cookieValue(request, name); }
