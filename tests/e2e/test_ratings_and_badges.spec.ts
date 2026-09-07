import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';
import fs from 'fs';
import path from 'path';

test('the most recently added recipes show a "New" badge, older ones don\'t', async ({ page }) => {
  // recipes.json is built by concatenating whole category files together, so
  // its array order does NOT reflect true add order (a new recipe added to
  // an existing category doesn't land at the end of the array). The badge
  // must be driven by recipes/_index.json — the file the automation actually
  // appends to — not by recipes.json's own order.
  const indexEntries = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../recipes/_index.json'), 'utf-8')
  );
  const trulyNewestTitle = indexEntries[indexEntries.length - 1].title;

  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');

  const firstCard = page.locator('.card').first();
  const newestCard = page.locator(`.card[data-title="${trulyNewestTitle}"]`);
  const lastCardByArrayOrder = page.locator('.card').last();

  await expect(firstCard.locator('.new-badge')).toHaveCount(0);
  await expect(newestCard.locator('.new-badge')).toHaveCount(1);
  // Regression guard: recipes.json's own last entry is a stale recipe once
  // category-file concatenation is accounted for, so it must NOT get the badge.
  await expect(lastCardByArrayOrder).not.toHaveAttribute('data-title', trulyNewestTitle);
});

test('rating a recipe up from the detail panel shows a thumbs-up on its card', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');

  const firstCard = page.locator('.card').first();
  await expect(firstCard.locator('.rating-indicator')).toHaveCount(0);

  await firstCard.click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#panel')).toHaveClass(/open/);

  await page.click('#ratingUpBtn');
  await expect(page.locator('#ratingUpBtn')).toHaveClass(/active/);

  await page.click('#panelClose');
  await expect(firstCard.locator('.rating-indicator')).toHaveText('👍');
});

test('clicking the same rating again clears it', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');

  const firstCard = page.locator('.card').first();
  await firstCard.click({ position: { x: 10, y: 10 } });

  await page.click('#ratingUpBtn');
  await expect(page.locator('#ratingUpBtn')).toHaveClass(/active/);

  await page.click('#ratingUpBtn');
  await expect(page.locator('#ratingUpBtn')).not.toHaveClass(/active/);

  await page.click('#panelClose');
  await expect(firstCard.locator('.rating-indicator')).toHaveCount(0);
});

test('"Liked only" filter shows only recipes rated up', async ({ page }) => {
  const firstTitle = 'Garlic Butter Pasta with Parmesan';
  await setupMockApi(page, {}, {}, { [firstTitle]: 'up' });
  await page.goto('/');
  await page.waitForSelector('.card');

  const totalBefore = await page.locator('.card').count();
  expect(totalBefore).toBeGreaterThan(1);

  await page.click('#likedChip');
  await expect(page.locator('#likedChip')).toHaveClass(/active/);

  const cards = page.locator('.card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-title', firstTitle);

  await page.click('#clearBtn');
  await expect(page.locator('.card')).toHaveCount(totalBefore);
});
