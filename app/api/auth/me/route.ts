import { currentUser, changePassword, verifyPassword } from "../../../auth";
import { env } from "cloudflare:workers";

export async function GET(request: Request) {
  const user = await currentUser(request);
  return user ? Response.json({ user }) : Response.json({ error: "Authentication required" }, { status: 401 });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json() as { currentPassword?: string; newPassword?: string };
  if (!body.newPassword || body.newPassword.length < 8) return Response.json({ error: "New password must contain at least 8 characters" }, { status: 400 });
  const row = await env.DB.prepare("SELECT password_hash FROM app_users WHERE id=?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !body.currentPassword || !(await verifyPassword(body.currentPassword, row.password_hash))) return Response.json({ error: "Current password is incorrect" }, { status: 400 });
  await changePassword(user.id, body.newPassword);
  return Response.json({ ok: true, message: "Password changed. Please sign in again." });
}
