import { categoriesForUrl } from "./url-category.ts";
import { duplicateKey } from "./url-duplicates.ts";

type SitemapItem = { id: number; url: string; status: string };

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
