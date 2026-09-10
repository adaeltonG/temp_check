import { today } from './domain.js';
import {
  addDays,
  calendarDate,
  databaseDate,
  mondayOfWeek,
  reportError,
  reportUpdateInput,
} from './weekly-domain.js';

const authorFields = { id: true, firstName: true };

function currentDate(config) {
  return today(config.timeZone || 'Europe/London', config.now?.() || new Date());
}

// All weekly writes share this lock, including corrections to older weeks.
// This keeps previous/next-week counter validation consistent across reports.
function withWeeklyLock(db, operation) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(740922)`;
    return operation(tx);
  });
}

async function ensureCurrentReport(tx, config) {
  const weekStart = databaseDate(mondayOfWeek(currentDate(config)));
  return tx.weeklyReport.upsert({
    where: { weekStart },
    create: { weekStart },
    update: {},
  });
}

async function contributorsFor(tx, reportId) {
  const activities = await tx.reportActivity.findMany({
    where: { reportId },
    distinct: ['userId'],
    select: { user: { select: authorFields } },
    orderBy: { createdAt: 'asc' },
  });
  return activities.map((activity) => activity.user);
}

function summaryFor(report, user, totalOutlets, contributors) {
  const weekStart = calendarDate(report.weekStart);
  return {
    id: report.id,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    isClosed: report.isClosed,
    version: report.version,
    closedAt: report.closedAt,
    closedBy: report.closedBy,
    updatedAt: report.updatedAt,
    canEdit: user.isAdmin === true || !report.isClosed,
    totalOutlets,
    completedOutlets: report.readings.filter((reading) => reading.current !== null)
      .length,
    contributors,
  };
}

async function neighboringReadings(tx, weekStart, direction, outletIds) {
  const readings = await tx.weeklyReading.findMany({
    where: {
      current: { not: null },
      report: { weekStart: { [direction === 'previous' ? 'lt' : 'gt']: weekStart } },
      ...(outletIds ? { outletId: { in: outletIds } } : {}),
    },
    include: { report: { select: { weekStart: true } } },
    orderBy: { report: { weekStart: direction === 'previous' ? 'desc' : 'asc' } },
  });
  const nearest = new Map();
  for (const reading of readings) {
    if (!nearest.has(reading.outletId)) nearest.set(reading.outletId, reading);
  }
  return nearest;
}

async function loadDetail(tx, id, user, config) {
  const report = await tx.weeklyReport.findUnique({
    where: { id },
    include: {
      readings: { include: { recordedBy: { select: authorFields } } },
      closedBy: { select: authorFields },
    },
  });
  if (!report) throw reportError(404, 'Weekly report not found.');

  const outlets = await tx.outlet.findMany({ orderBy: { sortOrder: 'asc' } });
  const previous = await neighboringReadings(tx, report.weekStart, 'previous');
  const saved = new Map(report.readings.map((reading) => [reading.outletId, reading]));
  const contributors = await contributorsFor(tx, report.id);

  return {
    ...summaryFor(report, user, outlets.length, contributors),
    today: currentDate(config),
    outlets: outlets.map((outlet) => {
      const earlier = previous.get(outlet.id);
      const reading = saved.get(outlet.id);
      return {
        ...outlet,
        lastReading: earlier
          ? {
              current: earlier.current,
              recordedOn: calendarDate(earlier.recordedOn),
              weekStart: calendarDate(earlier.report.weekStart),
            }
          : null,
        reading: reading
          ? {
              current: reading.current,
              version: reading.version,
              inspectorName: reading.inspectorName,
              recordedOn: calendarDate(reading.recordedOn),
              updatedAt: reading.updatedAt,
              recordedBy: reading.recordedBy,
            }
          : null,
      };
    }),
  };
}

async function saveReport(tx, id, user, input, config) {
  const report = await tx.weeklyReport.findUnique({
    where: { id },
    include: { readings: true },
  });
  if (!report) throw reportError(404, 'Weekly report not found.');
  if (report.isClosed && !user.isAdmin) {
    throw reportError(403, 'This report is closed. Only an admin can edit it.');
  }
  if (input.action === 'submit' && report.isClosed) {
    throw reportError(
      409,
      'This report has already been submitted. Reload the saved report.',
    );
  }
  if (input.action === 'submit' && input.version !== report.version) {
    throw reportError(
      409,
      'Someone saved progress after you opened this report. Reload and review the saved readings before submitting.',
    );
  }
  if (input.action === 'save' && input.readings.length === 0) {
    throw reportError(400, 'Change at least one station reading before saving.');
  }

  const outlets = await tx.outlet.findMany({ select: { id: true } });
  const outletIds = new Set(outlets.map((outlet) => outlet.id));
  const changedIds = input.readings.map((reading) => reading.outletId);
  if (
    new Set(changedIds).size !== changedIds.length ||
    changedIds.some((id) => !outletIds.has(id))
  ) {
    throw reportError(400, 'Choose valid stations, with no duplicate station entries.');
  }

  const saved = new Map(report.readings.map((reading) => [reading.outletId, reading]));
  for (const change of input.readings) {
    if (change.version !== (saved.get(change.outletId)?.version || 0)) {
      throw reportError(
        409,
        'Someone updated one of these stations after you opened the report. Your changes have not been saved. Reload the saved report and review your entries.',
      );
    }
  }

  const previous = await neighboringReadings(
    tx,
    report.weekStart,
    'previous',
    changedIds,
  );
  const following = await neighboringReadings(tx, report.weekStart, 'next', changedIds);
  const finalValues = new Map(
    report.readings.map((reading) => [reading.outletId, reading.current]),
  );
  for (const change of input.readings) {
    const earlier = previous.get(change.outletId);
    const later = following.get(change.outletId);
    if (change.current !== null && earlier && change.current < earlier.current) {
      throw reportError(
        400,
        'A counter cannot be lower than its reading from an earlier week. Check the entry.',
      );
    }
    if (change.current !== null && later && change.current > later.current) {
      throw reportError(
        400,
        'This counter is higher than a reading already saved in a later week. Review the later report before correcting this one.',
      );
    }
    finalValues.set(change.outletId, change.current);
  }

  const complete =
    outlets.length > 0 && outlets.every((outlet) => finalValues.get(outlet.id) != null);
  if (input.action === 'submit' && !complete) {
    throw reportError(
      400,
      'Fill every station before submitting. Use Save inspection to keep partial progress.',
    );
  }
  if (report.isClosed && !complete) {
    throw reportError(
      400,
      'A closed report must keep a reading for every station. Enter a corrected number instead of clearing it.',
    );
  }

  const now = config.now?.() || new Date();
  const recordedOn = databaseDate(today(config.timeZone || 'Europe/London', now));
  const changes = [];
  for (const change of input.readings) {
    const old = saved.get(change.outletId);
    const values = {
      current: change.current,
      inspectorName: input.inspectorName,
      recordedById: user.id,
      recordedOn,
      updatedAt: now,
    };
    await tx.weeklyReading.upsert({
      where: { reportId_outletId: { reportId: id, outletId: change.outletId } },
      create: { reportId: id, outletId: change.outletId, ...values },
      update: { ...values, version: { increment: 1 } },
    });
    changes.push({
      outletId: change.outletId,
      previous: old?.current ?? null,
      current: change.current,
    });
  }

  await tx.reportActivity.create({
    data: {
      reportId: id,
      userId: user.id,
      inspectorName: input.inspectorName,
      action:
        input.action === 'submit' ? 'submit' : report.isClosed ? 'admin-edit' : 'save',
      changes,
      createdAt: now,
    },
  });
  await tx.weeklyReport.update({
    where: { id },
    data: {
      version: { increment: 1 },
      updatedAt: now,
      ...(input.action === 'submit'
        ? { isClosed: true, closedAt: now, closedById: user.id }
        : {}),
    },
  });
  return loadDetail(tx, id, user, config);
}

export function registerWeeklyReportRoutes(app, db, config) {
  app.get('/api/water/reports/current', async (req, res) => {
    const detail = await withWeeklyLock(db, async (tx) => {
      const report = await ensureCurrentReport(tx, config);
      return loadDetail(tx, report.id, req.user, config);
    });
    res.json(detail);
  });

  app.get('/api/water/reports', async (req, res) => {
    const before = req.query.before;
    if (
      before !== undefined &&
      (typeof before !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(before) ||
        Number.isNaN(databaseDate(before).valueOf()) ||
        calendarDate(databaseDate(before)) !== before)
    ) {
      return res
        .status(400)
        .json({ error: 'Choose a valid date to load older reports.' });
    }
    const summaries = await withWeeklyLock(db, async (tx) => {
      await ensureCurrentReport(tx, config);
      const reports = await tx.weeklyReport.findMany({
        ...(before ? { where: { weekStart: { lt: databaseDate(before) } } } : {}),
        orderBy: { weekStart: 'desc' },
        take: 100,
        include: {
          readings: { select: { current: true } },
          closedBy: { select: authorFields },
        },
      });
      const totalOutlets = await tx.outlet.count();
      const summaries = [];
      for (const report of reports) {
        const contributors = await contributorsFor(tx, report.id);
        summaries.push(summaryFor(report, req.user, totalOutlets, contributors));
      }
      return summaries;
    });
    res.json(summaries);
  });

  app.get('/api/water/reports/:id', async (req, res) => {
    const detail = await withWeeklyLock(db, (tx) =>
      loadDetail(tx, req.params.id, req.user, config),
    );
    res.json(detail);
  });

  app.patch('/api/water/reports/:id', async (req, res) => {
    const parsed = reportUpdateInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Enter your name and valid whole-number readings, then save or submit the report.',
      });
    }
    const detail = await withWeeklyLock(db, (tx) =>
      saveReport(tx, req.params.id, req.user, parsed.data, config),
    );
    res.json(detail);
  });

  // Old browser tabs must refresh rather than creating another legacy report.
  app.post('/api/water/inspections', (_req, res) => {
    res.status(409).json({
      error:
        'Reports are now shared by week. Refresh this page to load the current weekly report.',
    });
  });
}
