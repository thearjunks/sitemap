import { categoriesForUrl } from "./url-category.ts";
import { duplicateKey } from "./url-duplicates.ts";

type SitemapItem = { id: number; url: string; status: string; updatedAt?: string; lastCheckedAt?: string | null; createdAt?: string };
export type SitemapEntry = { url: string; lastmod: string };
export type SitemapFile = { name: string; content: string; urlCount: number };
export const MAX_URLS_PER_SITEMAP = 50_000;

export function sitemapUrls(items: SitemapItem[], category = "All categories") {
  const seen = new Set<string>();
  const generatedAt = new Date().toISOString();
  return [...items].sort((a, b) => a.id - b.id).filter((item) => {
    if (item.status !== "Live" || (category !== "All categories" && !categoriesForUrl(item.url).includes(category))) return false;
    const key = duplicateKey(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item) => ({ url: item.url, lastmod: sitemapDate(item.updatedAt || item.lastCheckedAt || item.createdAt || generatedAt) }));
}

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const sitemapDate = (value: string) => new Date(value).toISOString().replace(/\.\d{3}Z$/, "+00:00");

export function sitemapXml(entries: SitemapEntry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((entry) => `  <url>\n    <loc>${escapeXml(entry.url)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.1</priority>\n  </url>`).join("\n")}\n</urlset>`;
}

export function sitemapIndexXml(locations: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map((url) => `  <sitemap>\n    <loc>${escapeXml(url)}</loc>\n  </sitemap>`).join("\n")}\n</sitemapindex>`;
}

export function sitemapFiles(entries: SitemapEntry[], suffix = "") : SitemapFile[] {
  if (entries.length <= MAX_URLS_PER_SITEMAP) return [{ name: `sitemap${suffix}.xml`, content: sitemapXml(entries), urlCount: entries.length }];
  const origin = new URL(entries[0].url).origin;
  const parts: SitemapFile[] = [];
  for (let start = 0; start < entries.length; start += MAX_URLS_PER_SITEMAP) {
    const part = start / MAX_URLS_PER_SITEMAP + 1;
    const chunk = entries.slice(start, start + MAX_URLS_PER_SITEMAP);
    parts.push({ name: `sitemap${suffix}-${part}.xml`, content: sitemapXml(chunk), urlCount: chunk.length });
  }
  const indexName = `sitemap${suffix}-index.xml`;
  const locations = parts.map((part) => `${origin}/${part.name}`);
  return [{ name: indexName, content: sitemapIndexXml(locations), urlCount: entries.length }, ...parts];
}
