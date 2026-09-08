import { env } from "cloudflare:workers";
import { hashPassword, verifyPassword } from "../server/passwords.mjs";

const COOKIE = "url_watch_session";
const SESSION_DAYS = 7;

export type AppUser = { id: number; username: string; displayName: string; role: "admin" | "user"; createdAt: string; updatedAt: string };
type UserRow = { id: number; username: string; display_name: string; password_hash: string; role: "admin" | "user"; created_at: string; updated_at: string };

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const mapUser = (row: UserRow): AppUser => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role, createdAt: row.created_at, updatedAt: row.updated_at });
export { verifyPassword };

export async function ensureAuthDb() {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS app_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE CASCADE)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_app_sessions_expiry ON app_sessions(expires_at)"),
  ]);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM app_users").first<{ count: number }>();
  if (!count?.count) {
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (username && password) {
      const now = new Date().toISOString();
      await env.DB.prepare("INSERT OR IGNORE INTO app_users(username,display_name,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?)")
        .bind(username, username, await hashPassword(password), "admin", now, now).run();
    }
  }
  await env.DB.prepare("DELETE FROM app_sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();
}

function cookieValue(request: Request) {
  const header = request.headers.get("cookie") || "";
  return header.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || "";
}

async function tokenHash(token: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

export async function currentUser(request: Request): Promise<AppUser | null> {
  await ensureAuthDb();
  const token = cookieValue(request);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT u.* FROM app_users u JOIN app_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?")
    .bind(await tokenHash(token), new Date().toISOString()).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function login(username: string, password: string) {
  await ensureAuthDb();
  const row = await env.DB.prepare("SELECT * FROM app_users WHERE username=? COLLATE NOCASE").bind(username.trim()).first<UserRow>();
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToHex(tokenBytes);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await env.DB.prepare("INSERT INTO app_sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .bind(await tokenHash(token), row.id, expires.toISOString(), now.toISOString()).run();
  return { user: mapUser(row), cookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` };
}

export async function logout(request: Request) {
  const token = cookieValue(request);
  if (token) await env.DB.prepare("DELETE FROM app_sessions WHERE token_hash=?").bind(await tokenHash(token)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function listUsers() {
  await ensureAuthDb();
  const rows = await env.DB.prepare("SELECT * FROM app_users ORDER BY role='admin' DESC, username COLLATE NOCASE").all<UserRow>();
  return rows.results.map(mapUser);
}

export async function createUser(username: string, displayName: string, password: string, role: "admin" | "user") {
  const existing = await env.DB.prepare("SELECT id FROM app_users WHERE username=? COLLATE NOCASE").bind(username.trim()).first();
  if (existing) throw new Error("Username already exists");
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO app_users(username,display_name,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .bind(username.trim(), displayName.trim() || username.trim(), await hashPassword(password), role, now, now).run();
}

export async function changePassword(userId: number, password: string) {
  await env.DB.prepare("UPDATE app_users SET password_hash=?,updated_at=? WHERE id=?").bind(await hashPassword(password), new Date().toISOString(), userId).run();
  await env.DB.prepare("DELETE FROM app_sessions WHERE user_id=?").bind(userId).run();
}

export async function changeRole(userId: number, role: "admin" | "user") {
  await env.DB.prepare("UPDATE app_users SET role=?,updated_at=? WHERE id=?").bind(role, new Date().toISOString(), userId).run();
}

export async function deleteUser(userId: number) {
  await env.DB.prepare("DELETE FROM app_users WHERE id=?").bind(userId).run();
}
