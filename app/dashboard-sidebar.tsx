"use client";

import Link from "next/link";

type Section = "overview" | "status" | "removed";

export function DashboardSidebar({ active, schedule = "Every 6 hours" }: { active: Section; schedule?: string }) {
  const items = [
    ["overview", "/", "▦", "Overview"],
    ["overview", "/#url-registry", "⌁", "All URLs"],
    ["status", "/status-dashboard", "◎", "URL Status"],
    ["overview", "/?status=Redirected#url-registry", "↗", "Redirects"],
    ["overview", "/?status=404#url-registry", "!", "Broken pages"],
    ["removed", "/removed-urls", "⌫", "Removed URLs"],
  ] as const;

  return <aside className="sidebar">
    <Link className="brand" href="/" aria-label="URL Watch overview">
      <span className="brand-mark">∿</span>
      <span><strong>URL Watch</strong><small>STC web operations</small></span>
    </Link>
    <div className="nav-label">Monitor</div>
    <nav aria-label="Primary navigation">
      {items.map(([section, href, icon, label]) => <Link className={`nav-item ${active === section && ((section !== "overview") || label === "Overview") ? "active" : ""}`} href={href} key={label}><span className="nav-icon">{icon}</span><span>{label}</span></Link>)}
    </nav>
    <div className="nav-label">Tools</div>
    <nav aria-label="Management navigation">
      <Link className="nav-item" href="/?panel=sitemap"><span className="nav-icon">◇</span><span>Sitemap builder</span></Link>
      <Link className="nav-item" href="/?panel=settings"><span className="nav-icon">⚙</span><span>Settings</span></Link>
    </nav>
    <div className="sidebar-foot"><div className="monitor-state"><span className="pulse-dot" /><strong>Monitoring active</strong></div><span>Automatic checks · {schedule}</span></div>
  </aside>;
}
