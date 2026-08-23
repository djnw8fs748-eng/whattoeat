import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

async function addRecipeToDay(page: import('@playwright/test').Page, recipeTitle: string, day: string) {
  const card = page.locator(`.card[data-title="${recipeTitle}"]`);
  await card.locator('.add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toHaveClass(/open/);
  // Using dispatchEvent instead of click() to bypass viewport checks for fixed-position elements
  await page.locator(`#dayPickerList .day-picker-row[data-day="${day}"]`).dispatchEvent('click');
  await expect(page.locator('#dayPicker')).not.toHaveClass(/open/);
}

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('planning a recipe shows its ingredients in the shopping list', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  await page.click('#planTab');
  await expect(page.locator('#shoppingSection')).toBeVisible();
  const items = page.locator('#shoppingGrid .shopping-item label');
  await expect(items).not.toHaveCount(0);
});

test('matching ingredients are merged and summed across planned recipes', async ({ page }) => {
  // Both recipes contain garlic — quantities should sum, not just dedupe
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');
  await addRecipeToDay(page, 'Creamy Chicken & Bacon Pasta', 'tue');

  await page.click('#planTab');

  const items = page.locator('#shoppingGrid .shopping-item label');
  const texts = await items.allTextContents();
  const garlicItems = texts.filter(t => t.toLowerCase().includes('garlic'));
  expect(garlicItems).toHaveLength(1);
  // Sum must be a number, not the original unscaled per-recipe quantity string
  expect(garlicItems[0]).toMatch(/^\d+(\.\d+)?\s*cloves garlic/i);
});

test('shopping list quantities scale with a day\'s servings', async ({ page }) => {
  const card = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]');
  await card.locator('.add-plan-btn').click();
  await page.locator('#dayPickerServingsPlus').click(); // 2 -> 3
  await page.locator('#dayPickerList .day-picker-row[data-day="mon"]').dispatchEvent('click');

  await page.click('#planTab');
  const spaghettiItem = page.locator('#shoppingGrid .shopping-item label', { hasText: 'spaghetti or linguine' });
  await expect(spaghettiItem).toContainText('300g');
});

test('shopping list items are in alphabetical order by ingredient name', async ({ page }) => {
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');
  await addRecipeToDay(page, 'Creamy Chicken & Bacon Pasta', 'tue');

  await page.click('#planTab');

  // Rendered labels lead with quantity ("300g spaghetti"), so ordering is
  // driven by each row's normalized ingredient name, exposed via data-sort-key
  // for testability, rather than by the full displayed string.
  const items = page.locator('#shoppingGrid .shopping-item');
  const sortKeys = await items.evaluateAll(els => els.map(el => el.getAttribute('data-sort-key')));
  const sorted = [...sortKeys].sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  expect(sortKeys).toEqual(sorted);
});

test('copy list button briefly shows "Copied!" text', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await page.click('#planTab');

  // Mock clipboard API in case the browser sandbox blocks it
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.resolve() },
      writable: true,
      configurable: true,
    });
  });

  await page.click('#copyListBtn');
  await expect(page.locator('#copyListBtn')).toHaveText('Copied!');

  // Text resets after 1800ms
  await expect(page.locator('#copyListBtn')).toHaveText('Copy list', { timeout: 3000 });
});
