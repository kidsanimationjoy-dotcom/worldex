import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import {
  Activity, AlertCircle, Archive, ArrowDownRight, ArrowRight, BadgeCheck, BookOpen,
  Building2, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3,
  Code2, Compass, Database, FileText, Film, Gamepad2, Gauge, Globe2, Grid2X2,
  Image as ImageIcon, Layers3, LayoutDashboard, Link2, LockKeyhole, Mail, Menu, MessageCircle,
  MessageSquareText, MoreHorizontal, Plus, Search, Settings2, Shield,
  ShieldAlert, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Store, Users, Video,
  Wallet, Workflow, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChatView } from "./components/ChatView";
import { Onboarding, type WorkspaceDraft } from "./components/Onboarding";
import { OpportunityFinder } from "./components/OpportunityFinder";
import { blankState, loadState, newId, saveState } from "./lib/store";
import type { AccessPolicy, Accent, Activity as ActivityItem, AppState, Chat, ProjectRecord, ResourceScope, Workspace } from "./types";

const accentMap: Record<Accent, string> = { blue: "#477bff", violet: "#8b72ff", mint: "#53d7c0", amber: "#e6b655", rose: "#df7a98" };
const iconMap: Record<string, LucideIcon> = {
  home: LayoutDashboard, chat: MessageCircle, workspaces: Grid2X2, opportunities: Compass,
  dropship: ShoppingBag, games: Gamepad2, connections: Link2, research: Search, outreach: ArrowDownRight,
  social: Globe2, ads: Activity, messages: Mail, documents: FileText, images: ImageIcon, videos: Video,
  automations: Workflow, library: BookOpen, analytics: Gauge, team: Users, settings: Settings2, status: BadgeCheck,
};

type PageKey = keyof typeof iconMap;
interface NavSection { title: string; items: { key: PageKey; label: string }[] }
const navigation: NavSection[] = [
  { title: "WORKSPACE", items: [{ key: "home", label: "Home" }, { key: "chat", label: "AURIX Chat" }, { key: "workspaces", label: "Workspaces" }, { key: "opportunities", label: "Opportunity Finder" }] },
  { title: "BUILD & GROW", items: [{ key: "dropship", label: "Dropship Studio" }, { key: "games", label: "Game Studio" }, { key: "connections", label: "Universal Connect" }] },
  { title: "GO TO MARKET", items: [{ key: "research", label: "Research" }, { key: "outreach", label: "Outreach" }, { key: "social", label: "Social" }, { key: "ads", label: "Ads" }, { key: "messages", label: "Messages" }] },
  { title: "WORKSPACE TOOLS", items: [{ key: "documents", label: "Documents" }, { key: "images", label: "Images" }, { key: "videos", label: "Videos" }, { key: "automations", label: "Schedule & Automations" }, { key: "library", label: "Library" }, { key: "analytics", label: "Analytics" }] },
  { title: "ADMIN", items: [{ key: "team", label: "Team" }, { key: "settings", label: "Settings" }, { key: "status", label: "Product status" }] },
];
const pageLabels = Object.fromEntries(navigation.flatMap((section) => section.items.map((item) => [item.key, item.label]))) as Record<PageKey, string>;

const connectionGroups = [
  { category: "Social", items: [{ name: "Instagram", note: "Publishing and insights", state: "Requires setup" }, { name: "TikTok", note: "Publishing and audience", state: "Not yet supported" }, { name: "LinkedIn", note: "Pages and posts", state: "Requires setup" }] },
  { category: "Commerce", items: [{ name: "Shopify", note: "Store, catalog and orders", state: "Requires setup" }, { name: "WooCommerce", note: "Store and product data", state: "Not yet supported" }] },
  { category: "Games", items: [{ name: "Roblox", note: "Experience publishing", state: "Not yet supported" }, { name: "Steam", note: "Release management", state: "Not yet supported" }, { name: "itch.io", note: "Game releases", state: "Not yet supported" }] },
  { category: "App Stores", items: [{ name: "Google Play", note: "Android releases", state: "Not yet supported" }, { name: "Apple App Store", note: "iOS releases", state: "Not yet supported" }] },
  { category: "Ads", items: [{ name: "Meta Ads", note: "Campaigns and reporting", state: "Requires setup" }, { name: "Google Ads", note: "Campaign data", state: "Requires setup" }] },
  { category: "Payments", items: [{ name: "Stripe", note: "Payments and products", state: "Requires setup" }, { name: "PayPal", note: "Transactions", state: "Not yet supported" }] },
  { category: "Email", items: [{ name: "Gmail", note: "Inbox access", state: "Requires setup" }] },
  { category: "CRM", items: [{ name: "HubSpot", note: "Contacts and deals", state: "Not yet supported" }] },
  { category: "Courses", items: [{ name: "Teachable", note: "Course operations", state: "Not yet supported" }] },
  { category: "Scheduling", items: [{ name: "Calendly", note: "Bookings", state: "Not yet supported" }] },
  { category: "Analytics", items: [{ name: "Google Analytics", note: "Read-only reporting", state: "Requires setup" }] },
  { category: "Storage", items: [{ name: "Google Drive", note: "File access", state: "Not yet supported" }] },
  { category: "Developer APIs", items: [{ name: "GitHub", note: "Repositories and releases", state: "Not yet supported" }] },
] as const;
const connectionCategoryNames = connectionGroups.map((item) => item.category);
const oauthProviderForConnector: Record<string, string> = {
  "Google Drive": "google", Gmail: "google", "Google Analytics": "google", GitHub: "github", LinkedIn: "linkedin",
};
const requiredScopeForConnector: Partial<Record<string, ResourceScope>> = {
  "Google Drive": "Content", Gmail: "Messages", "Google Analytics": "Analytics", LinkedIn: "Publishing",
};
const defaultScopesForConnector = (name: string): ResourceScope[] => {
  const required = requiredScopeForConnector[name];
  return required ? ["Profile", required] : ["Profile"];
};
const resourceScopes: ResourceScope[] = ["Profile", "Content", "Publishing", "Analytics", "Messages"];
const timeNow = () => new Date().toISOString();

