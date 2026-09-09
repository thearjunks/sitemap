import assert from "node:assert/strict";
import test from "node:test";
import { MAX_URLS_PER_SITEMAP, sitemapFiles, sitemapUrls, sitemapXml } from "../app/sitemap-generator.ts";

test("builds a category-aware SEO sitemap from live canonical URLs", () => {
  const urls = sitemapUrls([
    { id: 2, url: "https://www.stc.com.kw/en/business/", status: "Live" },
    { id: 1, url: "https://www.stc.com.kw/en/business", status: "Live" },
    { id: 3, url: "https://www.stc.com.kw/en/business/broken", status: "404" },
    { id: 4, url: "https://www.stc.com.kw/en/news?a=1&b=2", status: "Live" },
  ], "Business");
  assert.deepEqual(urls, ["https://www.stc.com.kw/en/business"]);
  assert.match(sitemapXml(["https://www.stc.com.kw/en/news?a=1&b=2"]), /news\?a=1&amp;b=2/);
  assert.doesNotMatch(sitemapXml(urls), /lastmod|priority|changefreq/);
});

test("creates a sitemap index and valid chunks above the search-engine limit", () => {
  const urls = Array.from({ length: MAX_URLS_PER_SITEMAP + 1 }, (_, index) => `https://www.stc.com.kw/en/page-${index + 1}`);
  const files = sitemapFiles(urls);
  assert.deepEqual(files.map((file) => file.name), ["sitemap-index.xml", "sitemap-1.xml", "sitemap-2.xml"]);
  assert.match(files[0].content, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(files[0].content, /https:\/\/www\.stc\.com\.kw\/sitemap-2\.xml/);
  assert.equal(files[1].urlCount, MAX_URLS_PER_SITEMAP);
  assert.equal(files[2].urlCount, 1);
});
