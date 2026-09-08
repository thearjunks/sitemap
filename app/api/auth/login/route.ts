import { login } from "../../../auth";

export async function POST(request: Request) {
  const body = await request.json() as { username?: string; password?: string };
  if (!body.username || !body.password) return Response.json({ error: "Enter your username and password" }, { status: 400 });
  const result = await login(body.username, body.password);
  if (!result) return Response.json({ error: "Incorrect username or password" }, { status: 401 });
  return Response.json({ user: result.user }, { headers: { "Set-Cookie": result.cookie } });
}
