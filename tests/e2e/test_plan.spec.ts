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

test('Add to plan button opens day picker with 5 day rows', async ({ page }) => {
  await page.locator('.card').first().locator('.add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toHaveClass(/open/);
  await expect(page.locator('#dayPickerList .day-picker-row')).toHaveCount(5);
  await page.locator('#dayPickerCancel').dispatchEvent('click');
});

test('selecting a day adds recipe to that day in the plan tab', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  await page.click('#planTab');
  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('card shows "✓ In plan" badge after adding to plan', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  const btn = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"] .add-plan-btn');
  await expect(btn).toHaveText('✓ In plan');
  await expect(btn).toHaveClass(/planned/);
});

test('plan tab badge count increments after adding recipe', async ({ page }) => {
  await expect(page.locator('#planBadge')).toBeHidden();

  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await expect(page.locator('#planBadge')).toBeVisible();
  await expect(page.locator('#planBadge')).toHaveText('1');

  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'tue');
  await expect(page.locator('#planBadge')).toHaveText('2');
});

test('adding to an occupied day replaces the recipe', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'mon');

  await page.click('#planTab');
  await expect(page.locator('#planGrid')).not.toContainText('Garlic Butter Pasta with Parmesan');
  await expect(page.locator('#planGrid')).toContainText('One-Pan Tomato & Basil Pasta');
});

test('remove button clears the day and removes card badge', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');

  await page.click('#planTab');
  await page.locator('.day-col-remove').first().click();

  await expect(page.locator('#planGrid .day-col-recipe')).toHaveCount(0);

  // badge on card should be gone after switching back to browse
  await page.click('#browseTab');
  const btn = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"] .add-plan-btn');
  await expect(btn).toHaveText('+ Add to plan');
  await expect(btn).not.toHaveClass(/planned/);
});

test('clicking an empty day slot in the plan tab switches to Browse', async ({ page }) => {
  // Navigate to plan tab with an empty plan — all slots are empty
  await page.click('#planTab');
  await page.locator('.day-col-empty').first().click();

  await expect(page.locator('#browseView')).toBeVisible();
  await expect(page.locator('#planView')).toBeHidden();
  await expect(page.locator('#browseTab')).toHaveClass(/active/);
});
