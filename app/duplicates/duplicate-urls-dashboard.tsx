"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "../dashboard-sidebar";
import { duplicateKey } from "../url-duplicates";

type UrlItem = {
  id: number; url: string; label: string; group: string; status: string; httpCode: number | null;
  finalUrl: string | null; lastCheckedAt: string | null; createdAt: string;
};
type Payload = { urls?: UrlItem[]; settings?: { schedule?: string } };
type DuplicateGroup = { key: string; items: UrlItem[] };

const fmtTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Not checked";

export function DuplicateUrlsDashboard() {
  const [data, setData] = useState<Payload>({ urls: [], settings: {} });
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/urls");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load duplicate URLs");
      setData(payload);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load duplicate URLs"); }
    finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);

  const groups = useMemo<DuplicateGroup[]>(() => {
    const grouped = new Map<string, UrlItem[]>();
    for (const item of data.urls || []) {
      const key = duplicateKey(item.url);
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    return [...grouped.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({ key, items: items.sort((a, b) => a.id - b.id) }))
      .filter((group) => group.items.some((item) => `${item.url} ${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase())))
      .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
  }, [data.urls, query]);
  const duplicateItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const extraIds = useMemo(() => groups.flatMap((group) => group.items.slice(1).map((item) => item.id)), [groups]);
  const allIds = useMemo(() => duplicateItems.map((item) => item.id), [duplicateItems]);
  const toggleAll = () => setSelected(selected.length === allIds.length ? [] : allIds);
  const toggle = (id: number) => setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  const removeSelected = async () => {
    if (!selected.length || !window.confirm("Are you sure you want to remove the selected duplicate URLs? They can be restored from Removed URLs.")) return;
    setLoading(true); setMessage("");
    try {
      const me = await fetch("/api/auth/me").then((response) => response.json()).catch(() => ({}));
      const response = await fetch("/api/urls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", ids: selected, removedBy: me.user?.username || "Current user", reason: "Removed from Duplicate URLs dashboard" }) });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(payload.error || "Unable to remove selected URLs");
      const removed = Number(payload.removed || selected.length);
      setSelected([]);
      setMessage(`${removed} duplicate URL${removed === 1 ? "" : "s"} moved to Removed URLs.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to remove selected URLs"); setLoading(false); }
  };

  const affected = groups.reduce((total, group) => total + group.items.length, 0);
  return <div className="app-shell">
    {loading && <div className="loading-line" />}
    <DashboardSidebar active="duplicates" schedule={data.settings?.schedule} />
    <main className="main">
      <header className="topbar"><div className="top-title"><span className="top-product">STC URL intelligence</span><span>Duplicate URL review</span></div><div className="top-actions"><button className="icon-btn" aria-label="Refresh duplicate URLs" title="Refresh duplicate URLs" onClick={load}>⟳</button></div></header>
      <div className="content">
        <div className="heading-row"><div><span className="page-label">Data quality</span><h1>Duplicate URLs</h1><p className="subhead">Review URL variants that point to the same canonical path, keep one preferred record, or remove an entire duplicate set.</p></div><div className="button-row"><a className="btn" href="/all-urls">View all URLs</a><button className="btn primary" disabled={!extraIds.length} onClick={() => setSelected(extraIds)}>Select extras</button></div></div>
        {message && <div className="notice" role="status"><strong>{message}</strong></div>}
        <section className="metrics duplicate-metrics" aria-label="Duplicate URL summary">
          <div className="metric" style={{ "--accent": "#5b21b6" } as React.CSSProperties}><div className="metric-top"><span>Duplicate sets</span><span className="metric-icon">⧉</span></div><div className="metric-value">{groups.length}</div><div className="metric-note">Canonical URL groups</div></div>
          <div className="metric" style={{ "--accent": "#c46512" } as React.CSSProperties}><div className="metric-top"><span>Affected URLs</span><span className="metric-icon">⌁</span></div><div className="metric-value">{affected}</div><div className="metric-note">Records requiring review</div></div>
          <div className="metric" style={{ "--accent": "#d63c4a" } as React.CSSProperties}><div className="metric-top"><span>Safe extras</span><span className="metric-icon">−</span></div><div className="metric-value">{extraIds.length}</div><div className="metric-note">Keep oldest record per set</div></div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><div className="panel-title">Duplicate groups</div><div className="panel-meta">URLs are matched by host, normalized path, and query parameters.</div></div></div>
          <div className="toolbar"><div className="toolbar-left"><div className="search"><input aria-label="Search duplicate URLs" value={query} onChange={(event) => { setQuery(event.target.value); setSelected([]); }} placeholder="Search URL, label, or group" /></div></div><div className="toolbar-right"><button className="btn" disabled={!extraIds.length} onClick={() => setSelected(extraIds)}>Select extras (keep one)</button><button className="btn" disabled={!allIds.length} onClick={() => setSelected(allIds)}>Select all duplicates</button>{selected.length > 0 && <><span className="selected-bar">{selected.length} selected</span><button className="btn danger" onClick={removeSelected}>Remove selected</button></>}</div></div>
          <div className="table-wrap">
            <table><thead><tr><th><input type="checkbox" aria-label="Select all duplicate URLs" checked={allIds.length > 0 && selected.length === allIds.length} onChange={toggleAll} /></th><th>Duplicate URL</th><th>Duplicate set</th><th>Group</th><th>Status</th><th>Last checked</th></tr></thead>
              <tbody>{groups.flatMap((group, groupIndex) => group.items.map((item, itemIndex) => <tr key={item.id}><td><input type="checkbox" aria-label={`Select ${item.url}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td className="url-cell"><div className="url-primary">{item.label || item.url}</div><a className="url-secondary url-link mono" href={item.url} target="_blank" rel="noreferrer">{item.url}<span aria-hidden="true">↗</span></a>{itemIndex === 0 && <span className="preferred-tag">Preferred record</span>}</td><td><span className="duplicate-set-label">Set {groupIndex + 1}</span><div className="url-secondary">{group.items.length} matching URLs</div></td><td>{item.group}</td><td><span className="badge">{item.status}{item.httpCode ? ` · ${item.httpCode}` : ""}</span></td><td>{fmtTime(item.lastCheckedAt)}</td></tr>))}</tbody>
            </table>
            {!groups.length && <div className="empty"><strong>No duplicate URLs found.</strong><br />The active URL registry currently contains one record per canonical URL.</div>}
          </div>
          <div className="panel-foot"><span><strong>{groups.length}</strong> duplicate sets · <strong>{affected}</strong> affected URLs</span><span>Removed records remain restorable</span></div>
        </section>
      </div>
    </main>
  </div>;
}
