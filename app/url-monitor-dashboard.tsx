"use client";

import { useEffect, useMemo, useState } from "react";

type UrlItem = {
  id: number; url: string; label: string; group: string; status: string; httpCode: number | null;
  finalUrl: string | null; indexedStatus: string; googleFirstSeen: string | null;
  lastCheckedAt: string | null; alertMessage: string | null; createdAt: string; updatedAt: string;
};
type HistoryItem = { id: number; url_id: number; from_status: string | null; to_status: string; note: string | null; checked_at: string };
type Settings = { schedule?: string; alerts_enabled?: number };
type Payload = { urls: UrlItem[]; history: HistoryItem[]; settings: Settings };

const statusClass: Record<string, string> = {
  Live: "live", Redirected: "redirected", "404": "not-found", "410": "gone",
  "Server Error": "server-error", Unavailable: "unavailable", Removed: "removed",
  Indexed: "indexed", "Not Indexed": "not-indexed", Unknown: "unknown",
};

const fmtTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Not checked";
const download = (name: string, content: string, type: string) => {
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href);
};

export function UrlMonitorDashboard() {
  const [data, setData] = useState<Payload>({ urls: [], history: [], settings: {} });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [group, setGroup] = useState("All groups");
  const [selected, setSelected] = useState<number[]>([]);
  const [drawer, setDrawer] = useState<"add" | "bulk" | "edit" | "history" | "settings" | null>(null);
  const [active, setActive] = useState<UrlItem | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [groupInput, setGroupInput] = useState("Website");
  const [bulkInput, setBulkInput] = useState("");
  const [toast, setToast] = useState("");

  const load = async () => {
    setLoading(true);
    try { const response = await fetch("/api/urls"); setData(await response.json()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const request = async (method: string, body: object) => {
    setLoading(true);
    try {
      const response = await fetch("/api/urls", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Request failed"); setData(payload); return payload;
    } catch (error) { flash(error instanceof Error ? error.message : "Something went wrong"); }
    finally { setLoading(false); }
  };

  const groups = useMemo(() => Array.from(new Set(data.urls.map((item) => item.group))).sort(), [data.urls]);
  const filtered = useMemo(() => data.urls.filter((item) => {
    const text = `${item.url} ${item.label} ${item.finalUrl || ""}`.toLowerCase();
    const matchesStatus = status === "All statuses" || item.status === status || (status === "Not Indexed" && item.indexedStatus === "Not Indexed");
    return text.includes(query.toLowerCase()) && matchesStatus && (group === "All groups" || item.group === group);
  }), [data.urls, query, status, group]);

  const count = (value: string) => data.urls.filter((item) => item.status === value).length;
  const indexed = data.urls.filter((item) => item.indexedStatus === "Indexed").length;
  const alerts = data.urls.filter((item) => item.alertMessage);
  const metrics = [
    ["Total URLs", data.urls.length, "Monitored records", "#2e6fbe", "∑"],
    ["Live", count("Live"), "Sitemap eligible", "#17845b", "✓"],
    ["Redirects", count("Redirected"), "Review destinations", "#c66a18", "↗"],
    ["404 / 410", count("404") + count("410"), "Broken or gone", "#c74343", "!"],
    ["Errors", count("Server Error") + count("Unavailable"), "Needs attention", "#8d3f64", "×"],
    ["Indexed", indexed, "Google visibility", "#2e6fbe", "G"],
    ["Not indexed", data.urls.filter((item) => item.indexedStatus === "Not Indexed").length, "Visibility gap", "#7952a3", "?"],
    ["Active alerts", alerts.length, "Status regressions", "#c66a18", "⚑"],
  ];

  const addOne = async () => {
    if (!urlInput.trim()) return;
    const result = await request("POST", { action: "add", urls: [{ url: urlInput, label: labelInput, group: groupInput }] });
    if (result) { setDrawer(null); setUrlInput(""); setLabelInput(""); flash("URL added to monitoring"); }
  };
  const addBulk = async () => {
    const urls = bulkInput.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    if (!urls.length) return;
    const result = await request("POST", { action: "add", urls: urls.map((url) => ({ url, group: groupInput })) });
    if (result) { setDrawer(null); setBulkInput(""); flash(`${result.added ?? 0} URLs added`); }
  };
  const checkNow = async (ids: number[] = []) => {
    const result = await request("POST", { action: "check", ids });
    if (result) { setSelected([]); flash(`${result.checked ?? 0} URLs checked`); }
  };
  const saveEdit = async () => {
    if (!active) return;
    const result = await request("PATCH", { id: active.id, label: labelInput, group: groupInput });
    if (result) { setDrawer(null); flash("URL details updated"); }
  };
  const markRemoved = async () => {
    const result = await request("PATCH", { ids: selected, status: "Removed" });
    if (result) { setSelected([]); flash("Selected URLs marked as removed"); }
  };
  const deleteSelected = async () => {
    if (!selected.length || !window.confirm(`Permanently delete ${selected.length} selected URL${selected.length > 1 ? "s" : ""} and their history?`)) return;
    const result = await request("DELETE", { ids: selected });
    if (result) { setSelected([]); flash("Selected URLs deleted"); }
  };
  const exportCsv = () => {
    const rows = [["URL","Label","Group","Status","HTTP Code","Final URL","Google Index","Google First Seen","Last Checked"], ...filtered.map((item) => [item.url,item.label,item.group,item.status,item.httpCode || "",item.finalUrl || "",item.indexedStatus,item.googleFirstSeen || "",item.lastCheckedAt || ""])];
    download("url-monitoring-export.csv", rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8"); flash("CSV export created");
  };
  const exportSitemap = () => {
    const live = data.urls.filter((item) => item.status === "Live");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${live.map((item) => `  <url>\n    <loc>${item.url.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</loc>\n    <lastmod>${(item.lastCheckedAt || item.updatedAt || new Date().toISOString()).slice(0,10)}</lastmod>\n  </url>`).join("\n")}\n</urlset>`;
    download("sitemap.xml", xml, "application/xml"); flash(`Sitemap created with ${live.length} live URLs`);
  };
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((item) => item.id));
  const openEdit = (item: UrlItem) => { setActive(item); setLabelInput(item.label); setGroupInput(item.group); setDrawer("edit"); };
  const openHistory = (item: UrlItem) => { setActive(item); setDrawer("history"); };

  return (
    <div className="app-shell">
      {loading && <div className="loading-line" />}
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">∿</span><span>URL Watch</span></div>
        <div className="nav-label">Workspace</div>
        <button className="nav-item active"><span className="nav-icon">▦</span><span>Overview</span></button>
        <button className="nav-item" onClick={() => { setStatus("All statuses"); window.scrollTo({ top: 500, behavior: "smooth" }); }}><span className="nav-icon">⌁</span><span>All URLs</span></button>
        <button className="nav-item" onClick={() => setStatus("Redirected")}><span className="nav-icon">↗</span><span>Redirects</span></button>
        <button className="nav-item" onClick={() => setStatus("404")}><span className="nav-icon">!</span><span>Broken pages</span></button>
        <div className="nav-label">Manage</div>
        <button className="nav-item" onClick={exportSitemap}><span className="nav-icon">◇</span><span>Sitemap</span></button>
        <button className="nav-item" onClick={() => setDrawer("settings")}><span className="nav-icon">⚙</span><span>Settings</span></button>
        <div className="sidebar-foot"><span className="pulse-dot" />Monitoring active<br />Schedule: {data.settings.schedule || "Every 6 hours"}</div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="top-title">Website URL Monitoring</div><div className="top-actions"><span className="panel-meta">Last dashboard refresh · just now</span><button className="icon-btn" aria-label="Refresh dashboard" onClick={load}>⟳</button></div></header>
        <div className="content">
          <div className="heading-row">
            <div><h1>URL health overview</h1><p className="subhead">Monitor availability, redirects, indexing, and sitemap eligibility from one place.</p></div>
            <div className="button-row"><button className="btn" onClick={() => setDrawer("bulk")}>⇧ Bulk import</button><button className="btn" onClick={() => checkNow()}>⟳ Check all now</button><button className="btn primary" onClick={() => setDrawer("add")}>＋ Add URL</button></div>
          </div>

          {alerts.length > 0 && <div className="notice"><span><strong>{alerts.length} active alert{alerts.length > 1 ? "s" : ""}</strong> — previously healthy pages have changed status and need review.</span><button onClick={() => { setQuery(""); setStatus("All statuses"); window.scrollTo({ top: 520, behavior: "smooth" }); }}>Review alerts →</button></div>}
          <section className="metrics" aria-label="URL monitoring summary">
            {metrics.map(([label,value,note,accent,icon]) => <div className="metric" key={String(label)} style={{ "--accent": accent } as React.CSSProperties}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>)}
          </section>

          <section className="panel">
            <div className="panel-head"><div><div className="panel-title">Monitored URLs</div><div className="panel-meta">Operational registry with current status and last check</div></div><div className="button-row"><button className="btn" onClick={exportCsv}>↓ Export CSV</button><button className="btn" onClick={exportSitemap}>◇ Generate sitemap</button></div></div>
            <div className="toolbar">
              <div className="toolbar-left"><div className="search"><input aria-label="Search URLs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search URL, label, or destination" /></div><select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>{["All statuses","Live","Redirected","404","410","Server Error","Unavailable","Removed","Not Indexed"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by group" value={group} onChange={(e) => setGroup(e.target.value)}><option>All groups</option>{groups.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="toolbar-right">{selected.length > 0 && <><span className="selected-bar">{selected.length} selected</span><button className="btn" onClick={() => checkNow(selected)}>⟳ Check</button><button className="btn" onClick={markRemoved}>Mark removed</button><button className="btn danger" onClick={deleteSelected}>Delete</button></>}</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th><input type="checkbox" aria-label="Select all visible URLs" checked={filtered.length > 0 && selected.length === filtered.length} onChange={toggleAll} /></th><th>URL</th><th>Group</th><th>Status</th><th>Final destination</th><th>Google</th><th>Last checked</th><th>Actions</th></tr></thead>
                <tbody>{filtered.map((item) => <tr key={item.id}>
                  <td><input type="checkbox" aria-label={`Select ${item.url}`} checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} /></td>
                  <td className="url-cell"><div className="url-primary">{item.label || item.url}</div><div className="url-secondary mono">{item.url}</div>{item.alertMessage && <span className="alert-tag">⚑ {item.alertMessage}</span>}</td>
                  <td>{item.group}</td><td><span className={`badge ${statusClass[item.status] || "unknown"}`}>{item.status}{item.httpCode ? ` · ${item.httpCode}` : ""}</span></td>
                  <td className="url-cell">{item.finalUrl ? <div className="url-secondary mono" title={item.finalUrl}>{item.finalUrl}</div> : <span className="panel-meta">—</span>}</td>
                  <td><span className={`badge ${statusClass[item.indexedStatus] || "unknown"}`}>{item.indexedStatus}</span>{item.googleFirstSeen && <div className="url-secondary">First seen ≈ {item.googleFirstSeen}</div>}</td>
                  <td>{fmtTime(item.lastCheckedAt)}</td><td><div className="table-actions"><button className="mini-btn" onClick={() => checkNow([item.id])}>Check</button><button className="mini-btn" onClick={() => openHistory(item)}>History</button><button className="mini-btn" onClick={() => openEdit(item)}>Edit</button></div></td>
                </tr>)}</tbody>
              </table>
              {!filtered.length && <div className="empty"><strong>No URLs match these filters.</strong><br />Try clearing a filter or add a new URL.</div>}
            </div>
            <div className="panel-foot"><span>Showing {filtered.length} of {data.urls.length} URLs</span><span>Sitemap includes Live URLs only</span></div>
          </section>
        </div>
      </main>

      {drawer && <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(null); }}><aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head"><div><h2>{drawer === "add" ? "Add a URL" : drawer === "bulk" ? "Bulk import URLs" : drawer === "edit" ? "Edit URL" : drawer === "history" ? "Status history" : "Monitoring settings"}</h2><p>{drawer === "history" ? active?.url : drawer === "settings" ? "Control automatic checks and regression alerts." : "Add pages to your central monitoring registry."}</p></div><button className="icon-btn" aria-label="Close" onClick={() => setDrawer(null)}>×</button></div>
        {drawer === "add" && <><div className="field"><label>STC URL</label><input autoFocus placeholder="https://www.stc.com.kw/en/page" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} /></div><div className="field"><label>Label (optional)</label><input placeholder="STC page label" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} /></div><div className="field"><label>Group</label><input value={groupInput} onChange={(e) => setGroupInput(e.target.value)} /></div><div className="field-help">Only stc.com.kw links are accepted for now.</div><div className="drawer-actions"><button className="btn" onClick={() => setDrawer(null)}>Cancel</button><button className="btn primary" onClick={addOne}>Add URL</button></div></>}
        {drawer === "bulk" && <><div className="field"><label>Paste STC URLs</label><textarea autoFocus placeholder={'https://www.stc.com.kw/en/page-one\nhttps://www.stc.com.kw/ar/page-two'} value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} /><div className="field-help">One URL per line, or separate using commas. Non-STC, duplicate, and invalid URLs are skipped.</div></div><div className="field"><label>Group for this import</label><input value={groupInput} onChange={(e) => setGroupInput(e.target.value)} /></div><div className="drawer-actions"><button className="btn" onClick={() => setDrawer(null)}>Cancel</button><button className="btn primary" onClick={addBulk}>Import URLs</button></div></>}
        {drawer === "edit" && active && <><div className="field"><label>URL</label><input value={active.url} disabled /></div><div className="field"><label>Label</label><input value={labelInput} onChange={(e) => setLabelInput(e.target.value)} /></div><div className="field"><label>Group</label><input value={groupInput} onChange={(e) => setGroupInput(e.target.value)} /></div><div className="drawer-actions"><button className="btn" onClick={() => setDrawer(null)}>Cancel</button><button className="btn primary" onClick={saveEdit}>Save changes</button></div></>}
        {drawer === "history" && active && <div className="history-list">{data.history.filter((item) => item.url_id === active.id).map((item) => <div className="history-row" key={item.id}><div className="history-time">{fmtTime(item.checked_at)}</div><div><div className="history-change">{item.from_status ? `${item.from_status} → ${item.to_status}` : item.to_status}</div><div className="url-secondary">{item.note || "Status check recorded"}</div></div></div>)}{!data.history.some((item) => item.url_id === active.id) && <div className="empty">No status changes recorded yet.</div>}</div>}
        {drawer === "settings" && <SettingsPanel settings={data.settings} onSave={async (settings) => { const result = await request("POST", { action: "settings", ...settings }); if (result) { setDrawer(null); flash("Monitoring settings saved"); } }} />}
      </aside></div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SettingsPanel({ settings, onSave }: { settings: Settings; onSave: (value: { schedule: string; alertsEnabled: boolean }) => void }) {
  const [schedule, setSchedule] = useState(settings.schedule || "Every 6 hours");
  const [alertsEnabled, setAlertsEnabled] = useState(settings.alerts_enabled !== 0);
  return <><div className="field"><label>Automatic check frequency</label><select value={schedule} onChange={(e) => setSchedule(e.target.value)}><option>Every hour</option><option>Every 6 hours</option><option>Every 12 hours</option><option>Daily</option><option>Weekly</option></select><div className="field-help">The monitoring schedule is stored with the dashboard. Connect a platform scheduler to call the check endpoint at this frequency.</div></div><div className="field"><label><input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} /> Alert when a previously live page breaks</label><div className="field-help">Alerts appear when a Live page changes to 404, 410, Server Error, or Unavailable.</div></div><div className="notice"><span><strong>Google indexing note</strong><br />Accurate indexing and first-seen data requires a verified Google Search Console or third-party SEO data connection.</span></div><div className="drawer-actions"><button className="btn primary" onClick={() => onSave({ schedule, alertsEnabled })}>Save settings</button></div></>;
}
