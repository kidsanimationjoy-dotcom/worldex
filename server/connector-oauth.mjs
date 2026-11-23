import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

const SCOPE_ORDER = ["Profile", "Content", "Publishing", "Analytics", "Messages"];
const providerDefinitions = {
  google: {
    name: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: {
      Profile: ["openid", "email", "profile"],
      Content: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
      Publishing: ["https://www.googleapis.com/auth/drive.file"],
      Analytics: ["https://www.googleapis.com/auth/analytics.readonly"],
      Messages: ["https://www.googleapis.com/auth/gmail.readonly"],
    },
    extraAuthorizationParams: { access_type: "offline", include_granted_scopes: "true", prompt: "consent" },
    identify: (profile) => ({ accountId: profile.sub, label: profile.email || profile.name || "Google account" }),
  },
  github: {
    name: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: { Profile: ["read:user", "user:email"] },
    extraAuthorizationParams: { allow_signup: "true" },
    identify: (profile) => ({ accountId: String(profile.id ?? ""), label: profile.login || profile.name || "GitHub account" }),
  },
  linkedin: {
    name: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    scopes: {
      Profile: ["openid", "profile", "email"],
      Publishing: ["w_member_social"],
    },
    extraAuthorizationParams: {},
    identify: (profile) => ({ accountId: profile.sub, label: profile.email || profile.name || "LinkedIn account" }),
  },
};

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
const b64url = (value) => Buffer.from(value).toString("base64url");
const safeEqualText = (left, right) => {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  return a.length === b.length && a.length > 0 && a.equals(b);
};
function encryptionKey(env) {
  const raw = env.WORLDEX_TOKEN_ENCRYPTION_KEY;
  if (typeof raw !== "string" || !raw) return null;
  let key;
  try {
    if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
    else key = Buffer.from(raw.replace(/^base64:/, ""), "base64");
  } catch { return null; }
  return key.length === 32 ? key : null;
}

export function encryptSecret(value, key) {
  if (typeof value !== "string" || !value || !Buffer.isBuffer(key) || key.length !== 32) throw new Error("Token encryption is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptSecret(value, key) {
  if (typeof value !== "string" || !Buffer.isBuffer(key) || key.length !== 32) throw new Error("Token encryption is not configured");
  const [version, ivPart, tagPart, bodyPart, extra] = value.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !bodyPart || extra !== undefined) throw new Error("Encrypted token format is invalid");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bodyPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Encrypted token could not be authenticated");
  }
}

function providerConfig(id, definition, env, key, callbackOrigin) {
  const prefix = `WORLDEX_OAUTH_${id.toUpperCase()}_`;
  const clientId = env[`${prefix}CLIENT_ID`];
  const clientSecret = env[`${prefix}CLIENT_SECRET`];
  const configured = Boolean(clientId && clientSecret && key && callbackOrigin);
  return { id, ...definition, clientId, clientSecret, configured };
}

async function readJson(response, providerName, operation) {
  let body;
  try { body = await response.json(); } catch { throw fail(502, "provider_invalid_response", `${providerName} returned an invalid response during ${operation}`); }
  if (!response.ok || body?.error || !body || typeof body !== "object") {
    throw fail(502, "provider_request_failed", `${providerName} could not complete the authorization request`);
  }
  return body;
}

