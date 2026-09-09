import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard navigation uses reliable document links", async () => {
  const source = await readFile("app/dashboard-sidebar.tsx", "utf8");
  for (const href of ["/", "/all-urls", "/status-dashboard", "/all-urls?status=Redirected", "/all-urls?status=404", "/duplicates", "/removed-urls", "/all-urls?panel=sitemap", "/all-urls?panel=settings", "/account", "/admin/users"]) {
    assert.ok(source.includes(`"${href}"`), `missing ${href}`);
  }
  assert.match(source, /href=\{href\}/);
  assert.match(source, /aria-current=\{current === section \? "page" : undefined\}/);
  assert.doesNotMatch(source, /next\/link|<Link/);
});

test("overview and All URLs render as dedicated dashboard modes", async () => {
  const source = await readFile("app/url-monitor-dashboard.tsx", "utf8");
  const allUrlsPage = await readFile("app/all-urls/page.tsx", "utf8");
  assert.match(source, /view === "overview"/);
  assert.match(source, /view === "urls"/);
  assert.match(source, /URLs or domains to add/);
  assert.match(source, /autoCheckResult/);
  assert.match(allUrlsPage, /view="urls"/);
});

test("duplicate dashboard supports safe and full duplicate selection", async () => {
  const source = await readFile("app/duplicates/duplicate-urls-dashboard.tsx", "utf8");
  assert.match(source, /Select extras \(keep one\)/);
  assert.match(source, /Select all duplicates/);
  assert.match(source, /action: "remove"/);
});

test("duplicate confirmation uses a contained modal layout", async () => {
  const source = await readFile("app/duplicate-review-dialog.tsx", "utf8");
  assert.match(source, /duplicate-confirm-body/);
  assert.match(source, /duplicate-confirm-actions/);
  assert.doesNotMatch(source, /drawer-head|drawer-actions/);
});
