import { categoriesForUrl } from "./url-category.ts";
import { duplicateKey } from "./url-duplicates.ts";

type SitemapItem = { id: number; url: string; status: string };
export type SitemapFile = { name: string; content: string; urlCount: number };
export const MAX_URLS_PER_SITEMAP = 50_000;

export function sitemapUrls(items: SitemapItem[], category = "All categories") {
  const seen = new Set<string>();
  return [...items].sort((a, b) => a.id - b.id).filter((item) => {
    if (item.status !== "Live" || (category !== "All categories" && !categoriesForUrl(item.url).includes(category))) return false;
    const key = duplicateKey(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item) => item.url);
}

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export function sitemapXml(urls: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`).join("\n")}\n</urlset>`;
}

export function sitemapIndexXml(locations: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map((url) => `  <sitemap>\n    <loc>${escapeXml(url)}</loc>\n  </sitemap>`).join("\n")}\n</sitemapindex>`;
}

export function sitemapFiles(urls: string[], suffix = "") : SitemapFile[] {
  if (urls.length <= MAX_URLS_PER_SITEMAP) return [{ name: `sitemap${suffix}.xml`, content: sitemapXml(urls), urlCount: urls.length }];
  const origin = new URL(urls[0]).origin;
  const parts: SitemapFile[] = [];
  for (let start = 0; start < urls.length; start += MAX_URLS_PER_SITEMAP) {
    const part = start / MAX_URLS_PER_SITEMAP + 1;
    const chunk = urls.slice(start, start + MAX_URLS_PER_SITEMAP);
    parts.push({ name: `sitemap${suffix}-${part}.xml`, content: sitemapXml(chunk), urlCount: chunk.length });
  }
  const indexName = `sitemap${suffix}-index.xml`;
  const locations = parts.map((part) => `${origin}/${part.name}`);
  return [{ name: indexName, content: sitemapIndexXml(locations), urlCount: urls.length }, ...parts];
}
