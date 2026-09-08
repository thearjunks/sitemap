"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardSidebar } from "../dashboard-sidebar";

type Item = { id: number; url: string; domain: string; status: string; httpCode: number | null; finalUrl: string | null; lastCheckedAt: string | null };
const statuses = ["All statuses", "Live", "Redirected", "404", "410", "Server Error", "Unavailable", "Not active", "Unknown"];
const statusClass: Record<string, string> = { Live: "live", Redirected: "redirected", "404": "not-found", "410": "gone", "Server Error": "server-error", Unavailable: "unavailable", Unknown: "unknown" };
const fmt = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Not checked";

export function StatusDashboard() {
  const [urls, setUrls] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [domain, setDomain] = useState("All domains");
  const [sort, setSort] = useState("Recently checked");
  const [selected, setSelected] = useState<number[]>([]);
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [addingToAll, setAddingToAll] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => setUrls((await (await fetch("/api/general-urls")).json()).urls);
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  const domains = useMemo(() => [...new Set(urls.map((item) => item.domain))].sort(), [urls]);
  const filtered = useMemo(() => urls.filter((item) => {
    const inactive = ["404", "410", "Server Error", "Unavailable"].includes(item.status);
    const statusMatch = status === "All statuses" || item.status === status || (status === "Not active" && inactive);
    return statusMatch && (domain === "All domains" || item.domain === domain) && `${item.url} ${item.finalUrl || ""}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => sort === "URL A–Z" ? a.url.localeCompare(b.url) : sort === "Status" ? a.status.localeCompare(b.status) : String(b.lastCheckedAt || "").localeCompare(String(a.lastCheckedAt || ""))), [urls, status, domain, query, sort]);
  const count = (value: string) => urls.filter((item) => item.status === value).length;

  const add = async () => {
    const values = input.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    if (!values.length) return;
    const response = await fetch("/api/general-urls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", urls: values }) });
    const data = await response.json(); setUrls(data.urls); setInput(""); setMessage(`${data.added} URL${data.added === 1 ? "" : "s"} added`);
  };
  const check = async (ids: number[] = []) => {
    if (checking) return;
    const targets = ids.length ? ids : urls.map((item) => item.id);
    if (!targets.length) return setMessage("Add at least one URL first");
    let done = 0; setChecking({ done, total: targets.length }); setMessage("");
    try {
      for (let start = 0; start < targets.length; start += 20) {
        const response = await fetch("/api/general-urls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", ids: targets.slice(start, start + 20) }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Check failed");
        const updates = new Map((data.urls as Item[]).map((item) => [item.id, item]));
        setUrls((current) => current.map((item) => updates.get(item.id) || item));
        done += data.checked; setChecking({ done, total: targets.length });
      }
      setSelected([]); setMessage(`${done} URLs checked`);
    } catch (error) { setMessage(`${done} of ${targets.length} checked. ${error instanceof Error ? error.message : "Checking stopped"}`); }
    finally { setChecking(null); }
  };
  const remove = async (ids: number[]) => {
    if (!ids.length || !confirm("Are you sure you want to delete the selected URLs?")) return;
    const data = await (await fetch("/api/general-urls", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })).json();
    setUrls(data.urls); setSelected([]); setMessage(ids.length === 1 ? "URL deleted" : "Selected URLs deleted");
  };
  const addToAllUrls = async (ids: number[]) => {
    const targets = urls.filter((item) => ids.includes(item.id));
    if (!targets.length || addingToAll) return;
    setAddingToAll(true); setMessage("");
    try {
      const response = await fetch("/api/urls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", urls: targets }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Add failed");
      const skipped = targets.length - data.added;
      setSelected([]); setMessage(`${data.added} URL${data.added === 1 ? "" : "s"} added to All URLs${skipped ? ` · ${skipped} already existed or were not STC URLs` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add URLs"); }
    finally { setAddingToAll(false); }
  };
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((item) => item.id));
  const metrics = [["Total", urls.length, "#2e6fbe"], ["Live", count("Live"), "#17845b"], ["Redirected", count("Redirected"), "#c66a18"], ["404 / 410", count("404") + count("410"), "#c74343"], ["Unavailable / errors", count("Unavailable") + count("Server Error"), "#8d3f64"], ["Unknown", count("Unknown"), "#69758c"]];

  return <div className="app-shell">
    {checking && <div className="loading-line" />}
    <DashboardSidebar active="status" />
    <main className="main">
      <header className="topbar"><div className="top-title"><span className="top-product">STC URL intelligence</span><span>URL checking workspace</span></div><div className="top-actions"><Link className="btn" href="/#url-registry">View All URLs</Link></div></header>
      <div className="content">
    <div className="heading-row"><div><span className="page-label">URL checker</span><h1>Check URLs before monitoring</h1><p className="subhead">Test any domain, review redirects and errors, then move approved URLs into the master registry.</p></div><button className="btn primary" disabled={Boolean(checking)} onClick={() => check()}>{checking ? `Checking ${checking.done} / ${checking.total}` : "⟳ Check all now"}</button></div>
    <section className="panel add-panel"><div><div className="panel-title">Add URLs to the checking queue</div><div className="panel-meta">Paste one URL per line, or separate multiple URLs with commas.</div></div><div className="add-grid"><textarea aria-label="URLs to add" placeholder={'https://example.com/\nhttps://example.com/contact'} value={input} onChange={(event) => setInput(event.target.value)} /><button className="btn primary" onClick={add}>＋ Add to queue</button></div>{message && <div className="status-message" role="status">{message}</div>}</section>
    {checking && <div className="check-progress"><div className="check-progress-copy"><strong>Checking URLs…</strong><span>{checking.done} of {checking.total}</span></div><div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={checking.total} aria-valuenow={checking.done}><div className="progress-fill" style={{ width: `${Math.round(checking.done / checking.total * 100)}%` }} /></div><div className="panel-meta">Keep this page open while the check is running.</div></div>}
    <section className="metrics status-metrics">{metrics.map(([label, value, accent]) => <div className="metric" key={String(label)} style={{ "--accent": accent } as React.CSSProperties}><div className="metric-top">{label}</div><div className="metric-value">{value}</div></div>)}</section>
    <section className="panel"><div className="panel-head"><div><div className="panel-title">Monitored URLs</div><div className="panel-meta">Current status, redirect destination, and last check time</div></div>{selected.length > 0 && <div className="button-row"><span className="selected-bar">{selected.length} selected</span><button className="btn primary" disabled={Boolean(checking) || addingToAll} onClick={() => addToAllUrls(selected)}>{addingToAll ? "Adding…" : "＋ Add Selected to All URLs"}</button><button className="btn" disabled={Boolean(checking)} onClick={() => check(selected)}>Check selected</button><button className="btn danger" onClick={() => remove(selected)}>Delete Selected</button></div>}</div>
      <div className="toolbar"><div className="toolbar-left"><div className="search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search URLs" aria-label="Search URLs" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status filter">{statuses.map((item) => <option key={item}>{item}</option>)}</select><select value={domain} onChange={(event) => setDomain(event.target.value)} aria-label="Domain filter"><option>All domains</option>{domains.map((item) => <option key={item}>{item}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort URLs"><option>Recently checked</option><option>URL A–Z</option><option>Status</option></select>{(query || status !== "All statuses" || domain !== "All domains") && <button className="text-btn" onClick={() => { setQuery(""); setStatus("All statuses"); setDomain("All domains"); }}>Clear filters</button>}</div></div>
      <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible URLs" checked={filtered.length > 0 && selected.length === filtered.length} onChange={toggleAll} /></th><th>URL</th><th>Domain</th><th>Status</th><th>Final destination</th><th>Last checked</th><th>Actions</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} aria-label={`Select ${item.url}`} /></td><td className="url-cell"><a className="url-primary url-link mono" href={item.url} target="_blank" rel="noreferrer">{item.url}<span aria-hidden="true">↗</span></a></td><td>{item.domain}</td><td><span className={`badge ${statusClass[item.status] || "unknown"}`}>{item.status}{item.httpCode ? ` · ${item.httpCode}` : ""}</span></td><td className="url-cell">{item.finalUrl ? <a className="url-secondary url-link mono" href={item.finalUrl} target="_blank" rel="noreferrer">{item.finalUrl}<span aria-hidden="true">↗</span></a> : <span className="panel-meta">—</span>}</td><td>{fmt(item.lastCheckedAt)}</td><td><div className="table-actions"><button className="mini-btn" disabled={Boolean(checking) || addingToAll} onClick={() => addToAllUrls([item.id])}>Add</button><button className="mini-btn" disabled={Boolean(checking)} onClick={() => check([item.id])}>Check</button><button className="mini-btn danger" onClick={() => remove([item.id])}>Delete</button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><strong>{urls.length ? "No URLs match these filters." : "No URLs added yet."}</strong><br />{urls.length ? "Try clearing a filter." : "Add your first URL above."}</div>}</div><div className="panel-foot"><span>Showing {filtered.length} of {urls.length} URLs</span><span>Select URLs to add them to All URLs and the live XML sitemap</span></div>
    </section>
      </div>
    </main>
  </div>;
}
