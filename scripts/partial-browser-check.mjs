import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
// Stub API traffic so this UI regression check never writes operational data.
const outlets = [
  { id: 'a', level: 2, location: 'Level 02', label: 'Station 1', lastReading: { current: 100, performedOn: '2026-09-01T00:00:00.000Z' } },
  { id: 'b', level: 2, location: 'Level 02', label: 'Station 2', lastReading: null }
];
let submitted;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let body;
  if (path === '/api/auth/me') body = { id: 'user', firstName: 'Admin' };
  else if (path === '/api/water/baseline') body = { outlets, previous: { id: 'old' }, today: '2026-09-07' };
  else if (route.request().method() === 'POST') { submitted = route.request().postDataJSON(); body = { id: 'saved' }; }
  else body = { id: 'saved', inspectorName: 'Admin', performedOn: '2026-09-07', readings: [{ id: 'reading', current: 0, previous: null, previousDate: null, outlet: outlets[1] }] };
  await route.fulfill({ json: body });
});
try {
  await page.goto('http://localhost:3100/water');
  const save = page.getByRole('button', { name: 'Save inspection', exact: true });
  await expect(save).toBeDisabled();
  await page.getByLabel('Level 02, Station 2, current reading').fill('0');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Inspection saved successfully.')).toBeVisible();
  expect(submitted.readings).toEqual([{ outletId: 'b', current: 0 }]);
  await expect(page.locator('.water-report-row')).toHaveCount(1);
  console.log('Partial-save browser check passed: one zero reading enables save, blank outlet omitted, report contains one reading.');
} finally { await browser.close(); }
