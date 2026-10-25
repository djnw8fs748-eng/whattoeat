import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';
import { addRecipeToDay, chooseOption } from './fixtures/ui';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('saving and loading a template round-trips the plan', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await page.click('[data-testid="planTab"]');

  await page.click('#saveTemplateBtn');
  await page.fill('#templateNameInput', 'Usual Week');
  await page.click('#templateSaveConfirm');

  // Clear the plan
  await page.getByTestId('day-col-remove').first().click();
  await expect(page.locator('#planGrid .day-col-recipe')).toHaveCount(0);

  await chooseOption(page, '#loadTemplateSelect', 'Usual Week');
  await page.click('#loadTemplateBtn');
  await page.click('#confirmModalOk');

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('failed template load shows an error banner and leaves the existing plan intact', async ({ page }) => {
  await addRecipeToDay(page, 'Garlic Butter Pasta with Parmesan', 'mon');
  await page.click('[data-testid="planTab"]');

  await page.click('#saveTemplateBtn');
  await page.fill('#templateNameInput', 'Usual Week');
  await page.click('#templateSaveConfirm');

  // Simulate the template having been deleted from another browser tab:
  // the select still lists it, but applying it now 404s.
  await page.route(/\/api\/templates\/.+\/apply/, async (route) => {
    await route.fulfill({ status: 404, json: { detail: "No template named 'Usual Week'" } });
  });

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');

  await chooseOption(page, '#loadTemplateSelect', 'Usual Week');
  await page.click('#loadTemplateBtn');
  await page.click('#confirmModalOk');

  await expect(page.locator('#apiErrorMsg')).toBeVisible();
  // plan state must not have been corrupted with the error body
  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
  await expect(page.locator('#planGrid')).not.toContainText('detail');
});
