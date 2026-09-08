"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "../dashboard-sidebar";

type RemovedUrl = { id: number; url: string; label: string; group: string; removedAt: string | null; removedBy: string | null; removalReason: string | null; statusBeforeRemoval: string | null };
type Payload = { removedUrls?: RemovedUrl[]; settings?: { schedule?: string } };
const fmtTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Unknown";

export function RemovedUrlsDashboard() {
  const [data, setData] = useState<Payload>({ removedUrls: [], settings: {} });
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Recently removed");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = async () => { setLoading(true); try { setData(await (await fetch("/api/urls")).json()); } finally { setLoading(false); } };
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  const removed = useMemo(() => data.removedUrls || [], [data.removedUrls]);
  const filtered = useMemo(() => removed.filter((item) => `${item.url} ${item.label} ${item.removedBy || ""} ${item.removalReason || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "URL A–Z" ? a.url.localeCompare(b.url) : sort === "Removed by" ? String(a.removedBy || "").localeCompare(String(b.removedBy || "")) : String(b.removedAt || "").localeCompare(String(a.removedAt || ""))), [removed, query, sort]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((item) => item.id));
  const restore = async (ids: number[]) => {
    if (!ids.length) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/urls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", ids }) });
      const text = await response.text();
      if (!text) throw new Error("The server returned an empty response. Please try again.");
      let payload: { error?: string; restored?: number; restoredIds?: number[] };
      try { payload = JSON.parse(text); } catch { throw new Error("The server response was incomplete. Please try again."); }
      if (!response.ok) throw new Error(payload.error || "Restore failed");
      const restoredIds = new Set((payload.restoredIds || ids).map(Number));
      setData((current) => ({ ...current, removedUrls: (current.removedUrls || []).filter((item) => !restoredIds.has(item.id)) }));
      setSelected([]); setMessage(`${payload.restored || restoredIds.size} URL${(payload.restored || restoredIds.size) === 1 ? "" : "s"} restored to All URLs`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Restore failed"); }
    finally { setLoading(false); }
  };

  return <div className="app-shell">
    {loading && <div className="loading-line" />}
    <DashboardSidebar active="removed" schedule={data.settings?.schedule} />
    <main className="main">
      <header className="topbar"><div className="top-title"><span className="top-product">STC URL intelligence</span><span>Removal archive</span></div><div className="top-actions"><a className="btn" href="/#url-registry">View All URLs</a><button className="icon-btn" aria-label="Refresh removed URLs" title="Refresh removed URLs" onClick={load}>⟳</button></div></header>
      <div className="content">
        <div className="heading-row"><div><span className="page-label">Archive</span><h1>Removed URLs</h1><p className="subhead">Review archived records, see who removed them and why, or restore them to active monitoring.</p></div>{selected.length > 0 && <button className="btn primary" disabled={loading} onClick={() => restore(selected)}>↶ Restore selected ({selected.length})</button>}</div>
        {message && <div className="notice"><span><strong>{message}</strong></span></div>}
        <section className="metrics removed-metrics" aria-label="Removed URL summary"><div className="metric" style={{ "--accent": "#c74343" } as React.CSSProperties}><div className="metric-top"><span>Removed URLs</span><span className="metric-icon">⌫</span></div><div className="metric-value">{removed.length}</div><div className="metric-note">Excluded from monitoring and sitemap</div></div></section>
        <section className="panel">
          <div className="panel-head"><div><div className="panel-title">Removal archive</div><div className="panel-meta">Removal details are retained until the URL is restored</div></div></div>
          <div className="toolbar"><div className="toolbar-left"><div className="search"><input aria-label="Search removed URLs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search URL, user, or reason" /></div><select aria-label="Sort removed URLs" value={sort} onChange={(event) => setSort(event.target.value)}><option>Recently removed</option><option>URL A–Z</option><option>Removed by</option></select>{query && <button className="text-btn" onClick={() => setQuery("")}>Clear search</button>}</div><div className="toolbar-right">{selected.length > 0 && <><span className="selected-bar">{selected.length} selected</span><button className="btn primary" disabled={loading} onClick={() => restore(selected)}>Restore selected</button></>}</div></div>
          <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible removed URLs" checked={filtered.length > 0 && selected.length === filtered.length} onChange={toggleAll} /></th><th>Removed URL</th><th>Removed date & time</th><th>Removed by</th><th>Reason</th><th>Actions</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`Select ${item.url}`} checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} /></td><td className="url-cell"><div className="url-primary">{item.label || item.url}</div><a className="url-secondary url-link mono" href={item.url} target="_blank" rel="noreferrer">{item.url}<span aria-hidden="true">↗</span></a>{item.statusBeforeRemoval && <div className="url-secondary">Previous status: {item.statusBeforeRemoval}</div>}</td><td>{fmtTime(item.removedAt)}</td><td>{item.removedBy || "Local user"}</td><td className="reason-cell">{item.removalReason || "—"}</td><td><button className="mini-btn" disabled={loading} onClick={() => restore([item.id])}>Restore</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><strong>{removed.length ? "No removed URLs match your search." : "No removed URLs."}</strong><br />{removed.length ? "Try another search term." : "URLs removed from All URLs will appear here."}</div>}</div>
          <div className="panel-foot"><span>Showing {filtered.length} of {removed.length} removed URLs</span><span>Restored URLs return to All URLs</span></div>
        </section>
      </div>
    </main>
  </div>;
}
