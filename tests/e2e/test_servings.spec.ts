import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('day picker servings stepper defaults to recipe base servings and can be adjusted', async ({ page }) => {
  const card = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]');
  await card.locator('.add-plan-btn').click();

  await expect(page.locator('#dayPickerServingsValue')).toHaveText('2');

  await page.locator('#dayPickerServingsPlus').click();
  await expect(page.locator('#dayPickerServingsValue')).toHaveText('3');

  await page.locator('#dayPickerList .day-picker-row[data-day="mon"]').dispatchEvent('click');

  await page.click('#planTab');
  await expect(page.locator('.day-col-recipe')).toContainText('3');
});

test('day picker servings stepper cannot go below 1', async ({ page }) => {
  const card = page.locator('.card[data-title="Garlic Butter Pasta with Parmesan"]');
  await card.locator('.add-plan-btn').click();

  for (let i = 0; i < 5; i++) {
    await page.locator('#dayPickerServingsMinus').click();
  }
  await expect(page.locator('#dayPickerServingsValue')).toHaveText('1');
});
