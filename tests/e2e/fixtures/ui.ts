import { Page, expect } from '@playwright/test';

/* Helpers for driving Atlassian (Atlaskit) components, which don't
   behave like plain HTML elements. */

/** Atlaskit Select isn't a native <select>: open its menu, then click the option. */
export async function chooseOption(page: Page, selectId: string, label: string): Promise<void> {
  await page.locator(selectId).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** Opens an Atlaskit Select and returns its option locator (for counting). */
export async function openOptions(page: Page, selectId: string) {
  await page.locator(selectId).click();
  return page.getByRole('option');
}

/** Clicks a card's "Add to plan" button and picks a day in the popup. */
export async function addRecipeToDay(page: Page, recipeTitle: string, day: string): Promise<void> {
  const card = page.locator(`.card[data-title="${recipeTitle}"]`);
  await card.getByTestId('add-plan-btn').click();
  await expect(page.locator('#dayPicker')).toBeVisible();
  // dispatchEvent instead of click() to bypass viewport checks for the floating popup
  await page.locator(`#dayPickerList .day-picker-row[data-day="${day}"]`).dispatchEvent('click');
  await expect(page.locator('#dayPicker')).toBeHidden();
}
