"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed");
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      window.location.href = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign in failed"); }
    finally { setLoading(false); }
  };
  return <main className="login-page"><section className="login-card">
    <div className="brand login-brand"><span className="brand-mark">∿</span><span><strong>URL Watch</strong><small>STC web operations</small></span></div>
    <span className="page-label">Secure access</span><h1>Welcome back</h1><p className="subhead">Sign in to access URL monitoring and sitemap tools.</p>
    <form className="auth-form" onSubmit={submit}>
      <label>Username<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label>
      <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn primary" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
    </form>
  </section></main>;
}
