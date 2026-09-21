import { expect, test } from '@playwright/test';
import { mockBackend, TAP_FLIGHT } from './mock-backend';

/** Phase 4 DoD: find a TAP flight → open its details → see the route. */
test('finds a TAP flight, opens it and shows the route', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/?lat=40&lon=-8.6&z=7');

  // `/` jumps to search from anywhere (SPEC § 5.4).
  await page.locator('body').press('/');
  await expect(page).toHaveURL(/\/search/);
  await page.getByTestId('search-input').fill('TAP');

  const result = page.getByTestId('search-result').filter({ hasText: TAP_FLIGHT.callsign });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(new RegExp(`sel=${TAP_FLIGHT.hex}`));
  const panel = page.locator('aside').getByTestId('flight-panel');
  await expect(panel.getByTestId('flight-title')).toHaveText(TAP_FLIGHT.callsign);
  await expect(panel).toContainText('TAP Air Portugal');
  await expect(panel).toContainText('AIRBUS A-320neo');

  const route = panel.getByTestId('flight-route');
  await expect(route).toContainText('OPO');
  await expect(route).toContainText('LIS');
  await expect(route).toContainText('km to go');
  await expect(panel.getByRole('progressbar', { name: 'Route progress' })).toBeVisible();
});

test('filters open with f, preview the count and close with Escape', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/?lat=40&lon=-8.6&z=7');
  await page.locator('body').press('f');
  const panel = page.getByTestId('filter-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('apply-filters')).toHaveText(/Show 1 flights/);
  await panel.getByRole('button', { name: 'Military only' }).click();
  await page.getByTestId('apply-filters').click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('open-filters')).toContainText('Filters · 1');
  await page.locator('body').press('f');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('filter-panel')).toBeHidden();
});
