export function duplicateKey(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const path = (decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/").toLowerCase();
    const query = [...url.searchParams.entries()]
      .sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB))
      .map(([key, value]) => `${key.toLowerCase()}=${value.toLowerCase()}`).join("&");
    return `${url.hostname.toLowerCase()}${path}${query ? `?${query}` : ""}`;
  } catch { return rawUrl.trim().toLowerCase(); }
}
