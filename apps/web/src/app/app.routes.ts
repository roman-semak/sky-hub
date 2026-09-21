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
  { path: '**', redirectTo: '' },
];
