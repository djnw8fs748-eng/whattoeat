import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('fridge search with one ingredient filters cards', async ({ page }) => {
  await page.fill('#fridgeInput', 'chicken');
  const count = await page.locator('.card').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(80);
});

test('fridge AND logic requires all terms to be present', async ({ page }) => {
  // First get count for 'chicken' alone
  await page.fill('#fridgeInput', 'chicken');
  const chickenCount = await page.locator('.card').count();

  // Then add 'pasta' — must be fewer matches (AND logic)
  await page.fill('#fridgeInput', 'chicken, pasta');
  const bothCount = await page.locator('.card').count();

  expect(bothCount).toBeGreaterThan(0);
  expect(bothCount).toBeLessThan(chickenCount);
});

test('typing in fridge input clears text search', async ({ page }) => {
  await page.fill('#searchInput', 'pasta');
  await page.fill('#fridgeInput', 'chicken');
  await expect(page.locator('#searchInput')).toHaveValue('');
});

test('typing in text search clears fridge input', async ({ page }) => {
  await page.fill('#fridgeInput', 'chicken');
  await page.fill('#searchInput', 'pasta');
  await expect(page.locator('#fridgeInput')).toHaveValue('');
});
