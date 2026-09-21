import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockBackend, TAP_FLIGHT } from './mock-backend';

/** SPEC phase 7: axe without critical violations on every screen. */
async function audit(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The WebGL canvas is not content.
    .exclude('.maplibregl-canvas')
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  const summary = results.violations.map(
    (v) => `${v.impact ?? '?'} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
  );
  test
    .info()
    .annotations.push({ type: `axe ${name}`, description: summary.join(' | ') || 'clean' });
  expect(blocking, summary.join('\n')).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
  await page.route('**/api/stats', (route) =>
    route.fulfill({
      json: {
        generatedAt: Date.now(),
        total: 10,
        airborne: 8,
        onGround: 2,
        military: 1,
        emergencies: [],
        altitudeBands: [
          [0, 2],
          [35000, 6],
        ],
        topOperators: [['TAP', 3]],
        topTypes: [['A20N', 3]],
      },
    }),
  );
  await page.route('**/api/airport/LPPT', (route) =>
    route.fulfill({
      json: {
        icao: 'LPPT',
        iata: 'LIS',
        name: 'Humberto Delgado Airport',
        city: 'Lisbon',
        country: 'PT',
        lat: 38.78,
        lon: -9.13,
        elevationFt: 374,
        metar: null,
        taf: null,
        windHistory: [],
        traffic: [],
      },
    }),
  );
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('map with the flight panel open', async ({ page }) => {
      await page.goto(`/?lat=40&lon=-8.6&z=7&sel=${TAP_FLIGHT.hex}`);
      await expect(page.locator('aside').getByTestId('flight-panel')).toBeVisible();
      await audit(page, `map-${theme}`);
    });

    test('filters dialog', async ({ page }) => {
      await page.goto('/?lat=40&lon=-8.6&z=7');
      await page.getByTestId('open-filters').click();
      await expect(page.getByTestId('filter-panel')).toBeVisible();
      await audit(page, `filters-${theme}`);
    });

    for (const path of ['/search', '/following', '/stats', '/airport/LPPT']) {
      test(`page ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await audit(page, `${path}-${theme}`);
      });
    }
  });
}
