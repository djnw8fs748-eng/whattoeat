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
  await expect(page.locator('.card[data-title="Lemon & Herb Chicken Thighs"]')).toBeVisible();
});
