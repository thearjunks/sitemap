"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardSidebar } from "../dashboard-sidebar";

type User = { username: string; displayName: string; role: string; isSuperAdmin?: boolean; createdAt: string };
export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/auth/me").then(response => response.json()).then(data => setUser(data.user)); }, []);
  const change = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    const data = await response.json(); setMessage(data.error || data.message);
    if (response.ok) window.setTimeout(() => { window.location.href = "/login"; }, 1200);
  };
  return <div className="app-shell"><DashboardSidebar active="account" /><main className="main"><header className="topbar"><div className="top-title"><span className="top-product">STC URL intelligence</span><span>My account</span></div></header><div className="content narrow-content">
    <div className="heading-row"><div><span className="page-label">Account</span><h1>My profile</h1><p className="subhead">Only you and administrators can access this account information.</p></div></div>
    <section className="panel account-panel"><div className="panel-head"><div><div className="panel-title">Account information</div><div className="panel-meta">Your personal access details</div></div></div><div className="profile-grid"><div><span>Username</span><strong>{user?.username || "Loading…"}</strong></div><div><span>Display name</span><strong>{user?.displayName || "—"}</strong></div><div><span>Role</span><strong className="role-pill">{user?.isSuperAdmin ? "Super Admin" : user?.role || "—"}</strong></div><div><span>Created</span><strong>{user ? new Date(user.createdAt).toLocaleDateString("en-GB") : "—"}</strong></div></div></section>
    <section className="panel account-panel"><div className="panel-head"><div><div className="panel-title">Change password</div><div className="panel-meta">Changing your password signs out your other sessions</div></div></div><form className="settings-form auth-form" onSubmit={change}><label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>{message && <div className="form-message" role="status">{message}</div>}<button className="btn primary">Change password</button></form></section>
  </div></main></div>;
}
