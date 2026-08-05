import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('gluten chip hides recipes with pasta or bread ingredients', async ({ page }) => {
  const totalBefore = await page.locator('.card').count();
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  const totalAfter = await page.locator('.card').count();
  expect(totalAfter).toBeLessThan(totalBefore);
  await expect(page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]')).not.toBeVisible();
  await expect(page.locator('.card[data-title="Lemon Herb Chicken Thighs & Potatoes"]')).toBeVisible();
});

test('selecting two allergens applies AND logic (fewer or equal results)', async ({ page }) => {
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  const glutenCount = await page.locator('.card').count();
  await page.locator('.allergen-chip[data-allergen="dairy"]').click();
  const bothCount = await page.locator('.card').count();
  expect(bothCount).toBeLessThanOrEqual(glutenCount);
});

test('clicking an active allergen chip deactivates it and restores recipes', async ({ page }) => {
  const totalBefore = await page.locator('.card').count();
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  const filtered = await page.locator('.card').count();
  expect(filtered).toBeLessThan(totalBefore);
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  await expect(page.locator('.card')).toHaveCount(totalBefore);
});

test('clear filters deactivates all allergen chips', async ({ page }) => {
  await page.locator('.allergen-chip[data-allergen="gluten"]').click();
  await page.locator('.allergen-chip[data-allergen="dairy"]').click();
  await expect(page.locator('.allergen-chip.active')).toHaveCount(2);
  await page.click('#clearBtn');
  await expect(page.locator('.allergen-chip.active')).toHaveCount(0);
  const totalAfter = await page.locator('.card').count();
  expect(totalAfter).toBeGreaterThan(0);
});
