import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowUp, Bot, Check, ChevronDown, Clock3, MessageSquarePlus, Paperclip, Pencil, Plus, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import type { Chat } from "../types";

interface Props {
  workspaceName: string;
  chats: Chat[];
  createSignal: boolean;
  onCreateHandled: () => void;
  onCreate: (title?: string) => Chat;
  onSaveDraft: (chatId: string, text: string) => void;
  onRename: (chatId: string, title: string) => void;
  onArchive: (chatId: string, archived: boolean) => void;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function ChatView({ workspaceName, chats, createSignal, onCreateHandled, onCreate, onSaveDraft, onRename, onArchive }: Props) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [notice, setNotice] = useState("");
  const handledCreateSignal = useRef(false);

  const filtered = useMemo(() => chats.filter((chat) => Boolean(chat.archivedAt) === showArchived)
    .filter((chat) => `${chat.title} ${chat.messages.map((message) => message.text).join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [chats, query, showArchived]);
  const active = filtered.find((chat) => chat.id === activeId) ?? filtered[0] ?? null;

  const startChat = () => {
    const chat = onCreate();
    setActiveId(chat.id);
    setShowArchived(false);
    setDraft("");
    setNotice("New workspace-local draft created.");
    window.setTimeout(() => setNotice(""), 2800);
  };

  useEffect(() => {
    if (!createSignal) {
      handledCreateSignal.current = false;
    } else if (!handledCreateSignal.current) {
      handledCreateSignal.current = true;
      startChat();
      onCreateHandled();
    }
  }, [createSignal]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!active || !draft.trim()) return;
    onSaveDraft(active.id, draft.trim());
    setDraft("");
    setNotice("Draft saved in this browser. No message was sent to AURIX.");
    window.setTimeout(() => setNotice(""), 4000);
  };

  const beginRename = (chat: Chat) => {
    setRenameId(chat.id);
    setRenameValue(chat.title);
  };
  const finishRename = (event: FormEvent) => {
    event.preventDefault();
    if (renameId && renameValue.trim()) onRename(renameId, renameValue.trim());
    setRenameId(null);
  };

  return <div className="chat-layout">
    <aside className="chat-index">
      <div className="chat-index-top"><div><span className="eyebrow">AURIX / CHAT</span><h2>Your conversations</h2></div><button className="icon-button new-chat-icon" onClick={startChat} aria-label="New chat" title="New chat"><Plus size={16} /></button></div>
      <button className="primary-button full-width new-chat-button" onClick={startChat}><MessageSquarePlus size={16} /> New Chat</button>
      <label className="search-field"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats & notes" aria-label="Search chats" />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>}</label>
      <div className="chat-list-toggle"><button className={!showArchived ? "active" : ""} onClick={() => setShowArchived(false)}>Active <span>{chats.filter((c) => !c.archivedAt).length}</span></button><button className={showArchived ? "active" : ""} onClick={() => setShowArchived(true)}>Archived <span>{chats.filter((c) => c.archivedAt).length}</span></button></div>
      <div className="conversation-list" aria-label={showArchived ? "Archived conversations" : "Active conversations"}>
        {filtered.length ? filtered.map((chat) => <button key={chat.id} className={`conversation-item ${active?.id === chat.id ? "selected" : ""}`} onClick={() => { setActiveId(chat.id); setDraft(""); }}>
          <span className="conversation-glyph"><span /></span><span className="conversation-copy"><b>{chat.title || "Untitled chat"}</b><small>{chat.messages.length ? `${chat.messages.length} saved ${chat.messages.length === 1 ? "draft" : "drafts"}` : "New conversation"}</small></span><span className="conversation-state">DRAFT</span>
        </button>) : <div className="mini-empty"><span className="empty-orbit"><MessageSquarePlus size={15} /></span><b>{query ? "No matches" : showArchived ? "No archived chats" : "A clean slate"}</b><p>{query ? "Try another search term." : showArchived ? "Archived chats can be reopened here." : "Start a separate conversation for this workspace."}</p></div>}
      </div>
      <div className="chat-scope-note"><ShieldCheck size={15} /><span><b>Workspace only</b><small>{workspaceName}</small></span></div>
    </aside>

    <section className="chat-stage">
      <div className="chat-stage-head"><div className="aurix-lockup"><span className="aurix-avatar"><Sparkles size={18} /></span><span><b>AURIX</b><small>WORKSPACE AI EMPLOYEE</small></span></div><div className="provider-status"><span className="status-dot status-dot-amber" /> AI NOT CONFIGURED</div></div>
      {!active ? <div className="chat-welcome"><div className="aurix-large"><Sparkles size={25} /></div><div className="eyebrow violet-eyebrow">YOUR WORKSPACE ASSISTANT</div><h1>Think it through.<br /><em>One workspace at a time.</em></h1><p>AURIX can use only context approved for <strong>{workspaceName}</strong>. Connect a real AI provider in a future setup to enable answers. Nothing is sent to an AI in this MVP.</p><button className="secondary-button" onClick={startChat}><Plus size={15} /> Create a draft conversation</button></div> : <>
        <div className="active-chat-heading"><div><div className="eyebrow">CURRENT WORKSPACE · {workspaceName}</div><h2>{active.title}</h2><span><Clock3 size={12} /> Updated {timeLabel(active.updatedAt)}</span></div><div className="chat-actions">{renameId === active.id ? <form className="rename-inline" onSubmit={finishRename}><input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label="Conversation name" maxLength={65} /><button aria-label="Save name"><Check size={14} /></button><button type="button" aria-label="Cancel rename" onClick={() => setRenameId(null)}><X size={14} /></button></form> : <button className="icon-button" onClick={() => beginRename(active)} aria-label="Rename chat" title="Rename"><Pencil size={15} /></button>}
          {active.archivedAt ? <button className="secondary-button compact-button" onClick={() => { onArchive(active.id, false); setShowArchived(false); }}>Reopen <ArrowUp size={13} /></button> : <button className="icon-button" onClick={() => onArchive(active.id, true)} aria-label="Archive chat" title="Archive chat"><Archive size={15} /></button>}</div></div>
        <div className="chat-briefing"><span className="briefing-orbit"><Bot size={16} /></span><div><b>This conversation is saved as a local draft.</b><p>There is no AI provider connected, so AURIX will not generate replies or run tasks. Notes are stored in this browser profile; there is no user sign-in to restrict access.</p></div><span className="state-chip state-draft">DRAFT</span></div>
        <div className="chat-transcript" aria-live="polite">
          {!active.messages.length ? <div className="transcript-empty"><div className="dotted-line" /><span>Nothing here yet</span><small>Save a local note below to keep context for later.</small><div className="dotted-line" /></div> : active.messages.map((message) => <article className="saved-note" key={message.id}><div className="note-avatar">YOU</div><div><div className="note-label">LOCAL DRAFT <span>·</span> {timeLabel(message.createdAt)}</div><p>{message.text}</p></div></article>)}
        </div>
        {notice && <div role="status" className="inline-feedback"><Check size={14} /> {notice}</div>}
        <form className="composer" onSubmit={save}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a local note for this conversation…" rows={3} aria-label="Local conversation draft" maxLength={5000} />
          <div className="composer-tools"><span><button type="button" className="composer-attach" disabled title="Attachments are not implemented in this local MVP"><Paperclip size={14} /> Attach <small>not available</small></button><span className="composer-hint">Browser-profile only · not protected by a user sign-in.</span></span><button type="submit" className="primary-button" disabled={!draft.trim()}><span>Save draft</span><ArrowUp size={15} /></button></div>
        </form>
        <div className="approval-row"><div><span className="approval-shield"><ShieldCheck size={14} /></span><span><b>Approvals</b><small>No pending approvals in this workspace.</small></span></div><button disabled title="No live task provider is configured">Inbox <ChevronDown size={13} /></button></div>
      </>}
    </section>
  </div>;
}
