import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: async () => (await import('./pages/map.page')).MapPage,
    title: 'SkyTrace — live flight map',
  },
  {
    path: 'search',
    loadComponent: async () => (await import('./pages/search.page')).SearchPage,
    title: 'Search — SkyTrace',
  },
  {
    path: 'following',
    loadComponent: async () => (await import('./pages/following.page')).FollowingPage,
    title: 'Following — SkyTrace',
  },
  {
    path: 'stats',
    loadComponent: async () => (await import('./pages/stats.page')).StatsPage,
    title: 'Statistics — SkyTrace',
  },
  {
    path: 'aircraft/:id',
    loadComponent: async () => (await import('./pages/aircraft.page')).AircraftPage,
    title: 'Aircraft — SkyTrace',
  },
  {
    path: 'airport/:icao',
    loadComponent: async () => (await import('./pages/airport.page')).AirportPage,
    title: 'Airport — SkyTrace',
  },
  { path: '**', redirectTo: '' },
];
