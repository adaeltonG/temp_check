'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useUser, Header, date, usage } from '../lib';

export default function Water() {
  const { user, error: userError } = useUser(); const router = useRouter();
  const [baseline, setBaseline] = useState(null); const [name, setName] = useState('');
  const [values, setValues] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null); const [report, setReport] = useState(null); const [saved, setSaved] = useState(false);
  function fail(e) { setError(e.message); if (e.status === 401) router.replace('/login'); }
  async function refresh() { setError(''); try { setBaseline(await api('/water/baseline')); } catch (e) { fail(e); } }
  useEffect(() => { if (user) { setName(user.firstName); api('/water/baseline').then(setBaseline).catch(e => { setError(e.message); if (e.status === 401) router.replace('/login'); }); } }, [user, router]);
  const previous = Object.fromEntries((baseline?.outlets || []).filter(o => o.lastReading).map(o => [o.id, o.lastReading.current]));
  const previousDates = [...new Set((baseline?.outlets || []).filter(o => o.lastReading).map(o => o.lastReading.performedOn))];
  const done = Object.values(values).filter(v => v !== '').length;
  async function loadHistory() { setError(''); setSaved(false); try { setHistory(await api('/water/inspections')); setReport(null); } catch (e) { fail(e); } }
  async function openReport(id) { setError(''); try { setReport(await api(`/water/inspections/${id}`)); } catch (e) { fail(e); } }
  async function save(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api('/water/inspections', { method: 'POST', body: JSON.stringify({ inspectorName: name.trim(), performedOn: baseline.today, baselineId: baseline.previous?.id || null, readings: baseline.outlets.filter(o => values[o.id] !== undefined && values[o.id] !== '').map(o => ({ outletId: o.id, current: Number(values[o.id]) })) }) });
      setValues({}); setSaved(true); await openReport(result.id); await refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  if (!user) return <main><p role="status">{userError || 'Checking your session…'}</p></main>;
  return <><Header title="Water Control and Management" subtitle="Weekly bottle refill counter checks"><Link href="/dashboard">← Dashboard</Link><button onClick={loadHistory}>Inspection history</button></Header><main>
    {error && <div className="notice error" role="alert">{error} <button type="button" onClick={refresh}>Refresh baseline</button></div>}
    {saved && <p className="notice" role="status">Inspection saved successfully.</p>}
    {report ? <Report report={report} onBack={() => { setReport(null); setSaved(false); }} /> : history ? <section className="history-panel"><div className="panel-heading"><h2>Inspection history</h2><button onClick={() => setHistory(null)}>Back to check</button></div><p className="field-hint">Latest 100 inspections</p>{history.length === 0 ? <p>No inspections saved yet.</p> : history.map(item => <article className="history-row" key={item.id}><div><h3>{item.inspectorName}</h3><p>{item._count.readings} recorded outlets</p></div><time>{date(item.performedOn)}</time><button onClick={() => openReport(item.id)}>View report</button></article>)}</section> : !baseline ? <p role="status">Loading outlets…</p> : <form onSubmit={save}>
      <section className="identity"><div className="section-kicker"><span>01</span><h2>Inspection record</h2></div><div className="identity-fields"><label>Name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={100} required /></label><label>Date<input type="text" value={date(baseline.today)} readOnly aria-describedby="date-note" /></label></div><p id="date-note" className="field-hint">Today’s check date · Europe/London. You can change the name if someone else is performing the check.</p></section>
      <section className="checks"><div className="section-kicker"><span>02</span><h2>Bottle refill readings</h2></div><p>Enter each dispenser’s cumulative bottle counter. Save any outlets you have checked; leave the others blank. An increase means used; an unchanged number means no use since that outlet?s last check.</p>{!baseline.previous && <p className="notice">No previous inspection yet. These readings will establish your first baseline.</p>}
      <div className="progress-wrap"><div className="progress-label"><span>Recorded outlets</span><strong>{done} / {baseline.outlets.length}</strong></div><div className="progress"><span style={{ width: `${baseline.outlets.length ? done / baseline.outlets.length * 100 : 0}%` }} /></div></div>
      <div className="table-scroll"><table className="water-table"><thead><tr><th scope="col">Location</th><th scope="col">Outlet</th><th scope="col" className="reading-heading">Last reading<small>{previousDates.length > 1 ? 'Dates shown per outlet' : date(previousDates[0])}</small></th><th scope="col" className="reading-heading">Current reading<small>{date(baseline.today)}</small></th></tr></thead><tbody>{baseline.outlets.map(outlet => {
        const value = values[outlet.id] ?? ''; const old = previous[outlet.id]; const status = value === '' ? '' : usage(Number(value), old);
        return <tr key={outlet.id}><th scope="row">{outlet.location}{outlet.note && <small className="source-note">Verify: {outlet.note}</small>}</th><td>{outlet.label}</td><td className="reading-value">{old ?? '—'}</td><td><input aria-label={`${outlet.location}, ${outlet.label}, current reading`} type="number" min={old ?? 0} max="2147483647" step="1" inputMode="numeric" value={value} onChange={e => setValues(current => ({ ...current, [outlet.id]: e.target.value }))} /><span className={`usage ${status === 'No change' || status === 'Check reading' ? 'unchanged' : ''}`} aria-live="polite">{status || 'Awaiting reading'}</span></td></tr>;
      })}</tbody></table></div></section><div className="submit-dock"><p><strong>Ready to file?</strong><span>{done} of {baseline.outlets.length} outlets recorded</span></p><button className="primary" disabled={busy || done === 0}>{busy ? 'Saving…' : 'Save inspection'}</button></div>
    </form>}
  </main></>;
}

function Report({ report, onBack }) {
  const levels = [...new Set(report.readings.map(r => r.outlet.level))];
  const unchanged = report.readings.filter(r => r.previous !== null && r.current === r.previous).length;
  return <section className="detail water-report"><div className="panel-heading no-print"><button onClick={onBack}>← Back</button><button onClick={() => window.print()}>Print report / Save PDF</button></div><header className="report-header"><div><p className="report-overline">WEEKLY WATER INSPECTION REPORT</p><h3>{report.inspectorName}</h3><time>{date(report.performedOn)}</time></div><p className="report-summary">{report.readings.length} recorded outlets<br />{unchanged} with no change</p></header>{levels.map(level => <section className="report-level" key={level}><h4>Level {String(level).padStart(2, '0')}</h4>{report.readings.filter(r => r.outlet.level === level).map(r => <article className="water-report-row" key={r.id}><div><strong>{r.outlet.location}</strong><p>{r.outlet.label}</p>{r.outlet.note && <small className="source-note">Verify: {r.outlet.note}</small>}</div><div className="reading-metrics"><div className="report-metric"><span className="report-metric-label">Last reading</span><small>{date(r.previousDate)}</small><strong className="report-metric-value">{r.previous ?? '—'}</strong></div><div className="report-metric"><span className="report-metric-label">Current reading</span><small>{date(report.performedOn)}</small><strong className="report-metric-value">{r.current}</strong></div></div><span className={`usage ${r.previous !== null && r.current === r.previous ? 'unchanged' : ''}`}>{usage(r.current, r.previous)}</span></article>)}</section>)}</section>;
}
