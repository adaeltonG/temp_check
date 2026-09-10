'use client';
import Link from 'next/link';
import AddUser from './AddUser';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, useUser, Header, basePath } from '../lib';
export default function Dashboard() {
  const { user, error } = useUser();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState('');
  const [userNotice, setUserNotice] = useState('');
  if (!user)
    return (
      <main>
        <p role="status">{error || 'Loading your dashboard…'}</p>
      </main>
    );
  return (
    <>
      <Header
        actions={user.isAdmin ? <AddUser onCreated={setUserNotice} /> : null}
        title="Your inspection dashboard"
        subtitle={`Welcome, ${user.firstName}. Choose a form to get started.`}
      >
        <button
          onClick={async () => {
            try {
              await api('/auth/logout', { method: 'POST' });
              router.replace('/login');
            } catch (e) {
              setLogoutError(e.message);
            }
          }}
        >
          Sign out
        </button>
      </Header>
      <main>
        {userNotice && (
          <p className="notice" role="status">
            {userNotice}
          </p>
        )}
        {logoutError && <p role="alert">{logoutError}</p>}
        <div className="section-kicker">
          <span>01</span>
          <h2>Inspection forms</h2>
        </div>
        <div className="dashboard-cards">
          <a className="dashboard-card" href={`${basePath}/temperature/index.html`}>
            <span className="card-symbol" aria-hidden="true">
              °C
            </span>
            <p className="eyebrow">TEMPERATURE CHECKS</p>
            <h2>Temperature Logs</h2>
            <p>
              Record hot and cold water temperatures and review your existing inspection
              history.
            </p>
            <strong>
              Open form <span aria-hidden="true">↗</span>
            </strong>
          </a>
          <Link className="dashboard-card" href="/water">
            <span className="card-symbol" aria-hidden="true">
              ≈
            </span>
            <p className="eyebrow">WEEKLY DISPENSER CHECKS</p>
            <h2>Water Control and Management</h2>
            <p>
              Check bottle refill counters, compare readings, and see which outlets have
              been used.
            </p>
            <strong>
              Start weekly check <span aria-hidden="true">→</span>
            </strong>
          </Link>
        </div>
      </main>
    </>
  );
}
