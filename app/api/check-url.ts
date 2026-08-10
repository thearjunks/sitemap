export async function inspectUrl(rawUrl: string) {
  let current = rawUrl;
  let redirected = false;
  let response: Response | null = null;
  try {
    for (let hops = 0; hops < 6; hops++) {
      response = await fetch(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "URL-Watch/1.0" } });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      redirected = true;
      current = new URL(location, current).toString();
    }
    const httpCode = response?.status ?? null;
    let status = "Unavailable";
    if (httpCode === 404) status = "404";
    else if (httpCode === 410) status = "410";
    else if (httpCode && httpCode >= 500) status = "Server Error";
    else if (httpCode && httpCode >= 200 && httpCode < 400) status = redirected ? "Redirected" : "Live";
    return { status, httpCode, finalUrl: redirected ? current : null };
  } catch {
    return { status: "Unavailable", httpCode: null, finalUrl: redirected ? current : null };
  }
}
