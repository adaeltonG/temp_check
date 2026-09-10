'use client';

import { date, usage } from '../lib';

export function WeekHeading({ report }) {
  return (
    <header className="weekly-heading">
      <div>
        <p className="eyebrow">WEEKLY WATER INSPECTION REPORT</p>
        <h2>
          {date(report.weekStart)} – {date(report.weekEnd)}
        </h2>
        <p>Monday to Sunday</p>
      </div>
      <div className="weekly-heading-summary">
        <span className={`weekly-status ${report.isClosed ? 'closed' : ''}`}>
          {report.isClosed ? 'Closed' : 'Open'}
        </span>
        <p>
          <strong>
            {report.completedOutlets} / {report.totalOutlets}
          </strong>{' '}
          outlets saved
        </p>
      </div>
      <p className="weekly-contributors">
        Contributors:{' '}
        {report.contributors.map((person) => person.firstName).join(', ') || 'None yet'}
      </p>
      {report.isClosed && report.closedBy && (
        <p className="weekly-contributors">
          Submitted by {report.closedBy.firstName}
          {report.closedAt
            ? ` · ${new Date(report.closedAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}`
            : ''}
        </p>
      )}
    </header>
  );
}

export default function WeeklyReport({ report }) {
  const levels = [...new Set(report.outlets.map((outlet) => outlet.level))];
  return (
    <section className="water-report weekly-report">
      <WeekHeading report={report} />
      {levels.map((level) => (
        <section className="report-level" key={level}>
          <h3>Level {String(level).padStart(2, '0')}</h3>
          {report.outlets
            .filter((outlet) => outlet.level === level)
            .map((outlet) => {
              const current = outlet.reading?.current;
              const previous = outlet.lastReading?.current;
              const status = current == null ? 'Not recorded' : usage(current, previous);
              return (
                <article className="water-report-row" key={outlet.id}>
                  <div>
                    <strong>{outlet.location}</strong>
                    <p>{outlet.label}</p>
                    {outlet.note && (
                      <small className="source-note">Verify: {outlet.note}</small>
                    )}
                  </div>
                  <div className="reading-metrics">
                    <div className="report-metric">
                      <span className="report-metric-label">Previous reading</span>
                      <small>
                        {outlet.lastReading
                          ? date(outlet.lastReading.recordedOn)
                          : 'No previous reading'}
                      </small>
                      <strong className="report-metric-value">{previous ?? '—'}</strong>
                    </div>
                    <div className="report-metric">
                      <span className="report-metric-label">This week</span>
                      <small>
                        {current != null
                          ? date(outlet.reading.recordedOn)
                          : 'Not recorded'}
                      </small>
                      <strong className="report-metric-value">{current ?? '—'}</strong>
                      {current != null && <small>{outlet.reading.inspectorName}</small>}
                    </div>
                  </div>
                  <span className={`usage ${status === 'No change' ? 'unchanged' : ''}`}>
                    {status}
                  </span>
                </article>
              );
            })}
        </section>
      ))}
    </section>
  );
}
