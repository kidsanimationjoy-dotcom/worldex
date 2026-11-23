import type { AppState } from "../types";

const STORAGE_KEY = "worldex.mvp.state.v1";

export function newId(prefix = "id"): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

export const blankState = (): AppState => ({
  version: 1,
  onboarded: false,
  activeWorkspaceId: null,
  workspaces: [],
  accessPolicies: [],
  crossWorkspaceOverview: false,
});

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return blankState();
    const value = parsed as Partial<AppState>;
    if (value.version !== 1 || !Array.isArray(value.workspaces)) return blankState();
    const workspaces = value.workspaces.filter((item) =>
      item && typeof item === "object" && typeof item.id === "string" &&
      typeof item.name === "string" && Array.isArray(item.chats) && Array.isArray(item.activity),
    ).map((item) => ({
      ...item,
      projects: Array.isArray(item.projects) ? item.projects : [],
      tasks: Array.isArray(item.tasks) ? item.tasks : [],
      files: Array.isArray(item.files) ? item.files : [],
      assistantMemory: Array.isArray(item.assistantMemory) ? item.assistantMemory : [],
      accountIds: Array.isArray(item.accountIds) ? item.accountIds : [],
    }));
    return {
      version: 1,
      onboarded: Boolean(value.onboarded && workspaces.length),
      activeWorkspaceId: workspaces.some((w) => w.id === value.activeWorkspaceId)
        ? value.activeWorkspaceId ?? null
        : workspaces[0]?.id ?? null,
      workspaces,
      accessPolicies: Array.isArray(value.accessPolicies) ? value.accessPolicies.map((policy) => ({
        ...policy,
        shareWithAll: Boolean(policy.shareWithAll),
        targetWorkspaceIds: Array.isArray(policy.targetWorkspaceIds) ? policy.targetWorkspaceIds : [],
        scopes: Array.isArray(policy.scopes) ? policy.scopes : [],
      })) : [],
      crossWorkspaceOverview: Boolean(value.crossWorkspaceOverview),
    };
  } catch {
    return blankState();
  }
}

export function saveState(value: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
