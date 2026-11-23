export type WorkspaceKind =
  | "Business"
  | "Startup"
  | "Freelance"
  | "Creator"
  | "Game studio"
  | "Client services"
  | "Personal work";

export type Intent =
  | "already-business"
  | "start-business"
  | "online-work"
  | "create-products"
  | "manage-clients";

export type ChatState = "draft" | "awaiting approval" | "running" | "completed" | "failed";
export type Accent = "blue" | "violet" | "mint" | "amber" | "rose";

export interface ChatMessage {
  id: string;
  role: "user";
  text: string;
  createdAt: string;
  status: "draft";
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  state: ChatState;
  messages: ChatMessage[];
}

export interface Workspace {
  id: string;
  name: string;
  kind: WorkspaceKind;
  intent: Intent;
  description: string;
  goals: string[];
  country: string;
  currency: string;
  accent: Accent;
  logo: string;
  createdAt: string;
  chats: Chat[];
  projects: ProjectRecord[];
  tasks: WorkspaceTask[];
  files: WorkspaceFile[];
  assistantMemory: string[];
  activity: Activity[];
  accountIds: string[];
}

export interface ProjectRecord {
  id: string;
  title: string;
  type: "Game brief" | "Digital product";
  description: string;
  targets: string[];
  createdAt: string;
  status: "Local draft";
}

export interface WorkspaceTask {
  id: string;
  title: string;
  state: "draft" | "awaiting approval" | "running" | "completed" | "failed";
}

export interface WorkspaceFile {
  id: string;
  name: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  label: string;
  createdAt: string;
}

export type ResourceScope = "Profile" | "Content" | "Publishing" | "Analytics" | "Messages";

/** A local policy draft/reference only. This does not authenticate or grant external API access. */
export interface AccessPolicy {
  id: string;
  ownerWorkspaceId: string;
  provider: string;
  accountLabel: string;
  targetWorkspaceIds: string[];
  shareWithAll: boolean;
  scopes: ResourceScope[];
  createdAt: string;
  revokedAt?: string;
}

export interface AppState {
  version: 1;
  onboarded: boolean;
  activeWorkspaceId: string | null;
  workspaces: Workspace[];
  accessPolicies: AccessPolicy[];
  crossWorkspaceOverview: boolean;
}

export type OpportunityCategory =
  | "Remote jobs"
  | "Freelance"
  | "Business models"
  | "Creator opportunities"
  | "Digital product ideas";

export interface Opportunity {
  id: string;
  title: string;
  category: OpportunityCategory;
  summary: string;
  source: string;
  verification: string;
  eligibility: string;
  skills: string[];
  difficulty: string;
  startupCost: string;
  timeCommitment: string;
  earningRange: string;
  earningEvidence: string;
  competition: string;
  risks: string[];
  steps: string[];
}
