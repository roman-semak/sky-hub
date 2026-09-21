import { expect, test } from '@playwright/test';
import { mockBackend } from './mock-backend';

/** Phase 6 DoD: the LPPT page shows aircraft on approach, with METAR/TAF. */
test('LPPT shows weather and traffic on approach', async ({ page }) => {
  await mockBackend(page);
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
        metar: {
          raw: 'METAR LPPT 211400Z VRB05KT CAVOK 32/12 Q1022 NOSIG',
          observedAt: Date.now() - 600_000,
          tempC: 32,
          dewpointC: 12,
          windDir: null,
          windKt: 5,
          gustKt: null,
          visibility: '6+',
          qnhHpa: 1022,
          category: 'VFR',
        },
        taf: { raw: 'TAF LPPT 211100Z 2112/2218 05007KT CAVOK', validFrom: 0, validTo: 1 },
        windHistory: [
          { dir: 320, kt: 12 },
          { dir: 318, kt: 15 },
          { dir: 80, kt: 6 },
        ],
        traffic: [
          {
            hex: '4951ab',
            callsign: 'TAP1234',
            typeCode: 'A20N',
            role: 'arrival',
            distanceNm: 4.1,
            altitude: 1500,
            gs: 150,
            baroRate: -760,
          },
          {
            hex: '4951ac',
            callsign: 'TAP77',
            typeCode: 'A339',
            role: 'departure',
            distanceNm: 6,
            altitude: 5000,
            gs: 220,
            baroRate: 2500,
          },
        ],
      },
    }),
  );
  await page.goto('/airport/lppt');
  await expect(page.getByTestId('airport-title')).toHaveText('LPPT · LIS');
  await expect(page.getByTestId('metar')).toContainText('VRB05KT');
  await expect(page.getByTestId('traffic')).toContainText('TAP1234');
  await expect(page.getByTestId('traffic')).toContainText('−760 fpm');
  await expect(page.getByRole('img', { name: /most often from 3[0-9]{2}°/ })).toBeVisible();

  // Picking an arrival opens it on the map.
  await page
    .getByTestId('traffic')
    .getByRole('button', { name: /TAP1234/ })
    .click();
  await expect(page).toHaveURL(/sel=4951ab/);
});
