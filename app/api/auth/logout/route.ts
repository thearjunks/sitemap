import { logout } from "../../../auth";

export async function POST(request: Request) {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": await logout(request) } });
}
