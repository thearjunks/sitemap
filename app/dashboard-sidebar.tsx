"use client";

import { useEffect, useState } from "react";

type Section = "overview" | "status" | "removed" | "account" | "users";

export function DashboardSidebar({ active, schedule = "Every 6 hours" }: { active: Section; schedule?: string }) {
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  useEffect(() => { void fetch("/api/auth/me").then(response => response.json()).then(data => setUser(data.user || null)); }, []);
  const items = [
    ["overview", "/", "▦", "Overview"],
    ["overview", "/#url-registry", "⌁", "All URLs"],
    ["status", "/status-dashboard", "◎", "URL Status"],
    ["overview", "/?status=Redirected#url-registry", "↗", "Redirects"],
    ["overview", "/?status=404#url-registry", "!", "Broken pages"],
    ["removed", "/removed-urls", "⌫", "Removed URLs"],
  ] as const;

  return <aside className="sidebar">
    <a className="brand" href="/" aria-label="URL Watch overview">
      <span className="brand-mark">∿</span>
      <span><strong>URL Watch</strong><small>STC web operations</small></span>
    </a>
    <div className="nav-label">Monitor</div>
    <nav aria-label="Primary navigation">
      {items.map(([section, href, icon, label]) => <a className={`nav-item ${active === section && ((section !== "overview") || label === "Overview") ? "active" : ""}`} href={href} key={label}><span className="nav-icon">{icon}</span><span>{label}</span></a>)}
    </nav>
    <div className="nav-label">Tools</div>
    <nav aria-label="Management navigation">
      <a className="nav-item" href="/?panel=sitemap"><span className="nav-icon">◇</span><span>Sitemap builder</span></a>
      <a className="nav-item" href="/?panel=settings"><span className="nav-icon">⚙</span><span>Settings</span></a>
    </nav>
    <div className="nav-label">Account</div>
    <nav aria-label="Account navigation">
      <a className={`nav-item ${active === "account" ? "active" : ""}`} href="/account"><span className="nav-icon">♙</span><span>My account</span></a>
      {user?.role === "admin" && <a className={`nav-item ${active === "users" ? "active" : ""}`} href="/admin/users"><span className="nav-icon">♚</span><span>User management</span></a>}
    </nav>
    <div className="sidebar-foot"><div className="monitor-state"><span className="pulse-dot" /><strong>Monitoring active</strong></div><span>Automatic checks · {schedule}</span>{user && <><div className="signed-user">Signed in as <strong>{user.username}</strong></div><button className="sidebar-signout" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>Sign out</button></>}</div>
  </aside>;
}
