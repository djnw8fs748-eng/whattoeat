import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

const PAST_WEEK: Record<string, { recipe: string; servings: number } | null> = {
  mon: { recipe: 'Garlic Butter Pasta with Parmesan', servings: 2 },
  tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
};

test.beforeEach(async ({ page }) => {
  await setupMockApi(page, {}, { '2026-08-03': PAST_WEEK });
  await page.goto('/');
  await page.waitForSelector('.card');
});

test('history view lists past weeks and shows their plan read-only', async ({ page }) => {
  await page.click('#planTab');
  await page.click('#historyBtn');

  await expect(page.locator('#historyWeekList option:not([value=""])')).toHaveCount(1);
  await page.selectOption('#historyWeekList', '2026-08-03');

  await expect(page.locator('#historyGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});

test('copying a past week overwrites the current plan', async ({ page }) => {
  await page.click('#planTab');
  await page.click('#historyBtn');
  await page.selectOption('#historyWeekList', '2026-08-03');

  page.on('dialog', dialog => dialog.accept());
  await page.click('#historyCopyBtn');

  await expect(page.locator('#planGrid')).toContainText('Garlic Butter Pasta with Parmesan');
});
