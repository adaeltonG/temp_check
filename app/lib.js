'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export async function api(path, options = {}) {
  const response = await fetch(`${basePath}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      body.error || 'The service is unavailable. Please try again.',
    );
    error.status = response.status;
    throw error;
  }
  return body;
}
export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/auth/me')
      .then(setUser)
      .catch((e) => (e.status === 401 ? router.replace('/login') : setError(e.message)));
  }, [router]);
  return { user, error };
}
export function date(value) {
  if (!value) return 'No previous check';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
export function usage(current, previous) {
  return previous == null
    ? 'Baseline'
    : current > previous
      ? `Used · +${current - previous}`
      : current === previous
        ? 'No change'
        : 'Check reading';
}
export function Header({ title, subtitle, children, actions }) {
  return (
    <header className="masthead portal-head">
      {actions ? (
        <div className="portal-heading-top">
          <p className="eyebrow">WATER CONTROL / INSPECTION PORTAL</p>
          {actions}
        </div>
      ) : (
        <p className="eyebrow">WATER CONTROL / INSPECTION PORTAL</p>
      )}
      <h1>{title}</h1>
      <p className="subtitle">{subtitle}</p>
      <nav className="portal-nav">{children}</nav>
    </header>
  );
}
