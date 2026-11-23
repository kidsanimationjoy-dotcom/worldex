import test from "node:test";
import assert from "node:assert/strict";
import { createConnectorOAuthService, decryptSecret, encryptSecret } from "./connector-oauth.mjs";

const key = Buffer.alloc(32, 7);
const env = {
  WORLDEX_TOKEN_ENCRYPTION_KEY: key.toString("base64"),
  WORLDEX_OAUTH_GOOGLE_CLIENT_ID: "google-client",
  WORLDEX_OAUTH_GOOGLE_CLIENT_SECRET: "google-secret",
  WORLDEX_OAUTH_GITHUB_CLIENT_ID: "github-client",
  WORLDEX_OAUTH_GITHUB_CLIENT_SECRET: "github-secret",
  WORLDEX_OAUTH_LINKEDIN_CLIENT_ID: "linkedin-client",
  WORLDEX_OAUTH_LINKEDIN_CLIENT_SECRET: "linkedin-secret",
};
function fakeRepo() {
  const transactions = new Map(); const connections = [];
  return {
    transactions, connections,
    async createOAuthTransaction(tx) { transactions.set(tx.stateHash, { ...tx, expiresAt: tx.expiresAt.toISOString() }); },
    async getOAuthTransaction(hash) { return transactions.get(hash) ?? null; },
    async deleteOAuthTransaction(hash) { return transactions.delete(hash); },
    secrets:new Map(),
    async saveProviderConnection(connection) {
      const saved = { id:connection.id,provider:connection.provider,accountLabel:connection.accountLabel,scopeCategories:connection.scopeCategories,status:"connected" };
      connections.push(saved);
      this.secrets.set(saved.id,{id:saved.id,userId:connection.userId,workspaceId:connection.workspaceId,provider:connection.provider,scopeCategories:connection.scopeCategories,status:"connected",accessTokenCiphertext:connection.accessTokenCiphertext,refreshTokenCiphertext:connection.refreshTokenCiphertext,expiresAt:connection.expiresAt?.toISOString()??null});
      return saved;
    },
    async getProviderConnectionSecrets(userId,workspaceId,id) {
      const item=this.secrets.get(id);
      return item?.userId===userId && item?.workspaceId===workspaceId ? item : null;
    },
    async updateProviderConnectionTokens(update) { const current=this.secrets.get(update.id); if(current)this.secrets.set(update.id,{...current,accessTokenCiphertext:update.accessTokenCiphertext,refreshTokenCiphertext:update.refreshTokenCiphertext,expiresAt:update.expiresAt?.toISOString()??null}); },
  };
}
test("AES-256-GCM encrypts and authenticates secrets", () => {
  const encrypted = encryptSecret("secret-token", key);
  assert.notEqual(encrypted, "secret-token");
  assert.equal(decryptSecret(encrypted, key), "secret-token");
  assert.throws(() => decryptSecret(encrypted, Buffer.alloc(32, 8)), /could not be authenticated/);
});
test("provider readiness never exposes app credentials", () => {
  const service = createConnectorOAuthService({ repo:fakeRepo(), env });
  const providers = service.listProviders();
  assert.deepEqual(providers.map((p) => p.id), ["google","github","linkedin"]);
  assert.ok(providers.every((p) => p.configured));
  assert.ok(providers.every((p) => !JSON.stringify(p).includes("secret")));
});
test("start creates a one-time state transaction and PKCE authorization URL", async () => {
  const repo = fakeRepo(), service = createConnectorOAuthService({ repo, env });
  const result = await service.start({ userId:"user-1",workspaceId:"ws-1",providerId:"google",requestedScopes:["Profile","Content"],redirectOrigin:"https://worldex.example" });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), "https://worldex.example/api/connections/oauth/callback/google");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok([...repo.transactions.values()][0].verifierCiphertext.startsWith("v1."));
  assert.equal([...repo.transactions.values()][0].scopes.join(","), "Profile,Content");
});
test("start rejects unsupported permission groups and unsafe redirect origins", async () => {
  const service = createConnectorOAuthService({ repo:fakeRepo(), env });
  await assert.rejects(service.start({ userId:"u",workspaceId:"w",providerId:"github",requestedScopes:["Profile","Publishing"],redirectOrigin:"https://worldex.example" }), /not available/);
  await assert.rejects(service.start({ userId:"u",workspaceId:"w",providerId:"google",requestedScopes:["Profile"],redirectOrigin:"https://evil.example/path" }), /origin is invalid/);
});
test("complete exchanges a one-time code, reads identity, and stores only encrypted tokens", async () => {
  const repo=fakeRepo(); let tokenBody; let profileCalls=0;
  const fetchImpl=async (url,options={})=>{
    if(String(url).includes("/token")) {
      tokenBody=new URLSearchParams(options.body);
      return {ok:true,json:async()=>({access_token:"access-secret",refresh_token:"refresh-secret",expires_in:3600,scope:"openid email profile"})};
    }
    profileCalls++;
    return {ok:true,json:async()=>({sub:"google-sub-1",email:"creator@example.com",name:"Creator"})};
  };
  const service=createConnectorOAuthService({repo,env,fetchImpl});
  const started=await service.start({userId:"user-1",workspaceId:"ws-1",providerId:"google",requestedScopes:["Profile"],redirectOrigin:"https://worldex.example"});
  const state=new URL(started.authorizationUrl).searchParams.get("state");
  const connection=await service.complete({providerId:"google",state,code:"one-time-code"});
  assert.equal(connection.provider,"google");
  assert.equal(connection.accountLabel,"creator@example.com");
  assert.equal(connection.status,"connected");
  assert.equal(profileCalls,1);
  assert.equal(tokenBody.get("code_verifier") !== null,true);
  assert.equal(repo.connections.length,1);
  assert.equal(repo.connections[0].accountLabel,"creator@example.com");
  assert.ok(repo.connections[0].id);
  assert.equal(repo.transactions.size,0);
  assert.equal(service.isEncryptionConfigured,true);
});
test("callback state cannot be replayed or substituted across providers", async () => {
  const repo=fakeRepo(),service=createConnectorOAuthService({repo,env});
  const started=await service.start({userId:"u",workspaceId:"w",providerId:"github",requestedScopes:["Profile"],redirectOrigin:"https://worldex.example"});
  const state=new URL(started.authorizationUrl).searchParams.get("state");
  assert.equal(await service.getTransaction(state) !== null,true);
  await assert.rejects(service.complete({providerId:"linkedin",state,code:"code"}), /could not be verified/);
  assert.equal(await service.cancel(state),true);
  assert.equal(await service.getTransaction(state),null);
});

