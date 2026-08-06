import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('Unified search input', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await page.waitForSelector('.card');
  });

  test('single-term search filters by title or ingredient', async ({ page }) => {
    const total = await page.locator('.card').count();
    await page.fill('#searchInput', 'pasta');
    const filtered = await page.locator('.card').count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    // Verify title-match works: at least one visible card must have 'pasta' in its title
    const titles = await page.locator('.card h3').allTextContents();
    expect(titles.some(t => t.toLowerCase().includes('pasta'))).toBe(true);
  });

  test('comma search applies AND ingredient logic', async ({ page }) => {
    // "chicken, lemon" should return only recipes with both ingredients
    await page.fill('#searchInput', 'chicken, lemon');
    const count = await page.locator('.card').count();
    expect(count).toBeGreaterThan(0);
    // Result should be <= single-term search
    await page.fill('#searchInput', 'chicken');
    const chickenCount = await page.locator('.card').count();
    await page.fill('#searchInput', 'chicken, lemon');
    const bothCount = await page.locator('.card').count();
    expect(bothCount).toBeLessThanOrEqual(chickenCount);
  });
});
