import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';
import { addRecipeToDay, chooseOption, openOptions } from './fixtures/ui';

const PAST_WEEK = {
  mon: { recipe: 'Garlic Butter Pasta with Parmesan', servings: 2 },
  tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
};

test.beforeEach(async ({ page }) => {
  await setupMockApi(page, {}, { '2026-08-03': PAST_WEEK });
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('history view lists past weeks and shows their plan read-only', async ({ page }) => {
  await page.click('[data-testid="planTab"]');
  await page.click('#historyBtn');

  await expect(await openOptions(page, '#historyWeekList')).toHaveCount(1);
  await page.getByRole('option', { name: '2026-08-03 (1 planned)' }).click();

  await expect(page.locator('#historyGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('copying a past week overwrites the current plan', async ({ page }) => {
  await page.click('[data-testid="planTab"]');
  await page.click('#historyBtn');
  await chooseOption(page, '#historyWeekList', '2026-08-03 (1 planned)');

  await page.click('#historyCopyBtn');
  await page.click('#confirmModalOk');

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('failed history copy shows an error banner and leaves the existing plan intact', async ({ page }) => {
  await addRecipeToDay(page, 'One-Pan Tomato & Basil Pasta', 'tue');
  await page.click('[data-testid="planTab"]');
  await page.click('#historyBtn');
  await chooseOption(page, '#historyWeekList', '2026-08-03 (1 planned)');

  // Simulate the week having been deleted from another browser tab: the
  // list still shows it, but copying it now 404s.
  await page.route(/\/api\/plan\/history\/.+\/copy/, async (route) => {
    await route.fulfill({ status: 404, json: { detail: "No plan found for week '2026-08-03'" } });
  });

  await expect(page.locator('#planGrid')).toContainText('One-Pan Tomato & Basil Pasta');

  await page.click('#historyCopyBtn');
  await page.click('#confirmModalOk');

  await expect(page.locator('#apiErrorMsg')).toBeVisible();
  // plan state must not have been corrupted with the error body, and the
  // pre-existing plan should still be showing
  await expect(page.locator('#planGrid')).toContainText('One-Pan Tomato & Basil Pasta');
  await expect(page.locator('#planGrid')).not.toContainText('detail');
});
