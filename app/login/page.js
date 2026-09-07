'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib';
export default function Login() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) }); router.replace('/dashboard'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <main className="login-shell"><section className="login-intro"><p className="eyebrow">WATER CONTROL AND MANAGEMENT</p><h1>Every check.<br />One place.</h1><p>Keep weekly water checks and temperature records close at hand.</p><span className="login-mark" aria-hidden="true">W</span></section><section className="login-panel"><p className="eyebrow">INSPECTION PORTAL</p><h2>Welcome back</h2><p>Sign in to your inspection dashboard.</p><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert" className="notice error">{error}</p>}<button className="solid" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button></form><p className="field-hint">Use the account supplied by your administrator.</p></section></main>;
}
