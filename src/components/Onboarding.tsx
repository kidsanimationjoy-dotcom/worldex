import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, Check, Gamepad2, Globe2, Handshake, Sparkles } from "lucide-react";
import type { Accent, Intent, WorkspaceKind } from "../types";

export interface WorkspaceDraft {
  name: string;
  kind: WorkspaceKind;
  intent: Intent;
  description: string;
  goals: string[];
  country: string;
  currency: string;
  accent: Accent;
}

interface Props {
  onCreate: (draft: WorkspaceDraft) => void;
  onCancel?: () => void;
  existingCount: number;
}

const paths: { id: Intent; title: string; copy: string; icon: typeof Building2 }[] = [
  { id: "already-business", title: "I already have a business", copy: "Keep your company operations in one focused workspace.", icon: Building2 },
  { id: "start-business", title: "I want to start a business", copy: "Shape an early-stage idea into a practical plan.", icon: Sparkles },
  { id: "online-work", title: "I’m looking for online work", copy: "Organise a personal job or freelance journey.", icon: BriefcaseBusiness },
  { id: "create-products", title: "I create games or digital products", copy: "Build a home for a game, creator or product project.", icon: Gamepad2 },
  { id: "manage-clients", title: "I manage client accounts", copy: "Separate every client environment from your own.", icon: Handshake },
];
const accents: { id: Accent; label: string }[] = [
  { id: "blue", label: "Orbit blue" }, { id: "violet", label: "Aurix violet" },
  { id: "mint", label: "Signal mint" }, { id: "amber", label: "Solar amber" }, { id: "rose", label: "Pulse rose" },
];

function kindFor(intent: Intent, productMode: "digital" | "game"): WorkspaceKind {
  if (intent === "already-business") return "Business";
  if (intent === "start-business") return "Startup";
  if (intent === "online-work") return "Freelance";
  if (intent === "manage-clients") return "Client services";
  return productMode === "game" ? "Game studio" : "Creator";
}
function accentFor(intent: Intent, productMode: "digital" | "game"): Accent {
  if (intent === "already-business") return "blue";
  if (intent === "start-business") return "violet";
  if (intent === "online-work") return "mint";
  if (intent === "manage-clients") return "amber";
  return productMode === "game" ? "violet" : "rose";
}
function defaultName(intent: Intent, productMode: "digital" | "game") {
  if (intent === "already-business") return "My business";
  if (intent === "start-business") return "New venture";
  if (intent === "online-work") return "My work search";
  if (intent === "manage-clients") return "Client portfolio";
  return productMode === "game" ? "Game project" : "Digital products";
}