function activity(label: string): ActivityItem { return { id: newId("evt"), label, createdAt: timeNow() }; }

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [accountAuth, setAccountAuth] = useState<"checking" | "signed-in" | "signed-out" | "unavailable">("checking");
  const [accountCsrfToken, setAccountCsrfToken] = useState("");
  const [accountWorkspaceReady, setAccountWorkspaceReady] = useState(false);
  const [accountCheckComplete, setAccountCheckComplete] = useState(false);
  const [accountSyncStatus, setAccountSyncStatus] = useState<"local" | "import" | "saving" | "saved" | "error">("local");
  const accountSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const [page, setPage] = useState<PageKey>("home");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [chatCreateRequest, setChatCreateRequest] = useState(false);
  const [saved, setSaved] = useState(true);
  const current = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null;

  const handleAccountLogout = () => {
    setAccountAuth("signed-out");
    setAccountCsrfToken("");
    setAccountWorkspaceReady(false);
    setAccountSyncStatus("local");
    setState(loadState());
    setPage("home");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("worldex_oauth") || params.has("worldex_auth")) setPage("connections");
  }, []);

  useEffect(() => {
    // Once an account workspace is active, the server is authoritative.
    // Keep the existing browser-local profile untouched as a device-only backup.
    if (accountWorkspaceReady) {
      setSaved(true);
      return;
    }
    const ok = saveState(state);
    setSaved(ok);
  }, [state, accountWorkspaceReady]);

  useEffect(() => {
    let active = true;
    const bootstrapAccount = async () => {
      try {
        const meResponse = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (meResponse.status === 401) {
          if (active) setAccountAuth("signed-out");
          return;
        }
        if (!meResponse.ok) {
          if (active) setAccountAuth("unavailable");
          return;
        }
        const me = await meResponse.json();
        if (!me.authenticated) {
          if (active) setAccountAuth("signed-out");
          return;
        }
        if (active) {
          setAccountAuth("signed-in");
          setAccountCsrfToken(typeof me.csrfToken === "string" ? me.csrfToken : "");
        }

        const stateResponse = await fetch("/api/state", { credentials: "same-origin" });
        if (!stateResponse.ok) throw new Error("Account workspace could not be loaded");
        const serverState = await stateResponse.json();
        if (!active) return;

        if (Array.isArray(serverState.workspaces) && serverState.workspaces.length > 0) {
          // Preserve any device-only work before switching to the account's server state.
          const deviceState = loadState();
          if (deviceState.workspaces.length > 0) {
            try {
              window.localStorage.setItem("worldex.mvp.device-backup.v1", JSON.stringify(deviceState));
            } catch {
              // The server copy remains safe; failure to create an optional local backup is non-fatal.
            }
          }
          setState(serverState as AppState);
          setAccountWorkspaceReady(true);
          setAccountSyncStatus("saved");
        } else {
          // Never import a browser profile automatically. The user must choose
          // "Save workspace to account" from Universal Connect.
          setAccountWorkspaceReady(false);
          setAccountSyncStatus("import");
        }
      } catch {
        if (active) {
          setAccountAuth("unavailable");
          setAccountSyncStatus("local");
        }
      } finally {
        if (active) setAccountCheckComplete(true);
      }
    };
    void bootstrapAccount();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (accountAuth !== "signed-in" || !accountWorkspaceReady || !accountCsrfToken) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setAccountSyncStatus("saving");
      accountSaveQueue.current = accountSaveQueue.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/state", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": accountCsrfToken },
            body: JSON.stringify(state),
          });
          if (response.status === 401) {
            if (active) {
              // Never persist previously server-loaded account data into the local preview
              // when the session expires. Return to the pre-existing device-local profile.
              setAccountAuth("signed-out");
              setAccountCsrfToken("");
              setAccountWorkspaceReady(false);
              setAccountSyncStatus("local");
              setState(loadState());
            }
            return;
          }
          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message ?? "Account sync failed");
          if (active) setAccountSyncStatus("saved");
        })
        .catch(() => {
          if (active) setAccountSyncStatus("error");
        });
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [state, accountAuth, accountWorkspaceReady, accountCsrfToken]);

  useEffect(() => {
    if (current) document.documentElement.style.setProperty("--workspace-accent", accentMap[current.accent]);
    else document.documentElement.style.setProperty("--workspace-accent", accentMap.blue);
  }, [current?.accent]);

  useEffect(() => {
    const switchFromOverview = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === "string") setState((previous) => previous.workspaces.some((workspace) => workspace.id === id) ? { ...previous, activeWorkspaceId: id } : previous);
      setPage("home");
    };
    const navigateFromPanel = (event: Event) => {
      const next = (event as CustomEvent<PageKey>).detail;
      if (next in iconMap) setPage(next);
    };
    const keyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || Boolean(target?.isContentEditable);
      if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setPage("chat");
        setChatCreateRequest(true);
      }
    };
    window.addEventListener("worldex:switch-workspace", switchFromOverview);
    window.addEventListener("worldex:navigate", navigateFromPanel);
    window.addEventListener("keydown", keyboardShortcut);
    return () => {
      window.removeEventListener("worldex:switch-workspace", switchFromOverview);
      window.removeEventListener("worldex:navigate", navigateFromPanel);
      window.removeEventListener("keydown", keyboardShortcut);
    };
  }, []);

  const createWorkspace = (draft: WorkspaceDraft) => {
    const id = newId("ws");
    const workspace: Workspace = {
      id, name: draft.name, kind: draft.kind, intent: draft.intent,
      description: draft.description, goals: draft.goals, country: draft.country,
      currency: draft.currency, accent: draft.accent, logo: draft.name.slice(0, 1).toUpperCase(),
      createdAt: timeNow(), chats: [], projects: [], tasks: [], files: [], assistantMemory: [],
      activity: [activity("Workspace created · isolated by default")], accountIds: [],
    };
    setState((previous) => ({ ...previous, onboarded: true, activeWorkspaceId: id, workspaces: [...previous.workspaces, workspace] }));
    setPage("home");
    setCreatingWorkspace(false);
    setMobileMenu(false);
  };

  const updateWorkspace = (workspaceId: string, update: (workspace: Workspace) => Workspace, event?: string) => {
    setState((previous) => ({
      ...previous,
      workspaces: previous.workspaces.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        const changed = update(workspace);
        return { ...changed, activity: event ? [activity(event), ...workspace.activity].slice(0, 30) : changed.activity };
      }),
    }));
  };

  const switchWorkspace = (workspaceId: string) => {
    if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) return;
    setState((previous) => ({ ...previous, activeWorkspaceId: workspaceId }));
    setPage("home");
    setCreatingWorkspace(false);
    setMobileMenu(false);
  };

  const addChat = (workspaceId: string): Chat => {
    const now = timeNow();
    const chat: Chat = { id: newId("chat"), title: `New conversation ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, createdAt: now, updatedAt: now, state: "draft", messages: [] };
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, chats: [chat, ...workspace.chats] }), "Draft conversation created");
    return chat;
  };

  const changeChat = (workspaceId: string, chatId: string, change: (chat: Chat) => Chat, label: string) => {
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, chats: workspace.chats.map((chat) => chat.id === chatId ? change(chat) : chat) }), label);
  };

  if (!accountCheckComplete) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#090B12", color: "#DDE5F5" }}>
      <p>Checking your WORLDEX account…</p>
    </div>;
  }
  if (!state.onboarded || !current) {
    return <Onboarding onCreate={createWorkspace} existingCount={state.workspaces.length} />;
  }
  if (creatingWorkspace) {
    return <Onboarding onCreate={createWorkspace} onCancel={() => setCreatingWorkspace(false)} existingCount={state.workspaces.length} />;
  }

  const handleNavigate = (next: PageKey) => { setPage(next); setMobileMenu(false); };

  return <div className="app-frame" style={{ "--workspace-accent": accentMap[current.accent] } as CSSProperties}>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><BrandMark /><span className="wordmark">WORLD<span>EX</span><small>ONE WORLD. UNLIMITED POSSIBILITIES.</small></span><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X size={16} /></button></div>
      <WorkspaceSwitcher current={current} workspaces={state.workspaces} onSwitch={switchWorkspace} onNew={() => setCreatingWorkspace(true)} />
      <button className="sidebar-new-chat" onClick={() => { setPage("chat"); setChatCreateRequest(true); setMobileMenu(false); }}><span><Plus size={15} /></span> New Chat <kbd>Ctrl/⌘ J</kbd></button>
      <nav className="main-navigation" aria-label="Main navigation">
        {navigation.map((section) => <div className="nav-section" key={section.title}><div className="nav-section-title">{section.title}</div>{section.items.map(({ key, label }) => {
          const Icon = iconMap[key];
          return <button key={key} className={`nav-item ${page === key ? "active" : ""}`} aria-current={page === key ? "page" : undefined} onClick={() => handleNavigate(key)}><Icon size={16} strokeWidth={1.8} /><span>{label}</span>{key === "connections" && <i className="nav-status-dot" />}</button>;
        })}</div>)}
      </nav>
      <div className="sidebar-bottom"><button className="aurix-mini" onClick={() => handleNavigate("chat")}><span className="aurix-avatar small"><Sparkles size={13} /></span><span><b>AURIX</b><small>AI not configured</small></span><span className="status-dot status-dot-amber" /></button><div className="sidebar-local"><span className="local-mark" /><span>{accountWorkspaceReady ? "Account workspace" : "Local preview"}</span><span className="local-separator">·</span><span>{accountWorkspaceReady ? (accountSyncStatus === "saving" ? "Saving…" : accountSyncStatus === "saved" ? "Synced" : accountSyncStatus === "error" ? "Sync failed" : "Account") : accountAuth === "signed-in" ? "Save to account" : saved ? "Saved" : "Storage unavailable"}</span></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu-button icon-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>{current.kind}</span><ChevronRight size={13} /><b>{pageLabels[page]}</b></div></div>
        <div className="topbar-right"><div className="local-badge"><span className={`status-dot ${accountWorkspaceReady ? accountSyncStatus === "error" ? "status-dot-amber" : "status-dot-mint" : "status-dot-muted"}`} /> {accountWorkspaceReady ? accountSyncStatus === "saving" ? "ACCOUNT SYNCING" : accountSyncStatus === "error" ? "SYNC NEEDS ATTENTION" : "ACCOUNT WORKSPACE" : accountAuth === "signed-in" ? "ACCOUNT IMPORT NEEDED" : "LOCAL PREVIEW"}</div><div className="topbar-divider" />
          <button className="workspace-identity" title={`Current workspace: ${current.name}`} onClick={() => setPage("workspaces")}><span className="identity-mark" style={{ background: "var(--workspace-accent)" }}>{current.logo}</span><span><b>{current.name}</b><small>{current.kind}</small></span><ChevronDown size={14} /></button>
          <button className="icon-button help-button" aria-label="Product status and help" title="Product status" onClick={() => setPage("status")}><CircleHelp size={17} /></button>
        </div>
      </header>
      <main className="content-area" key={`${page}:${current.id}`}>
        {page === "home" && <HomeView workspace={current} allWorkspaces={state.workspaces} crossOverview={state.crossWorkspaceOverview} onOpen={handleNavigate} onNewWorkspace={() => setCreatingWorkspace(true)} />}
        {page === "chat" && <ChatView workspaceId={current.id} workspaceName={current.name} chats={current.chats} csrfToken={accountCsrfToken} signedIn={accountAuth === "signed-in" && accountWorkspaceReady} createSignal={chatCreateRequest} onCreateHandled={() => setChatCreateRequest(false)} onCreate={() => addChat(current.id)} onRename={(chatId, title) => changeChat(current.id, chatId, (chat) => ({ ...chat, title, updatedAt: timeNow() }), "Conversation renamed")} onArchive={(chatId, archived) => changeChat(current.id, chatId, (chat) => ({ ...chat, archivedAt: archived ? timeNow() : undefined, updatedAt: timeNow() }), archived ? "Conversation archived" : "Conversation reopened")} />}
        {page === "workspaces" && <WorkspaceView current={current} workspaces={state.workspaces} policies={state.accessPolicies} onSwitch={switchWorkspace} onNew={() => setCreatingWorkspace(true)} onOpenSettings={() => setPage("settings")} />}
        {page === "opportunities" && <OpportunityFinder />}
        {page === "connections" && <ConnectView appState={state} activeWorkspace={current} workspaces={state.workspaces} policies={state.accessPolicies} onServerWorkspaceReady={() => { setAccountWorkspaceReady(true); setAccountSyncStatus("saved"); }} onAccountLogout={handleAccountLogout} onCreatePolicy={(policy) => setState((previous) => ({ ...previous, accessPolicies: [policy, ...previous.accessPolicies], workspaces: previous.workspaces.map((workspace) => workspace.id === policy.ownerWorkspaceId ? { ...workspace, activity: [activity(`Local access policy draft created · ${policy.provider}`), ...workspace.activity].slice(0, 30) } : workspace) }))} onRevoke={(id) => setState((previous) => { const existing = previous.accessPolicies.find((policy) => policy.id === id); return { ...previous, accessPolicies: previous.accessPolicies.map((policy) => policy.id === id ? { ...policy, revokedAt: timeNow() } : policy), workspaces: previous.workspaces.map((workspace) => existing?.ownerWorkspaceId === workspace.id ? { ...workspace, activity: [activity(`Local access policy draft revoked · ${existing.provider}`), ...workspace.activity].slice(0, 30) } : workspace) }; })} />}
        {page === "settings" && <SettingsView workspace={current} state={state} updateWorkspace={updateWorkspace} setOverview={(value) => setState((previous) => ({ ...previous, crossWorkspaceOverview: value }))} onReset={() => { void (async () => {
          const accountMode = accountWorkspaceReady;
          const prompt = accountMode
            ? "Delete all WORLDEX workspace data from your signed-in account? This cannot be undone."
            : "Delete the locally saved WORLDEX data in this browser? This cannot be undone.";
          if (!window.confirm(prompt)) return;
          if (accountMode) {
            setAccountSyncStatus("saving");
            try {
              const response = await fetch("/api/state", {
                method: "DELETE",
                credentials: "same-origin",
                headers: { "X-CSRF-Token": accountCsrfToken },
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error?.message ?? "Account workspace data could not be deleted");
            } catch (error) {
              setAccountSyncStatus("error");
              window.alert(error instanceof Error ? error.message : "Account workspace data could not be deleted");
              return;
            }
          } else {
            localStorage.removeItem("worldex.mvp.state.v1");
          }
          setAccountWorkspaceReady(false);
          setAccountSyncStatus("local");
          setState(blankState());
        })(); }} />}
        {page === "status" && <StatusView />}
        {page === "dropship" && <DropshipView />}
        {page === "games" && <GameStudioView workspace={current} updateWorkspace={(update, label) => updateWorkspace(current.id, update, label)} />}
        {!(["home", "chat", "workspaces", "opportunities", "connections", "settings", "status", "dropship", "games"] as PageKey[]).includes(page) && <CapabilityPage page={page} />}
      </main>
      <footer className="app-footer"><span>WORLDEX <i>·</i> ONE WORLD. UNLIMITED POSSIBILITIES.</span><span><span className="footer-dot" /> {accountWorkspaceReady ? "Account-backed workspace" : "Browser-local preview"} · <button onClick={() => setPage("status")}>See what’s live</button></span></footer>
    </div>
  </div>;
}

function BrandMark() {
  return <span className="brand-emblem" aria-hidden="true"><svg viewBox="0 0 42 42" fill="none"><circle cx="21" cy="21" r="13.5" stroke="currentColor" strokeWidth="1.2" /><ellipse cx="21" cy="21" rx="6.6" ry="13.5" stroke="currentColor" strokeWidth="1" /><path d="M8 16.3c4.4 2.3 8.7 3.4 13 3.4 4.9 0 8.8-1.2 12.8-3.4M8 25.7c4.4-2.3 8.7-3.4 13-3.4 4.9 0 8.8 1.2 12.8 3.4" stroke="currentColor" strokeWidth="1" /><path d="M21 3.5c6.7 0 16.8 5.1 16.8 12.3S31 24.2 22 24.2" stroke="#8B72FF" strokeWidth="1.2" /><circle cx="36.2" cy="12.2" r="2.3" fill="#8B72FF" /><circle cx="8" cy="7" r="1.8" fill="#477BFF" /><path d="M8 7 12 11" stroke="#477BFF" strokeWidth="1" /></svg></span>;
}

function WorkspaceSwitcher({ current, workspaces, onSwitch, onNew }: { current: Workspace; workspaces: Workspace[]; onSwitch: (id: string) => void; onNew: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="workspace-switcher-wrap">
    <button className={`workspace-switcher ${open ? "open" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Workspace menu. Current workspace: ${current.name}`}>
      <span className="switcher-icon" style={{ background: "var(--workspace-accent)" }}>{current.logo}</span><span className="switcher-copy"><small>ACTIVE WORKSPACE</small><b>{current.name}</b><i>{current.kind}</i></span><ChevronDown size={14} />
    </button>
    {open && <div className="switcher-popover"><div className="popover-label">YOUR WORKSPACES · LOCAL ONLY</div>{workspaces.map((workspace) => <button key={workspace.id} className={`switcher-option ${current.id === workspace.id ? "selected" : ""}`} onClick={() => { onSwitch(workspace.id); setOpen(false); }}><span style={{ "--accent": accentMap[workspace.accent] } as CSSProperties}>{workspace.logo}</span><span><b>{workspace.name}</b><small>{workspace.kind}</small></span>{current.id === workspace.id && <Check size={14} />}</button>)}<div className="popover-divider" /><button className="switcher-add" onClick={() => { onNew(); setOpen(false); }}><Plus size={14} /> New workspace</button><small className="popover-isolation">No workspace data is inherited by default.</small></div>}
  </div>;
}

function HomeView({ workspace, allWorkspaces, crossOverview, onOpen, onNewWorkspace }: { workspace: Workspace; allWorkspaces: Workspace[]; crossOverview: boolean; onOpen: (page: PageKey) => void; onNewWorkspace: () => void }) {
  const recentChats = workspace.chats.filter((chat) => !chat.archivedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const focus = workspace.kind === "Game studio"
    ? { title: "Capture a game brief", detail: "Organize this project concept in its own workspace.", page: "games" as PageKey }
    : workspace.kind === "Creator"
      ? { title: "Outline a digital product", detail: "Start with a local product brief and validate the idea.", page: "games" as PageKey }
      : workspace.kind === "Business" || workspace.kind === "Startup"
        ? { title: "Review a business opportunity", detail: "Explore structured examples; no live listings connected.", page: "opportunities" as PageKey }
        : workspace.kind === "Client services"
          ? { title: "Keep client work separate", detail: "Create one isolated workspace for each client account.", page: "workspaces" as PageKey }
          : { title: "Find a work opportunity", detail: "Organize your search; demo listings are not live jobs.", page: "opportunities" as PageKey };
  return <div className="home-page">
    <div className="home-hero"><div className="home-hero-copy"><div className="eyebrow"><span className="status-dot status-dot-blue" /> WORKSPACE OVERVIEW <span className="hero-date">· {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div><h1>Move something <em>forward.</em></h1><p className="home-subtitle">Your {workspace.kind.toLowerCase()} workspace is ready. Choose a next step—nothing is running in the background.</p><div className="hero-cta-row"><button className="primary-button" onClick={() => onOpen("chat")}><Sparkles size={15} /> Open AURIX Chat <ArrowRight size={14} /></button><button className="secondary-button" onClick={() => onOpen("opportunities")}><Compass size={15} /> Explore opportunities</button></div></div><div className="hero-orb-wrap"><div className="hero-orb-glow" /><div className="hero-ring hero-ring-a" /><div className="hero-ring hero-ring-b" /><div className="hero-ring hero-ring-c" /><span className="hero-node hero-node-one" /><span className="hero-node hero-node-two" /><span className="hero-node hero-node-three" /><div className="hero-globe"><Globe2 size={49} strokeWidth={1.15} /><span>W</span></div><span className="hero-orb-label">ONE WORLD</span><span className="hero-orb-label label-right">YOUR WORKSPACE</span></div><span className="hero-top-chip"><span className="status-dot status-dot-mint" /> BROWSER-LOCAL</span></div>
    <div className="home-grid"><section className="home-panel status-panel"><div className="panel-heading"><div><span className="eyebrow">TODAY’S SURFACE</span><h2>Workspace snapshot</h2></div><span className="quiet-pill">LOCAL RECORDS</span></div><div className="snapshot-list"><SnapshotRow icon={MessageCircle} label="Conversations" value={`${workspace.chats.filter((chat) => !chat.archivedAt).length} active`} hint="Saved in this workspace" /><SnapshotRow icon={Layers3} label="Projects" value={`${workspace.projects.length} drafts`} hint="Workspace-local records" /><SnapshotRow icon={CheckCircle2} label="Tasks" value={`${workspace.tasks.length} recorded`} hint="No background actions" /><SnapshotRow icon={Link2} label="Account references" value={workspace.accountIds.length ? `${workspace.accountIds.length} records` : "None connected"} hint="External access not configured" /></div><div className="snapshot-disclaimer"><LockKeyhole size={13} /><span>Local counts only · not sales, balances or analytics</span></div></section>
      <section className="home-panel aurix-panel"><div className="panel-heading"><div><span className="eyebrow violet-eyebrow">YOUR AI EMPLOYEE</span><h2>AURIX is standing by.</h2></div><span className="aurix-avatar"><Sparkles size={17} /></span></div><div className="aurix-status-line"><span className="status-dot status-dot-amber" /><b>AI provider not configured</b></div><p className="panel-copy">No chats, prompts or workspace data are sent to an AI in this MVP. When a provider is configured, permissions must be approved here—not inferred across workspaces.</p><button className="text-link" onClick={() => onOpen("chat")}>Open local chat drafts <ArrowRight size={13} /></button><div className="aurix-orbit-mark"><span /><span /><span /></div></section>
      <section className="home-panel next-panel"><div className="panel-heading"><div><span className="eyebrow">SUGGESTED FOR {workspace.kind.toUpperCase()}</span><h2>Start with the real work.</h2></div><MoreHorizontal size={17} /></div><div className="next-steps-list"><button onClick={() => onOpen(focus.page)}><span className="step-number">01</span><span><b>{focus.title}</b><small>{focus.detail}</small></span><ChevronRight size={14} /></button><button onClick={() => onOpen("connections")}><span className="step-number">02</span><span><b>Review integrations</b><small>No external accounts are connected.</small></span><ChevronRight size={14} /></button><button onClick={onNewWorkspace}><span className="step-number">03</span><span><b>Create another workspace</b><small>New spaces start empty and isolated.</small></span><ChevronRight size={14} /></button></div></section>
      <section className="home-panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">CONVERSATIONS</span><h2>Continue where you left off</h2></div><button className="text-link" onClick={() => onOpen("chat")}>View all <ArrowRight size={13} /></button></div>{recentChats.length ? <div className="recent-chat-list">{recentChats.map((chat) => <div key={chat.id}><span className="recent-chat-icon"><MessageSquareText size={14} /></span><span><b>{chat.title}</b><small>{chat.messages.length ? `${chat.messages.length} saved local note${chat.messages.length === 1 ? "" : "s"}` : "No notes · draft only"}</small></span><span className="state-chip state-draft">DRAFT</span></div>)}</div> : <div className="home-empty-row"><span className="empty-orbit"><MessageCircle size={14} /></span><span><b>No conversations yet</b><small>Create a local draft when you’re ready.</small></span><button className="small-quiet-button" onClick={() => onOpen("chat")}>New chat <ArrowRight size={12} /></button></div>}</section>
      <section className="home-panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">LOCAL ACTIVITY HISTORY</span><h2>Changes in this workspace</h2></div><Activity size={15} /></div>{workspace.activity.length ? <div className="activity-event-list">{workspace.activity.slice(0, 4).map((item) => <div key={item.id}><span className="activity-event-dot" /><span><b>{item.label}</b><small>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span></div>)}</div> : <div className="activity-empty"><Clock3 size={14} /> No workspace changes recorded yet.</div>}</section>
    </div>
    {crossOverview && <section className="portfolio-overview"><div><div className="eyebrow">CROSS-WORKSPACE OVERVIEW · ENABLED BY YOU</div><h2>Space inventory only</h2><p>This overview exposes names, types and local chat counts only—not files, customers, memories, messages, balances or account content.</p></div><div className="portfolio-list">{allWorkspaces.map((item) => <button key={item.id} onClick={() => item.id !== workspace.id && window.dispatchEvent(new CustomEvent("worldex:switch-workspace", { detail: item.id }))}><span className="identity-mark" style={{ "--accent": accentMap[item.accent] } as CSSProperties}>{item.logo}</span><span><b>{item.name}</b><small>{item.kind} · {item.chats.length} chat records</small></span>{item.id === workspace.id ? <span className="state-chip state-active">CURRENT</span> : <ChevronRight size={14} />}</button>)}</div></section>}
  </div>;
}

function SnapshotRow({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return <div className="snapshot-row"><span className="snapshot-icon"><Icon size={15} /></span><span className="snapshot-label"><b>{label}</b><small>{hint}</small></span><span className="snapshot-value">{value}</span></div>;
}

function WorkspaceView({ current, workspaces, policies, onSwitch, onNew, onOpenSettings }: { current: Workspace; workspaces: Workspace[]; policies: AccessPolicy[]; onSwitch: (id: string) => void; onNew: () => void; onOpenSettings: () => void }) {
  const sharedCount = policies.filter((policy) => !policy.revokedAt && (policy.ownerWorkspaceId === current.id || targetIds(policy, workspaces).includes(current.id))).length;
  return <div className="standard-page workspace-page"><div className="module-page-heading"><div><div className="eyebrow">INDEPENDENT OPERATING SPACES</div><h1>Your workspaces</h1><p>Each environment keeps its own conversations, projects, settings and local history.</p></div><button className="primary-button" onClick={onNew}><Plus size={15} /> New workspace</button></div><div className="workspace-isolation-callout"><span><ShieldCheck size={17} /></span><div><b>Separate local records, not account security</b><p>Switching workspace changes which records appear. New workspaces start empty; no chats, files, customers, memory or integrations are copied by default. There is no user sign-in or per-user access control; anyone with access to this browser profile may be able to read these local records.</p></div><span className="state-chip state-active">ON BY DEFAULT</span></div><div className="workspace-table-heading"><span>WORKSPACE</span><span>TYPE</span><span>LOCAL RECORDS</span><span>CREATED</span><span>STATE</span></div><div className="workspace-table">{workspaces.map((workspace) => <button key={workspace.id} className={`workspace-table-row ${workspace.id === current.id ? "current" : ""}`} onClick={() => onSwitch(workspace.id)}><span className="workspace-table-name"><span className="identity-mark" style={{ "--accent": accentMap[workspace.accent] } as CSSProperties}>{workspace.logo}</span><span><b>{workspace.name}</b><small>{workspace.description || workspace.goals[0] || "No description added"}</small></span></span><span className="workspace-type"><span className="kind-dot" style={{ "--accent": accentMap[workspace.accent] } as CSSProperties} />{workspace.kind}</span><span className="workspace-record-count">{workspace.chats.length} chats · {workspace.projects.length} projects · {workspace.tasks.length} tasks</span><span className="workspace-created">{new Date(workspace.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span><span>{workspace.id === current.id ? <span className="state-chip state-active">ACTIVE</span> : <span className="state-chip state-muted">LOCAL</span>}</span></button>)}</div><div className="workspace-footer-card"><div><div className="eyebrow">ACCOUNT POLICY REFERENCES</div><h3>{sharedCount} active local policy {sharedCount === 1 ? "reference" : "references"} in this workspace</h3><p>Policy drafts list proposed resource scopes only. They do not authenticate accounts or copy business data.</p></div><button className="secondary-button" onClick={() => window.dispatchEvent(new CustomEvent("worldex:navigate", { detail: "connections" }))}>Review policies <ArrowRight size={14} /></button></div><button className="quiet-inline-link" onClick={onOpenSettings}><Settings2 size={14} /> Customize this workspace</button></div>;
}

function targetIds(policy: AccessPolicy, workspaces: Workspace[]) {
  return policy.shareWithAll ? workspaces.map((workspace) => workspace.id).filter((id) => id !== policy.ownerWorkspaceId) : policy.targetWorkspaceIds;
}

function ConnectView({ appState, activeWorkspace, workspaces, policies, onCreatePolicy, onRevoke, onServerWorkspaceReady, onAccountLogout }: { appState: AppState; activeWorkspace: Workspace; workspaces: Workspace[]; policies: AccessPolicy[]; onCreatePolicy: (policy: AccessPolicy) => void; onRevoke: (id: string) => void; onServerWorkspaceReady: () => void; onAccountLogout: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All categories");
  const [showForm, setShowForm] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<{ name: string; note: string; state: string; category: string } | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<ResourceScope[]>(["Profile"]);
  const [providers, setProviders] = useState<{ id: string; name: string; configured: boolean; supportedScopes: string[] }[]>([]);
  const [providerConnections, setProviderConnections] = useState<{ id: string; provider: string; accountLabel: string; status: string; scopeCategories: string[] }[]>([]);
  const [csrfToken, setCsrfToken] = useState("");
  const [authState, setAuthState] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const [serverWorkspaceReady, setServerWorkspaceReady] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiMessage, setApiMessage] = useState("");
  const [callbackMessage, setCallbackMessage] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [selectedConnection, setSelectedConnection] = useState<{ id: string; provider: string; accountLabel: string; scopeCategories: string[] } | null>(null);

  const loadConnections = async () => {
    const meResponse = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (meResponse.status === 401) { setAuthState("signed-out"); setServerWorkspaceReady(false); return; }
    if (!meResponse.ok) throw new Error("WORLDEX sign-in status could not be checked");
    const me = await meResponse.json();
    if (!me.authenticated) { setAuthState("signed-out"); setServerWorkspaceReady(false); return; }
    setAuthState("signed-in");
    setCsrfToken(me.csrfToken ?? "");
    const [providerResponse, stateResponse] = await Promise.all([
      fetch("/api/connections/providers", { credentials: "same-origin" }),
      fetch("/api/state", { credentials: "same-origin" }),
    ]);
    if (!providerResponse.ok || !stateResponse.ok) throw new Error("The WORLDEX server could not load connector settings");
    const providerData = await providerResponse.json();
    const serverState = await stateResponse.json();
    setProviders(providerData.providers ?? []);
    const workspaceReady = (serverState.workspaces ?? []).some((workspace: Workspace) => workspace.id === activeWorkspace.id);
    setServerWorkspaceReady(workspaceReady);
    if (workspaceReady) {
      const connectionResponse = await fetch(`/api/connections?workspaceId=${encodeURIComponent(activeWorkspace.id)}`, { credentials: "same-origin" });
      if (!connectionResponse.ok) throw new Error("Connections for this workspace could not be loaded");
      const connectionData = await connectionResponse.json();
      setProviderConnections(connectionData.connections ?? []);
    } else setProviderConnections([]);
  };

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("worldex_oauth");
    const authStatus = params.get("worldex_auth");
    if (oauthStatus === "connected") setCallbackMessage("Provider account connected successfully.");
    else if (oauthStatus === "signin") setCallbackMessage("Your WORLDEX sign-in session was not available when the provider returned. Sign in and try again.");
    else if (oauthStatus === "failed") setCallbackMessage(params.get("reason") === "denied" ? "The provider authorization was cancelled." : "The provider could not complete authorization. Check its setup and try again.");
    else if (authStatus === "connected") setCallbackMessage("You are signed in to WORLDEX. Save your local workspace to your account to enable connections.");
    else if (authStatus === "failed") setCallbackMessage("WORLDEX sign-in was cancelled or could not be completed.");
    if (oauthStatus || authStatus) window.history.replaceState({}, document.title, window.location.pathname);
    const run = async () => {
      try { await loadConnections(); }
      catch (error) { if (active) setApiMessage(error instanceof Error ? error.message : "Could not load connection settings"); }
      finally { if (active) setLoadingConnections(false); }
    };
    void run();
    return () => { active = false; };
  }, [activeWorkspace.id]);

  const signIn = async () => {
    setBusy(true); setApiMessage("");
    try {
      const response = await fetch("/api/auth/oauth/start", { method: "POST", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error?.message ?? "WORLDEX sign-in is not configured yet");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setApiMessage(error instanceof Error ? error.message : "Could not start WORLDEX sign-in"); setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true);
    setApiMessage("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": csrfToken },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Could not sign out of WORLDEX");
      setAuthState("signed-out");
      setServerWorkspaceReady(false);
      setProviderConnections([]);
      setConnectionNotice("Signed out. Your account data remains on the server and was not copied into this browser.");
      onAccountLogout();
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Could not sign out of WORLDEX");
    } finally {
      setBusy(false);
    }
  };

  const syncWorkspace = async () => {
    setBusy(true); setApiMessage("");
    try {
      const response = await fetch("/api/state", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(appState),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Workspace could not be saved to your account");
      await loadConnections();
      onServerWorkspaceReady();
      setConnectionNotice("Workspace saved securely to your WORLDEX account. Changes will now sync to your account automatically.");
    } catch (error) { setApiMessage(error instanceof Error ? error.message : "Workspace sync failed"); }
    finally { setBusy(false); }
  };

  const startProviderConnection = async () => {
    if (!selectedConnector) return;
    const providerId = oauthProviderForConnector[selectedConnector.name];
    if (!providerId) { setApiMessage("This platform's official connector is not implemented yet."); return; }
    const providerInfo = providers.find((item) => item.id === providerId);
    if (!providerInfo?.configured) { setApiMessage("This integration is not enabled by WORLDEX yet."); return; }
    const scopes = selectedScopes.filter((scope) => providerInfo.supportedScopes.includes(scope));
    if (!scopes.includes("Profile")) { setApiMessage("Profile permission is required to identify the connected account."); return; }
    setBusy(true); setApiMessage("");
    try {
      const response = await fetch(`/api/connections/${providerId}/start`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, scopes }),
      });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error?.message ?? "Could not start provider authorization");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setApiMessage(error instanceof Error ? error.message : "Could not start provider authorization"); setBusy(false); }
  };

  const disconnectProvider = async (connectionId: string) => {
    setBusy(true); setApiMessage("");
    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: "DELETE", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ workspaceId: activeWorkspace.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Could not disconnect this account");
      await loadConnections();
      setSelectedConnection(null);
      setConnectionNotice(data.providerAccessRevoked
        ? "WORLDEX disconnected this account and confirmed that the provider revoked its authorization."
        : data.providerRevocationSupported
          ? "WORLDEX deleted its local tokens, but the provider did not confirm revocation. Review the provider's connected-app settings."
          : "WORLDEX deleted its local tokens. This provider does not expose a supported revocation endpoint here, so remove WORLDEX from its connected-app settings as well.");
      setSelectedConnector(null);
    } catch (error) { setApiMessage(error instanceof Error ? error.message : "Could not disconnect account"); }
    finally { setBusy(false); }
  };

  const providerFor = (name: string) => providers.find((provider) => provider.id === oauthProviderForConnector[name]);
  const connectedFor = (name: string) => providerConnections.find((connection) => connection.provider === oauthProviderForConnector[name] && connection.status === "connected");
  const openConnector = (connector: { name: string; note: string; state: string; category: string }) => {
    const connection = connectedFor(connector.name) ?? null;
    setSelectedConnector(connector);
    setSelectedConnection(connection);
    const existingScopes = (connection?.scopeCategories ?? []).filter((scope): scope is ResourceScope => resourceScopes.includes(scope as ResourceScope));
    setSelectedScopes([...new Set<ResourceScope>([...defaultScopesForConnector(connector.name), ...existingScopes])]);
    setApiMessage("");
  };
  const matching = connectionGroups.flatMap((group) => group.items.map((item) => ({ ...item, category: group.category })))
    .filter((item) => (filter === "All categories" || item.category === filter) && `${item.name} ${item.category} ${item.note}`.toLowerCase().includes(query.toLowerCase()));
  const visiblePolicies = policies.filter((policy) => !policy.revokedAt && (policy.ownerWorkspaceId === activeWorkspace.id || targetIds(policy, workspaces).includes(activeWorkspace.id)));
  const ownerName = (id: string) => workspaces.find((workspace) => workspace.id === id)?.name ?? "Unknown workspace";
  const policy = policies.find((item) => item.id === revokeId);
  return <div className="standard-page connect-page"><div className="module-page-heading"><div><div className="eyebrow">ONE POLICY LAYER · NO ACCOUNT TOKENS</div><h1>Universal Connect</h1><p>Review integration readiness and keep workspace boundaries explicit.</p></div><div className="not-connected-chip"><span className="status-dot status-dot-amber" /> {loadingConnections ? "CHECKING CONNECTIONS" : `${providerConnections.filter((item) => item.status === "connected").length} CONNECTED ACCOUNTS`}</div></div>
    <div className="connect-boundary"><span><LockKeyhole size={16} /></span><div><b>Connect accounts without asking users for API keys.</b><p>WORLDEX will send users to each provider’s official authorization page. AURIX will only receive the permissions the user approves, and important actions such as publishing or sending messages will require confirmation. Provider authorization is not live until WORLDEX completes that provider’s server-side registration.</p></div></div>
    <div className="connector-session-panel">
      <div className="connector-session-copy"><b>{authState === "checking" ? "Checking WORLDEX account…" : authState === "signed-in" ? "WORLDEX account session active" : "Sign in to connect your accounts"}</b><p>{authState === "signed-in" ? serverWorkspaceReady ? "This workspace is saved in your secure account. Provider tokens will be stored on the server." : "Your current workspace is still browser-local. Save it to your WORLDEX account before connecting a provider." : "Provider connections belong to your account, not just this browser. Sign in first; no provider password or API key is entered here."}</p></div>
      {authState === "signed-out" && <button className="primary-button" disabled={busy || loadingConnections} onClick={signIn}>Sign in with WORLDEX <ArrowRight size={13} /></button>}
      {authState === "signed-in" && !serverWorkspaceReady && <button className="primary-button" disabled={busy || loadingConnections} onClick={syncWorkspace}>{busy ? "Saving…" : "Save workspace to account"} <ArrowRight size={13} /></button>}
      {authState === "signed-in" && serverWorkspaceReady && <span className="connector-session-ready"><CheckCircle2 size={14} /> Workspace saved</span>}
      {authState === "signed-in" && <button className="secondary-button" disabled={busy || loadingConnections} onClick={signOut}>Sign out</button>}
      {authState === "checking" && <span className="connector-session-ready">Checking…</span>}
    </div>
    {callbackMessage && <div className="connector-notice"><CheckCircle2 size={14} />{callbackMessage}<button onClick={() => setCallbackMessage("")} aria-label="Dismiss"><X size={13} /></button></div>}
    {connectionNotice && <div className="connector-notice"><CheckCircle2 size={14} />{connectionNotice}<button onClick={() => setConnectionNotice("")} aria-label="Dismiss"><X size={13} /></button></div>}
    {apiMessage && <div className="connector-error"><AlertCircle size={14} />{apiMessage}<button onClick={() => setApiMessage("")} aria-label="Dismiss"><X size={13} /></button></div>}
    <div className="catalog-header"><div><h2>Integration marketplace</h2><p>{matching.length} integrations shown · <b>Not connected</b> until official authorization is configured</p></div><div className="catalog-controls"><label className="search-field"><Search size={14} /><input aria-label="Search connectors" placeholder="Search integrations" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>}</label><label className="select-filter"><SlidersHorizontal size={14} /><select aria-label="Filter connector category" value={filter} onChange={(e) => setFilter(e.target.value)}><option>All categories</option>{connectionCategoryNames.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={13} /></label></div></div>
    <div className="integration-grid">{matching.length ? matching.map((connector) => { const providerInfo=providerFor(connector.name); const connection=connectedFor(connector.name); const required=requiredScopeForConnector[connector.name]; const hasPermission=!required || Boolean(connection?.scopeCategories.includes(required)); const mapped=Boolean(oauthProviderForConnector[connector.name]); const status=connection && hasPermission ? "Connected" : connection ? "Permission needed" : providerInfo?.configured ? "Ready to connect" : mapped ? "WORLDEX setup required" : "Coming later"; return <article key={`${connector.category}-${connector.name}`} className="integration-card"><div className="integration-card-top"><span className="integration-icon"><Store size={17} /></span><span className={`integration-status ${connection && hasPermission ? "is-connected" : ""}`}><i />{status}</span></div><div className="integration-card-copy"><h3>{connector.name}</h3><span className="integration-category">{connector.category}</span><p>{connector.note}</p>{connection && <small className="integration-account-label">{connection.accountLabel}</small>}</div><div className="integration-card-footer"><small>{providerInfo?.configured ? "Official OAuth" : mapped ? "Developer setup needed" : "Not implemented"}</small><button className="integration-connect-button" onClick={() => openConnector(connector)}>{connection ? "Manage" : mapped ? "Connect" : "Details"} <ArrowRight size={13} /></button></div></article>; }) : <div className="catalog-empty"><Search size={17} /><b>No integrations match</b><small>Try another category or search.</small></div>}</div>
    <div className="policy-section"><div className="policy-heading"><div><div className="eyebrow">WORKSPACE-LEVEL ACCESS RULES</div><h2>Sharing policy drafts</h2><p>Local policy records only—no external API permission is granted or enforced.</p></div><button className="secondary-button" onClick={() => setShowForm((open) => !open)}><Plus size={14} /> {showForm ? "Close form" : "Draft a policy"}</button></div>
      {showForm && <PolicyForm activeWorkspace={activeWorkspace} workspaces={workspaces} onCancel={() => setShowForm(false)} onCreate={(created) => { onCreatePolicy(created); setShowForm(false); }} />}
      {!visiblePolicies.length && !showForm ? <div className="policy-empty"><div className="empty-orbit"><Shield size={15} /></div><span><b>No active policy drafts here</b><small>When you draft one, its proposed scopes and workspace targets will be visible here. No accounts are connected.</small></span></div> : visiblePolicies.length > 0 && <div className="policy-list">{visiblePolicies.map((item) => <div key={item.id} className="policy-row"><div className="policy-account"><span className="policy-app-icon"><Link2 size={14} /></span><span><b>{item.accountLabel}</b><small>{item.provider} · owned by {ownerName(item.ownerWorkspaceId)}</small></span></div><div className="policy-scopes"><span className="eyebrow">PROPOSED SCOPES</span><div>{item.scopes.map((scope) => <span key={scope}>{scope}</span>)}</div></div><div className="policy-targets"><span className="eyebrow">TARGET WORKSPACES</span><small>{item.shareWithAll ? `All workspaces (current & future)` : targetIds(item, workspaces).map(ownerName).join(", ") || "None"}</small></div><div className="policy-status"><span className="state-chip state-limited">DRAFT · NO ACCESS</span>{item.ownerWorkspaceId === activeWorkspace.id ? <button className="text-link revoke-link" onClick={() => setRevokeId(item.id)}>Revoke <X size={12} /></button> : <small>Revoke from owner workspace</small>}</div></div>)}</div>}
    </div>
    {selectedConnector && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedConnector(null); }}><section className="confirm-modal integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-modal-title"><div className="modal-icon"><Link2 size={18} /></div><div className="eyebrow">OFFICIAL ACCOUNT AUTHORIZATION</div><h2 id="integration-modal-title">{selectedConnection ? `Manage ${selectedConnector.name}` : `Connect ${selectedConnector.name}`}</h2><p>{selectedConnector.note}. WORLDEX sends you to the provider’s official sign-in and approval page. Never enter your provider password or an API key into WORLDEX.</p>{selectedConnection && <div className="integration-connected-account"><span className="integration-status is-connected"><i />CONNECTED</span><b>{selectedConnection.accountLabel}</b><small>Granted groups: {selectedConnection.scopeCategories.join(", ")}</small></div>}<div className="integration-permission-panel"><b>Choose the permissions this workspace needs</b>{(providerFor(selectedConnector.name)?.supportedScopes ?? []).map((scope) => <label key={scope} className="integration-scope-option"><input type="checkbox" checked={selectedScopes.includes(scope as ResourceScope)} disabled={scope === "Profile" || busy} onChange={() => setSelectedScopes((previous) => previous.includes(scope as ResourceScope) ? previous.filter((item) => item !== scope) : [...previous, scope as ResourceScope])} /><span><b>{scope}</b><small>{scope === "Profile" ? "Identify the account connected to this workspace" : scope === "Content" ? "Read permitted files and content" : scope === "Publishing" ? "Request publishing permission where the provider approves it" : scope === "Analytics" ? "Read analytics reports" : "Read permitted mailbox data"}</small></span>{scope === "Profile" && <em>Required</em>}</label>)}{!providerFor(selectedConnector.name)?.supportedScopes.length && <span className="integration-scope-unavailable">Permission options are not available for this connector yet.</span>}</div><div className="integration-setup-note"><AlertCircle size={14} /><span>{!oauthProviderForConnector[selectedConnector.name] ? "This platform’s OAuth adapter is not implemented yet." : !providerFor(selectedConnector.name)?.configured ? "WORLDEX has not registered and configured this provider yet. Its server-side client credentials and encryption key must be installed before users can connect." : authState !== "signed-in" ? "Sign in to WORLDEX before starting this provider authorization." : !serverWorkspaceReady ? "Save this workspace to your WORLDEX account before connecting a provider." : "The provider will show its official permission screen. Access is limited to the scopes you select and approve."}</span></div><div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => setSelectedConnector(null)}>Close</button>{selectedConnection && <button className="danger-button" disabled={busy} onClick={() => disconnectProvider(selectedConnection.id)}>{busy ? "Working…" : "Disconnect"}</button>}<button className="primary-button" disabled={busy || authState !== "signed-in" || !serverWorkspaceReady || !providerFor(selectedConnector.name)?.configured || !(providerFor(selectedConnector.name)?.supportedScopes.length)} onClick={startProviderConnection}>{busy ? "Opening provider…" : selectedConnection ? "Update permissions" : `Continue to ${providerFor(selectedConnector.name)?.name ?? "provider"}`} <ArrowRight size={13} /></button></div></section></div>
    }
    {revokeId && policy && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="revoke-title"><div className="modal-icon warning"><AlertCircle size={18} /></div><div className="eyebrow">REVOKE SHARING POLICY</div><h2 id="revoke-title">Remove this local policy draft?</h2><p><b>{policy.accountLabel}</b> will no longer be referenced as shared with any workspace. This does not revoke an external API token because none exists.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setRevokeId(null)}>Keep policy</button><button className="danger-button" onClick={() => { onRevoke(policy.id); setRevokeId(null); }}>Revoke policy</button></div></section></div>}
  </div>;
}

function PolicyForm({ activeWorkspace, workspaces, onCancel, onCreate }: { activeWorkspace: Workspace; workspaces: Workspace[]; onCancel: () => void; onCreate: (policy: AccessPolicy) => void }) {
  const [provider, setProvider] = useState("Instagram");
  const [accountLabel, setAccountLabel] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [shareWithAll, setShareWithAll] = useState(false);
  const [scopes, setScopes] = useState<ResourceScope[]>(["Profile"]);
  const [error, setError] = useState("");
  const targets = workspaces.filter((workspace) => workspace.id !== activeWorkspace.id);
  const toggleTarget = (id: string) => setSelectedTargets((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const toggleScope = (scope: ResourceScope) => setScopes((previous) => previous.includes(scope) ? previous.filter((value) => value !== scope) : [...previous, scope]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!accountLabel.trim()) { setError("Enter a descriptive label for this account reference."); return; }
    if (!shareWithAll && !selectedTargets.length) { setError("Select at least one other workspace, or explicitly choose all workspaces."); return; }
    if (!scopes.length) { setError("Select at least one proposed resource scope."); return; }
    onCreate({ id: newId("policy"), ownerWorkspaceId: activeWorkspace.id, provider, accountLabel: accountLabel.trim(), targetWorkspaceIds: selectedTargets, shareWithAll, scopes, createdAt: timeNow() });
  };
  return <form className="policy-form" onSubmit={submit}><div className="policy-form-intro"><span className="policy-warning-icon"><ShieldAlert size={16} /></span><div><b>Local policy draft only</b><p>Write a proposed account-sharing rule for review. There is no connected account or external access in this MVP.</p></div></div>
    <div className="policy-form-grid"><label className="field-label">PROVIDER REFERENCE<select value={provider} onChange={(e) => setProvider(e.target.value)}>{connectionGroups.flatMap((group) => group.items.map((item) => item.name)).sort().map((providerName) => <option key={providerName}>{providerName}</option>)}</select><small>Provider name only; no account is authenticated.</small></label><label className="field-label">ACCOUNT LABEL<input maxLength={60} value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="e.g. Main creator profile (reference)" /><small>Descriptive local label, not an account lookup.</small></label></div>
    <fieldset className="policy-choice"><legend>PROPOSED RESOURCE SCOPES · LEAST PRIVILEGE</legend><div className="checkbox-row">{resourceScopes.map((scope) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /><span>{scope}</span></label>)}</div></fieldset>
    <fieldset className="policy-choice"><legend>SHARE WITH · SELECTED WORKSPACES ONLY BY DEFAULT</legend>{targets.length ? <><div className="checkbox-row workspace-targets">{targets.map((workspace) => <label key={workspace.id}><input type="checkbox" checked={selectedTargets.includes(workspace.id)} disabled={shareWithAll} onChange={() => toggleTarget(workspace.id)} /><span>{workspace.name}<small>{workspace.kind}</small></span></label>)}</div><label className="all-workspaces-check"><input type="checkbox" checked={shareWithAll} onChange={(e) => { setShareWithAll(e.target.checked); if (e.target.checked) setSelectedTargets([]); }} /><span>All current and future workspaces <small>This is an explicit broader grant. Still a policy draft only.</small></span></label></> : <div className="form-inline-note">Create a second workspace before this reference can target another workspace.</div>}</fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}<div className="policy-form-foot"><span><LockKeyhole size={13} /> Chats, files, customers, memory and financial data are excluded.</span><div><button type="button" className="quiet-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button"><Check size={14} /> Save policy draft</button></div></div>
  </form>;
}

function SettingsView({ workspace, state, updateWorkspace, setOverview, onReset }: { workspace: Workspace; state: AppState; updateWorkspace: (id: string, update: (value: Workspace) => Workspace, event?: string) => void; setOverview: (value: boolean) => void; onReset: () => void }) {
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [logo, setLogo] = useState(workspace.logo);
  useEffect(() => { setName(workspace.name); setDescription(workspace.description); setLogo(workspace.logo); }, [workspace.id, workspace.name, workspace.description, workspace.logo]);
  const saveIdentity = (event: FormEvent) => {
    event.preventDefault();
    updateWorkspace(workspace.id, (current) => ({ ...current, name: name.trim() || current.name, description: description.trim(), logo: (logo.trim() || current.name).slice(0, 2).toUpperCase() }), "Workspace identity updated");
  };
  const accents: Accent[] = ["blue", "violet", "mint", "amber", "rose"];
  return <div className="standard-page settings-page"><div className="module-page-heading"><div><div className="eyebrow">CONTROL YOUR SPACE</div><h1>Settings</h1><p>Workspace appearance is independent. Cross-workspace overview is off by default.</p></div><span className="state-chip state-active">{workspace.name}</span></div>
    <div className="settings-layout"><aside className="settings-subnav"><span className="eyebrow">SETTINGS</span><span className="settings-subnav-current"><Building2 size={14} /> Workspace</span><span className="settings-subnav-disabled"><Shield size={14} /> Accounts <i>Setup needed</i></span><span className="settings-subnav-disabled"><Database size={14} /> Storage <i>Local only</i></span><span className="settings-subnav-disabled"><Users size={14} /> Team <i>Not supported</i></span></aside>
      <div className="settings-content"><section className="settings-section"><div><div className="eyebrow">WORKSPACE IDENTITY</div><h2>Make this space yours</h2><p>These details stay inside the active workspace. No website or storefront branding tools are included.</p></div><form className="settings-identity-form" onSubmit={saveIdentity}><label className="field-label">WORKSPACE NAME<input value={name} onChange={(e) => setName(e.target.value)} maxLength={44} /></label><label className="field-label">SHORT DESCRIPTION<input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Optional workspace focus" /></label><div className="field-row"><label className="field-label">COUNTRY<input value={workspace.country} placeholder="Not set" onChange={(e) => updateWorkspace(workspace.id, (value) => ({ ...value, country: e.target.value }))} /></label><label className="field-label">CURRENCY<input value={workspace.currency} placeholder="Not set" maxLength={3} onChange={(e) => updateWorkspace(workspace.id, (value) => ({ ...value, currency: e.target.value.toUpperCase() }))} /></label></div><label className="field-label">WORKSPACE MONOGRAM<input value={logo} onChange={(e) => setLogo(e.target.value)} maxLength={2} placeholder="e.g. NX" /><small>Short label only; a custom logo upload is not implemented.</small></label><button className="primary-button save-settings" type="submit"><Check size={14} /> Save identity</button></form></section>
        <section className="settings-section accent-settings"><div><div className="eyebrow">APPEARANCE</div><h2>Workspace accent</h2><p>Changes the active workspace accent while preserving WORLDEX identity.</p></div><div className="setting-accent-picker">{accents.map((accent) => <button key={accent} aria-label={`Use ${accent} accent`} aria-pressed={workspace.accent === accent} className={`setting-accent ${workspace.accent === accent ? "chosen" : ""}`} style={{ "--accent": accentMap[accent] } as CSSProperties} onClick={() => updateWorkspace(workspace.id, (value) => ({ ...value, accent }), `Workspace accent changed to ${accent}`)}><i />{accent}</button>)}</div></section>
        <section className="settings-section cross-settings"><div><div className="eyebrow">CROSS-WORKSPACE VISIBILITY</div><h2>Overview</h2><p>Optional, off by default. If enabled, Home lists workspace names, types and local conversation counts only. It does not expose chats, files, customers, memory, integrations, or financial data.</p></div><label className="toggle-control"><input type="checkbox" checked={state.crossWorkspaceOverview} onChange={(e) => setOverview(e.target.checked)} /><span className="toggle-track" /><span className="toggle-label">{state.crossWorkspaceOverview ? "Enabled" : "Off"}</span></label></section>
        <section className="settings-section local-storage-section"><div className="storage-icon"><Database size={17} /></div><div><div className="eyebrow">DATA LOCATION</div><h2>Saved in this browser</h2><p>There is no login, server database, sync, backup or cross-device persistence in this MVP. Do not store sensitive business information here.</p><span className="state-chip state-limited">LOCAL STORAGE · NOT SECURE MULTI-USER ISOLATION</span></div></section>
        <section className="settings-section reset-section"><div><div className="eyebrow">RESET</div><h2>Clear local app data</h2><p>Remove all WORLDEX workspaces, chat drafts and policy references stored in this browser.</p></div><button className="danger-outline-button" onClick={onReset}><Archive size={14} /> Clear browser data</button></section>
      </div>
    </div>
  </div>;
}

function StatusView() {
  const rows = [
    { feature: "Onboarding & workspace setup", implemented: "Implemented", configured: "Browser-local", tested: "Build check", verified: "Not externally verified" },
    { feature: "Workspace switching & isolation model", implemented: "Implemented", configured: "Local storage", tested: "Type/build checked", verified: "Not secure multi-user isolation" },
    { feature: "Chat create/search/rename/archive/reopen", implemented: "Implemented", configured: "Browser-local", tested: "Type/build checked", verified: "No AI connected" },
    { feature: "Opportunity Finder schema", implemented: "DEMO DATA only", configured: "No live source", tested: "Type/build checked", verified: "Not source-verified" },
    { feature: "Workspace permission policy drafts", implemented: "Implemented", configured: "Local rules only", tested: "Type/build checked", verified: "No external enforcement" },
    { feature: "Connector catalogue", implemented: "Status pages", configured: "Not connected", tested: "Type/build checked", verified: "No provider verification" },
    { feature: "AI responses & task execution", implemented: "Not implemented", configured: "Provider required", tested: "Not tested", verified: "Not available" },
    { feature: "Database accounts & secure sync", implemented: "Not implemented", configured: "Not configured", tested: "Not tested", verified: "Not verified" },
    { feature: "Publishing, commerce, analytics & messaging", implemented: "Not implemented", configured: "Not connected", tested: "Not tested", verified: "Not verified" },
  ];
  return <div className="standard-page status-page"><div className="module-page-heading"><div><div className="eyebrow">NO AMBIGUOUS GREEN CHECKS</div><h1>Product status</h1><p>What is implemented, configured, tested and independently verified are reported separately.</p></div><span className="status-stamp"><BadgeCheck size={16} /> TRANSPARENT STATUS</span></div><div className="status-summary"><div><span className="status-summary-icon"><CheckCircle2 size={16} /></span><b>Working locally</b><small>Onboarding, workspace scope, saved chat management and local policy drafts.</small></div><div><span className="status-summary-icon amber"><AlertCircle size={16} /></span><b>Not connected</b><small>AI, OAuth providers, persistent database, third-party listings and external execution.</small></div><div><span className="status-summary-icon muted"><ShieldAlert size={16} /></span><b>Not yet verified</b><small>No external provider, account or live listing has been independently verified.</small></div></div><div className="status-table-wrap"><table className="status-table"><thead><tr><th>CAPABILITY</th><th>IMPLEMENTED</th><th>CONFIGURED</th><th>TESTED</th><th>VERIFIED</th></tr></thead><tbody>{rows.map((row) => <tr key={row.feature}><td>{row.feature}</td><td>{row.implemented}</td><td>{row.configured}</td><td>{row.tested}</td><td>{row.verified}</td></tr>)}</tbody></table></div><div className="status-handoff"><div className="handoff-orbit"><Code2 size={16} /></div><div><div className="eyebrow">DEVELOPER HANDOFF</div><h2>Connect the real foundation before going live.</h2><p>See <b>HANDOFF.md</b> in the project for data ownership, schema notes and the setup sequence for auth, database, server-side AI and provider OAuth.</p><div className="handoff-links"><span><Database size={13} /> Auth + database</span><span><Sparkles size={13} /> Server-side AI</span><span><Link2 size={13} /> Provider OAuth</span></div></div></div><div className="status-boundary"><ShieldCheck size={15} /><span>WORLDEX itself is a web application. User-facing website building, hosting, redesign, generation and publishing are outside this product.</span></div></div>;
}

function DropshipView() {
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [shipping, setShipping] = useState("");
  const [feePercent, setFeePercent] = useState("");
  const [ads, setAds] = useState("");
  const [refundPercent, setRefundPercent] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [currency, setCurrency] = useState("USD");
  const nums = [price, cost, shipping, feePercent, ads, refundPercent, taxPercent].map((v) => v.trim() === "" ? null : Number(v));
  const ready = nums.every((v) => v !== null && Number.isFinite(v) && v >= 0) && (nums[0] ?? 0) > 0;
  let result: { profit: number; margin: number; payment: number; refund: number; tax: number } | null = null;
  if (ready) {
    const [p, c, s, fee, a, refund, tax] = nums as number[];
    const payment = p * fee / 100;
    const refundCost = p * refund / 100;
    const taxCost = p * tax / 100;
    const profit = p - c - s - payment - a - refundCost - taxCost;
    result = { profit, margin: p ? profit / p * 100 : 0, payment, refund: refundCost, tax: taxCost };
  }
  const numericInput = (label: string, value: string, set: (v: string) => void, hint?: string, suffix?: string) => <label className="field-label calculator-field">{label}<span>{hint ?? "Per unit assumption"}</span><div><input type="number" min="0" step="0.01" value={value} onChange={(e) => set(e.target.value)} placeholder="0.00" /><i>{suffix || currency}</i></div></label>;
  return <div className="standard-page dropship-page"><div className="module-page-heading"><div><div className="eyebrow">DROPSHIP STUDIO · LIMITED</div><h1>Unit economics</h1><p>Run a transparent, per-unit estimate using numbers you provide. This is not a live store or supplier feed.</p></div><span className="not-connected-chip"><span className="status-dot status-dot-amber" /> STORE NOT CONNECTED</span></div><div className="calculator-notice"><AlertCircle size={15} /><span>Estimate only · Enter assumptions · No taxes, fees, refunds, ads or sales are sourced automatically.</span></div><div className="calculator-layout"><section className="calculator-form-panel"><div className="calculator-panel-heading"><div className="eyebrow">YOUR INPUTS · PER UNIT</div><label className="currency-select">Currency <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option><option>AUD</option></select></label></div><div className="calculator-fields">{numericInput("Selling price", price, setPrice, "What the customer pays")}{numericInput("Product cost", cost, setCost, "Supplier cost", currency)}{numericInput("Shipping", shipping, setShipping, "Shipping or fulfilment", currency)}{numericInput("Payment fees", feePercent, setFeePercent, "Percentage of selling price", "%")}{numericInput("Advertising", ads, setAds, "Per-unit advertising estimate", currency)}{numericInput("Refund allowance", refundPercent, setRefundPercent, "Percentage reserved", "%")}{numericInput("Tax assumption", taxPercent, setTaxPercent, "Percentage of selling price", "%")}</div><div className="calc-formula"><span className="eyebrow">FORMULA</span><p>Price − product cost − shipping − payment fee − ads − refund allowance − tax assumption</p><small>Tax is simplified as a percent of price; jurisdiction-specific tax is not calculated.</small></div></section><section className="calculator-result"><div className="eyebrow">ESTIMATED CONTRIBUTION · NOT A SALE</div>{result ? <><div className="result-figure">{result.profit < 0 ? "−" : ""}{currency} {Math.abs(result.profit).toFixed(2)}<small>/ unit</small></div><div className={`result-margin ${result.profit < 0 ? "negative" : ""}`}>{result.margin.toFixed(1)}% estimated margin</div><div className="result-breakdown"><div><span>Payment fee</span><b>{currency} {result.payment.toFixed(2)}</b></div><div><span>Refund reserve</span><b>{currency} {result.refund.toFixed(2)}</b></div><div><span>Tax assumption</span><b>{currency} {result.tax.toFixed(2)}</b></div></div><span className="state-chip state-demo">USER-PROVIDED ASSUMPTIONS</span></> : <div className="calc-empty"><Wallet size={19} /><b>Enter all assumptions</b><p>Fill each field above to calculate a per-unit estimate. Until then, no value is shown.</p></div>}<div className="result-caveat"><ShieldAlert size={13} /><span>Excludes other overhead, chargebacks, foreign exchange, actual tax rules and demand. Estimates are uncertain—not profit or revenue.</span></div></section></div><div className="module-roadmap"><div className="eyebrow">OTHER DROPSHIP CAPABILITIES</div><div className="roadmap-grid">{[{ title: "Product research", state: "Not connected", icon: Search }, { title: "Supplier comparison", state: "Not connected", icon: Store }, { title: "Store, inventory & orders", state: "Requires provider setup", icon: ShoppingBag }, { title: "Fulfilment & customer support", state: "Not yet supported", icon: MessageCircle }].map(({ title, state, icon: Icon }) => <div key={title}><span className="roadmap-icon"><Icon size={15} /></span><span><b>{title}</b><small>{state}</small></span><span className="status-dot status-dot-muted" /></div>)}</div></div></div>;
}

function GameStudioView({ workspace, updateWorkspace }: { workspace: Workspace; updateWorkspace: (update: (value: Workspace) => Workspace, label: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"Game brief" | "Digital product">("Game brief");
  const [targets, setTargets] = useState<string[]>([]);
  const targetOptions = ["Roblox", "Steam", "itch.io", "Google Play", "Apple App Store"];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const project: ProjectRecord = { id: newId("project"), title: title.trim(), type, description: description.trim(), targets, createdAt: timeNow(), status: "Local draft" };
    updateWorkspace((current) => ({ ...current, projects: [project, ...current.projects] }), "Local project brief created");
    setTitle(""); setDescription(""); setTargets([]); setShowForm(false);
  };
  return <div className="standard-page game-page"><div className="module-page-heading"><div><div className="eyebrow">GAME STUDIO · PROJECT SPACE</div><h1>Shape the next build.</h1><p>Capture a project brief in this workspace. No game engine, build pipeline or store account is connected.</p></div><button className="primary-button" onClick={() => setShowForm((v) => !v)}><Plus size={15} /> {showForm ? "Close form" : "New project brief"}</button></div><div className="game-boundary"><span><Gamepad2 size={16} /></span><div><b>Project briefs are local drafts only.</b><p>Roblox, Steam, itch.io, Google Play and Apple App Store publishing requires genuine authentication, platform approval and permissions. No publishing, builds, sales or analytics are simulated.</p></div><span className="state-chip state-limited">NOT CONNECTED</span></div>
    {showForm && <form className="game-brief-form" onSubmit={submit}><div className="eyebrow">NEW WORKSPACE-LOCAL BRIEF</div><div className="game-form-row"><label className="field-label">PROJECT TYPE<select value={type} onChange={(e) => setType(e.target.value as typeof type)}><option>Game brief</option><option>Digital product</option></select></label><label className="field-label">PROJECT NAME<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} placeholder="Give your idea a working title" required /></label></div><label className="field-label">DESCRIPTION<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="What do you want to explore? This brief is saved in this browser profile." /></label><fieldset className="policy-choice"><legend>TARGET PLATFORMS · INTENT ONLY, NO CONNECTION</legend><div className="checkbox-row game-targets">{targetOptions.map((target) => <label key={target}><input type="checkbox" checked={targets.includes(target)} onChange={() => setTargets((previous) => previous.includes(target) ? previous.filter((t) => t !== target) : [...previous, target])} /><span>{target}</span></label>)}</div></fieldset><div className="wizard-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="primary-button"><Check size={14} /> Save local brief</button></div></form>}
    <div className="game-projects"><div className="section-title-row"><div><div className="eyebrow">CURRENT WORKSPACE ONLY</div><h2>Project briefs <span>{workspace.projects.length}</span></h2></div><span className="local-project-label">WORKSPACE-LOCAL</span></div>{workspace.projects.length ? <div className="project-list">{workspace.projects.map((project) => <article key={project.id} className="project-card"><div className="project-icon"><Gamepad2 size={17} /></div><div className="project-copy"><div><span className="state-chip state-demo">LOCAL DRAFT</span><span className="project-type">{project.type}</span></div><h3>{project.title}</h3><p>{project.description || "No description added."}</p><small>{project.targets.length ? `Target intent: ${project.targets.join(", ")} · ` : "No target platform selected · "}Not connected</small></div><div className="project-menu"><span className="state-chip state-muted">NOT PUBLISHED</span></div></article>)}</div> : <div className="game-empty"><div className="game-empty-orbit"><Gamepad2 size={19} /></div><b>Nothing in this workspace yet</b><p>Start with a local concept brief; projects created in another workspace will not appear here.</p><button className="secondary-button" onClick={() => setShowForm(true)}><Plus size={14} /> Create local brief</button></div>}</div>
    <div className="release-checklist"><div><div className="eyebrow">RELEASE CHECKLIST · REFERENCE ONLY</div><h2>No release is ready</h2><p>Real builds, store authentication, compliance checks and test results have not been recorded.</p></div><div className="release-steps"><span><i>01</i> Build & test <b>Not started</b></span><span><i>02</i> Connect target store <b>Not connected</b></span><span><i>03</i> Verify permissions <b>Not verified</b></span></div></div>
  </div>;
}

const capabilityCopy: Partial<Record<PageKey, { icon: LucideIcon; status: string; description: string; next: string[] }>> = {
  research: { icon: Search, status: "Not yet supported", description: "A research workspace is on the roadmap. No provider-backed searches or source citations are available in this MVP.", next: ["Research sources and evidence capture", "Workspace-specific saved research", "Source verification and update timestamps"] },
  outreach: { icon: ArrowDownRight, status: "Not yet supported", description: "Outreach campaigns are not configured. WORLDEX does not send messages, contact prospects, or claim delivery.", next: ["Approved contact sources", "Draft review and consent controls", "Provider setup and send approval"] },
  social: { icon: Globe2, status: "Not connected", description: "There are no linked social accounts. Publishing, scheduling and engagement metrics are not available.", next: ["OAuth provider and scopes", "Draft calendar and review", "Live status and analytics after account verification"] },
  ads: { icon: Activity, status: "Not connected", description: "No ad accounts, spending or campaign data are connected. This page will not estimate or fabricate ROAS.", next: ["Provider authentication", "Spend limits and human approval", "Verified campaign data and reporting"] },
  messages: { icon: Mail, status: "Not connected", description: "Email and messaging providers are not connected. No customer communication is stored or sent here.", next: ["Provider consent and inbox scopes", "Workspace-specific consent controls", "Human review and send authorization"] },
  documents: { icon: FileText, status: "Limited", description: "Documents have no workspace storage backend yet. No file upload, indexing, or AI reading is available.", next: ["Private workspace storage", "Ownership and access checks", "Upload and deletion auditing"] },
  images: { icon: ImageIcon, status: "Not yet supported", description: "Image generation and editing are not configured. No asset is being generated or uploaded by this page.", next: ["Real generation/edit provider", "Asset ownership and storage", "Workspace file permissions"] },
  videos: { icon: Film, status: "Not yet supported", description: "Video generation, editing and publishing are not configured. No external job is started here.", next: ["Provider selection and limits", "Durable asset handling", "Review and external-publish permissions"] },
  automations: { icon: Workflow, status: "Not yet supported", description: "Scheduled jobs and external triggers are not configured. Nothing will run in the background.", next: ["Server-side scheduler and durable jobs", "Workspace-specific authorizations", "Run history, pause and cancellation"] },
  library: { icon: BookOpen, status: "Limited", description: "The library has no persistent file storage in this browser-local MVP. Workspace file areas are empty by default.", next: ["Private storage and indexing", "Clear ownership and deletion controls", "Provider sharing only by explicit consent"] },
  analytics: { icon: Gauge, status: "Not connected", description: "There are no live analytics sources or verified metrics. WORLDEX does not display simulated sales, engagement or balances.", next: ["Read-only verified provider data", "Source and sync timestamps", "Metric definitions and freshness labels"] },
  team: { icon: Users, status: "Not yet supported", description: "There is no team login, role system or shared account. Current records are local to this browser and are not secure multi-user isolation.", next: ["Authentication and membership", "Server-side workspace ownership", "Audited least-privilege roles"] },
};

function CapabilityPage({ page }: { page: PageKey }) {
  const data = capabilityCopy[page] ?? { icon: CircleHelp, status: "Not yet supported", description: "This capability is not implemented or connected in the current MVP.", next: ["Define a verified provider integration", "Add workspace-level permissions", "Expose honest sync, error and availability status"] };
  const Icon = data.icon;
  return <div className="standard-page capability-page"><div className="module-page-heading"><div><div className="eyebrow">{pageLabels[page].toUpperCase()} · CAPABILITY STATUS</div><h1>{pageLabels[page]}</h1><p>{data.description}</p></div><span className="not-connected-chip"><span className="status-dot status-dot-amber" /> {data.status.toUpperCase()}</span></div><div className="capability-hero"><div className="capability-symbol"><Icon size={23} strokeWidth={1.4} /></div><div><div className="eyebrow">THIS MODULE IS NOT A MOCK WORKFLOW</div><h2>Built for honest readiness, not pretend results.</h2><p>There is no external provider configured for this module. Controls that would claim to execute external actions are unavailable until the integration is implemented, tested and verified.</p></div><div className="capability-status-stamp"><span className="status-dot status-dot-muted" /> NOT CONNECTED</div></div><section className="capability-roadmap"><div className="eyebrow">WHAT REAL SUPPORT REQUIRES</div>{data.next.map((item, index) => <div key={item}><span>0{index + 1}</span><p>{item}</p><span className="state-chip state-muted">NOT IMPLEMENTED</span></div>)}</section><div className="capability-footnote"><ShieldAlert size={15} /><span>No mock success, fake data, simulated publishing, analytics or live external execution is shown here.</span></div></div>;
}
