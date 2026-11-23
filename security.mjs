import { createHash, createHmac, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";

export const SESSION_COOKIE = "webdev_app_session";
export const OAUTH_NONCE_COOKIE = "worldex_oauth_nonce";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const b64url = (value) => Buffer.from(value).toString("base64url");

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signSessionJwt({ openId, appId, secret, nowSeconds = Math.floor(Date.now() / 1000), sid = randomUUID() }) {
  if (!openId || !appId || !secret) throw new Error("Session signing configuration is incomplete");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ appId, openId, sid, iat: nowSeconds, exp: nowSeconds + SESSION_MAX_AGE_SECONDS }));
  const content = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(content).digest("base64url");
  return { token: `${content}.${signature}`, sid, expiresAt: new Date((nowSeconds + SESSION_MAX_AGE_SECONDS) * 1000) };
}

export function verifyPlatformJwt(token, { secret, appId, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (typeof token !== "string" || token.length > 8192 || !secret || !appId) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header; let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch { return null; }
  if (header?.alg !== "HS256" || payload?.appId !== appId || typeof payload.openId !== "string" || !payload.openId || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds) return null;
  const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (!constantTimeEqual(expected, parts[2])) return null;
  return payload;
}

export function csrfTokenForSession(sessionId, tokenHash, secret) {
  return createHmac("sha256", secret).update(`csrf:${sessionId}:${tokenHash}`).digest("base64url");
}

export function originAllowed(origin, { allowedOrigins = "", previewSuffixes = [".manus.computer"], allowLocal = true } = {}) {
  if (typeof origin !== "string" || origin.length > 512) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
  const exact = allowedOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  if (exact.includes(origin)) return true;
  if (allowLocal && ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:") return true;
  return url.protocol === "https:" && previewSuffixes.some((suffix) => url.hostname.endsWith(suffix));
}

export function parseOAuthState(state) {
  if (typeof state !== "string" || state.length > 4096) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (typeof parsed?.redirectUri !== "string" || typeof parsed?.nonce !== "string") return null;
    return parsed;
  } catch { return null; }
}

export function buildOAuthState(redirectUri, nonce) {
  return b64url(JSON.stringify({ redirectUri, nonce }));
}

export function makeCookie(name, value, { secure, sameSite = secure ? "None" : "Lax", maxAge, httpOnly = true } = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`, "Path=/", "Priority=High"];
  if (httpOnly) attributes.push("HttpOnly");
  if (secure) attributes.push("Secure");
  attributes.push(`SameSite=${sameSite}`);
  if (Number.isFinite(maxAge)) attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return attributes.join("; ");
}

/**
 * Browsers omit the Origin header on same-origin GET/HEAD requests, which is how the SPA calls
 * /api/auth/me and GET /api/state. Those reads have no side effects and the response cannot be read
 * cross-origin (CORS is enforced above). A missing Origin is therefore tolerated for safe methods only,
 * and only when fetch metadata does not say the request is cross-site. Mutations always need Origin + CSRF.
 */
export function isTrustedSafeRead({ method, secFetchSite }) {
  if (method !== "GET" && method !== "HEAD") return false;
  return secFetchSite === undefined || secFetchSite === "same-origin" || secFetchSite === "none";
}
