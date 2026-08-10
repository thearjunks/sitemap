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

async function ensureDb() {
  await env.DB.batch(schemaStatements.map((sql) => env.DB.prepare(sql)));
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM monitored_urls").first<{ count: number }>();
  if (!count?.count) {
    const now = new Date();
    const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();
    const seeds = [
      ["https://www.example.com/", "Homepage", "Corporate", "Live", 200, null, "Indexed", "2018-04", iso(0.2), null],
      ["https://www.example.com/products", "Products", "Corporate", "Live", 200, null, "Indexed", "2020-09", iso(0.4), null],
      ["https://www.example.com/old-offers", "Old offers", "Campaigns", "Redirected", 301, "https://www.example.com/offers", "Indexed", "2021-02", iso(0.7), null],
      ["https://www.example.com/summer-2024", "Summer campaign", "Campaigns", "404", 404, null, "Not Indexed", "2024-05", iso(1.1), "Previously live page now returns 404"],
      ["https://www.example.com/support", "Support", "Help center", "Live", 200, null, "Indexed", "2019-11", iso(1.3), null],
      ["https://www.example.com/legacy-api", "Legacy API", "Technical", "410", 410, null, "Not Indexed", "2020-01", iso(2.2), null],
      ["https://www.example.com/account", "Customer account", "Corporate", "Server Error", 503, null, "Unknown", null, iso(2.8), "Previously live page now returns a server error"],
      ["https://status.example.com/", "Service status", "Technical", "Live", 200, null, "Indexed", "2022-03", iso(4.3), null],
      ["https://www.example.com/discontinued", "Discontinued service", "Archive", "Removed", null, null, "Not Indexed", "2019-06", iso(26), null],
      ["https://www.example.com/contact", "Contact us", "Corporate", "Live", 200, null, "Indexed", "2018-04", iso(5.1), null],
      ["https://www.example.com/partners", "Partners", "Corporate", "Unavailable", null, null, "Unknown", null, iso(6), "Previously live page is unavailable"],
      ["https://www.example.com/new-launch", "New launch", "Campaigns", "Live", 200, null, "Not Indexed", null, iso(7), null],
    ];
    const insert = `INSERT INTO monitored_urls
      (url,label,group_name,status,http_code,final_url,indexed_status,google_first_seen,last_checked_at,alert_message,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
    await env.DB.batch(seeds.map((s, index) => env.DB.prepare(insert).bind(...s, iso(72 + index), iso(0.2))));
    await env.DB.prepare("INSERT OR IGNORE INTO monitor_settings (id,schedule,alerts_enabled,updated_at) VALUES (1,?,?,?)")
      .bind("Every 6 hours", 1, now.toISOString()).run();
    const rows = await env.DB.prepare("SELECT id,status,http_code,final_url,created_at FROM monitored_urls").all<UrlRow>();
    await env.DB.batch(rows.results.map((row) => env.DB.prepare(
      "INSERT INTO status_history (url_id,from_status,to_status,http_code,final_url,note,checked_at) VALUES (?,NULL,?,?,?,?,?)"
    ).bind(row.id, row.status, row.http_code, row.final_url, "Added to monitoring", row.created_at)));
  }
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
      if (!url) continue;
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
