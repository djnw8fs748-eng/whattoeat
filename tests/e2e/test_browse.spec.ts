import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('page loads with all recipe cards', async ({ page }) => {
  await expect(page.locator('.card')).toHaveCount(80);
});

test('text search by name filters cards', async ({ page }) => {
  await page.fill('#searchInput', 'Garlic Butter Pasta with Parmesan');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card h3').first()).toContainText('Garlic Butter Pasta with Parmesan');
});

test('text search by ingredient filters cards', async ({ page }) => {
  // '400g' appears in many ingredient strings but in no recipe titles
  await page.fill('#searchInput', '400g');
  const count = await page.locator('.card').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(80);
});

test('category filter shows only matching category', async ({ page }) => {
  await page.selectOption('#catSelect', 'Pasta');
  const pills = page.locator('.card .pill');
  const count = await pills.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(pills.nth(i)).toHaveText('Pasta');
  }
});

test('time filter hides recipes over 30 minutes', async ({ page }) => {
  await page.locator('.chip[data-time="30"]').click();
  await expect(page.locator('.card[data-title="Tuna & Sweetcorn Pasta Bake"]')).not.toBeVisible();
  await expect(page.locator('.card')).toHaveCount(66);
});

test('clear filters restores all cards', async ({ page }) => {
  await page.fill('#searchInput', 'pasta');
  await expect(page.locator('.card')).not.toHaveCount(80);
  await page.click('#clearBtn');
  await expect(page.locator('.card')).toHaveCount(80);
});

test('Surprise me opens recipe detail panel', async ({ page }) => {
  await page.click('#surpriseBtn');
  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#panelContent #panelTitle')).not.toBeEmpty();
});
