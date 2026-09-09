"use client";

import { useEffect, useState } from "react";

type Section = "overview" | "urls" | "status" | "redirects" | "broken" | "duplicates" | "removed" | "sitemap" | "settings" | "account" | "users";

function currentSection(fallback: Section): Section {
  if (typeof window === "undefined") return fallback;
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  if (pathname === "/status-dashboard") return "status";
  if (pathname === "/all-urls") {
    if (params.get("panel") === "sitemap") return "sitemap";
    if (params.get("panel") === "settings") return "settings";
    if (params.get("status") === "Redirected") return "redirects";
    if (["404", "Broken"].includes(params.get("status") || "")) return "broken";
    return "urls";
  }
  if (pathname === "/duplicates") return "duplicates";
  if (pathname === "/removed-urls") return "removed";
  if (pathname === "/account") return "account";
  if (pathname === "/admin/users") return "users";
  if (params.get("panel") === "sitemap") return "sitemap";
  if (params.get("panel") === "settings") return "settings";
  if (params.get("status") === "Redirected") return "redirects";
  if (params.get("status") === "404") return "broken";
  if (hash === "#url-registry") return "urls";
  return "overview";
}

export function DashboardSidebar({ active, schedule = "Every 6 hours" }: { active: Section; schedule?: string }) {
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [current, setCurrent] = useState<Section>(active);
  useEffect(() => {
    const update = () => setCurrent(currentSection(active));
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    void fetch("/api/auth/me").then(response => response.json()).then(data => setUser(data.user || null));
    return () => { window.removeEventListener("hashchange", update); window.removeEventListener("popstate", update); };
  }, [active]);
  const items = [
    ["overview", "/", "▦", "Overview"],
    ["urls", "/all-urls", "⌁", "All URLs"],
    ["status", "/status-dashboard", "◎", "URL Status"],
    ["redirects", "/all-urls?status=Redirected", "↗", "Redirects"],
    ["broken", "/all-urls?status=404", "!", "Broken pages"],
    ["duplicates", "/duplicates", "⧉", "Duplicate URLs"],
    ["removed", "/removed-urls", "⌫", "Removed URLs"],
  ] as const;

  return <aside className="sidebar">
    <a className="brand" href="/" aria-label="URL Watch overview">
      <span className="brand-mark">∿</span>
      <span><strong>URL Watch</strong><small>STC web operations</small></span>
    </a>
    <div className="nav-label">Monitor</div>
    <nav aria-label="Primary navigation">
      {items.map(([section, href, icon, label]) => <a className={`nav-item ${current === section ? "active" : ""}`} href={href} key={label} aria-current={current === section ? "page" : undefined}><span className="nav-icon">{icon}</span><span>{label}</span></a>)}
    </nav>
    <div className="nav-label">Tools</div>
    <nav aria-label="Management navigation">
      <a className={`nav-item ${current === "sitemap" ? "active" : ""}`} href="/all-urls?panel=sitemap" aria-current={current === "sitemap" ? "page" : undefined}><span className="nav-icon">◇</span><span>Sitemap builder</span></a>
      <a className={`nav-item ${current === "settings" ? "active" : ""}`} href="/all-urls?panel=settings" aria-current={current === "settings" ? "page" : undefined}><span className="nav-icon">⚙</span><span>Settings</span></a>
    </nav>
    <div className="nav-label">Account</div>
    <nav aria-label="Account navigation">
      <a className={`nav-item ${current === "account" ? "active" : ""}`} href="/account" aria-current={current === "account" ? "page" : undefined}><span className="nav-icon">♙</span><span>My account</span></a>
      {user?.role === "admin" && <a className={`nav-item ${current === "users" ? "active" : ""}`} href="/admin/users" aria-current={current === "users" ? "page" : undefined}><span className="nav-icon">♚</span><span>User management</span></a>}
    </nav>
    <div className="sidebar-foot"><div className="monitor-state"><span className="pulse-dot" /><strong>Monitoring active</strong></div><span>Automatic checks · {schedule}</span>{user && <><div className="signed-user">Signed in as <strong>{user.username}</strong></div><button className="sidebar-signout" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>Sign out</button></>}</div>
  </aside>;
}