export function Onboarding({ onCreate, onCancel, existingCount }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [productMode, setProductMode] = useState<"digital" | "game">("digital");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [accent, setAccent] = useState<Accent>("blue");
  const [error, setError] = useState("");
  const chosenKind = useMemo(() => intent ? kindFor(intent, productMode) : null, [intent, productMode]);

  const chooseIntent = (next: Intent) => {
    setIntent(next);
    if (next === "create-products") setProductMode("digital");
    setAccent(accentFor(next, next === "create-products" ? "digital" : productMode));
    setName(defaultName(next, next === "create-products" ? "digital" : productMode));
    setStep(2);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!intent || !chosenKind || !name.trim()) {
      setError("Add a workspace name to continue.");
      return;
    }
    onCreate({
      name: name.trim(), kind: chosenKind, intent, description: description.trim(),
      goals: goals.split(/[\n,]/).map((goal) => goal.trim()).filter(Boolean).slice(0, 8),
      country: country.trim(), currency: currency.trim().toUpperCase(), accent,
    });
  };

  return (
    <main className="onboarding-screen">
      <div className="onboarding-topline">
        <div className="brand-lockup"><span className="brand-symbol"><Globe2 size={23} strokeWidth={1.55} /></span><span>WORLD<span className="brand-cut">EX</span></span></div>
        <span className="onboarding-progress">{existingCount ? `${existingCount} ${existingCount === 1 ? "workspace" : "workspaces"} already created` : "WORKSPACE SETUP · 2 STEPS"}</span>
        {onCancel && <button className="quiet-button" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="onboarding-layout">
        <section className="onboarding-pitch">
          <div className="eyebrow violet-eyebrow"><span className="status-dot status-dot-violet" /> ONE WORLD. UNLIMITED POSSIBILITIES.</div>
          <h1>{existingCount ? "Create a world of your own." : "Where does your next chapter begin?"}</h1>
          <p>Every workspace starts clean. Bring only the context that belongs here—projects, conversations and approved connections stay in their own orbit.</p>
          <div className="orbit-visual onboarding-orbit" aria-hidden="true">
            <div className="orbit-halo" /><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-ring orbit-ring-three" />
            <span className="orbit-node orbit-node-a" /><span className="orbit-node orbit-node-b" /><span className="orbit-node orbit-node-c" />
            <div className="orbit-core"><Globe2 size={50} strokeWidth={1.2} /><span>W</span></div>
            <span className="orbit-caption orbit-caption-left">YOUR SPACE</span><span className="orbit-caption orbit-caption-right">YOUR DIRECTION</span>
          </div>
          <div className="isolation-pill"><span className="isolation-shield">◈</span><span><b>Isolated by default</b><small>No chats, files or accounts carry over.</small></span><Check size={15} /></div>
        </section>
        <section className="onboarding-form-panel">
          <div className="wizard-steps"><span className={step === 1 ? "wizard-step active" : "wizard-step complete"}><i>{step > 1 ? <Check size={12} /> : "01"}</i> YOUR PATH</span><span className="wizard-line" /><span className={step === 2 ? "wizard-step active" : "wizard-step"}><i>02</i> YOUR SPACE</span></div>
          {step === 1 ? <>
            <div className="wizard-heading"><div className="eyebrow">LET’S SET YOUR INTENT</div><h2>What brings you here?</h2><p>Choose the closest fit. You can add more workspaces at any time.</p></div>
            <div className="intent-list">
              {paths.map(({ id, title, copy, icon: Icon }) => <button className="intent-option" key={id} onClick={() => chooseIntent(id)}>
                <span className="intent-icon"><Icon size={18} /></span><span className="intent-copy"><b>{title}</b><small>{copy}</small></span><ArrowRight size={16} className="intent-arrow" />
              </button>)}
            </div>
          </> : <>
            <div className="wizard-heading"><div className="eyebrow">SET UP A WORKSPACE</div><h2>Give it a direction.</h2><p>Optional fields can be left blank and updated later.</p></div>
            <form className="workspace-form" onSubmit={submit}>
              <label className="field-label">WORKSPACE NAME <span>Required</span><input autoFocus maxLength={44} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northstar Studio" /></label>
              {intent === "create-products" && <fieldset className="choice-field"><legend>WHAT ARE YOU CREATING?</legend><div className="segmented-control"><button type="button" onClick={() => { setProductMode("digital"); setAccent(accentFor(intent, "digital")); if (!name || name === "Game project") setName("Digital products"); }} className={productMode === "digital" ? "selected" : ""}>Digital products</button><button type="button" onClick={() => { setProductMode("game"); setAccent(accentFor(intent, "game")); if (!name || name === "Digital products") setName("Game project"); }} className={productMode === "game" ? "selected" : ""}>Games</button></div></fieldset>}
              <div className="type-note"><span className="type-marker" style={{ "--accent": `var(--${accent})` } as React.CSSProperties} /><span>Workspace type</span><b>{chosenKind}</b></div>
              <label className="field-label">SHORT DESCRIPTION <span>Optional</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="What does this workspace focus on?" rows={2} /></label>
              <label className="field-label">GOALS <span>Optional · separate with commas</span><input value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Validate an idea, find first clients" /></label>
              <div className="field-row"><label className="field-label">COUNTRY <span>Optional</span><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Canada" /></label><label className="field-label">CURRENCY <span>Optional</span><input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" maxLength={3} /></label></div>
              <fieldset className="choice-field accent-field"><legend>ACCENT COLOR</legend><div className="accent-choices">{accents.map((item) => <button key={item.id} type="button" title={item.label} aria-label={`${item.label}${accent === item.id ? ", selected" : ""}`} onClick={() => setAccent(item.id)} className={`accent-choice ${accent === item.id ? "chosen" : ""}`} style={{ "--accent": `var(--${item.id})` } as React.CSSProperties}><span /></button>)}</div></fieldset>
              {error && <p role="alert" className="form-error">{error}</p>}
              <div className="wizard-actions"><button type="button" className="secondary-button" onClick={() => setStep(1)}><ArrowLeft size={15} /> Back</button><button className="primary-button" type="submit">Create workspace <ArrowRight size={15} /></button></div>
              <p className="local-disclosure">Browser-profile storage only · no sign-in or provider accounts are connected.</p>
            </form>
          </>}
        </section>
      </div>
      <div className="onboarding-footer"><span>AURIX · WORKSPACE CONTEXT ISOLATED</span><span>© WORLDEX · LOCAL MVP PREVIEW</span></div>
    </main>
  );
}
