import { chromium, expect } from '@playwright/test';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:13300/cbre';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Use a loopback development URL for this mocked regression check.');
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const report = {
  id: 'mock-week',
  weekStart: '2026-09-07',
  weekEnd: '2026-09-13',
  today: '2026-09-08',
  isClosed: false,
  canEdit: true,
  version: 1,
  totalOutlets: 2,
  completedOutlets: 1,
  contributors: [],
  outlets: [
    {
      id: 'a',
      level: 2,
      location: 'Level 02',
      label: 'Station 1',
      lastReading: { current: 100, recordedOn: '2026-09-01' },
      reading: {
        current: 108,
        version: 1,
        inspectorName: 'Alice',
        recordedOn: '2026-09-07',
      },
    },
    {
      id: 'b',
      level: 2,
      location: 'Level 02',
      label: 'Station 2',
      lastReading: null,
      reading: null,
    },
  ],
};
let submitted;
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  let body;
  if (path.endsWith('/auth/me'))
    body = { id: 'mock-user', firstName: 'Bob', isAdmin: false };
  else if (route.request().method() === 'PATCH') {
    submitted = route.request().postDataJSON();
    report.outlets[1].reading = {
      current: 0,
      version: 1,
      inspectorName: 'Bob',
      recordedOn: report.today,
    };
    report.version += 1;
    report.completedOutlets = 2;
    body = report;
  } else body = report;
  await route.fulfill({ json: body });
});
try {
  await page.goto(base + '/water');
  const save = page.getByRole('button', { name: 'Save inspection', exact: true });
  await expect(save).toBeDisabled();
  await expect(page.getByLabel('Level 02, Station 1, current reading')).toHaveValue(
    '108',
  );
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
  await page.getByLabel('Level 02, Station 2, current reading').fill('0');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Progress saved.', { exact: true })).toBeVisible();
  expect(submitted.readings).toEqual([{ outletId: 'b', current: 0, version: 0 }]);
  await expect(page.getByLabel('Level 02, Station 2, current reading')).toHaveValue('0');
  await expect(page.locator('.weekly-form .weekly-status')).toHaveText('Open');
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeVisible();
  console.log(
    'Partial-save regression passed: restored existing value, saved only changed zero, retained open report, and enabled Submit on completion.',
  );
} finally {
  await browser.close();
}
