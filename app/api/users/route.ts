import { changePassword, changeRole, createUser, currentUser, deleteUser, listUsers } from "../../auth";

async function admin(request: Request) {
  const user = await currentUser(request);
  return user?.role === "admin" ? user : null;
}

export async function GET(request: Request) {
  return await admin(request) ? Response.json({ users: await listUsers() }) : Response.json({ error: "Administrator access required" }, { status: 403 });
}

export async function POST(request: Request) {
  if (!await admin(request)) return Response.json({ error: "Administrator access required" }, { status: 403 });
  const body = await request.json() as { username?: string; displayName?: string; password?: string; role?: string };
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(body.username || "")) return Response.json({ error: "Username must be 3–50 letters, numbers, dots, underscores, or hyphens" }, { status: 400 });
  if (!body.password || body.password.length < 8) return Response.json({ error: "Password must contain at least 8 characters" }, { status: 400 });
  try {
    await createUser(body.username!, body.displayName || "", body.password, body.role === "admin" ? "admin" : "user");
    return Response.json({ users: await listUsers() });
  } catch { return Response.json({ error: "That username already exists" }, { status: 409 }); }
}

export async function PATCH(request: Request) {
  const actor = await admin(request);
  if (!actor) return Response.json({ error: "Administrator access required" }, { status: 403 });
  const body = await request.json() as { id?: number; password?: string; role?: string };
  const id = Number(body.id);
  if (!id) return Response.json({ error: "Select a user" }, { status: 400 });
  if (body.password) {
    if (body.password.length < 8) return Response.json({ error: "Password must contain at least 8 characters" }, { status: 400 });
    await changePassword(id, body.password);
  } else if (body.role === "admin" || body.role === "user") {
    if (id === actor.id && body.role !== "admin") return Response.json({ error: "You cannot remove your own administrator role" }, { status: 400 });
    await changeRole(id, body.role);
  } else return Response.json({ error: "No valid change supplied" }, { status: 400 });
  return Response.json({ users: await listUsers() });
}

export async function DELETE(request: Request) {
  const actor = await admin(request);
  if (!actor) return Response.json({ error: "Administrator access required" }, { status: 403 });
  const id = Number((await request.json() as { id?: number }).id);
  if (!id || id === actor.id) return Response.json({ error: "You cannot remove your own account" }, { status: 400 });
  await deleteUser(id);
  return Response.json({ users: await listUsers() });
}
