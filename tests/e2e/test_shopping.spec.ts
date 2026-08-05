import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

async function addRecipeToDay(page: import('@playwright/test').Page, recipeTitle: string, day: string) {
  const card = page.locator(`.card[data-title="${recipeTitle}"]`);
  await card.locator('.add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toHaveClass(/open/);
  // The day picker is position:fixed but positioned outside the viewport in headless mode,
  // so we dispatch the click event directly instead of relying on pointer simulation.
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

test('shared ingredients are deduplicated in the shopping list', async ({ page }) => {
  // Both recipes contain "2 cloves garlic, minced"
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');
  await addRecipeToDay(page, 'Creamy Chicken & Bacon Pasta', 'tue');

  await page.click('#planTab');

  const items = page.locator('#shoppingGrid .shopping-item label');
  const texts = await items.allTextContents();
  const garlicItems = texts.filter(t => t.toLowerCase().includes('garlic'));
  expect(garlicItems).toHaveLength(1);
});

test('shopping list items are in alphabetical order', async ({ page }) => {
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');
  await addRecipeToDay(page, 'Creamy Chicken & Bacon Pasta', 'tue');

  await page.click('#planTab');

  const items = page.locator('#shoppingGrid .shopping-item label');
  const texts = await items.allTextContents();
  const sorted = [...texts].sort((a, b) => a.localeCompare(b));
  expect(texts).toEqual(sorted);
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
