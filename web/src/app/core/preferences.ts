import { Injectable, effect, signal } from '@angular/core';
import { AVATAR_HUES } from '../ui/accents';
import { readStorage, writeStorage } from './local-storage';
import { customPlaymatImageId, isCustomPlaymatId, PLAYER_MATS } from './player-mats';

const SEATS_KEY = 'co.defaults.seats.v1';
const AVATAR_KEY = 'co.profile.avatarHue.v1';
const DECK_VIEW_KEY = 'co.decks.view.v1';
const PLAYMAT_KEY = 'co.profile.playmatId.v1';
const UPLOADED_PLAYMAT_KEY = 'co.profile.playmatImageId.v1';

export const SEAT_CHOICES = [2, 3, 4, 5, 6] as const;
export const MAX_SEATS = 6;

export type DeckView = 'card' | 'list';

@Injectable({ providedIn: 'root' })
export class Preferences {
  readonly seats = signal(readSeats());

  readonly avatarHue = signal(readAvatarHue());

  readonly deckView = signal<DeckView>(readStorage(DECK_VIEW_KEY) === 'list' ? 'list' : 'card');

  readonly playmatId = signal(readPlaymatId());

  readonly uploadedPlaymatImageId = signal(readUploadedPlaymatImageId());

  constructor() {
    effect(() => writeStorage(SEATS_KEY, String(this.seats())));
    effect(() => writeStorage(DECK_VIEW_KEY, this.deckView()));
    effect(() => {
      const hue = this.avatarHue();
      writeStorage(AVATAR_KEY, hue === null ? null : String(hue));
    });
    effect(() => writeStorage(PLAYMAT_KEY, this.playmatId()));
    effect(() => writeStorage(UPLOADED_PLAYMAT_KEY, this.uploadedPlaymatImageId()));
  }
}

function readSeats(): number {
  const stored = Number(readStorage(SEATS_KEY));
  return (SEAT_CHOICES as readonly number[]).includes(stored) ? stored : 2;
}

function readAvatarHue(): number | null {
  const stored = Number(readStorage(AVATAR_KEY));
  return (AVATAR_HUES as readonly number[]).includes(stored) ? stored : null;
}

function readPlaymatId(): string | null {
  const stored = readStorage(PLAYMAT_KEY);

  if (isCustomPlaymatId(stored)) return stored;
  return PLAYER_MATS.some((mat) => mat.id === stored) ? stored : null;
}

function readUploadedPlaymatImageId(): string | null {
  const stored = readStorage(UPLOADED_PLAYMAT_KEY);
  if (stored) return stored;

  const playmatId = readStorage(PLAYMAT_KEY);
  return isCustomPlaymatId(playmatId) ? customPlaymatImageId(playmatId) : null;
}
