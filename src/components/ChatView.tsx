import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowUp, Bot, Check, Clock3, MessageSquarePlus, Pencil, Plus, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import type { Chat } from "../types";

interface Props {
  workspaceId: string;
  workspaceName: string;
  chats: Chat[];
  createSignal: boolean;
  csrfToken: string;
  signedIn: boolean;
  onCreateHandled: () => void;
  onCreate: (title?: string) => Chat;
  onSaveDraft: (chatId: string, text: string) => void;
  onRename: (chatId: string, title: string) => void;
  onArchive: (chatId: string, archived: boolean) => void;
}
type LiveMessage = { role: "user" | "assistant"; content: string; id: string };
function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function ChatView({ workspaceId, workspaceName, chats, createSignal, csrfToken, signedIn, onCreateHandled, onCreate, onSaveDraft, onRename, onArchive }: Props) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [notice, setNotice] = useState("");
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const handledCreateSignal = useRef(false);

  const filtered = useMemo(() => chats.filter((chat) => Boolean(chat.archivedAt) === showArchived)
    .filter((chat) => `${chat.title} ${chat.messages.map((message) => message.text).join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [chats, query, showArchived]);
  const active = filtered.find((chat) => chat.id === activeId) ?? filtered[0] ?? null;

  useEffect(() => {
    let activeRequest = true;
    fetch("/api/status", { credentials: "same-origin" }).then((response) => response.ok ? response.json() : null)
      .then((status) => { if (activeRequest) setAiConfigured(Boolean(status?.openaiConfigured)); })
      .catch(() => { if (activeRequest) setAiConfigured(false); });
    return () => { activeRequest = false; };
  }, []);

  const startChat = () => {
    const chat = onCreate();
    setActiveId(chat.id);
    setShowArchived(false);
    setDraft("");
    setLiveMessages([]);
    setNotice("New conversation ready.");
    window.setTimeout(() => setNotice(""), 2800);
  };
  useEffect(() => {
    if (!createSignal) handledCreateSignal.current = false;
    else if (!handledCreateSignal.current) { handledCreateSignal.current = true; startChat(); onCreateHandled(); }
  }, [createSignal]);
  useEffect(() => { setLiveMessages([]); }, [active?.id]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!active || !text || sending) return;
    if (!signedIn || !csrfToken) { setNotice("Sign in to your WORLDEX account to use AURIX AI."); return; }
    if (!aiConfigured) { setNotice("AURIX AI is not configured. Add OPENAI_API_KEY to the Netlify environment and redeploy."); return; }
    const nextMessages: LiveMessage[] = [...liveMessages, { role: "user", content: text, id: `user-${Date.now()}` }];
    setLiveMessages(nextMessages);
    setDraft("");
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/aurix/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ workspaceId, messages: nextMessages.slice(-12).map(({ role, content }) => ({ role, content })) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "AURIX could not answer. Please try again.");
      setLiveMessages((current) => [...current, { role: "assistant", content: payload.reply, id: `assistant-${Date.now()}` }]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AURIX could not answer. Please try again.");
    } finally { setSending(false); }
  };
  const beginRename = (chat: Chat) => { setRenameId(chat.id); setRenameValue(chat.title); };
  const finishRename = (event: FormEvent) => { event.preventDefault(); if (renameId && renameValue.trim()) onRename(renameId, renameValue.trim()); setRenameId(null); };

  return <div className="chat-layout">
    <aside className="chat-index">
      <div className="chat-index-top"><div><span className="eyebrow">AURIX / CHAT</span><h2>Your conversations</h2></div><button className="icon-button new-chat-icon" onClick={startChat} aria-label="New chat" title="New chat"><Plus size={16} /></button></div>
      <button className="primary-button full-width new-chat-button" onClick={startChat}><MessageSquarePlus size={16} /> New Chat</button>
      <label className="search-field"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats & notes" aria-label="Search chats" />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>}</label>
      <div className="chat-list-toggle"><button className={!showArchived ? "active" : ""} onClick={() => setShowArchived(false)}>Active <span>{chats.filter((c) => !c.archivedAt).length}</span></button><button className={showArchived ? "active" : ""} onClick={() => setShowArchived(true)}>Archived <span>{chats.filter((c) => c.archivedAt).length}</span></button></div>
      <div className="conversation-list" aria-label={showArchived ? "Archived conversations" : "Active conversations"}>
        {filtered.length ? filtered.map((chat) => <button key={chat.id} className={`conversation-item ${active?.id === chat.id ? "selected" : ""}`} onClick={() => { setActiveId(chat.id); setDraft(""); }}>
          <span className="conversation-glyph"><span /></span><span className="conversation-copy"><b>{chat.title || "Untitled chat"}</b><small>{chat.messages.length ? `${chat.messages.length} saved notes` : "New conversation"}</small></span><span className="conversation-state">CHAT</span>
        </button>) : <div className="mini-empty"><span className="empty-orbit"><MessageSquarePlus size={15} /></span><b>{query ? "No matches" : showArchived ? "No archived chats" : "A clean slate"}</b><p>{query ? "Try another search term." : "Start a separate conversation for this workspace."}</p></div>}
      </div>
      <div className="chat-scope-note"><ShieldCheck size={15} /><span><b>Workspace only</b><small>{workspaceName}</small></span></div>
    </aside>

    <section className="chat-stage">
      <div className="chat-stage-head"><div className="aurix-lockup"><span className="aurix-avatar"><Sparkles size={18} /></span><span><b>AURIX</b><small>POWERED BY OPENAI</small></span></div><div className="provider-status"><span className={`status-dot ${aiConfigured ? "status-dot-green" : "status-dot-amber"}`} /> {aiConfigured ? "AI CONFIGURED" : "AI NOT CONFIGURED"}</div></div>
      {!active ? <div className="chat-welcome"><div className="aurix-large"><Sparkles size={25} /></div><div className="eyebrow violet-eyebrow">YOUR WORKSPACE ASSISTANT</div><h1>Think it through.<br /><em>One workspace at a time.</em></h1><p>AURIX uses the OpenAI API through WORLDEX's secure backend. Your API key stays on the server and is never sent to the browser.</p><button className="secondary-button" onClick={startChat}><Plus size={15} /> Start a conversation</button></div> : <>
        <div className="active-chat-heading"><div><div className="eyebrow">CURRENT WORKSPACE · {workspaceName}</div><h2>{active.title}</h2><span><Clock3 size={12} /> Updated {timeLabel(active.updatedAt)}</span></div><div className="chat-actions">{renameId === active.id ? <form className="rename-inline" onSubmit={finishRename}><input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label="Conversation name" maxLength={65} /><button aria-label="Save name"><Check size={14} /></button><button type="button" aria-label="Cancel rename" onClick={() => setRenameId(null)}><X size={14} /></button></form> : <button className="icon-button" onClick={() => beginRename(active)} aria-label="Rename chat" title="Rename"><Pencil size={15} /></button>}
          {active.archivedAt ? <button className="secondary-button compact-button" onClick={() => { onArchive(active.id, false); setShowArchived(false); }}>Reopen <ArrowUp size={13} /></button> : <button className="icon-button" onClick={() => onArchive(active.id, true)} aria-label="Archive chat" title="Archive chat"><Archive size={15} /></button>}</div></div>
        <div className="chat-briefing"><span className="briefing-orbit"><Bot size={16} /></span><div><b>{aiConfigured ? "AURIX is connected to its AI provider." : "AURIX is waiting for its API configuration."}</b><p>{aiConfigured ? "Replies are generated through the secure WORLDEX backend. Chat messages are kept in this browser session." : "Add OPENAI_API_KEY in your Netlify site's environment variables, enable Functions scope, and redeploy. Never paste the key into this chat or the website frontend."}</p></div><span className={`state-chip ${aiConfigured ? "state-active" : "state-draft"}`}>{aiConfigured ? "READY" : "SETUP"}</span></div>
        <div className="chat-transcript" aria-live="polite">
          {!liveMessages.length && !active.messages.length ? <div className="transcript-empty"><div className="dotted-line" /><span>Start talking to AURIX</span><small>Ask a question or describe what you want help with.</small><div className="dotted-line" /></div> : <>
            {active.messages.map((message) => <article className="saved-note" key={message.id}><div className="note-avatar">NOTE</div><div><div className="note-label">SAVED LOCAL NOTE <span>·</span> {timeLabel(message.createdAt)}</div><p>{message.text}</p></div></article>)}
            {liveMessages.map((message) => <article className={`saved-note aurix-live-message ${message.role}`} key={message.id}><div className="note-avatar">{message.role === "user" ? "YOU" : "AI"}</div><div><div className="note-label">{message.role === "user" ? "YOU" : "AURIX"}</div><p>{message.content}</p></div></article>)}
          </>}
          {sending && <article className="saved-note aurix-live-message assistant"><div className="note-avatar">AI</div><div><div className="note-label">AURIX</div><p>Thinking…</p></div></article>}
        </div>
        {notice && <div role="status" className="inline-feedback"><Check size={14} /> {notice}</div>}
        <form className="composer" onSubmit={send}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message AURIX…" rows={3} aria-label="Message AURIX" maxLength={5000} disabled={sending} />
          <div className="composer-tools"><span className="composer-hint">AI replies may be inaccurate. Review important information.</span><button type="submit" className="primary-button" disabled={!draft.trim() || sending}><span>{sending ? "Thinking…" : "Send to AURIX"}</span><ArrowUp size={15} /></button></div>
        </form>
        <div className="approval-row"><div><span className="approval-shield"><ShieldCheck size={14} /></span><span><b>Workspace boundary</b><small>AURIX cannot access other workspaces through this chat endpoint.</small></span></div><span className="state-chip state-draft">PROTOTYPE</span></div>
      </>}
    </section>
  </div>;
}
