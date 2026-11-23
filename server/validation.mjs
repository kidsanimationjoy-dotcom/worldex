const intents = new Set(["already-business", "start-business", "online-work", "create-products", "manage-clients"]);
const kinds = new Set(["Business", "Startup", "Freelance", "Creator", "Game studio", "Client services", "Personal work"]);
const accents = new Set(["blue", "violet", "mint", "amber", "rose"]);
const scopes = new Set(["Profile", "Content", "Publishing", "Analytics", "Messages"]);
const chatStates = new Set(["draft", "awaiting approval", "running", "completed", "failed"]);
const taskStates = new Set(["draft", "awaiting approval", "running", "completed", "failed"]);

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = "ValidationError"; this.status = 400; }
}
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const text = (v, max, field, { optional = false, trim = true } = {}) => {
  if (optional && (v === undefined || v === null)) return "";
  if (typeof v !== "string" || v.length > max || (!optional && !v.trim())) throw new ValidationError(`${field} is invalid`);
  return trim ? v.trim() : v;
};
const arr = (v, max, field) => {
  if (!Array.isArray(v) || v.length > max) throw new ValidationError(`${field} must be an array with at most ${max} entries`);
  return v;
};
const date = (v, field, optional = false) => {
  if (optional && (v === undefined || v === null || v === "")) return undefined;
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v))) throw new ValidationError(`${field} must be an ISO timestamp`);
  return new Date(v).toISOString();
};
function uniqueIds(values, field) {
  const ids = values.map((value) => text(value, 100, field));
  if (new Set(ids).size !== ids.length) throw new ValidationError(`${field} contains duplicate IDs`);
  return ids;
}

