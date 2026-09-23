import { expect, test, type Page } from '@playwright/test';
import { mockBackend, TAP_FLIGHT, type MockAlert } from './mock-backend';

/** SPEC phase 8 features end to end: alerts, heatmap, 3D terrain, export. */

const ALERT: MockAlert = {
  hex: 'ab1234',
  callsign: 'RSQ1',
  squawk: '7700',
  kind: 'general',
  lat: 40.1,
  lon: -8.5,
  military: false,
  at: Date.now(),
};

// A 1×1 transparent PNG, enough to stand in for a DEM tile.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const openLayers = async (page: Page, label: string): Promise<void> => {
  await page.getByRole('button', { name: 'Layers' }).click();
  const panel = page.getByTestId('layers-panel');
  await expect(panel).toBeVisible();
  await panel.getByText(label).click();
};

test('an emergency squawk reaches the toast and the alerts page', async ({ page }) => {
  await mockBackend(page, { alerts: [ALERT] });
  await page.goto('/?lat=40&lon=-8.6&z=7');

  const toast = page.getByRole('alert');
  await expect(toast).toContainText('7700');
  await expect(toast).toContainText('RSQ1');

  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toBeHidden();

  // Dismissing only clears the toast; the alerts page keeps the history.
  await page.getByRole('link', { name: 'Alerts' }).click();
  await expect(page.getByTestId('alert-row')).toContainText('RSQ1');
  await expect(page.getByTestId('alert-row')).toContainText('7700');
});

test('the density layer asks for the viewport and draws without errors', async ({ page }) => {
  await mockBackend(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let bbox = '';
  await page.route('**/api/heatmap?**', (route) => {
    bbox = new URL(route.request().url()).searchParams.get('bbox') ?? '';
    return route.fulfill({
      json: {
        windowHours: 24,
        cellDeg: 0.25,
        max: 12,
        cells: [
          { lat: 40.1, lon: -8.5, count: 12 },
          { lat: 40.4, lon: -8.2, count: 5 },
        ],
      },
    });
  });

  await page.goto('/?lat=40&lon=-8.6&z=7');
  await openLayers(page, 'Traffic density');
  await expect.poll(() => bbox.length).toBeGreaterThan(0);

  const edges = bbox.split(',').map(Number);
  expect(edges).toHaveLength(4);
  expect(Number(edges[0])).toBeLessThan(Number(edges[2]));
  expect(Number(edges[1])).toBeLessThan(Number(edges[3]));
  expect(errors).toEqual([]);
});

test('3D mode loads terrain tiles and keeps rendering', async ({ page }) => {
  await mockBackend(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let demTiles = 0;
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', (route) => {
    demTiles++;
    return route.fulfill({ body: PIXEL, contentType: 'image/png' });
  });

  await page.goto('/?lat=40&lon=-8.6&z=7');
  await openLayers(page, '3D terrain');
  await expect.poll(() => demTiles, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the flight panel offers the track as KML and GPX', async ({ page }) => {
  await mockBackend(page);
  await page.goto(`/?lat=40&lon=-8.6&z=7&sel=${TAP_FLIGHT.hex}`);

  // Downloads bypass page.route, so this checks the contract of the links;
  // the documents themselves are covered by the server's unit tests.
  const panel = page.locator('aside').getByTestId('flight-panel');
  await expect(panel.getByTestId('export-kml')).toHaveAttribute(
    'href',
    `/api/track/${TAP_FLIGHT.hex}?format=kml`,
  );
  await expect(panel.getByRole('link', { name: 'Export track as GPX' })).toHaveAttribute(
    'href',
    `/api/track/${TAP_FLIGHT.hex}?format=gpx`,
  );
  await expect(panel.getByTestId('export-kml')).toHaveAttribute('download', '');
});
