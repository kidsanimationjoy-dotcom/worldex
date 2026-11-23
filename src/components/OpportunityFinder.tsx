import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BriefcaseBusiness, CheckCircle2, ChevronRight, Clock3, Compass, FileSearch, Filter, MapPin, ShieldAlert, Sparkles, Wallet, X } from "lucide-react";
import { categories, demoOpportunities } from "../lib/opportunities";
import type { Opportunity, OpportunityCategory } from "../types";

const categoryIcons: Record<OpportunityCategory, typeof Compass> = {
  "Remote jobs": BriefcaseBusiness, Freelance: Compass, "Business models": ArrowUpRight,
  "Creator opportunities": Sparkles, "Digital product ideas": FileSearch,
};

export function OpportunityFinder() {
  const [category, setCategory] = useState<OpportunityCategory>("Remote jobs");
  const [selectedId, setSelectedId] = useState(demoOpportunities[0].id);
  const [search, setSearch] = useState("");
  const [showDemo, setShowDemo] = useState(true);
  const visible = useMemo(() => demoOpportunities.filter((opportunity) => opportunity.category === category)
    .filter((opportunity) => `${opportunity.title} ${opportunity.summary} ${opportunity.skills.join(" ")}`.toLowerCase().includes(search.toLowerCase())), [category, search]);
  const selected = visible.find((opportunity) => opportunity.id === selectedId) ?? visible[0] ?? null;

  const changeCategory = (next: OpportunityCategory) => {
    setCategory(next);
    const nextItem = demoOpportunities.find((item) => item.category === next);
    setSelectedId(nextItem?.id ?? "");
  };

  return <div className="opportunity-page">
    <div className="module-page-heading"><div><div className="eyebrow">EXPLORE WHAT’S NEXT</div><h1>Opportunity Finder</h1><p>Research possible paths. Every live listing needs a verified source before you act.</p></div><div className="demo-watermark"><span className="status-dot status-dot-amber" /> LIVE SOURCES NOT CONNECTED</div></div>
    <div className="opportunity-banner"><div className="banner-icon"><ShieldAlert size={16} /></div><div><b>No live opportunities are connected.</b><p>These are structured examples for interface review—not jobs, verified listings or market research.</p></div><button className="banner-toggle" onClick={() => setShowDemo((value) => !value)}>{showDemo ? "Hide demo examples" : "Show demo examples"}</button></div>
    <div className="opportunity-body">
      <aside className="opportunity-filters"><div className="filter-title"><span className="eyebrow">DISCOVER BY TYPE</span><Filter size={14} /></div>
        {categories.map((item) => { const Icon = categoryIcons[item]; return <button key={item} className={`opportunity-category ${category === item ? "active" : ""}`} onClick={() => changeCategory(item)}><Icon size={16} /><span>{item}</span><ChevronRight size={14} /></button>; })}
        <div className="eligibility-note"><MapPin size={15} /><span><b>Region is not set</b><small>Add a country in workspace settings to help define eligibility before a live source is connected.</small></span></div>
        <div className="finder-guardrail"><CheckCircle2 size={14} /><span>No earnings are promised. Demo details are explicitly unverified.</span></div>
      </aside>
      <section className="opportunity-list-pane"><div className="result-header"><div><span className="eyebrow">{category.toUpperCase()}</span><h2>Explore a possible path</h2></div><span className="result-count">{showDemo ? visible.length : 0} {showDemo ? "demo examples" : "live listings"}</span></div>
        <label className="search-field opportunity-search"><FileSearch size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search example skills or topics" aria-label="Search opportunity examples" />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={13} /></button>}</label>
        {!showDemo ? <div className="empty-opportunities"><div className="empty-orbit"><Compass size={17} /></div><b>Waiting for a verified source</b><p>Connect an approved data source to show live listings. No opportunities are being fabricated.</p><span className="state-chip state-limited">NOT CONNECTED</span></div> : visible.length ? <div className="opportunity-list">{visible.map((item, index) => <OpportunityRow key={item.id} item={item} active={selected?.id === item.id} onClick={() => setSelectedId(item.id)} index={index} />)}</div> : <div className="mini-empty opportunity-none"><b>No matching demo examples</b><p>Try another search term.</p></div>}
        <div className="demo-footnote">DEMO DATA <span>·</span> Illustrative schema only <span>·</span> No live search or applications</div>
      </section>
      <section className="opportunity-detail-pane">{selected && showDemo ? <OpportunityDetail opportunity={selected} /> : <div className="detail-placeholder"><span className="detail-target"><Compass size={21} /></span><span className="eyebrow">DETAIL VIEW</span><h3>No live listing to show</h3><p>Select a demo example to see how the evidence and eligibility fields will appear when a verified source is connected.</p><div className="detail-lines"><span /><span /><span /></div><span className="state-chip state-muted">SOURCE REQUIRED</span></div>}</section>
    </div>
    <div className="disclaimer-line"><ShieldAlert size={14} /><span>Opportunity details and earning estimates must be verified against a genuine source. DEMO DATA is never a recommendation or promise of income.</span></div>
  </div>;
}