test("internal token access enforces scope groups and returns plaintext only to server code", async () => {
  const repo=fakeRepo();
  const service=createConnectorOAuthService({repo,env,fetchImpl:async (url)=>String(url).includes("/token")?{ok:true,json:async()=>({access_token:"opaque-access",expires_in:3600,scope:"openid email profile"})}:{ok:true,json:async()=>({sub:"subject-7",email:"private@example.com"})}});
  const started=await service.start({userId:"user-1",workspaceId:"ws-1",providerId:"google",requestedScopes:["Profile"],redirectOrigin:"https://worldex.example"});
  const state=new URL(started.authorizationUrl).searchParams.get("state");
  const saved=await service.complete({providerId:"google",state,code:"code-1"});
  const token=await service.getAccessToken({userId:"user-1",workspaceId:"ws-1",connectionId:saved.id,requiredScope:"Profile"});
  assert.equal(token.accessToken,"opaque-access");
  assert.equal(token.provider,"google");
  await assert.rejects(service.getAccessToken({userId:"user-1",workspaceId:"ws-1",connectionId:saved.id,requiredScope:"Messages"}),/not authorized/);
  await assert.rejects(service.getAccessToken({userId:"other-user",workspaceId:"ws-1",connectionId:saved.id}),/not found/);
});

test("the service stores only permission groups present in the provider token response", async () => {
  const repo=fakeRepo();
  const service=createConnectorOAuthService({
    repo,env,
    fetchImpl:async (url)=>String(url).includes("/accessToken")
      ? {ok:true,json:async()=>({access_token:"linkedin-access",expires_in:3600,scope:"openid profile email"})}
      : {ok:true,json:async()=>({sub:"linkedin-member-1",email:"member@example.com",name:"Member"})},
  });
  const started=await service.start({userId:"user-2",workspaceId:"ws-2",providerId:"linkedin",requestedScopes:["Profile","Publishing"],redirectOrigin:"https://worldex.example"});
  const state=new URL(started.authorizationUrl).searchParams.get("state");
  const saved=await service.complete({providerId:"linkedin",state,code:"linkedin-code"});
  assert.deepEqual(saved.scopeCategories,["Profile"]);
  assert.equal(saved.status,"connected");
});

test("Google disconnect revokes the refresh token at Google's OAuth revocation endpoint", async () => {
  const calls=[];
  const repo={async getProviderConnectionSecrets(){return {
    id:"connection-1",provider:"google",status:"connected",scopeCategories:["Profile"],
    accessTokenCiphertext:encryptSecret("access-token",key),refreshTokenCiphertext:encryptSecret("refresh-token",key),
  };}};
  const service=createConnectorOAuthService({repo,env,fetchImpl:async (url,options)=>{
    calls.push({url:String(url),options});
    return {ok:true,status:200};
  }});
  assert.deepEqual(await service.revokeConnection({userId:"u",workspaceId:"w",connectionId:"connection-1"}),{revoked:true,supported:true});
  assert.equal(calls[0].url,"https://oauth2.googleapis.com/revoke");
  assert.equal(new URLSearchParams(calls[0].options.body).get("token"),"refresh-token");
});
test("GitHub disconnect removes the OAuth app grant with its registered app credentials", async () => {
  let call;
  const repo={async getProviderConnectionSecrets(){return {
    id:"connection-2",provider:"github",status:"connected",scopeCategories:["Profile"],
    accessTokenCiphertext:encryptSecret("github-access",key),refreshTokenCiphertext:null,
  };}};
  const service=createConnectorOAuthService({repo,env,fetchImpl:async (url,options)=>{
    call={url:String(url),options};
    return {ok:true,status:204};
  }});
  const result=await service.revokeConnection({userId:"u",workspaceId:"w",connectionId:"connection-2"});
  assert.deepEqual(result,{revoked:true,supported:true});
  assert.match(call.url,/api\.github\.com\/applications\/github-client\/grant$/);
  assert.equal(call.options.method,"DELETE");
  assert.equal(JSON.parse(call.options.body).access_token,"github-access");
  assert.match(call.options.headers.Authorization,/^Basic /);
});
test("LinkedIn disconnect does not claim provider revocation where no supported endpoint is documented", async () => {
  const repo={async getProviderConnectionSecrets(){return {
    id:"connection-3",provider:"linkedin",status:"connected",scopeCategories:["Profile"],
    accessTokenCiphertext:encryptSecret("linkedin-access",key),refreshTokenCiphertext:null,
  };}};
  let called=false;
  const service=createConnectorOAuthService({repo,env,fetchImpl:async()=>{called=true;throw new Error("unexpected");}});
  assert.deepEqual(await service.revokeConnection({userId:"u",workspaceId:"w",connectionId:"connection-3"}),{revoked:false,supported:false});
  assert.equal(called,false);
});
