import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard navigation uses reliable document links", async () => {
  const source = await readFile("app/dashboard-sidebar.tsx", "utf8");
  for (const href of ["/", "/#url-registry", "/status-dashboard", "/?status=Redirected#url-registry", "/?status=404#url-registry", "/removed-urls", "/?panel=sitemap", "/?panel=settings", "/account", "/admin/users"]) {
    assert.ok(source.includes(`"${href}"`), `missing ${href}`);
  }
  assert.match(source, /href=\{href\}/);
  assert.doesNotMatch(source, /next\/link|<Link/);
});
