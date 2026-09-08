export const URL_CATEGORIES = ["Business", "Product", "News", "Disclosure", "IR", "VAS", "Number ending", "PDF", "Others"] as const;

export function categoriesForUrl(rawUrl: string) {
  let path: string;
  try { path = decodeURIComponent(new URL(rawUrl).pathname).toLowerCase().replace(/\/+$/, ""); }
  catch { return [] as string[]; }

  const segments = path.split("/").filter(Boolean);
  const has = (...names: string[]) => segments.some((segment) => names.includes(segment));
  const categories: string[] = [];
  if (has("business")) categories.push("Business");
  if (has("product", "products")) categories.push("Product");
  if (has("news", "newsroom")) categories.push("News");
  if (has("disclosure", "disclosures")) categories.push("Disclosure");
  if (has("ir", "investor", "investors", "investor-relations")) categories.push("IR");
  if (has("vas")) categories.push("VAS");
  if (/\d+$/.test(path)) categories.push("Number ending");
  if (path.endsWith(".pdf")) categories.push("PDF");
  if (!categories.length) categories.push("Others");
  return categories;
}
