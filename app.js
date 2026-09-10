(function () {
  'use strict';

  const LEVELS = {
    1: [
      'North Kitchen Pot Wash',
      'North Kitchen Sink',
      'North Wash Hand Basin',
      'North Cleaners Cupboard',
    ],
    2: [
      'North Refreshment Hub',
      'South Cleaners Cupboard',
      'Calorifier Supply',
      'Calorifier Return',
    ],
    3: [
      'Kitchen Mop Wash',
      'Kitchen Cleaners Cupboard',
      'Kitchen Pot Wash 5',
      'Kitchen Pot Wash 6',
      'Kitchen Pot Wash 7',
      'Kitchen Pot Wash 8',
      'Kitchen Pot Wash 9',
      'Kitchen Wash Hand Basin 4',
      'Kitchen Wash Hand Basin 5',
      'Calorifier 1 Supply',
      'Calorifier 1 Return',
      'Calorifier 2 Supply',
      'Calorifier 2 Return',
    ],
    6: ['North Refreshment Hub', 'South Cleaners Room Wash Hand Basin', 'South Shower'],
    7: ['North Refreshment Hub', 'South Cleaners Room Wash Hand Basin', 'South Shower'],
    8: [
      'North Refreshment Hub',
      'South Cleaners Cupboard',
      'South Shower',
      'South Shower Room Wash Hand Basin',
    ],
    9: [
      'South Cleaners Cupboard',
      'South Refreshment Hub',
      'South Shower Room Wash Hand Basin',
    ],
    10: [
      'North Refreshment Hub',
      'South Cleaners Cupboard',
      'South Shower Room Wash Hand Basin',
      'South Shower',
    ],
    11: ['North Refreshment Hub', 'South Cleaners Room Wash Hand Basin', 'South Shower'],
    12: [
      'North Refreshment Hub',
      'South Cleaners Cupboard',
      'South Shower Room Wash Hand Basin',
    ],
    13: [
      'North Refreshment Hub',
      'North Pot Wash A',
      'North Pot Wash B',
      'North Shower Room Wash Hand Basin 1',
      'North Shower Room Wash Hand Basin 2',
      'South Cleaners Cupboard',
      'South Shower Room Wash Hand Basin',
      'South Shower',
    ],
    14: [
      'North Cleaners Cupboard',
      'South Cleaners Cupboard',
      'South Shower Room Wash Hand Basin',
      'South Shower',
    ],
    15: [
      'North Refreshment Hub',
      'South Cleaners Cupboard',
      'South Shower Room Wash Hand Basin',
      'South Shower',
    ],
    16: [
      'Cleaners Sink',
      'Wash Hand Basin',
      'Shower (WUDU)',
      'Multi-faith Hub Sink',
      'Tea Point',
    ],
    17: [
      'North Refreshment Hub',
      'South Cleaners Cupboard',
      'South Shower Room Wash Hand Basin',
      'South Shower',
    ],
    18: [
      'North Refreshment Hub',
      'South Cleaners Cupboard',
      'South Shower Room Wash Hand Basin',
      'South Shower',
    ],
    19: [
      'Cleaners Cupboard (2)',
      'Wash Hand Basin (1)',
      'Refreshment Hub Sink',
      'Wash Hand Basin (2)',
      'Pot Wash A',
      'Pot Wash B',
      'Calorifier Supply',
      'Calorifier Return',
    ],
    20: [
      'Cleaners Sink',
      'Wash Hand Basin (1)',
      'Pot Wash A',
      'Wash Hand Basin (2)',
      'Pot Wash B',
      'Calorifier Supply',
      'Calorifier Return',
    ],
  };
  const DB_NAME = 'water-control-db',
    STORE = 'database',
    KEY = 'main';
  let db = null,
    SQL = null,
    lastFocus = null;
  const $ = (id) => document.getElementById(id);
  const startup = $('startup'),
    form = $('checkForm'),
    levelsEl = $('levels'),
    dialog = $('historyDialog'),
    historyContent = $('historyContent');

  function announce(message) {
    $('announcer').textContent = '';
    setTimeout(() => {
      $('announcer').textContent = message;
    }, 20);
  }
  function today() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }
  function displayDate(isoDate) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }
  function parseDisplayDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) return null;
    const [, day, month, year] = match,
      iso = `${year}-${month}-${day}`,
      candidate = new Date(`${iso}T12:00:00`);
    return candidate.getFullYear() === Number(year) &&
      candidate.getMonth() + 1 === Number(month) &&
      candidate.getDate() === Number(day)
      ? iso
      : null;
  }
  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('aria-')) node.setAttribute(k, v);
      else node[k] = v;
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function openStore(mode = 'readonly') {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction(STORE, mode);
        resolve({ store: tx.objectStore(STORE), tx, connection: req.result });
      };
    });
  }
  async function loadBytes() {
    const { store, connection } = await openStore();
    return new Promise((resolve, reject) => {
      const req = store.get(KEY);
      req.onsuccess = () => {
        connection.close();
        resolve(req.result);
      };
      req.onerror = () => {
        connection.close();
        reject(req.error);
      };
    });
  }
  async function persist() {
    const bytes = db.export(),
      { store, tx, connection } = await openStore('readwrite');
    await new Promise((resolve, reject) => {
      store.put(bytes, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    connection.close();
  }
  function schema(database) {
    database.exec(
      'PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS checks (id INTEGER PRIMARY KEY, inspector_name TEXT NOT NULL, check_date TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY, check_id INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE, level INTEGER NOT NULL, location TEXT NOT NULL, hot_temp REAL, cold_temp REAL, mixed_temp REAL, remedial_required INTEGER NOT NULL DEFAULT 0 CHECK(remedial_required IN (0,1))); CREATE INDEX IF NOT EXISTS idx_checks_date ON checks(check_date DESC); CREATE INDEX IF NOT EXISTS idx_readings_check ON readings(check_id);',
    );
  }
  function query(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function renderLevels() {
    Object.entries(LEVELS).forEach(([level, locations], i) => {
      const details = el('details', { class: 'level' });
      if (i === 0) details.open = true;
      const summary = el('summary');
      summary.append(el('span', { class: 'level-number' }, `Level ${level}`));
      const meta = el('span', { class: 'level-meta' });
      meta.append(
        el(
          'span',
          { class: 'level-count', dataset: { level } },
          `0 / ${locations.length}`,
        ),
        el('span', { class: 'plus', 'aria-hidden': 'true' }),
      );
      summary.append(meta);
      details.append(summary);
      const list = el('div', { class: 'outlets' });
      locations.forEach((location, index) =>
        list.append(makeOutlet(Number(level), location, index)),
      );
      details.append(list);
      levelsEl.append(details);
    });
    updateProgress();
  }
  function tempField(kind, label) {
    const wrap = el('label', { class: 'temp-label' });
    wrap.append(el('span', {}, label));
    const unit = el('div', { class: 'input-unit' });
    unit.append(
      el('input', {
        type: 'number',
        step: '0.1',
        inputMode: 'decimal',
        name: kind,
        disabled: true,
        'aria-label': label,
      }),
    );
    wrap.append(unit);
    return wrap;
  }
  function makeOutlet(level, location, index) {
    const card = el('div', {
      class: 'outlet',
      dataset: { level: String(level), location },
    });
    card.append(
      el('div', { class: 'location' }, location),
      tempField('hot', 'Hot Temp °C'),
      tempField('cold', 'Cold Temp °C'),
      tempField('mixed', 'Mixed Temp °C'),
    );
    const fs = el('fieldset', { class: 'remedial' }),
      legend = el('legend', {}, 'Remedial actions required'),
      row = el('div', { class: 'radio-row' });
    ['No', 'Yes'].forEach((label, j) => {
      const lab = el('label'),
        radio = el('input', {
          type: 'radio',
          name: `remedial-${level}-${index}`,
          value: String(j),
          checked: j === 0,
          disabled: true,
        });
      lab.append(radio, document.createTextNode(label));
      row.append(lab);
    });
    fs.append(legend, row);
    card.append(fs);
    card.addEventListener('input', () => {
      updateCard(card);
      updateProgress();
    });
    return card;
  }
  function cardData(card) {
    const value = (n) => {
      const v = card.querySelector(`[name=${n}]`).value;
      return v === '' ? null : Number(v);
    };
    return {
      level: Number(card.dataset.level),
      location: card.dataset.location,
      hot: value('hot'),
      cold: value('cold'),
      mixed: value('mixed'),
      remedial: Number(card.querySelector('input[type=radio]:checked').value),
    };
  }
  function isUsed(data) {
    return (
      data.hot !== null ||
      data.cold !== null ||
      data.mixed !== null ||
      data.remedial === 1
    );
  }
  function updateCard(card) {
    const data = cardData(card);
    card.classList.toggle('has-data', isUsed(data));
    card.classList.toggle('is-remedial', data.remedial === 1);
  }
  function updateProgress() {
    const cards = [...document.querySelectorAll('.outlet')],
      used = cards.filter((c) => isUsed(cardData(c))).length;
    $('progressText').textContent = `${used} / ${cards.length}`;
    $('progressBar').style.width = `${(used / cards.length) * 100}%`;
    Object.keys(LEVELS).forEach((level) => {
      const group = cards.filter((c) => c.dataset.level === level),
        done = group.filter((c) => isUsed(cardData(c))).length;
      document.querySelector(`[data-level="${level}"]`).textContent =
        `${done} / ${group.length}`;
    });
  }
  function setReady() {
    startup.className = 'startup ready';
    form.setAttribute('aria-busy', 'false');
    document.querySelectorAll('input,button').forEach((n) => (n.disabled = false));
    $('checkDate').value = displayDate(today());
  }
  function fail(error) {
    startup.className = 'startup error';
    startup.textContent = `Local storage could not start: ${error.message || error}. Try a current version of Chrome, Edge, or Firefox.`;
    announce('Local storage could not start');
  }

  async function saveCheck(event) {
    event.preventDefault();
    const name = $('inspectorName').value.trim(),
      dateField = $('checkDate'),
      date = parseDisplayDate(dateField.value);
    dateField.setCustomValidity(date ? '' : 'Enter a valid date in DD/MM/YYYY format.');
    if (!name || !date || !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    dateField.setCustomValidity('');
    const readings = [...document.querySelectorAll('.outlet')]
      .map(cardData)
      .filter(isUsed);
    if (!readings.length) {
      announce('Enter at least one reading or choose remedial action Yes.');
      alert(
        'Enter at least one temperature or mark a location as requiring remedial action.',
      );
      return;
    }
    $('submitButton').disabled = true;
    try {
      db.exec('BEGIN');
      let stmt = db.prepare(
        'INSERT INTO checks(inspector_name,check_date,created_at) VALUES(?,?,?)',
      );
      stmt.run([name, date, new Date().toISOString()]);
      stmt.free();
      const checkId = query('SELECT last_insert_rowid() AS id')[0].id;
      stmt = db.prepare(
        'INSERT INTO readings(check_id,level,location,hot_temp,cold_temp,mixed_temp,remedial_required) VALUES(?,?,?,?,?,?,?)',
      );
      try {
        readings.forEach((r) =>
          stmt.run([checkId, r.level, r.location, r.hot, r.cold, r.mixed, r.remedial]),
        );
      } finally {
        stmt.free();
      }
      db.exec('COMMIT');
      await persist();
      clearReadings();
      renderHistory();
      announce(`Inspection saved with ${readings.length} recorded locations.`);
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {}
      fail(error);
    } finally {
      $('submitButton').disabled = false;
    }
  }
  function clearReadings() {
    document.querySelectorAll('.outlet').forEach((card) => {
      card.querySelectorAll('input[type=number]').forEach((i) => (i.value = ''));
      card.querySelector("input[type=radio][value='0']").checked = true;
      updateCard(card);
    });
    updateProgress();
  }

  function renderHistory() {
    historyContent.replaceChildren();
    const checks = query(
      'SELECT c.*, COUNT(r.id) AS reading_count FROM checks c LEFT JOIN readings r ON r.check_id=c.id GROUP BY c.id ORDER BY c.check_date DESC,c.id DESC',
    );
    if (!checks.length) {
      historyContent.append(
        el(
          'div',
          { class: 'empty' },
          'No inspections saved yet. Your completed checks will appear here.',
        ),
      );
      return;
    }
    const list = el('div', { class: 'history-list' });
    checks.forEach((check) => {
      const row = el('article', { class: 'history-row' }),
        info = el('div');
      info.append(
        el('h3', {}, check.inspector_name),
        el('p', {}, `${check.reading_count} recorded locations`),
      );
      row.append(
        info,
        el('time', { dateTime: check.check_date }, displayDate(check.check_date)),
      );
      const actions = el('div', { class: 'row-actions' }),
        view = el('button', { type: 'button' }, 'View'),
        del = el('button', { type: 'button', class: 'danger' }, 'Delete');
      view.addEventListener('click', () => renderDetails(check.id));
      del.addEventListener('click', () => deleteCheck(check.id, check.inspector_name));
      actions.append(view, del);
      row.append(actions);
      list.append(row);
    });
    historyContent.append(list);
  }
  function temperatureMetric(label, value) {
    const metric = el('div', { class: 'report-metric' });
    metric.append(
      el('span', { class: 'report-metric-label' }, label),
      el('strong', { class: 'report-metric-value' }, value === null ? '—' : `${value}°C`),
    );
    return metric;
  }
  function renderDetails(id) {
    const check = query('SELECT * FROM checks WHERE id=?', [id])[0],
      readings = query('SELECT * FROM readings WHERE check_id=? ORDER BY level, id', [
        id,
      ]);
    historyContent.replaceChildren();
    const box = el('div', { class: 'detail' }),
      back = el(
        'button',
        { type: 'button', class: 'detail-back' },
        'Back to all inspections',
      );
    back.addEventListener('click', renderHistory);
    const header = el('header', { class: 'report-header' }),
      titleWrap = el('div');
    titleWrap.append(
      el('p', { class: 'report-overline' }, 'INSPECTION REPORT'),
      el('h3', {}, check.inspector_name),
      el('time', { dateTime: check.check_date }, displayDate(check.check_date)),
    );
    header.append(
      titleWrap,
      el(
        'p',
        { class: 'report-summary' },
        `${readings.length} recorded location${readings.length === 1 ? '' : 's'}`,
      ),
    );
    box.append(back, header);
    const groups = new Map();
    readings.forEach((reading) => {
      if (!groups.has(reading.level)) groups.set(reading.level, []);
      groups.get(reading.level).push(reading);
    });
    groups.forEach((levelReadings, level) => {
      const section = el('section', {
          class: 'report-level',
          'aria-labelledby': `report-level-${level}`,
        }),
        heading = el('div', { class: 'report-level-heading' });
      heading.append(
        el('h4', { id: `report-level-${level}` }, `Level ${level}`),
        el(
          'span',
          {},
          `${levelReadings.length} location${levelReadings.length === 1 ? '' : 's'}`,
        ),
      );
      section.append(heading);
      levelReadings.forEach((r) => {
        const row = el('article', { class: 'reading' }),
          location = el('strong', { class: 'reading-location' }, r.location),
          metrics = el('div', { class: 'reading-metrics' }),
          status = el(
            'span',
            { class: `remedial-badge ${r.remedial_required ? 'is-yes' : 'is-no'}` },
            r.remedial_required ? 'Remedial: Yes' : 'Remedial: No',
          );
        metrics.append(
          temperatureMetric('Hot', r.hot_temp),
          temperatureMetric('Cold', r.cold_temp),
          temperatureMetric('Mixed', r.mixed_temp),
        );
        row.append(location, metrics, status);
        section.append(row);
      });
      box.append(section);
    });
    historyContent.append(box);
    back.focus();
  }
  async function deleteCheck(id, name) {
    if (!confirm(`Delete the inspection recorded by ${name}? This cannot be undone.`))
      return;
    const stmt = db.prepare('DELETE FROM checks WHERE id=?');
    try {
      stmt.run([id]);
    } finally {
      stmt.free();
    }
    await persist();
    renderHistory();
    announce('Inspection deleted');
  }
  function openHistory() {
    lastFocus = document.activeElement;
    renderHistory();
    dialog.showModal();
    $('closeHistory').focus();
  }
  function closeHistory() {
    dialog.close();
    if (lastFocus) lastFocus.focus();
  }
  function exportDb() {
    const blob = new Blob([db.export()], { type: 'application/vnd.sqlite3' }),
      a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `water-checks-${today()}.sqlite`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    announce('Database export downloaded');
  }
  async function importDb(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const candidate = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
      let valid = false;
      try {
        const names = candidate.exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('checks','readings')",
        );
        valid = names.length && names[0].values.length === 2;
      } catch (_) {}
      if (!valid) {
        candidate.close();
        throw new Error(
          'This file does not contain the expected checks and readings tables.',
        );
      }
      if (
        !confirm(
          'Importing will replace all inspections stored in this browser. Continue?',
        )
      ) {
        candidate.close();
        return;
      }
      db.close();
      db = candidate;
      schema(db);
      await persist();
      renderHistory();
      announce('Database imported successfully');
    } catch (error) {
      alert(`Database import failed: ${error.message}`);
      announce('Database import failed');
    }
  }
  async function init() {
    renderLevels();
    try {
      const binary = Uint8Array.from(atob(window.SQL_WASM_BASE64), (c) =>
        c.charCodeAt(0),
      );
      SQL = await initSqlJs({ wasmBinary: binary });
      const saved = await loadBytes();
      db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();
      schema(db);
      if (!saved) await persist();
      setReady();
      renderHistory();
      announce('Form ready. Local database loaded.');
    } catch (error) {
      fail(error);
    }
  }

  form.addEventListener('submit', saveCheck);
  $('historyButton').addEventListener('click', openHistory);
  $('closeHistory').addEventListener('click', closeHistory);
  $('exportDb').addEventListener('click', exportDb);
  $('importDb').addEventListener('change', importDb);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeHistory();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeHistory();
  });
  window.WaterChecks = { LEVELS, schema };
  init();
})();
