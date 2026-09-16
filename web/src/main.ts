import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig, clearStaleChunkReloadGuard } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(clearStaleChunkReloadGuard)
  .catch((err) => console.error(err));