export function createConnectorOAuthService({ repo, env = process.env, fetchImpl = fetch, now = () => Date.now(), uuid = randomUUID }) {
  if (!repo) throw new Error("A repository is required for connector OAuth");
  const key = encryptionKey(env);
  const configs = Object.fromEntries(Object.entries(providerDefinitions).map(([id, definition]) => [id, providerConfig(id, definition, env, key, true)]));

  function listProviders() {
    return Object.values(configs).map((item) => ({
      id: item.id,
      name: item.name,
      configured: item.configured,
      supportedScopes: Object.keys(item.scopes),
    }));
  }

  async function start({ userId, workspaceId, providerId, requestedScopes, redirectOrigin }) {
    const config = configs[providerId];
    if (!config) throw fail(404, "provider_not_supported", "This provider is not supported yet");
    if (!config.configured) throw fail(503, "provider_not_configured", "This integration is not enabled by WORLDEX yet");
    if (!Array.isArray(requestedScopes) || requestedScopes.length < 1 || requestedScopes.length > 5) throw fail(400, "invalid_scopes", "Choose at least one permission group");
    const scopes = [...new Set(requestedScopes)];
    if (!scopes.includes("Profile") || scopes.some((scope) => !SCOPE_ORDER.includes(scope) || !config.scopes[scope])) {
      throw fail(400, "invalid_scopes", "The requested permission groups are not available for this provider");
    }
    let origin;
    try {
      const url = new URL(redirectOrigin);
      if (url.origin !== redirectOrigin || !["https:", "http:"].includes(url.protocol) || (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("bad origin");
      origin = url.origin;
    } catch { throw fail(400, "invalid_redirect_origin", "The WORLDEX application origin is invalid"); }

    const redirectUri = `${origin}/api/connections/oauth/callback/${providerId}`;
    const state = b64url(randomBytes(32));
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const requestedProviderScopes = [...new Set(scopes.flatMap((scope) => config.scopes[scope]))];
    const stateHash = createHash("sha256").update(state).digest("hex");
    const expiresAt = new Date(now() + 10 * 60 * 1000);
    await repo.createOAuthTransaction({
      stateHash, userId, workspaceId, provider: providerId, redirectOrigin: origin, redirectUri,
      scopes, verifierCiphertext: encryptSecret(verifier, key), expiresAt,
    });

    const url = new URL(config.authorizeUrl);
    url.search = new URLSearchParams({
      response_type: "code", client_id: config.clientId, redirect_uri: redirectUri,
      scope: requestedProviderScopes.join(" "), state, code_challenge: challenge,
      code_challenge_method: "S256", ...config.extraAuthorizationParams,
    }).toString();
    return { authorizationUrl: url.toString(), expiresAt: expiresAt.toISOString() };
  }

  async function getTransaction(state) {
    if (typeof state !== "string" || state.length < 32 || state.length > 256) return null;
    const stateHash = createHash("sha256").update(state).digest("hex");
    return repo.getOAuthTransaction(stateHash);
  }

  async function cancel(state) {
    if (typeof state !== "string" || state.length < 32 || state.length > 256) return false;
    return repo.deleteOAuthTransaction(createHash("sha256").update(state).digest("hex"));
  }

  async function complete({ providerId, state, code }) {
    if (typeof code !== "string" || code.length < 1 || code.length > 4096) throw fail(400, "invalid_code", "The provider authorization code is invalid");
    const transaction = await getTransaction(state);
    if (!transaction || transaction.provider !== providerId) throw fail(400, "oauth_state_invalid", "The authorization request expired or could not be verified");
    if (Date.parse(transaction.expiresAt) <= now()) {
      await cancel(state);
      throw fail(400, "oauth_state_expired", "The authorization request expired. Please try connecting again");
    }
    if (!key) throw fail(503, "token_encryption_not_configured", "WORLDEX secure token storage is not configured");
    const config = configs[providerId];
    if (!config?.configured) throw fail(503, "provider_not_configured", "This integration is not enabled by WORLDEX yet");
    const consumed = await repo.deleteOAuthTransaction(transaction.stateHash);
    if (!consumed) throw fail(400, "oauth_state_used", "This authorization response has already been used");

    const verifier = decryptSecret(transaction.verifierCiphertext, key);
    const form = new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: transaction.redirectUri,
      client_id: config.clientId, client_secret: config.clientSecret, code_verifier: verifier,
    });
    const tokenResponse = await readJson(await fetchImpl(config.tokenUrl, {
      method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    }), config.name, "token exchange");
    if (typeof tokenResponse.access_token !== "string" || !tokenResponse.access_token) throw fail(502, "provider_token_missing", `${config.name} did not return an access token`);

    const profileResponse = await readJson(await fetchImpl(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenResponse.access_token}`, Accept: "application/json", "User-Agent": "WORLDEX" },
    }), config.name, "account lookup");
    const identity = config.identify(profileResponse);
    if (!identity.accountId || typeof identity.accountId !== "string") throw fail(502, "provider_identity_missing", `${config.name} did not return a stable account identifier`);

    const providerScopes = typeof tokenResponse.scope === "string"
      ? tokenResponse.scope.split(/[ ,]+/).filter(Boolean)
      : transaction.scopes.flatMap((scope) => config.scopes[scope]);
    const expiresAt = Number.isFinite(Number(tokenResponse.expires_in)) && Number(tokenResponse.expires_in) > 0
      ? new Date(now() + Number(tokenResponse.expires_in) * 1000)
      : null;
    const connection = await repo.saveProviderConnection({
      id: uuid(), userId: transaction.userId, workspaceId: transaction.workspaceId, provider: providerId,
      providerAccountId: identity.accountId, accountLabel: String(identity.label || config.name).slice(0, 160),
      scopeCategories: transaction.scopes, providerScopes, accessTokenCiphertext: encryptSecret(tokenResponse.access_token, key),
      refreshTokenCiphertext: typeof tokenResponse.refresh_token === "string" ? encryptSecret(tokenResponse.refresh_token, key) : null,
      tokenType: typeof tokenResponse.token_type === "string" ? tokenResponse.token_type.slice(0, 32) : "Bearer",
      expiresAt,
    });
    return connection;
  }

  async function getAccessToken({ userId, workspaceId, connectionId, requiredScope }) {
    const saved = await repo.getProviderConnectionSecrets(userId,workspaceId,connectionId);
    if (!saved || saved.status !== "connected" || !saved.accessTokenCiphertext) throw fail(404,"connection_not_found","Connected account was not found");
    if (requiredScope && !saved.scopeCategories.includes(requiredScope)) throw fail(403,"connection_scope_missing","This account was not authorized for the requested permission");
    let current=saved;
    if (current.expiresAt && Date.parse(current.expiresAt)<=now()+60_000) {
      if (!current.refreshTokenCiphertext) throw fail(409,"connection_reauthorization_required","This provider session expired. Reconnect the account to continue");
      const config=configs[current.provider];
      if (!config?.configured) throw fail(503,"provider_not_configured","This integration is not enabled by WORLDEX yet");
      try {
        const refreshToken=decryptSecret(current.refreshTokenCiphertext,key);
        const response=await readJson(await fetchImpl(config.tokenUrl,{
          method:"POST",headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded"},
          body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken,client_id:config.clientId,client_secret:config.clientSecret}),
        }),config.name,"token refresh");
        if (typeof response.access_token!=="string" || !response.access_token) throw fail(502,"provider_token_missing","Provider did not return a refreshed access token");
        const expiresAt=Number.isFinite(Number(response.expires_in))&&Number(response.expires_in)>0?new Date(now()+Number(response.expires_in)*1000):null;
        const nextRefresh=typeof response.refresh_token==="string"?response.refresh_token:refreshToken;
        const nextAccessCiphertext=encryptSecret(response.access_token,key);
        await repo.updateProviderConnectionTokens({
          id:current.id,userId,workspaceId,accessTokenCiphertext:nextAccessCiphertext,
          refreshTokenCiphertext:encryptSecret(nextRefresh,key),providerScopes:typeof response.scope==="string"?response.scope.split(/[ ,]+/).filter(Boolean):[],
          tokenType:typeof response.token_type==="string"?response.token_type.slice(0,32):"Bearer",expiresAt,
        });
        current={...current,accessTokenCiphertext:nextAccessCiphertext,expiresAt:expiresAt?.toISOString()??null};
      } catch(error) {
        if (error?.code==="provider_request_failed" || error?.code==="provider_invalid_response") {
          throw fail(409,"connection_reauthorization_required","WORLDEX could not renew this provider session. Reconnect the account to continue");
        }
        throw error;
      }
    }
    return { provider:current.provider, accessToken:decryptSecret(current.accessTokenCiphertext,key), scopeCategories:current.scopeCategories };
  }

  return { listProviders, start, getTransaction, cancel, complete, getAccessToken, isEncryptionConfigured: Boolean(key) };
}
