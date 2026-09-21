import type { Routes } from '@angular/router';
import { MapPage } from './pages/map.page';

export const routes: Routes = [
  {
    path: '',
    // The landing page: eager so its overlays paint with the first frame.
    component: MapPage,
    title: $localize`:@@title.map:SkyTrace — live flight map`,
  },
  {
    path: 'search',
    loadComponent: async () => (await import('./pages/search.page')).SearchPage,
    title: $localize`:@@title.search:Search — SkyTrace`,
  },
  {
    path: 'following',
    loadComponent: async () => (await import('./pages/following.page')).FollowingPage,
    title: $localize`:@@title.following:Following — SkyTrace`,
  },
  {
    path: 'stats',
    loadComponent: async () => (await import('./pages/stats.page')).StatsPage,
    title: $localize`:@@title.stats:Statistics — SkyTrace`,
  },
  {
    path: 'aircraft/:id',
    loadComponent: async () => (await import('./pages/aircraft.page')).AircraftPage,
    title: $localize`:@@title.aircraft:Aircraft — SkyTrace`,
  },
  {
    path: 'airport/:icao',
    loadComponent: async () => (await import('./pages/airport.page')).AirportPage,
    title: $localize`:@@title.airport:Airport — SkyTrace`,
  },
  { path: '**', redirectTo: '' },
];