function OpportunityRow({ item, active, onClick, index }: { item: Opportunity; active: boolean; onClick: () => void; index: number }) {
  const Icon = categoryIcons[item.category];
  return <button className={`opportunity-row ${active ? "active" : ""}`} onClick={onClick}>
    <span className="row-index">0{index + 1}</span><span className="row-icon"><Icon size={16} /></span><span className="row-main"><b>{item.title}</b><small>{item.summary}</small><span className="row-meta"><span><Wallet size={11} /> {item.startupCost.split(";")[0]}</span><span><Clock3 size={11} /> {item.timeCommitment.split(";")[0]}</span></span></span><span className="row-disclosure">DEMO</span><ChevronRight size={14} className="row-chevron" />
  </button>;
}

function OpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  return <article className="opportunity-detail">
    <div className="detail-topline"><span className="state-chip state-demo">DEMO DATA</span><span className="detail-id">REF · {opportunity.id.toUpperCase().replaceAll("-", "—")}</span></div>
    <h2>{opportunity.title}</h2><p className="detail-summary">{opportunity.summary}</p>
    <div className="source-box"><div><FileSearch size={14} /><span><b>Source</b><small>{opportunity.source}</small></span></div><span className="verification-chip"><span className="status-dot status-dot-amber" />{opportunity.verification}</span></div>
    <div className="detail-section"><div className="eyebrow">ELIGIBILITY & SCOPE</div><p>{opportunity.eligibility}</p></div>
    <div className="detail-metrics"><div><span className="eyebrow">DIFFICULTY</span><b>{opportunity.difficulty}</b></div><div><span className="eyebrow">STARTUP COST</span><b>{opportunity.startupCost}</b></div><div><span className="eyebrow">TIME COMMITMENT</span><b>{opportunity.timeCommitment}</b></div><div><span className="eyebrow">COMPETITION</span><b>{opportunity.competition}</b></div></div>
    <div className="detail-section earning-section"><div className="eyebrow">EARNING RANGE · UNCERTAIN</div><div className="earning-range">{opportunity.earningRange}</div><p>{opportunity.earningEvidence}</p></div>
    <div className="detail-section"><div className="eyebrow">SKILLS TO CONSIDER</div><div className="skill-pills">{opportunity.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
    <div className="detail-section"><div className="eyebrow">RISKS & OPEN QUESTIONS</div><ul className="risk-list">{opportunity.risks.map((risk) => <li key={risk}><span><ArrowDownRight size={12} /></span>{risk}</li>)}</ul></div>
    <div className="detail-section start-steps"><div className="eyebrow">POSSIBLE NEXT STEPS · VERIFY FIRST</div><ol>{opportunity.steps.map((step, i) => <li key={step}><i>0{i + 1}</i>{step}</li>)}</ol></div>
  </article>;
}
