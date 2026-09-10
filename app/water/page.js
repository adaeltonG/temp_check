'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useUser, Header, date, usage } from '../lib';
import WeeklyReport, { WeekHeading } from './WeeklyReport';

function savedValues(report) {
  return Object.fromEntries(
    report.outlets.map((outlet) => [
      outlet.id,
      outlet.reading?.current == null ? '' : String(outlet.reading.current),
    ]),
  );
}

export default function Water() {
  const { user, error: userError } = useUser();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [values, setValues] = useState({});
  const [name, setName] = useState('');
  const [mode, setMode] = useState('edit');
  const [history, setHistory] = useState([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const form = useRef(null);

  const changes = (report?.outlets || []).filter((outlet) => {
    const value = values[outlet.id] ?? '';
    return (value === '' ? null : Number(value)) !== (outlet.reading?.current ?? null);
  });
  const dirty = changes.length > 0;
  const completed = (report?.outlets || []).filter(
    (outlet) => values[outlet.id] !== '' && values[outlet.id] !== undefined,
  ).length;
  const complete = Boolean(report && completed === report.totalOutlets);

  useEffect(() => {
    if (!user) return;
    let active = true;
    pending.current = true;
    setBusy(true);
    setName(user.firstName);
    api('/water/reports/current')
      .then((result) => {
        if (!active) return;
        setReport(result);
        setValues(savedValues(result));
        setMode(result.isClosed ? 'view' : 'edit');
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message);
        if (e.status === 401) router.replace('/login');
      })
      .finally(() => {
        if (active) {
          pending.current = false;
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [user, router]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function canLeave() {
    return !dirty || window.confirm('Discard your unsaved readings?');
  }

  function fail(e) {
    setError(e.message);
    if (e.status === 401) router.replace('/login');
  }

  function adopt(result, nextMode) {
    setReport(result);
    setValues(savedValues(result));
    setMode(nextMode || (result.isClosed ? 'view' : 'edit'));
  }

  async function loadReport(id = 'current', nextMode) {
    if (pending.current || !canLeave()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      adopt(await api(`/water/reports/${id}`), nextMode);
    } catch (e) {
      fail(e);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function loadHistory(before) {
    if (pending.current || !canLeave()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const query = before ? `?before=${encodeURIComponent(before)}` : '';
      const page = await api(`/water/reports${query}`);
      setHistory((current) => (before ? [...current, ...page] : page));
      setHasMoreHistory(page.length === 100);
      if (report) setValues(savedValues(report));
      setMode('history');
    } catch (e) {
      fail(e);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function save(action) {
    if (pending.current || !report || !form.current.reportValidity()) return;
    if (action === 'save' && !dirty) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api(`/water/reports/${report.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          inspectorName: name.trim(),
          version: report.version,
          action,
          readings: changes.map((outlet) => ({
            outletId: outlet.id,
            current: values[outlet.id] === '' ? null : Number(values[outlet.id]),
            version: outlet.reading?.version ?? 0,
          })),
        }),
      });
      adopt(result, action === 'submit' ? 'view' : 'edit');
      setNotice(action === 'submit' ? 'Report submitted and closed.' : 'Progress saved.');
    } catch (e) {
      fail(e);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function viewSaved() {
    if (!canLeave()) return;
    setValues(savedValues(report));
    setMode('view');
    setError('');
    setNotice('');
  }

  if (!user)
    return (
      <main>
        <p role="status">{userError || 'Checking your session…'}</p>
      </main>
    );

  return (
    <>
      <Header
        title="Water Control and Management"
        subtitle="Shared weekly bottle refill counter checks"
      >
        <Link
          href="/dashboard"
          onClick={(event) => {
            if (busy || !canLeave()) event.preventDefault();
          }}
        >
          ← Dashboard
        </Link>
        <button type="button" disabled={busy} onClick={() => loadHistory()}>
          Inspection history
        </button>
      </Header>
      <main className="weekly-page">
        {error && (
          <div className="notice error no-print" role="alert">
            <p>{error}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                loadReport(report?.id || 'current', mode === 'history' ? undefined : mode)
              }
            >
              Reload saved report
            </button>
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {busy && (
          <p className="weekly-loading no-print" role="status">
            Updating report…
          </p>
        )}
        {mode === 'history' ? (
          <section className="history-panel">
            <div className="panel-heading">
              <h2>Weekly reports</h2>
              <button type="button" disabled={busy} onClick={() => loadReport()}>
                Back to current week
              </button>
            </div>
            <p className="field-hint">
              One report per week. Older incomplete weeks stay open for the team to
              finish.
            </p>
            {history.length === 0 ? (
              <p>No weekly reports yet.</p>
            ) : (
              history.map((item) => (
                <article className="weekly-history-row" key={item.id}>
                  <div>
                    <h3>
                      {date(item.weekStart)} – {date(item.weekEnd)}
                    </h3>
                    <p>
                      <span className={`weekly-status ${item.isClosed ? 'closed' : ''}`}>
                        {item.isClosed ? 'Closed' : 'Open'}
                      </span>{' '}
                      {item.completedOutlets} / {item.totalOutlets} outlets saved
                    </p>
                    <p>
                      Contributors:{' '}
                      {item.contributors.map((person) => person.firstName).join(', ') ||
                        'None yet'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => loadReport(item.id, item.isClosed ? 'view' : 'edit')}
                  >
                    {item.isClosed ? 'View report' : 'Continue report'}
                  </button>
                </article>
              ))
            )}
            {hasMoreHistory && (
              <button
                type="button"
                disabled={busy}
                onClick={() => loadHistory(history[history.length - 1].weekStart)}
              >
                {busy ? 'Loading older weeks…' : 'Load older weeks'}
              </button>
            )}
          </section>
        ) : !report ? (
          <p role="status">
            {error
              ? 'The weekly report could not be loaded.'
              : 'Loading this week’s report…'}
          </p>
        ) : (
          <>
            <div className="weekly-toolbar no-print">
              <button type="button" disabled={busy} onClick={() => loadReport()}>
                Back to current week
              </button>
              {mode === 'edit' ? (
                <button type="button" disabled={busy} onClick={viewSaved}>
                  View / print saved report
                </button>
              ) : (
                <div className="weekly-toolbar-actions">
                  {report.canEdit && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setMode('edit');
                        setNotice('');
                      }}
                    >
                      {report.isClosed ? 'Edit report' : 'Continue report'}
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => window.print()}>
                    Print report / Save PDF
                  </button>
                </div>
              )}
            </div>
            {mode === 'view' || !report.canEdit ? (
              <WeeklyReport report={report} />
            ) : (
              <>
                <form
                  ref={form}
                  className="weekly-form no-print"
                  onSubmit={(event) => {
                    event.preventDefault();
                    save('save');
                  }}
                >
                  <WeekHeading report={report} />
                  {report.isClosed ? (
                    <p className="notice">
                      You are correcting a closed report. Saving keeps it closed.
                    </p>
                  ) : (
                    <p className="weekly-guidance">
                      Save readings as you go. Your team can continue this report on
                      another day. Submit once all outlets are recorded.
                    </p>
                  )}
                  <fieldset disabled={busy} className="weekly-fields">
                    <section className="identity">
                      <div className="section-kicker">
                        <span>01</span>
                        <h2>Inspection record</h2>
                      </div>
                      <div className="identity-fields">
                        <label>
                          Name
                          <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            autoComplete="name"
                            maxLength={100}
                            required
                            pattern=".*\S.*"
                          />
                        </label>
                        <label>
                          Today
                          <input type="text" value={date(report.today)} readOnly />
                        </label>
                      </div>
                    </section>
                    <section className="checks">
                      <div className="section-kicker">
                        <span>02</span>
                        <h2>Bottle refill readings</h2>
                      </div>
                      <div className="progress-wrap">
                        <div className="progress-label">
                          <span>Outlets entered{dirty ? ' · unsaved changes' : ''}</span>
                          <strong>
                            {completed} / {report.totalOutlets}
                          </strong>
                        </div>
                        <progress
                          className="weekly-progress"
                          aria-label="Outlets entered"
                          value={completed}
                          max={report.totalOutlets}
                        />
                      </div>
                      <div className="table-scroll">
                        <table className="water-table weekly-table">
                          <thead>
                            <tr>
                              <th scope="col">Location</th>
                              <th scope="col">Outlet</th>
                              <th scope="col" className="reading-heading">
                                Previous reading<small>Last saved date below</small>
                              </th>
                              <th scope="col" className="reading-heading">
                                This week<small>Saved name and date below</small>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.outlets.map((outlet) => {
                              const value = values[outlet.id] ?? '';
                              const previous = outlet.lastReading?.current;
                              const status =
                                value === ''
                                  ? 'Awaiting reading'
                                  : usage(Number(value), previous);
                              return (
                                <tr key={outlet.id}>
                                  <th scope="row">
                                    {!/\blevel\b/i.test(outlet.location) && (
                                      <small className="weekly-level">
                                        Level {String(outlet.level).padStart(2, '0')}
                                      </small>
                                    )}
                                    {outlet.location}
                                    {outlet.note && (
                                      <small className="source-note">
                                        Verify: {outlet.note}
                                      </small>
                                    )}
                                  </th>
                                  <td>{outlet.label}</td>
                                  <td className="reading-value">
                                    {previous ?? '—'}
                                    <small className="last-reading-date">
                                      {outlet.lastReading
                                        ? date(outlet.lastReading.recordedOn)
                                        : 'No previous reading'}
                                    </small>
                                  </td>
                                  <td>
                                    <input
                                      aria-label={`${outlet.location}, ${outlet.label}, current reading`}
                                      type="number"
                                      min={previous ?? 0}
                                      max="2147483647"
                                      step="1"
                                      inputMode="numeric"
                                      required={report.isClosed}
                                      value={value}
                                      onChange={(event) =>
                                        setValues((current) => ({
                                          ...current,
                                          [outlet.id]: event.target.value,
                                        }))
                                      }
                                    />
                                    <span
                                      className={`usage ${status === 'No change' || status === 'Check reading' ? 'unchanged' : ''}`}
                                    >
                                      {status}
                                    </span>
                                    <small className="weekly-saved-by">
                                      {outlet.reading?.current != null
                                        ? `Saved ${date(outlet.reading.recordedOn)} · ${outlet.reading.inspectorName}`
                                        : 'Not saved yet'}
                                    </small>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </fieldset>
                  <div className="submit-dock weekly-submit">
                    <p>
                      <strong>
                        {report.isClosed
                          ? 'Report corrections'
                          : complete
                            ? 'All outlets recorded'
                            : 'Save your progress'}
                      </strong>
                      <span>
                        {dirty
                          ? 'You have unsaved readings.'
                          : 'All entered readings are saved.'}
                      </span>
                    </p>
                    <div className="weekly-toolbar-actions">
                      <button type="submit" className="primary" disabled={busy || !dirty}>
                        {busy ? 'Saving…' : 'Save inspection'}
                      </button>
                      {!report.isClosed && complete && (
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() => save('submit')}
                        >
                          Submit
                        </button>
                      )}
                    </div>
                  </div>
                </form>
                <div className="weekly-print-only">
                  <WeeklyReport report={report} />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
