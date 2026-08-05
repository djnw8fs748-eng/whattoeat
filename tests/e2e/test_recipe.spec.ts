import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('clicking a card opens the recipe panel with correct title', async ({ page }) => {
  const firstCard = page.locator('.card').first();
  const expectedTitle = await firstCard.locator('h3').textContent();

  // Click the card body (not the add-to-plan button)
  await firstCard.click({ position: { x: 10, y: 10 } });

  await expect(page.locator('#panel')).toHaveClass(/open/);
  await expect(page.locator('#panelContent #panelTitle')).toHaveText(expectedTitle!.trim());
});

test('close button hides the recipe panel', async ({ page }) => {
  await page.locator('.card').first().click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#panel')).toHaveClass(/open/);

  await page.click('#panelClose');
  await expect(page.locator('#panel')).not.toHaveClass(/open/);
});

test('clicking the backdrop hides the recipe panel', async ({ page }) => {
  await page.locator('.card').first().click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#panel')).toHaveClass(/open/);

  await page.click('#backdrop');
  await expect(page.locator('#panel')).not.toHaveClass(/open/);
});
