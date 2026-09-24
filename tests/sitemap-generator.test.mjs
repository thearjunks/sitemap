import assert from "node:assert/strict";
import test from "node:test";
import { MAX_URLS_PER_SITEMAP, sitemapFiles, sitemapUrls, sitemapXml } from "../app/sitemap-generator.ts";

test("builds a category-aware SEO sitemap from live canonical URLs", () => {
  const urls = sitemapUrls([
    { id: 2, url: "https://www.stc.com.kw/en/business/", status: "Live", updatedAt: "2026-04-23T07:28:26Z" },
    { id: 1, url: "https://www.stc.com.kw/en/business", status: "Live", updatedAt: "2026-04-22T07:28:26Z" },
    { id: 3, url: "https://www.stc.com.kw/en/business/broken", status: "404" },
    { id: 4, url: "https://www.stc.com.kw/en/news?a=1&b=2", status: "Live" },
  ], "Business");
  assert.deepEqual(urls, [{ url: "https://www.stc.com.kw/en/business", lastmod: "2026-04-22T07:28:26+00:00" }]);
  const xml = sitemapXml([{ url: "https://www.stc.com.kw/en/news?a=1&b=2", lastmod: "2026-04-22T07:28:26+00:00" }]);
  assert.match(xml, /news\?a=1&amp;b=2/);
  assert.match(xml, /<lastmod>2026-04-22T07:28:26\+00:00<\/lastmod>/);
  assert.match(xml, /<changefreq>daily<\/changefreq>/);
  assert.match(xml, /<priority>0\.1<\/priority>/);
});

test("creates a sitemap index and valid chunks above the search-engine limit", () => {
  const urls = Array.from({ length: MAX_URLS_PER_SITEMAP + 1 }, (_, index) => ({ url: `https://www.stc.com.kw/en/page-${index + 1}`, lastmod: "2026-04-22T07:28:26+00:00" }));
  const files = sitemapFiles(urls);
  assert.deepEqual(files.map((file) => file.name), ["sitemap-index.xml", "sitemap-1.xml", "sitemap-2.xml"]);
  assert.match(files[0].content, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(files[0].content, /https:\/\/www\.stc\.com\.kw\/sitemap-2\.xml/);
  assert.equal(files[1].urlCount, MAX_URLS_PER_SITEMAP);
  assert.equal(files[2].urlCount, 1);
});
