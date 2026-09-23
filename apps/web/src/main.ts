/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { apiOrigin } from './app/core/config/api-origin';
import { preconnectApi } from './app/core/config/preconnect';

// Before bootstrap: the connection is warm by the time the first call goes out.
preconnectApi(apiOrigin());

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  document.body.textContent = 'SkyTrace failed to start.';
  throw err;
});
