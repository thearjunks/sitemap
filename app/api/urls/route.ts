import { env } from "cloudflare:workers";

type UrlRow = {
  id: number; url: string; label: string; group_name: string; status: string;
  http_code: number | null; final_url: string | null; indexed_status: string;
  google_first_seen: string | null; last_checked_at: string | null;
  alert_message: string | null; created_at: string; updated_at: string;
};

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
  `CREATE INDEX IF NOT EXISTS idx_monitored_urls_status ON monitored_urls(status)`,
  `CREATE INDEX IF NOT EXISTS idx_monitored_urls_group ON monitored_urls(group_name)`,
  `CREATE INDEX IF NOT EXISTS idx_status_history_url_checked ON status_history(url_id, checked_at)`,
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
  await env.DB.batch([
    env.DB.prepare("UPDATE monitored_urls SET group_name='English' WHERE url LIKE '%stc.com.kw/en/%' OR url LIKE '%stc.com.kw/en'"),
    env.DB.prepare("UPDATE monitored_urls SET group_name='Arabic' WHERE url LIKE '%stc.com.kw/ar/%' OR url LIKE '%stc.com.kw/ar'"),
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
    alertMessage: row.alert_message, createdAt: row.created_at, updatedAt: row.updated_at,
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

async function getPayload() {
  const [urls, history, settings] = await Promise.all([
    env.DB.prepare("SELECT * FROM monitored_urls ORDER BY id DESC").all<UrlRow>(),
    env.DB.prepare("SELECT * FROM status_history ORDER BY checked_at DESC LIMIT 500").all(),
    env.DB.prepare("SELECT * FROM monitor_settings WHERE id=1").first(),
  ]);
  return { urls: urls.results.map(mapUrl), history: history.results, settings };
}

async function inspectUrl(rawUrl: string) {
  let current = rawUrl;
  let redirected = false;
  let response: Response | null = null;
  try {
    for (let hops = 0; hops < 6; hops++) {
      response = await fetch(current, { method: "GET", redirect: "manual", headers: { "User-Agent": "URL-Watch/1.0" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;
        redirected = true;
        current = new URL(location, current).toString();
        continue;
      }
      break;
    }
    const code = response?.status ?? null;
    let status = "Unavailable";
    if (code === 404) status = "404";
    else if (code === 410) status = "410";
    else if (code && code >= 500) status = "Server Error";
    else if (code && code >= 200 && code < 400) status = redirected ? "Redirected" : "Live";
    else if (code && code >= 400) status = "Unavailable";
    return { status, httpCode: code, finalUrl: redirected ? current : null };
  } catch {
    return { status: "Unavailable", httpCode: null, finalUrl: redirected ? current : null };
  }
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

  if (action === "add") {
    const entries = Array.isArray(body.urls) ? body.urls : [];
    let added = 0;
    for (const item of entries) {
      const data = typeof item === "string" ? { url: item } : item as Record<string, unknown>;
      const url = normalizeUrl(String(data.url || ""));
      if (!url || !isStcUrl(url)) continue;
      const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO monitored_urls (url,label,group_name,status,indexed_status,created_at,updated_at) VALUES (?,?,?,'Unknown','Unknown',?,?)"
      ).bind(url, String(data.label || ""), String(data.group || "Website"), now, now).run();
      if (result.meta.changes) {
        added++;
        const row = await env.DB.prepare("SELECT id FROM monitored_urls WHERE url=?").bind(url).first<{ id: number }>();
        if (row) await env.DB.prepare("INSERT INTO status_history (url_id,from_status,to_status,note,checked_at) VALUES (?,NULL,'Unknown','Added to monitoring',?)").bind(row.id, now).run();
      }
    }
    return Response.json({ ...(await getPayload()), added });
  }

  if (action === "check") {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    const query = ids.length ? `SELECT * FROM monitored_urls WHERE id IN (${ids.map(() => "?").join(",")}) AND status != 'Removed'` : "SELECT * FROM monitored_urls WHERE status != 'Removed'";
    const rows = await env.DB.prepare(query).bind(...ids).all<UrlRow>();
    for (const row of rows.results) {
      const result = await inspectUrl(row.url);
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
    return Response.json({ ...(await getPayload()), checked: rows.results.length });
  }

  if (action === "settings") {
    await env.DB.prepare("INSERT INTO monitor_settings (id,schedule,alerts_enabled,updated_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET schedule=excluded.schedule,alerts_enabled=excluded.alerts_enabled,updated_at=excluded.updated_at")
      .bind(String(body.schedule || "Every 6 hours"), body.alertsEnabled ? 1 : 0, now).run();
    return Response.json(await getPayload());
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
