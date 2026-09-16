import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  NavigationError,
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
} from '@angular/router';
import { BRIDGE_SOCKET_FACTORY, webSocketFactory } from './core/bridge-socket';
import { routes } from './app.routes';

// Retry stale deployment chunks once per tab to avoid a reload loop.
const STALE_CHUNK_RELOAD_KEY = 'stale-chunk-reload-attempted';

const CHUNK_LOAD_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module/i;

function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_ERROR.test(error.message);
}

export function clearStaleChunkReloadGuard(): void {
  sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
}

function reloadOnStaleChunk(event: NavigationError): void {
  if (!isChunkLoadError(event.error)) return;
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) return;
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1');
  window.location.href = event.url;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withNavigationErrorHandler(reloadOnStaleChunk),
    ),
    {
      provide: BRIDGE_SOCKET_FACTORY,
      useValue: webSocketFactory,
    },
  ],
};
