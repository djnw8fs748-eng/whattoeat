import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('fridge search with one ingredient filters cards', async ({ page }) => {
  await page.fill('#searchInput', 'chicken');
  const count = await page.locator('.card').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(80);
});

test('fridge AND logic requires all terms to be present', async ({ page }) => {
  // First get count for 'chicken' alone
  await page.fill('#searchInput', 'chicken');
  const chickenCount = await page.locator('.card').count();

  // Then add 'pasta' — must be fewer matches (AND logic via comma)
  await page.fill('#searchInput', 'chicken, pasta');
  const bothCount = await page.locator('.card').count();

  expect(bothCount).toBeGreaterThan(0);
  expect(bothCount).toBeLessThan(chickenCount);
});
