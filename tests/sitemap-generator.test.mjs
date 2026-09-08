import assert from "node:assert/strict";
import test from "node:test";
import { sitemapUrls, sitemapXml } from "../app/sitemap-generator.ts";

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
