import { env } from "cloudflare:workers";
import { inspectUrl } from "../check-url";

type Row = { id: number; url: string; domain: string; status: string; http_code: number | null; final_url: string | null; last_checked_at: string | null; created_at: string; updated_at: string };

async function ensureDb() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS general_monitored_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Unknown', http_code INTEGER, final_url TEXT,
      last_checked_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_general_urls_status ON general_monitored_urls(status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_general_urls_domain ON general_monitored_urls(domain)"),
  ]);
}

function normalize(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return { url: url.toString(), domain: url.hostname.toLowerCase() };
  } catch { return null; }
}

const map = (row: Row) => ({ id: row.id, url: row.url, domain: row.domain, status: row.status, httpCode: row.http_code, finalUrl: row.final_url, lastCheckedAt: row.last_checked_at, createdAt: row.created_at, updatedAt: row.updated_at });
async function allUrls() { return (await env.DB.prepare("SELECT * FROM general_monitored_urls ORDER BY id DESC").all<Row>()).results.map(map); }

export async function GET() {
  await ensureDb();
  return Response.json({ urls: await allUrls() });
}

export async function POST(request: Request) {
  await ensureDb();
  const body = await request.json() as { action?: string; urls?: string[]; ids?: number[] };
  const now = new Date().toISOString();
  if (body.action === "add") {
    let added = 0;
    for (const value of body.urls || []) {
      const parsed = normalize(value);
      if (!parsed) continue;
      const result = await env.DB.prepare("INSERT OR IGNORE INTO general_monitored_urls (url,domain,status,created_at,updated_at) VALUES (?,?,'Unknown',?,?)").bind(parsed.url, parsed.domain, now, now).run();
      added += result.meta.changes || 0;
    }
    return Response.json({ urls: await allUrls(), added });
  }
  if (body.action === "check") {
    const ids = (body.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return Response.json({ error: "No URLs selected" }, { status: 400 });
    const rows = await env.DB.prepare(`SELECT * FROM general_monitored_urls WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<Row>();
    for (let start = 0; start < rows.results.length; start += 10) {
      const batch = rows.results.slice(start, start + 10);
      const checks = await Promise.all(batch.map((row) => inspectUrl(row.url)));
      await env.DB.batch(batch.map((row, index) => env.DB.prepare("UPDATE general_monitored_urls SET status=?,http_code=?,final_url=?,last_checked_at=?,updated_at=? WHERE id=?").bind(checks[index].status, checks[index].httpCode, checks[index].finalUrl, now, now, row.id)));
    }
    const checked = await env.DB.prepare(`SELECT * FROM general_monitored_urls WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<Row>();
    return Response.json({ urls: checked.results.map(map), checked: checked.results.length });
  }
  return Response.json({ error: "Unsupported action" }, { status: 400 });
}

export async function DELETE(request: Request) {
  await ensureDb();
  const body = await request.json() as { ids?: number[] };
  const ids = (body.ids || []).map(Number).filter(Boolean);
  if (ids.length) await env.DB.prepare(`DELETE FROM general_monitored_urls WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
  return Response.json({ urls: await allUrls() });
}
