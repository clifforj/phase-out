import { Signal, computed } from '@angular/core';
import type { GameStore } from '../core/game-store';

export interface BoardBanner {
  level: 'info' | 'warn' | 'error';
  text: string;
}

export function boardStale(store: GameStore): Signal<boolean> {
  return computed(
    () => store.status() !== 'open' || store.xmageDropped() || store.watchState() === 'refused',
  );
}

export function boardBanner(store: GameStore): Signal<BoardBanner | null> {
  return computed<BoardBanner | null>(() => {
    if (store.protocolMismatch()) {
      return {
        level: 'error',
        text: `Stopped: ${store.protocolMismatch()}. This client will not render a protocol it does not implement.`,
      };
    }
    if (store.unmapped().length) {
      const names = store
        .unmapped()
        .map((u) => `${u.callbackMethod}×${u.count}`)
        .join(', ');
      return {
        level: 'warn',
        text: `The bridge could not translate: ${names}. Something happened in this game that protocol v1 does not cover.`,
      };
    }
    if (store.xmageDropped()) {
      return {
        level: 'error',
        text: 'The game session was dropped - the board below is frozen. Reload to start a new session.',
      };
    }
    const status = store.status();
    if (status === 'reconnecting' || status === 'connecting') {
      return {
        level: 'info',
        text:
          `${status === 'connecting' ? 'Connecting' : 'Reconnecting'} to the bridge` +
          (store.reconnects() ? ` (attempt ${store.reconnects() + 1})` : '') +
          '… a spectator can resume, so watching will pick up where the game now is.',
      };
    }
    if (store.watchState() === 'refused') {
      return { level: 'error', text: `Cannot watch this table: ${store.watchProblem()}` };
    }
    if (store.watchState() === 'requesting') {
      return { level: 'info', text: 'Asking to watch…' };
    }

    if (store.eliminated()) {
      return {
        level: 'info',
        text: 'You are out of this game. The rest of the pod plays on - you are watching now.',
      };
    }
    return null;
  });
}
