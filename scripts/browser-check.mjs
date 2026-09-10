import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

if (process.env.RUN_BROWSER_TESTS !== '1') {
  throw new Error('Set RUN_BROWSER_TESTS=1 only for the isolated weekly test database.');
}
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:13300/cbre';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) {
  throw new Error(
    'This browser test writes fixture readings and only accepts a loopback test URL.',
  );
}
await mkdir('.test-artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
async function login(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(`weekly-${name}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('weekly-test-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await page.waitForURL('**/dashboard');
  if (name !== 'admin')
    await expect(
      page.getByRole('button', { name: 'Add User', exact: false }),
    ).toHaveCount(0);
  await page.getByRole('link', { name: /Start weekly check/ }).click();
  await page
    .getByRole('heading', { name: '21/09/2026 – 27/09/2026', exact: true })
    .first()
    .waitFor();
  return page;
}
async function save(page) {
  await page.getByRole('button', { name: 'Save inspection', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Progress saved.' }),
  ).toBeVisible();
}
try {
  const alice = await login('alice');
  const bob = await login('bob');
  const inputs = (page) => page.getByRole('spinbutton');
  await expect(inputs(alice)).toHaveCount(42);
  await expect(alice.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
  await inputs(alice).nth(0).fill('125');
  await save(alice);
  await expect(inputs(alice).nth(0)).toHaveValue('125');
  await expect(
    alice.getByRole('button', { name: 'Save inspection', exact: true }),
  ).toBeDisabled();

  await inputs(bob).nth(1).fill('450');
  await save(bob);
  await expect(inputs(bob).nth(0)).toHaveValue('125');
  await alice.reload();
  await expect(inputs(alice).nth(1)).toHaveValue('450');
  await inputs(alice).nth(0).fill('126');
  await inputs(bob).nth(0).fill('127');
  await save(bob);
  await alice.getByRole('button', { name: 'Save inspection', exact: true }).click();
  await expect(alice.locator('.notice[role="alert"]')).toContainText(
    'Someone updated one of these stations',
  );
  await expect(inputs(alice).nth(0)).toHaveValue('126');
  alice.once('dialog', (dialog) => dialog.accept());
  await alice.getByRole('button', { name: 'Reload saved report', exact: true }).click();
  await expect(inputs(alice).nth(0)).toHaveValue('127');

  for (let index = 2; index < 42; index++) await inputs(alice).nth(index).fill('500');
  await expect(alice.getByRole('button', { name: 'Submit', exact: true })).toBeVisible();
  await save(alice);
  await expect(alice.locator('.weekly-form .weekly-status')).toHaveText('Open');
  await alice.screenshot({
    path: '.test-artifacts/weekly-open-desktop.png',
    fullPage: false,
  });
  await alice.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(alice.getByRole('status')).toContainText('Report submitted and closed.');
  await expect(
    alice.getByRole('button', { name: 'Edit report', exact: true }),
  ).toHaveCount(0);
  await expect(inputs(alice)).toHaveCount(0);
  await bob.reload();
  await expect(bob.locator('.weekly-status')).toHaveText('Closed');
  await expect(inputs(bob)).toHaveCount(0);

  const admin = await login('admin');
  await admin.getByRole('button', { name: 'Edit report', exact: true }).click();
  await inputs(admin).nth(0).fill('128');
  await save(admin);
  await expect(admin.locator('.weekly-form .weekly-status')).toHaveText('Closed');
  await expect(admin.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
  await admin
    .getByRole('button', { name: 'View / print saved report', exact: true })
    .click();
  await expect(admin.locator('.weekly-report .weekly-status')).toHaveText('Closed');
  await admin.screenshot({
    path: '.test-artifacts/weekly-closed-desktop.png',
    fullPage: false,
  });
  await admin.setViewportSize({ width: 390, height: 844 });
  expect(
    await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await admin.screenshot({
    path: '.test-artifacts/weekly-closed-mobile.png',
    fullPage: false,
  });
  await admin.getByRole('button', { name: 'Inspection history', exact: true }).click();
  await expect(
    admin.getByRole('heading', { name: '21/09/2026 – 27/09/2026', exact: true }),
  ).toHaveCount(1);
  await admin
    .getByRole('button', { name: 'Continue report', exact: true })
    .first()
    .click();
  await expect(admin.locator('.weekly-form .weekly-status')).toHaveText('Open');
  expect(
    await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await admin.screenshot({
    path: '.test-artifacts/weekly-open-mobile.png',
    fullPage: false,
  });

  await admin.getByRole('link', { name: '← Dashboard', exact: true }).click();
  await admin.getByRole('button', { name: 'Add User', exact: false }).click();
  await expect(
    admin.getByRole('dialog', { name: 'Add User', exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByRole('checkbox', { name: 'Admin', exact: true }),
  ).not.toBeChecked();
  await admin.screenshot({
    path: '.test-artifacts/add-user-mobile.png',
    fullPage: false,
  });
  await admin.keyboard.press('Escape');
  await expect(admin.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    'Browser checks passed: shared partial saves, persisted values, conflicts, complete-only Submit, closure, role restrictions, admin correction, older open reports, mobile layout and Add User modal.',
  );
} finally {
  await browser.close();
}
