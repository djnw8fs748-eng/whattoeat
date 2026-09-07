import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test('the most recently added recipes show a "New" badge, older ones don\'t', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/');
  await page.waitForSelector('.card');

  const firstCard = page.locator('.card').first();
  const lastCard = page.locator('.card').last();

  await expect(firstCard.locator('.new-badge')).toHaveCount(0);
  await expect(lastCard.locator('.new-badge')).toHaveCount(1);
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