export function parseAppState(raw) {
  if (!object(raw) || raw.version !== 1) throw new ValidationError("Unsupported state version");
  const workspaces = arr(raw.workspaces, 50, "workspaces").map((input) => {
    if (!object(input)) throw new ValidationError("Invalid workspace");
    const id = text(input.id, 80, "workspace.id");
    const kind = text(input.kind, 40, "workspace.kind");
    const intent = text(input.intent, 40, "workspace.intent");
    const accent = text(input.accent, 20, "workspace.accent");
    if (!kinds.has(kind) || !intents.has(intent) || !accents.has(accent)) throw new ValidationError("Invalid workspace type, intent, or accent");
    const chats = arr(input.chats, 200, "workspace.chats").map((chat) => {
      if (!object(chat)) throw new ValidationError("Invalid chat");
      const state = text(chat.state, 40, "chat.state");
      if (!chatStates.has(state)) throw new ValidationError("Invalid chat state");
      return {
        id: text(chat.id, 100, "chat.id"), title: text(chat.title || "Untitled conversation", 160, "chat.title"),
        createdAt: date(chat.createdAt, "chat.createdAt"), updatedAt: date(chat.updatedAt, "chat.updatedAt"),
        archivedAt: date(chat.archivedAt, "chat.archivedAt", true), state,
        messages: arr(chat.messages, 500, "chat.messages").flatMap((message) => {
          if (!object(message)) throw new ValidationError("Invalid message");
          // Assistant messages are written only by the server worker. Never echo client copies
          // back into persistence, but allow state snapshots containing them to sync normally.
          if (message.role === "assistant" && message.status === "completed") return [];
          if (message.role !== "user" || message.status !== "draft") throw new ValidationError("Only user-authored local draft messages can be imported");
          return [{ id: text(message.id, 100, "message.id"), role: "user", text: text(message.text, 5000, "message.text", { trim: false }), createdAt: date(message.createdAt, "message.createdAt"), status: "draft" }];
        }),
      };
    });
    uniqueIds(chats.map((chat) => chat.id), "chat IDs");
    const projects = arr(input.projects ?? [], 200, "workspace.projects").map((project) => {
      if (!object(project) || !["Game brief", "Digital product"].includes(project.type) || project.status !== "Local draft") throw new ValidationError("Invalid local project brief");
      return { id: text(project.id, 100, "project.id"), title: text(project.title, 160, "project.title"), type: project.type, description: text(project.description ?? "", 2000, "project.description", { optional: true, trim: false }), targets: arr(project.targets ?? [], 10, "project.targets").map((v) => text(v, 100, "project.target")), createdAt: date(project.createdAt, "project.createdAt"), status: "Local draft" };
    });
    const tasks = arr(input.tasks ?? [], 200, "workspace.tasks").map((task) => {
      if (!object(task)) throw new ValidationError("Invalid workspace task");
      const state = text(task.state, 40, "task.state");
      if (!taskStates.has(state)) throw new ValidationError("Invalid workspace task state");
      return { id: text(task.id, 100, "task.id"), title: text(task.title, 200, "task.title"), state };
    });
    const files = arr(input.files ?? [], 200, "workspace.files").map((file) => {
      if (!object(file)) throw new ValidationError("Invalid workspace file reference");
      return { id: text(file.id, 100, "file.id"), name: text(file.name, 200, "file.name"), createdAt: date(file.createdAt, "file.createdAt") };
    });
    const activity = arr(input.activity ?? [], 500, "workspace.activity").map((event) => {
      if (!object(event)) throw new ValidationError("Invalid activity record");
      return { id: text(event.id, 100, "activity.id"), label: text(event.label, 240, "activity.label"), createdAt: date(event.createdAt, "activity.createdAt") };
    });
    return {
      id, name: text(input.name, 80, "workspace.name"), kind, intent,
      description: text(input.description ?? "", 1000, "workspace.description", { optional: true }),
      goals: arr(input.goals ?? [], 20, "workspace.goals").map((v) => text(v, 200, "workspace.goal")),
      country: text(input.country ?? "", 100, "workspace.country", { optional: true }),
      currency: text(input.currency ?? "", 3, "workspace.currency", { optional: true }).toUpperCase(),
      accent, logo: text(input.logo ?? "", 8, "workspace.logo", { optional: true }),
      createdAt: date(input.createdAt, "workspace.createdAt"), chats, projects, tasks, files,
      assistantMemory: arr(input.assistantMemory ?? [], 100, "workspace.assistantMemory").map((v) => text(v, 1000, "assistantMemory.item")),
      activity, accountIds: arr(input.accountIds ?? [], 50, "workspace.accountIds").map((v) => text(v, 100, "workspace.accountId")),
    };
  });
  uniqueIds(workspaces.map((workspace) => workspace.id), "workspace IDs");
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const activeWorkspaceId = raw.activeWorkspaceId === null ? null : text(raw.activeWorkspaceId, 80, "activeWorkspaceId");
  if (activeWorkspaceId && !workspaceIds.has(activeWorkspaceId)) throw new ValidationError("Active workspace is not in the submitted state");
  const accessPolicies = arr(raw.accessPolicies ?? [], 200, "accessPolicies").map((policy) => {
    if (!object(policy)) throw new ValidationError("Invalid connection sharing intent");
    const ownerWorkspaceId = text(policy.ownerWorkspaceId, 80, "grant.ownerWorkspaceId");
    const targetWorkspaceIds = uniqueIds(arr(policy.targetWorkspaceIds ?? [], 50, "grant.targetWorkspaceIds"), "grant target IDs");
    if (!workspaceIds.has(ownerWorkspaceId) || targetWorkspaceIds.some((id) => !workspaceIds.has(id))) throw new ValidationError("Grant owner and targets must belong to this account state");
    const requestedScopes = arr(policy.scopes ?? [], 5, "grant.scopes").map((scope) => text(scope, 32, "grant.scope"));
    if (requestedScopes.some((scope) => !scopes.has(scope))) throw new ValidationError("Grant contains an unsupported scope");
    return { id: text(policy.id, 100, "grant.id"), ownerWorkspaceId, provider: text(policy.provider, 80, "grant.provider"), accountLabel: text(policy.accountLabel, 160, "grant.accountLabel"), targetWorkspaceIds, shareWithAll: Boolean(policy.shareWithAll), scopes: [...new Set(requestedScopes)], createdAt: date(policy.createdAt, "grant.createdAt"), revokedAt: date(policy.revokedAt, "grant.revokedAt", true) };
  });
  uniqueIds(accessPolicies.map((grant) => grant.id), "grant IDs");
  return { version: 1, onboarded: workspaces.length > 0, activeWorkspaceId: activeWorkspaceId ?? workspaces[0]?.id ?? null, workspaces, accessPolicies, crossWorkspaceOverview: Boolean(raw.crossWorkspaceOverview) };
}

export function parseTaskRequest(raw) {
  if (!object(raw)) throw new ValidationError("Task request must be an object");
  return { workspaceId: text(raw.workspaceId, 80, "workspaceId"), conversationId: text(raw.conversationId, 100, "conversationId"), inputText: text(raw.inputText, 6000, "inputText") };
}
