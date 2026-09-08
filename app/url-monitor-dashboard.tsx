"use client";

import { useEffect, useMemo, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import { categoriesForUrl, URL_CATEGORIES } from "./url-category";
import { duplicateKey } from "./url-duplicates";
import { sitemapUrls, sitemapXml } from "./sitemap-generator";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DuplicateReviewDialog } from "./duplicate-review-dialog";

type UrlItem = {
  id: number; url: string; label: string; group: string; status: string; httpCode: number | null;
  finalUrl: string | null; indexedStatus: string; googleFirstSeen: string | null;
  lastCheckedAt: string | null; alertMessage: string | null; removedAt: string | null;
  removedBy: string | null; removalReason: string | null; statusBeforeRemoval: string | null;
  createdAt: string; updatedAt: string;
};
type HistoryItem = { id: number; url_id: number; from_status: string | null; to_status: string; note: string | null; checked_at: string };
type Settings = { schedule?: string; alerts_enabled?: number };
type ImportHistory = { id: number; sourceType: string; sourceName: string; importedAt: string; totalRows: number; uniqueUrls: number; addedCount: number; existingCount: number; duplicateCount: number; invalidCount: number };
type ImportResult = { importId: number; sourceType: string; sourceName: string; importedAt: string; totalRows: number; uniqueUrls: number; addedUrls: string[]; existingUrls: string[]; replacedUrls?: string[]; duplicateUrls: string[]; invalidUrls: string[] };
type Payload = { urls: UrlItem[]; removedUrls: UrlItem[]; history: HistoryItem[]; settings: Settings; imports: ImportHistory[] };
type ApiResponse = Partial<Payload> & { error?: string; added?: number; replaced?: number; skipped?: number; importResult?: ImportResult; removed?: number; removedIds?: number[]; removedAt?: string; removedBy?: string; removalReason?: string | null; requiresDuplicateConfirmation?: boolean; duplicateUrls?: string[] };

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
  const [data, setData] = useState<Payload>({ urls: [], removedUrls: [], history: [], settings: {}, imports: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [group, setGroup] = useState("All groups");
  const [category, setCategory] = useState("All categories");
  const [sort, setSort] = useState("Recently updated");
  const [selected, setSelected] = useState<number[]>([]);
  const [drawer, setDrawer] = useState<"add" | "bulk" | "imports" | "edit" | "history" | "settings" | "sitemap" | "remove" | null>(null);
  const [active, setActive] = useState<UrlItem | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [groupInput, setGroupInput] = useState("Website");
  const [importGroup, setImportGroup] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [sitemapInput, setSitemapInput] = useState("https://www.stc.com.kw/sitemap.xml");
  const [sitemapCategory, setSitemapCategory] = useState("All categories");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [removedBy, setRemovedBy] = useState("Local user");
  const [removalReason, setRemovalReason] = useState("");
  const [toast, setToast] = useState("");
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<{ body: Record<string, unknown>; kind: "add" | "import"; urls: string[] } | null>(null);

  const load = async () => {
    setLoading(true);
    try { const response = await fetch("/api/urls"); const payload = await response.json(); setData({ ...payload, imports: payload.imports || [] }); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    queueMicrotask(() => {
      void load();
      const params = new URLSearchParams(window.location.search);
      const linkedStatus = params.get("status");
      if (linkedStatus) setStatus(linkedStatus);
      const panel = params.get("panel");
      if (panel === "sitemap" || panel === "settings") setDrawer(panel);
    });
  }, []);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const request = async (method: string, body: object) => {
    setLoading(true);
    try {
      const response = await fetch("/api/urls", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const text = await response.text();
      if (!text) throw new Error("The server returned an empty response. Please try again.");
      let payload: ApiResponse;
      try { payload = JSON.parse(text); } catch { throw new Error("The server response was incomplete. Please try again."); }
      if (response.status === 409 && payload.requiresDuplicateConfirmation) return payload;
      if (!response.ok) throw new Error(payload.error || "Request failed");
      if (Array.isArray(payload.urls)) setData({ ...(payload as Payload), imports: payload.imports || [] });
      return payload;
    } catch (error) { flash(error instanceof Error ? error.message : "Something went wrong"); }
    finally { setLoading(false); }
  };

  const groups = useMemo(() => Array.from(new Set(data.urls.map((item) => item.group))).sort(), [data.urls]);
  const duplicateGroups = useMemo(() => {
    const grouped = new Map<string, UrlItem[]>();
    for (const item of data.urls) {
      const key = duplicateKey(item.url);
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    return [...grouped.values()].filter((items) => items.length > 1).map((items) => items.sort((a, b) => a.id - b.id));
  }, [data.urls]);
  const duplicateIds = useMemo(() => new Set(duplicateGroups.flatMap((items) => items.map((item) => item.id))), [duplicateGroups]);
  const duplicateCounts = useMemo(() => new Map(duplicateGroups.flatMap((items) => items.map((item) => [item.id, items.length]))), [duplicateGroups]);
  const filtered = useMemo(() => data.urls.filter((item) => {
    const text = `${item.url} ${item.label} ${item.finalUrl || ""}`.toLowerCase();
    const notActive = ["404", "410", "Server Error", "Unavailable"].includes(item.status);
    const matchesStatus = status === "All statuses" || item.status === status || (status === "Not active" && notActive) || (status === "Broken" && ["404", "410"].includes(item.status)) || (status === "Indexed" && item.indexedStatus === "Indexed") || (status === "Not Indexed" && item.indexedStatus === "Not Indexed");
    const matchesCategory = category === "All categories" || (category === "Duplicate links" ? duplicateIds.has(item.id) : categoriesForUrl(item.url).includes(category));
    return text.includes(query.toLowerCase()) && matchesStatus && matchesCategory && (group === "All groups" || item.group === group);
  }).sort((a, b) => sort === "URL A–Z" ? a.url.localeCompare(b.url) : sort === "Status" ? a.status.localeCompare(b.status) : sort === "Oldest checked" ? String(a.lastCheckedAt || "").localeCompare(String(b.lastCheckedAt || "")) : String(b.updatedAt).localeCompare(String(a.updatedAt))), [data.urls, query, status, group, category, duplicateIds, sort]);

  const count = (value: string) => data.urls.filter((item) => item.status === value).length;
  const indexed = data.urls.filter((item) => item.indexedStatus === "Indexed").length;
  const alerts = data.urls.filter((item) => item.alertMessage);
  const metrics = [
    { label: "Total URLs", value: data.urls.length, note: "Monitored records", accent: "#5b35d5", icon: "∑", filter: "All statuses" },
    { label: "Live", value: count("Live"), note: "Sitemap eligible", accent: "#0f9f74", icon: "✓", filter: "Live" },
    { label: "Redirects", value: count("Redirected"), note: "Review destinations", accent: "#d97706", icon: "↗", filter: "Redirected" },
    { label: "404 / 410", value: count("404") + count("410"), note: "Broken or gone", accent: "#e5484d", icon: "!", filter: "Broken" },
    { label: "Errors", value: count("Server Error") + count("Unavailable"), note: "Needs attention", accent: "#a33b6c", icon: "×", filter: "Not active" },
    { label: "Indexed", value: indexed, note: "Google visibility", accent: "#2878c8", icon: "G", filter: "Indexed" },
    { label: "Not indexed", value: data.urls.filter((item) => item.indexedStatus === "Not Indexed").length, note: "Visibility gap", accent: "#7c4cc5", icon: "?", filter: "Not Indexed" },
    { label: "Active alerts", value: alerts.length, note: "Status regressions", accent: "#d97706", icon: "⚑", filter: "All statuses" },
  ];
  const clearFilters = () => { setQuery(""); setStatus("All statuses"); setGroup("All groups"); setCategory("All categories"); };

  const addOne = async () => {
    if (!urlInput.trim()) return;
    const body = { action: "add", urls: [{ url: urlInput, label: labelInput, group: groupInput }] };
    const result = await request("POST", body);
    if (result?.requiresDuplicateConfirmation) return setDuplicateReview({ body, kind: "add", urls: result.duplicateUrls || [] });
    if (result) finishAdd(result);
  };
  const finishAdd = (result: ApiResponse) => {
    setDrawer(null); setUrlInput(""); setLabelInput("");
    flash(result.replaced ? `${result.replaced} existing URL replaced` : result.skipped ? "Existing URL kept; duplicate skipped" : "URL added to monitoring");
  };
  const runImport = async (body: Record<string, unknown>) => {
    setImporting(true);
    try {
      const result = await request("POST", body);
      if (result?.requiresDuplicateConfirmation) { setDuplicateReview({ body, kind: "import", urls: result.duplicateUrls || [] }); return false; }
      if (result?.importResult) {
        setImportResult(result.importResult);
        const replaced = result.importResult.replacedUrls?.length || 0;
        flash(`${result.importResult.addedUrls.length} new · ${replaced} replaced · ${result.importResult.existingUrls.length - replaced} skipped`);
      }
      return Boolean(result);
    } finally { setImporting(false); }
  };
  const addBulk = async () => {
    const urls = bulkInput.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    if (!urls.length) return;
    if (await runImport({ action: "import", sourceType: "Paste", sourceName: "Pasted URLs", urls, group: importGroup })) setBulkInput("");
  };
  const importExcel = async (file: File) => {
    try {
      const rows = await readXlsxFile(file);
      const headerRowIndex = rows.findIndex((row) => row.some((cell) => /^(url|website url|page url|link)$/i.test(String(cell || "").trim())));
      let values: string[];
      if (headerRowIndex >= 0) {
        const header = rows[headerRowIndex];
        const urlColumn = header.findIndex((cell) => /^(url|website url|page url|link)$/i.test(String(cell || "").trim()));
        values = rows.slice(headerRowIndex + 1).map((row) => String(row[urlColumn] || "").trim()).filter(Boolean);
      } else {
        values = rows.flat().map((cell) => String(cell || "").trim()).filter((value) => /^https?:\/\//i.test(value) || /(?:^|\.)stc\.com\.kw(?:\/|$)/i.test(value));
      }
      if (!values.length) return flash("No URL column or STC links were found in this Excel file");
      await runImport({ action: "import", sourceType: "Excel", sourceName: file.name, urls: values, group: importGroup });
    } catch (error) { flash(error instanceof Error ? error.message : "Excel import failed"); }
  };
  const importSitemap = async () => {
    if (!sitemapInput.trim()) return;
    await runImport({ action: "import-sitemap", sitemapUrl: sitemapInput, group: importGroup });
  };
  const resolveDuplicates = async (duplicateAction: "replace" | "skip") => {
    if (!duplicateReview) return;
    setImporting(true);
    try {
      const pending = duplicateReview;
      const result = await request("POST", { ...pending.body, duplicateAction });
      if (!result) return;
      setDuplicateReview(null);
      if (pending.kind === "add") finishAdd(result);
      else if (result.importResult) {
        setImportResult(result.importResult);
        if (pending.body.sourceType === "Paste") setBulkInput("");
        const replaced = result.importResult.replacedUrls?.length || 0;
        flash(duplicateAction === "replace" ? `${replaced} existing URL${replaced === 1 ? "" : "s"} replaced` : `${result.importResult.addedUrls.length} new URL${result.importResult.addedUrls.length === 1 ? "" : "s"} added; duplicates skipped`);
      }
    } finally { setImporting(false); }
  };
  const checkNow = async (ids: number[] = []) => {
    if (checking) return;
    const targetIds = ids.length ? ids : data.urls.map((item) => item.id);
    if (!targetIds.length) return flash("No active URLs to check");
    let done = 0;
    setChecking({ done, total: targetIds.length });
    try {
      for (let start = 0; start < targetIds.length; start += 20) {
        const response = await fetch("/api/urls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", ids: targetIds.slice(start, start + 20) }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "A check batch failed");
        const updates = new Map((payload.urls as UrlItem[]).map((item) => [item.id, item]));
        setData((current) => ({ ...current, urls: current.urls.map((item) => updates.get(item.id) || item) }));
        done += payload.checked ?? 0;
        setChecking({ done, total: targetIds.length });
      }
      setSelected([]);
      const refreshed = await fetch("/api/urls");
      setData(await refreshed.json());
      flash(`${done} URLs checked`);
    } catch (error) {
      flash(`${done} of ${targetIds.length} checked. ${error instanceof Error ? error.message : "Checking stopped"}`);
    } finally { setChecking(null); }
  };
  const saveEdit = async () => {
    if (!active) return;
    const result = await request("PATCH", { id: active.id, label: labelInput, group: groupInput });
    if (result) { setDrawer(null); flash("URL details updated"); }
  };
  const openRemove = (ids: number[]) => { setSelected(ids); setRemovalReason(""); setDrawer("remove"); };
  const removeUrls = async () => {
    if (!selected.length) return;
    const selectedIds = [...selected];
    const result = await request("POST", { action: "remove", ids: selectedIds, removedBy, reason: removalReason });
    if (result) {
      const removedIds = new Set<number>((result.removedIds || selectedIds).map(Number));
      setData((current) => {
        const archived = current.urls.filter((item) => removedIds.has(item.id)).map((item) => ({ ...item, statusBeforeRemoval: item.status, status: "Removed", removedAt: result.removedAt, removedBy: result.removedBy, removalReason: result.removalReason }));
        return { ...current, urls: current.urls.filter((item) => !removedIds.has(item.id)), removedUrls: [...archived, ...current.removedUrls] };
      });
      const count = Number(result.removed || removedIds.size); setSelected([]); setDrawer(null); flash(`${count} URL${count === 1 ? "" : "s"} moved to Removed URLs`);
    }
  };
  const exportCsv = () => {
    const rows = [["URL","Label","Group","Status","HTTP Code","Final URL","Google Index","Google First Seen","Last Checked"], ...filtered.map((item) => [item.url,item.label,item.group,item.status,item.httpCode || "",item.finalUrl || "",item.indexedStatus,item.googleFirstSeen || "",item.lastCheckedAt || ""])];
    download("url-monitoring-export.csv", rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8"); flash("CSV export created");
  };
  const exportSitemap = () => {
    const urls = sitemapUrls(data.urls, sitemapCategory);
    if (!urls.length) return flash(`No Live ${sitemapCategory === "All categories" ? "" : `${sitemapCategory} `}URLs are eligible for the sitemap`);
    const suffix = sitemapCategory === "All categories" ? "" : `-${sitemapCategory.toLowerCase().replaceAll(" ", "-")}`;
    download(`sitemap${suffix}.xml`, sitemapXml(urls), "application/xml"); flash(`Sitemap created with ${urls.length} SEO-eligible URLs`);
  };
  const openSitemap = () => { setSitemapCategory(URL_CATEGORIES.some((item) => item === category) ? category : "All categories"); setDrawer("sitemap"); };
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((item) => item.id));
  const selectDuplicateExtras = () => setSelected(duplicateGroups.flatMap((items) => items.slice(1).map((item) => item.id)));
  const selectAllDuplicates = () => setSelected([...duplicateIds]);
  const openEdit = (item: UrlItem) => { setActive(item); setLabelInput(item.label); setGroupInput(item.group); setDrawer("edit"); };
  const openHistory = (item: UrlItem) => { setActive(item); setDrawer("history"); };

  return (
    <div className="app-shell">
      {(loading || checking) && <div className="loading-line" />}
      <DashboardSidebar active="overview" schedule={data.settings.schedule} />

      <main className="main">
        <header className="topbar"><div className="top-title"><span className="top-product">STC URL intelligence</span><span>Website monitoring workspace</span></div><div className="top-actions"><span className="sync-state"><span className="pulse-dot" />Data loaded</span><button className="icon-btn" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={load}>⟳</button></div></header>
        <div className="content">
          <div className="heading-row">
            <div><span className="page-label">Overview</span><h1>Keep every STC URL healthy</h1><p className="subhead">Monitor availability, redirects, indexing, and sitemap eligibility from one organized workspace.</p></div>
            <div className="button-row"><button className="btn" disabled={Boolean(checking)} onClick={() => { setImportResult(null); setDrawer("bulk"); }}>⇧ Bulk import</button><button className="btn" onClick={() => setDrawer("imports")}>↺ Import history</button><button className="btn" disabled={Boolean(checking)} onClick={() => checkNow()}>{checking ? `⟳ Checking ${checking.done.toLocaleString()} / ${checking.total.toLocaleString()}` : "⟳ Check all now"}</button><button className="btn primary" disabled={Boolean(checking)} onClick={() => setDrawer("add")}>＋ Add URL</button></div>
          </div>

          {checking && <div className="check-progress" role="status" aria-live="polite"><div className="check-progress-copy"><strong>Checking all URLs…</strong><span>{checking.done.toLocaleString()} of {checking.total.toLocaleString()} checked</span></div><div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={checking.total} aria-valuenow={checking.done}><div className="progress-fill" style={{ width: `${Math.round((checking.done / checking.total) * 100)}%` }} /></div><div className="panel-meta">Keep this page open. Results and filters update after every batch.</div></div>}

          {alerts.length > 0 && <div className="notice"><span><strong>{alerts.length} active alert{alerts.length > 1 ? "s" : ""}</strong> — previously healthy pages have changed status and need review.</span><button onClick={() => { setQuery(""); setStatus("All statuses"); window.scrollTo({ top: 520, behavior: "smooth" }); }}>Review alerts →</button></div>}
          <section className="metrics" aria-label="URL monitoring summary">
            {metrics.map((metric) => <button className={`metric ${status === metric.filter ? "metric-active" : ""}`} key={metric.label} style={{ "--accent": metric.accent } as React.CSSProperties} onClick={() => { setStatus(metric.filter); document.getElementById("url-registry")?.scrollIntoView({ behavior: "smooth" }); }}><div className="metric-top"><span>{metric.label}</span><span className="metric-icon">{metric.icon}</span></div><div className="metric-value">{metric.value}</div><div className="metric-note">{metric.note}<span>View →</span></div></button>)}
          </section>

          <section className="panel" id="url-registry">
            <div className="panel-head"><div><div className="panel-title">Monitored URLs</div><div className="panel-meta">Operational registry with current status and last check</div></div><div className="button-row"><button className="btn" onClick={exportCsv}>↓ Export CSV</button><button className="btn" onClick={openSitemap}>◇ Generate sitemap</button></div></div>
            <div className="toolbar">
              <div className="toolbar-left"><div className="search"><input aria-label="Search URLs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search URL, label, or destination" /></div><select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>{["All statuses","Live","Redirected","Broken","404","410","Server Error","Unavailable","Not active","Indexed","Not Indexed","Unknown"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by group" value={group} onChange={(e) => setGroup(e.target.value)}><option>All groups</option>{groups.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}><option>All categories</option>{[...URL_CATEGORIES, "Duplicate links"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Sort URLs" value={sort} onChange={(e) => setSort(e.target.value)}>{["Recently updated","URL A–Z","Status","Oldest checked"].map((item) => <option key={item}>{item}</option>)}</select>{(query || status !== "All statuses" || group !== "All groups" || category !== "All categories") && <button className="text-btn" onClick={clearFilters}>Clear filters</button>}</div>
              <div className="toolbar-right">{category === "Duplicate links" && duplicateGroups.length > 0 && <><span className="selected-bar">{duplicateGroups.length} duplicate sets</span><button className="btn" onClick={selectDuplicateExtras}>Select extras (keep one)</button><button className="btn" onClick={selectAllDuplicates}>Select all duplicates</button></>}{selected.length > 0 && <><span className="selected-bar">{selected.length} selected</span><button className="btn" disabled={Boolean(checking)} onClick={() => checkNow(selected)}>⟳ Check</button><button className="btn danger" disabled={Boolean(checking)} onClick={() => openRemove(selected)}>Remove Selected</button></>}</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th><input type="checkbox" aria-label="Select all visible URLs" checked={filtered.length > 0 && selected.length === filtered.length} onChange={toggleAll} /></th><th>URL</th><th>Group</th><th>Status</th><th>Final destination</th><th>Google</th><th>Last checked</th><th>Actions</th></tr></thead>
                <tbody>{filtered.map((item) => <tr key={item.id}>
                  <td><input type="checkbox" aria-label={`Select ${item.url}`} checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} /></td>
                  <td className="url-cell"><div className="url-primary">{item.label || item.url}</div><a className="url-secondary url-link mono" href={item.url} target="_blank" rel="noreferrer" title={`Open ${item.url}`}>{item.url}<span aria-hidden="true">↗</span></a>{category === "Duplicate links" && duplicateCounts.has(item.id) && <span className="duplicate-tag">{duplicateCounts.get(item.id)} links in this duplicate set</span>}{item.alertMessage && <span className="alert-tag">⚑ {item.alertMessage}</span>}</td>
                  <td>{item.group}</td><td><span className={`badge ${statusClass[item.status] || "unknown"}`}>{item.status}{item.httpCode ? ` · ${item.httpCode}` : ""}</span></td>
                  <td className="url-cell">{item.finalUrl ? <a className="url-secondary url-link mono" href={item.finalUrl} target="_blank" rel="noreferrer" title={`Open ${item.finalUrl}`}>{item.finalUrl}<span aria-hidden="true">↗</span></a> : <span className="panel-meta">—</span>}</td>
                  <td><span className={`badge ${statusClass[item.indexedStatus] || "unknown"}`}>{item.indexedStatus}</span>{item.googleFirstSeen && <div className="url-secondary">First seen ≈ {item.googleFirstSeen}</div>}</td>
                  <td>{fmtTime(item.lastCheckedAt)}</td><td><div className="table-actions"><button className="mini-btn" disabled={Boolean(checking)} onClick={() => checkNow([item.id])}>Check</button><button className="mini-btn" onClick={() => openHistory(item)}>History</button><button className="mini-btn" disabled={Boolean(checking)} onClick={() => openEdit(item)}>Edit</button><button className="mini-btn danger" disabled={Boolean(checking)} onClick={() => openRemove([item.id])}>Remove</button></div></td>
                </tr>)}</tbody>
              </table>
              {!filtered.length && <div className="empty"><strong>No URLs match these filters.</strong><br />Try clearing a filter or add a new URL.</div>}
            </div>
            <div className="panel-foot"><span><strong>{filtered.length.toLocaleString()}</strong> of {data.urls.length.toLocaleString()} URLs shown</span><span>Sitemap includes Live URLs only</span></div>
          </section>
        </div>
      </main>

      {drawer && <div className="drawer-backdrop"><aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head"><div><h2>{drawer === "add" ? "Add a URL" : drawer === "bulk" ? "Bulk import URLs" : drawer === "imports" ? "Import history" : drawer === "edit" ? "Edit URL" : drawer === "history" ? "Status history" : drawer === "sitemap" ? "Generate XML sitemap" : drawer === "remove" ? "Remove URLs" : "Monitoring settings"}</h2><p>{drawer === "history" ? active?.url : drawer === "imports" ? "Every import is retained with its source, time, and deduplicated result counts." : drawer === "settings" ? "Control automatic checks and regression alerts." : drawer === "sitemap" ? "Create an SEO-safe sitemap from the URLs in this dashboard." : drawer === "remove" ? `${selected.length} selected URL${selected.length === 1 ? "" : "s"} will move to Removed URLs and can be restored later.` : "Add pages to your central monitoring registry."}</p></div><button className="icon-btn" aria-label="Close" onClick={() => setDrawer(null)}>×</button></div>
        {drawer === "add" && <><div className="field"><label htmlFor="add-url">STC URL</label><input id="add-url" placeholder="https://www.stc.com.kw/en/page" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} /></div><div className="field"><label htmlFor="add-label">Label (optional)</label><input id="add-label" placeholder="STC page label" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} /></div><div className="field"><label htmlFor="add-group">Group</label><input id="add-group" value={groupInput} onChange={(e) => setGroupInput(e.target.value)} /></div><div className="field-help">Only stc.com.kw links are accepted for now.</div><div className="drawer-actions"><button className="btn" onClick={() => setDrawer(null)}>Cancel</button><button className="btn primary" onClick={addOne}>Add URL</button></div></>}
        {drawer === "bulk" && <>
          <div className="field"><label htmlFor="import-group">Group override (optional)</label><input id="import-group" value={importGroup} onChange={(e) => setImportGroup(e.target.value)} placeholder="Leave blank to detect English or Arabic" /><div className="field-help">When blank, /en/ is classified as English and /ar/ as Arabic automatically.</div></div>
          <div className="import-source"><strong>Excel file</strong><span>Upload an .xlsx file with a URL, Website URL, Page URL, or Link column.</span><label className={`btn ${importing ? "disabled" : ""}`}>Choose Excel<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={importing} onChange={(e) => { const file = e.target.files?.[0]; if (file) void importExcel(file); e.currentTarget.value = ""; }} /></label></div>
          <div className="import-source"><strong>Sitemap URL</strong><span>Fetch the sitemap and any linked sitemap indexes automatically. Existing URLs are shown for Replace or Skip confirmation before import.</span><input value={sitemapInput} onChange={(e) => setSitemapInput(e.target.value)} placeholder="https://www.stc.com.kw/sitemap.xml" /><button className="btn" disabled={importing} onClick={importSitemap}>Import sitemap</button></div>
          <div className="field"><label htmlFor="bulk-urls">Or paste STC URLs</label><textarea id="bulk-urls" placeholder={'https://www.stc.com.kw/en/page-one\nhttps://www.stc.com.kw/ar/page-two'} value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} /><div className="field-help">One URL per line, or separate using commas. Existing URLs are reviewed before anything is changed.</div></div>
          <div className="drawer-actions"><button className="btn" onClick={() => setDrawer(null)}>Close</button><button className="btn primary" disabled={importing || !bulkInput.trim()} onClick={addBulk}>{importing ? "Importing…" : "Import pasted URLs"}</button></div>
          {importResult && <ImportResultPanel result={importResult} />}
        </>}
        {drawer === "imports" && <div className="import-history">{data.imports.map((item) => <div className="import-history-row" key={item.id}><div className="import-history-head"><div><strong>{item.sourceType}</strong><div className="url-secondary mono" title={item.sourceName}>{item.sourceName}</div></div><span>{fmtTime(item.importedAt)}</span></div><div className="import-counts"><span><b>{item.addedCount}</b> added</span><span><b>{item.existingCount}</b> existing</span><span><b>{item.duplicateCount}</b> duplicate</span><span><b>{item.invalidCount}</b> invalid</span></div><div className="field-help">{item.totalRows} rows · {item.uniqueUrls} unique valid URLs</div></div>)}{!data.imports.length && <div className="empty">No imports have been recorded yet.</div>}</div>}
        {drawer === "edit" && active && <><div className="field"><label htmlFor="edit-url">URL</label><input id="edit-url" value={active.url} disabled /></div><div className="field"><label htmlFor="edit-label">Label</label><input id="edit-label" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} /></div><div className="field"><label htmlFor="edit-group">Group</label><input id="edit-group" value={groupInput} onChange={(e) => setGroupInput(e.target.value)} /></div><div className="drawer-actions"><button className="btn" onClick={() => setDrawer(null)}>Cancel</button><button className="btn primary" onClick={saveEdit}>Save changes</button></div></>}
        {drawer === "history" && active && <div className="history-list">{data.history.filter((item) => item.url_id === active.id).map((item) => <div className="history-row" key={item.id}><div className="history-time">{fmtTime(item.checked_at)}</div><div><div className="history-change">{item.from_status ? `${item.from_status} → ${item.to_status}` : item.to_status}</div><div className="url-secondary">{item.note || "Status check recorded"}</div></div></div>)}{!data.history.some((item) => item.url_id === active.id) && <div className="empty">No status changes recorded yet.</div>}</div>}
        {drawer === "sitemap" && <SitemapPanel urls={data.urls} category={sitemapCategory} onCategory={setSitemapCategory} onGenerate={exportSitemap} />}
        {drawer === "remove" && <><div className="field"><label htmlFor="removed-by">Removed by</label><input id="removed-by" value={removedBy} onChange={(e) => setRemovedBy(e.target.value)} placeholder="Name or team" /></div><div className="field"><label htmlFor="removal-reason">Reason (optional)</label><textarea id="removal-reason" value={removalReason} onChange={(e) => setRemovalReason(e.target.value)} placeholder="Why are these URLs being removed?" /></div><div className="drawer-actions"><button className="btn" onClick={() => setDrawer(null)}>Cancel</button><button className="btn danger" onClick={removeUrls}>Move to Removed URLs</button></div></>}
        {drawer === "settings" && <SettingsPanel settings={data.settings} onSave={async (settings) => { const result = await request("POST", { action: "settings", ...settings }); if (result) { setDrawer(null); flash("Monitoring settings saved"); } }} />}
      </aside></div>}
      {duplicateReview && <DuplicateReviewDialog urls={duplicateReview.urls} busy={importing} onClose={() => setDuplicateReview(null)} onChoose={resolveDuplicates} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SitemapPanel({ urls, category, onCategory, onGenerate }: { urls: UrlItem[]; category: string; onCategory: (value: string) => void; onGenerate: () => void }) {
  const inCategory = urls.filter((item) => category === "All categories" || categoriesForUrl(item.url).includes(category));
  const live = inCategory.filter((item) => item.status === "Live");
  const eligible = sitemapUrls(urls, category);
  return <><div className="field"><label htmlFor="sitemap-category">Category</label><select id="sitemap-category" value={category} onChange={(event) => onCategory(event.target.value)}><option>All categories</option>{URL_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div><div className="import-result-grid sitemap-summary"><div className="import-stat"><strong>{eligible.length}</strong><span>Included</span></div><div className="import-stat"><strong>{inCategory.length - live.length}</strong><span>Non-live excluded</span></div><div className="import-stat"><strong>{live.length - eligible.length}</strong><span>Duplicate variants excluded</span></div></div><div className="sitemap-rules"><strong>SEO rules applied</strong><ul><li>Only Live URLs from All URLs</li><li>One preferred URL per duplicate set</li><li>Absolute URLs with XML escaping</li><li>No unverified lastmod, priority, or changefreq values</li><li>Removed, redirected, broken, and unavailable URLs excluded</li></ul></div><div className="field-help">Google permits up to 50,000 URLs per sitemap. This export contains {eligible.length.toLocaleString()}.</div><div className="drawer-actions"><button className="btn primary" disabled={!eligible.length || eligible.length > 50000} onClick={onGenerate}>Download XML sitemap</button></div></>;
}

function ImportResultPanel({ result }: { result: ImportResult }) {
  const replaced = new Set(result.replacedUrls || []);
  const groups: Array<[string, string[]]> = [["Newly added", result.addedUrls], ["Replaced", result.replacedUrls || []], ["Skipped existing", result.existingUrls.filter((url) => !replaced.has(url))], ["Duplicate in import", result.duplicateUrls], ["Invalid or non-STC", result.invalidUrls]];
  return <div className="import-result"><h3>Import result</h3><div className="import-result-grid">{groups.map(([label, urls]) => <div className="import-stat" key={label}><strong>{urls.length}</strong><span>{label}</span></div>)}</div>{groups.map(([label, urls]) => urls.length > 0 && <details className="import-details" key={label}><summary>{label} ({urls.length})</summary><div className="import-url-list">{urls.map((url) => <div className="mono" key={url}>{url}</div>)}</div></details>)}</div>;
}

function SettingsPanel({ settings, onSave }: { settings: Settings; onSave: (value: { schedule: string; alertsEnabled: boolean }) => void }) {
  const [schedule, setSchedule] = useState(settings.schedule || "Every 6 hours");
  const [alertsEnabled, setAlertsEnabled] = useState(settings.alerts_enabled !== 0);
  return <><div className="field"><label htmlFor="check-frequency">Automatic check frequency</label><select id="check-frequency" value={schedule} onChange={(e) => setSchedule(e.target.value)}><option>Every hour</option><option>Every 6 hours</option><option>Every 12 hours</option><option>Daily</option><option>Weekly</option></select><div className="field-help">The monitoring schedule is stored with the dashboard. Connect a platform scheduler to call the check endpoint at this frequency.</div></div><div className="field"><label><input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} /> Alert when a previously live page breaks</label><div className="field-help">Alerts appear when a Live page changes to 404, 410, Server Error, or Unavailable.</div></div><div className="notice"><span><strong>Google indexing note</strong><br />Accurate indexing and first-seen data requires a verified Google Search Console or third-party SEO data connection.</span></div><div className="drawer-actions"><button className="btn primary" onClick={() => onSave({ schedule, alertsEnabled })}>Save settings</button></div></>;
}
