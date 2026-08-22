import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

async function addRecipeToDay(page: import('@playwright/test').Page, recipeTitle: string, day: string) {
  const card = page.locator(`.card[data-title="${recipeTitle}"]`);
  await card.locator('.add-plan-btn').click();
  await page.locator(`#dayPickerList .day-picker-row[data-day="${day}"]`).dispatchEvent('click');
}

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('saving and loading a template round-trips the plan', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await page.click('#planTab');

  page.once('dialog', dialog => dialog.accept('Usual Week'));
  await page.click('#saveTemplateBtn');

  // Clear the plan
  await page.locator('.day-col-remove').first().click();
  await expect(page.locator('#planGrid .day-col-recipe')).toHaveCount(0);

  await page.selectOption('#loadTemplateSelect', 'Usual Week');
  page.once('dialog', dialog => dialog.accept());
  await page.click('#loadTemplateBtn');

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('failed template load shows an error banner and leaves the existing plan intact', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await page.click('#planTab');

  page.once('dialog', dialog => dialog.accept('Usual Week'));
  await page.click('#saveTemplateBtn');

  // Simulate the template having been deleted from another browser tab:
  // the select still lists it, but applying it now 404s.
  await page.route(/\/api\/templates\/.+\/apply/, async (route) => {
    await route.fulfill({ status: 404, json: { detail: "No template named 'Usual Week'" } });
  });

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');

  await page.selectOption('#loadTemplateSelect', 'Usual Week');
  page.once('dialog', dialog => dialog.accept());
  await page.click('#loadTemplateBtn');

  await expect(page.locator('#apiErrorMsg')).toBeVisible();
  // plan state must not have been corrupted with the error body
  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
  await expect(page.locator('#planGrid')).not.toContainText('detail');
});
