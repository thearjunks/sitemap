import { env } from "cloudflare:workers";
import { inspectUrl } from "../check-url";

type UrlRow = {
  id: number; url: string; label: string; group_name: string; status: string;
  http_code: number | null; final_url: string | null; indexed_status: string;
  google_first_seen: string | null; last_checked_at: string | null;
  alert_message: string | null; removed_at: string | null; removed_by: string | null;
  removal_reason: string | null; status_before_removal: string | null;
  created_at: string; updated_at: string;
};
type ImportRow = { id: number; source_type: string; source_name: string; imported_at: string; total_rows: number; unique_urls: number; added_count: number; existing_count: number; duplicate_count: number; invalid_count: number };

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS monitored_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, label TEXT NOT NULL DEFAULT '',
    group_name TEXT NOT NULL DEFAULT 'Website', status TEXT NOT NULL DEFAULT 'Unknown', http_code INTEGER,
    final_url TEXT, indexed_status TEXT NOT NULL DEFAULT 'Unknown', google_first_seen TEXT,
    last_checked_at TEXT, alert_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, url_id INTEGER NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
    http_code INTEGER, final_url TEXT, note TEXT, checked_at TEXT NOT NULL,
    FOREIGN KEY (url_id) REFERENCES monitored_urls(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS monitor_settings (
    id INTEGER PRIMARY KEY, schedule TEXT NOT NULL DEFAULT 'Every 6 hours',
    alerts_enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS url_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT NOT NULL, source_name TEXT NOT NULL,
    imported_at TEXT NOT NULL, total_rows INTEGER NOT NULL, unique_urls INTEGER NOT NULL,
    added_count INTEGER NOT NULL, existing_count INTEGER NOT NULL, duplicate_count INTEGER NOT NULL,
    invalid_count INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS url_import_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, import_id INTEGER NOT NULL, url TEXT NOT NULL,
    result TEXT NOT NULL, duplicate_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (import_id) REFERENCES url_imports(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_monitored_urls_status ON monitored_urls(status)`,
  `CREATE INDEX IF NOT EXISTS idx_monitored_urls_group ON monitored_urls(group_name)`,
  `CREATE INDEX IF NOT EXISTS idx_status_history_url_checked ON status_history(url_id, checked_at)`,
  `CREATE INDEX IF NOT EXISTS idx_url_imports_imported_at ON url_imports(imported_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_url_import_items_import_url ON url_import_items(import_id, url)`,
];

const STC_SITEMAP_URL = "https://www.stc.com.kw/sitemap.xml";

function isStcUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "stc.com.kw" || host.endsWith(".stc.com.kw");
  } catch { return false; }
}

function stcGroup(value: string) {
  const url = new URL(value);
  if (/^\/en(?:\/|$)/i.test(url.pathname)) return "English";
  if (/^\/ar(?:\/|$)/i.test(url.pathname)) return "Arabic";
  return "STC Other";
}

async function importStcSitemap(clearExisting: boolean) {
  const response = await fetch(STC_SITEMAP_URL, { headers: { "User-Agent": "URL-Watch/1.0" } });
  if (!response.ok) throw new Error(`STC sitemap returned HTTP ${response.status}`);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => match[1].trim().replaceAll("&amp;", "&"))
    .filter(isStcUrl);
  const uniqueUrls = [...new Set(urls)];
  if (!uniqueUrls.length) throw new Error("The STC sitemap contained no valid STC URLs");

  if (clearExisting) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM status_history"),
      env.DB.prepare("DELETE FROM monitored_urls"),
    ]);
  }

  const now = new Date().toISOString();
  const insert = env.DB.prepare(
    "INSERT OR IGNORE INTO monitored_urls (url,label,group_name,status,indexed_status,created_at,updated_at) VALUES (?,'',?,'Unknown','Unknown',?,?)"
  );
  for (let start = 0; start < uniqueUrls.length; start += 100) {
    await env.DB.batch(uniqueUrls.slice(start, start + 100).map((url) => insert.bind(url, stcGroup(url), now, now)));
  }
  await env.DB.prepare("INSERT OR IGNORE INTO monitor_settings (id,schedule,alerts_enabled,updated_at) VALUES (1,?,?,?)")
    .bind("Every 6 hours", 1, now).run();
}

async function ensureDb() {
  await env.DB.batch(schemaStatements.map((sql) => env.DB.prepare(sql)));
  const columns = await env.DB.prepare("PRAGMA table_info(monitored_urls)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const migrations = [
    ["removed_at", "ALTER TABLE monitored_urls ADD COLUMN removed_at TEXT"],
    ["removed_by", "ALTER TABLE monitored_urls ADD COLUMN removed_by TEXT"],
    ["removal_reason", "ALTER TABLE monitored_urls ADD COLUMN removal_reason TEXT"],
    ["status_before_removal", "ALTER TABLE monitored_urls ADD COLUMN status_before_removal TEXT"],
  ].filter(([name]) => !names.has(name));
  if (migrations.length) await env.DB.batch(migrations.map(([, sql]) => env.DB.prepare(sql)));
  await env.DB.batch([
    env.DB.prepare("UPDATE monitored_urls SET group_name='English' WHERE url LIKE '%stc.com.kw/en/%' OR url LIKE '%stc.com.kw/en'"),
    env.DB.prepare("UPDATE monitored_urls SET group_name='Arabic' WHERE url LIKE '%stc.com.kw/ar/%' OR url LIKE '%stc.com.kw/ar'"),
    env.DB.prepare("UPDATE monitored_urls SET removed_at=COALESCE(removed_at,updated_at),removed_by=COALESCE(removed_by,'Legacy removal'),status_before_removal=COALESCE(status_before_removal,'Unknown') WHERE status='Removed'"),
  ]);
  const [count, dummy] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM monitored_urls").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM monitored_urls WHERE url LIKE '%example.com%'").first<{ count: number }>(),
  ]);
  if (!count?.count || dummy?.count) await importStcSitemap(Boolean(dummy?.count));
}

function mapUrl(row: UrlRow) {
  return {
    id: row.id, url: row.url, label: row.label, group: row.group_name, status: row.status,
    httpCode: row.http_code, finalUrl: row.final_url, indexedStatus: row.indexed_status,
    googleFirstSeen: row.google_first_seen, lastCheckedAt: row.last_checked_at,
    alertMessage: row.alert_message, removedAt: row.removed_at, removedBy: row.removed_by,
    removalReason: row.removal_reason, statusBeforeRemoval: row.status_before_removal,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch { return null; }
}

const decodeXml = (value: string) => value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");

async function collectSitemapUrls(sitemapUrl: string, visited = new Set<string>()): Promise<string[]> {
  const normalized = normalizeUrl(sitemapUrl);
  if (!normalized || !isStcUrl(normalized)) throw new Error("Only STC sitemap URLs are accepted");
  if (visited.has(normalized)) return [];
  if (visited.size >= 25) throw new Error("Sitemap index contains too many sitemap files");
  visited.add(normalized);
  const response = await fetch(normalized, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "URL-Watch/1.0" } });
  if (!response.ok) throw new Error(`Sitemap returned HTTP ${response.status}`);
  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
  if (/<sitemapindex\b/i.test(xml)) {
    const nested: string[] = [];
    for (const location of locations) {
      nested.push(...await collectSitemapUrls(location, visited));
      if (nested.length > 20000) throw new Error("Sitemap index contains more than 20,000 URLs");
    }
    return nested;
  }
  if (locations.length > 20000) throw new Error("Sitemap contains more than 20,000 URLs");
  return locations;
}

async function importUrls(rawValues: string[], sourceType: string, sourceName: string, group: string, now: string) {
  const valid = new Map<string, number>();
  const invalid = new Map<string, number>();
  for (const rawValue of rawValues) {
    const raw = String(rawValue || "").trim();
    if (!raw) continue;
    const url = normalizeUrl(raw);
    if (!url || !isStcUrl(url)) invalid.set(raw, (invalid.get(raw) || 0) + 1);
    else valid.set(url, (valid.get(url) || 0) + 1);
  }
  const entries = [...valid.keys()];
  const addedUrls: string[] = [];
  const existingUrls: string[] = [];
  const insert = env.DB.prepare("INSERT OR IGNORE INTO monitored_urls (url,label,group_name,status,indexed_status,created_at,updated_at) VALUES (?,'',?,'Unknown','Unknown',?,?)");
  for (let start = 0; start < entries.length; start += 100) {
    const chunk = entries.slice(start, start + 100);
    const results = await env.DB.batch(chunk.map((url) => insert.bind(url, group || stcGroup(url), now, now)));
    results.forEach((result, index) => (result.meta.changes ? addedUrls : existingUrls).push(chunk[index]));
  }
  for (let start = 0; start < addedUrls.length; start += 100) {
    const chunk = addedUrls.slice(start, start + 100);
    const rows = await env.DB.prepare(`SELECT id FROM monitored_urls WHERE url IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ id: number }>();
    if (rows.results.length) await env.DB.batch(rows.results.map((row) => env.DB.prepare("INSERT INTO status_history (url_id,from_status,to_status,note,checked_at) VALUES (?,NULL,'Unknown',?,?)").bind(row.id, `Added from ${sourceType} import`, now)));
  }
  const duplicateUrls = [...valid.entries()].filter(([, count]) => count > 1).map(([url]) => url);
  const invalidUrls = [...invalid.keys()];
  const summary = await env.DB.prepare("INSERT INTO url_imports (source_type,source_name,imported_at,total_rows,unique_urls,added_count,existing_count,duplicate_count,invalid_count) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(sourceType, sourceName, now, rawValues.length, entries.length, addedUrls.length, existingUrls.length, duplicateUrls.length, invalidUrls.length).run();
  const importId = Number(summary.meta.last_row_id);
  const items = [
    ...addedUrls.map((url) => ({ url, result: "Added", duplicateCount: (valid.get(url) || 1) - 1 })),
    ...existingUrls.map((url) => ({ url, result: "Existing", duplicateCount: (valid.get(url) || 1) - 1 })),
    ...invalidUrls.map((url) => ({ url, result: "Invalid", duplicateCount: (invalid.get(url) || 1) - 1 })),
  ];
  const insertItem = env.DB.prepare("INSERT OR IGNORE INTO url_import_items (import_id,url,result,duplicate_count) VALUES (?,?,?,?)");
  for (let start = 0; start < items.length; start += 100) {
    await env.DB.batch(items.slice(start, start + 100).map((item) => insertItem.bind(importId, item.url, item.result, item.duplicateCount)));
  }
  return { importId, sourceType, sourceName, importedAt: now, totalRows: rawValues.length, uniqueUrls: entries.length, addedUrls, existingUrls, duplicateUrls, invalidUrls };
}

async function getPayload() {
  const [urls, removedUrls, history, settings, imports] = await Promise.all([
    env.DB.prepare("SELECT * FROM monitored_urls WHERE status != 'Removed' ORDER BY id DESC").all<UrlRow>(),
    env.DB.prepare("SELECT * FROM monitored_urls WHERE status = 'Removed' ORDER BY removed_at DESC, id DESC").all<UrlRow>(),
    env.DB.prepare("SELECT * FROM status_history ORDER BY checked_at DESC LIMIT 500").all(),
    env.DB.prepare("SELECT * FROM monitor_settings WHERE id=1").first(),
    env.DB.prepare("SELECT * FROM url_imports ORDER BY imported_at DESC, id DESC").all<ImportRow>(),
  ]);
  return {
    urls: urls.results.map(mapUrl), removedUrls: removedUrls.results.map(mapUrl), history: history.results, settings,
    imports: imports.results.map((row) => ({ id: row.id, sourceType: row.source_type, sourceName: row.source_name, importedAt: row.imported_at, totalRows: row.total_rows, uniqueUrls: row.unique_urls, addedCount: row.added_count, existingCount: row.existing_count, duplicateCount: row.duplicate_count, invalidCount: row.invalid_count })),
  };
}

export async function GET() {
  await ensureDb();
  return Response.json(await getPayload());
}

export async function POST(request: Request) {
  await ensureDb();
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action || "add");
  const now = new Date().toISOString();

  if (action === "import") {
    const sourceType = ["Excel", "Paste"].includes(String(body.sourceType)) ? String(body.sourceType) : "Paste";
    const values = Array.isArray(body.urls) ? body.urls.map(String) : [];
    if (!values.length) return Response.json({ error: "No URLs found in the import" }, { status: 400 });
    const result = await importUrls(values, sourceType, String(body.sourceName || sourceType), String(body.group || ""), now);
    return Response.json({ ...(await getPayload()), importResult: result });
  }

  if (action === "import-sitemap") {
    try {
      const sitemapUrl = String(body.sitemapUrl || "").trim();
      const values = await collectSitemapUrls(sitemapUrl);
      if (!values.length) return Response.json({ error: "No URLs were found in this sitemap" }, { status: 400 });
      const result = await importUrls(values, "Sitemap", sitemapUrl, String(body.group || ""), now);
      return Response.json({ ...(await getPayload()), importResult: result });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Sitemap import failed" }, { status: 400 });
    }
  }

  if (action === "add") {
    const entries = Array.isArray(body.urls) ? body.urls : [];
    let added = 0;
    for (const item of entries) {
      const data = typeof item === "string" ? { url: item } : item as Record<string, unknown>;
      const url = normalizeUrl(String(data.url || ""));
      if (!url || !isStcUrl(url)) continue;
      const status = ["Live", "Redirected", "404", "410", "Server Error", "Unavailable", "Unknown"].includes(String(data.status)) ? String(data.status) : "Unknown";
      const httpCode = Number.isInteger(data.httpCode) ? Number(data.httpCode) : null;
      const finalUrl = data.finalUrl ? String(data.finalUrl) : null;
      const lastCheckedAt = data.lastCheckedAt ? String(data.lastCheckedAt) : null;
      const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO monitored_urls (url,label,group_name,status,http_code,final_url,indexed_status,last_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'Unknown',?,?,?)"
      ).bind(url, String(data.label || ""), String(data.group || stcGroup(url)), status, httpCode, finalUrl, lastCheckedAt, now, now).run();
      if (result.meta.changes) {
        added++;
        const row = await env.DB.prepare("SELECT id FROM monitored_urls WHERE url=?").bind(url).first<{ id: number }>();
        if (row) await env.DB.prepare("INSERT INTO status_history (url_id,from_status,to_status,note,checked_at) VALUES (?,NULL,?,'Added to monitoring',?)").bind(row.id, status, now).run();
      }
    }
    return Response.json({ ...(await getPayload()), added });
  }

  if (action === "check") {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    const query = ids.length ? `SELECT * FROM monitored_urls WHERE id IN (${ids.map(() => "?").join(",")}) AND status != 'Removed'` : "SELECT * FROM monitored_urls WHERE status != 'Removed'";
    const rows = await env.DB.prepare(query).bind(...ids).all<UrlRow>();
    for (let start = 0; start < rows.results.length; start += 10) {
      const batch = rows.results.slice(start, start + 10);
      const checks = await Promise.all(batch.map((row) => inspectUrl(row.url)));
      for (let index = 0; index < batch.length; index++) {
        const row = batch[index];
        const result = checks[index];
        const risky = row.status === "Live" && ["404", "410", "Server Error", "Unavailable"].includes(result.status);
        const redirectRisk = row.status === "Live" && result.finalUrl && ["404", "410", "Server Error", "Unavailable"].includes(result.status);
        const alert = risky || redirectRisk ? `Previously live page now ${result.status === "Unavailable" ? "is unavailable" : `returns ${result.status}`}` : null;
        await env.DB.prepare("UPDATE monitored_urls SET status=?,http_code=?,final_url=?,last_checked_at=?,alert_message=?,updated_at=? WHERE id=?")
          .bind(result.status, result.httpCode, result.finalUrl, now, alert, now, row.id).run();
        if (row.status !== result.status || row.final_url !== result.finalUrl) {
          await env.DB.prepare("INSERT INTO status_history (url_id,from_status,to_status,http_code,final_url,note,checked_at) VALUES (?,?,?,?,?,?,?)")
            .bind(row.id, row.status, result.status, result.httpCode, result.finalUrl, alert || "Status changed", now).run();
        }
      }
    }
    const checkedRows = ids.length
      ? await env.DB.prepare(`SELECT * FROM monitored_urls WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<UrlRow>()
      : await env.DB.prepare("SELECT * FROM monitored_urls WHERE status != 'Removed'").all<UrlRow>();
    return Response.json({ urls: checkedRows.results.map(mapUrl), checked: rows.results.length });
  }

  if (action === "settings") {
    await env.DB.prepare("INSERT INTO monitor_settings (id,schedule,alerts_enabled,updated_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET schedule=excluded.schedule,alerts_enabled=excluded.alerts_enabled,updated_at=excluded.updated_at")
      .bind(String(body.schedule || "Every 6 hours"), body.alertsEnabled ? 1 : 0, now).run();
    return Response.json(await getPayload());
  }

  if (action === "remove") {
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(Boolean))] : [];
    if (!ids.length) return Response.json({ error: "No URLs selected" }, { status: 400 });
    const removedBy = String(body.removedBy || "Local user").trim() || "Local user";
    const reason = String(body.reason || "").trim() || null;
    const removedRows: Array<{ id: number; status_before_removal: string | null }> = [];
    for (let start = 0; start < ids.length; start += 75) {
      const chunk = ids.slice(start, start + 75);
      const rows = await env.DB.prepare(`SELECT id,status FROM monitored_urls WHERE id IN (${chunk.map(() => "?").join(",")}) AND status != 'Removed'`).bind(...chunk).all<{ id: number; status: string }>();
      const removable = rows.results.map((row) => row.id);
      if (!removable.length) continue;
      await env.DB.prepare(`UPDATE monitored_urls SET status_before_removal=status,status='Removed',removed_at=?,removed_by=?,removal_reason=?,updated_at=? WHERE id IN (${removable.map(() => "?").join(",")})`)
        .bind(now, removedBy, reason, now, ...removable).run();
      removedRows.push(...rows.results.map((row) => ({ id: row.id, status_before_removal: row.status })));
    }
    for (let start = 0; start < removedRows.length; start += 75) {
      await env.DB.batch(removedRows.slice(start, start + 75).map((row) => env.DB.prepare("INSERT INTO status_history (url_id,from_status,to_status,note,checked_at) VALUES (?,?,'Removed',?,?)").bind(row.id, row.status_before_removal, reason ? `Removed by ${removedBy}: ${reason}` : `Removed by ${removedBy}`, now)));
    }
    return Response.json({
      removed: removedRows.length,
      removedIds: removedRows.map((row) => row.id),
      removedAt: now,
      removedBy,
      removalReason: reason,
    });
  }

  if (action === "restore") {
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(Boolean))] : [];
    if (!ids.length) return Response.json({ error: "No URLs selected" }, { status: 400 });
    const restoredIds: number[] = [];
    for (let start = 0; start < ids.length; start += 75) {
      const chunk = ids.slice(start, start + 75);
      const rows = await env.DB.prepare(`SELECT id FROM monitored_urls WHERE id IN (${chunk.map(() => "?").join(",")}) AND status='Removed'`).bind(...chunk).all<{ id: number }>();
      const restorable = rows.results.map((row) => row.id);
      if (!restorable.length) continue;
      await env.DB.prepare(`UPDATE monitored_urls SET status=COALESCE(NULLIF(status_before_removal,''),'Unknown'),status_before_removal=NULL,removed_at=NULL,removed_by=NULL,removal_reason=NULL,updated_at=? WHERE id IN (${restorable.map(() => "?").join(",")})`)
        .bind(now, ...restorable).run();
      restoredIds.push(...restorable);
    }
    for (let start = 0; start < restoredIds.length; start += 75) {
      await env.DB.batch(restoredIds.slice(start, start + 75).map((id) => env.DB.prepare("INSERT INTO status_history (url_id,from_status,to_status,note,checked_at) SELECT id,'Removed',status,'Restored to monitoring',? FROM monitored_urls WHERE id=?").bind(now, id)));
    }
    return Response.json({ restored: restoredIds.length, restoredIds });
  }

  return Response.json({ error: "Unsupported action" }, { status: 400 });
}

export async function PATCH(request: Request) {
  await ensureDb();
  const body = await request.json() as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [Number(body.id)].filter(Boolean);
  if (!ids.length) return Response.json({ error: "No URLs selected" }, { status: 400 });
  const updates: string[] = [];
  const values: unknown[] = [];
  const allowed: Record<string, string> = { label: "label", group: "group_name", status: "status", indexedStatus: "indexed_status", googleFirstSeen: "google_first_seen" };
  for (const [key, column] of Object.entries(allowed)) {
    if (body[key] !== undefined && body[key] !== "") { updates.push(`${column}=?`); values.push(body[key]); }
  }
  if (!updates.length) return Response.json({ error: "No changes supplied" }, { status: 400 });
  updates.push("updated_at=?"); values.push(new Date().toISOString());
  await env.DB.prepare(`UPDATE monitored_urls SET ${updates.join(",")} WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...values, ...ids).run();
  return Response.json(await getPayload());
}

export async function DELETE(request: Request) {
  await ensureDb();
  const body = await request.json() as { ids?: number[] };
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
  if (ids.length) await env.DB.prepare(`DELETE FROM monitored_urls WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
  return Response.json(await getPayload());
}
