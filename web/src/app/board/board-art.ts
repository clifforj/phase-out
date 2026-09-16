import { type Signal, computed } from '@angular/core';
import type { CardArtService } from '../core/card-art';
import type { BoardLayout } from './scene/layout';

export class BoardArt {
  constructor(
    private readonly art: CardArtService,
    private readonly layout: Signal<BoardLayout>,
  ) {}

  readonly urls = computed(() => {
    const urls = new Map<string, string>();
    if (!this.art.enabled) return urls;
    for (const placement of this.layout().placements) {
      const url = this.art.artFor(placement.card, placement.space === 'camera' ? 'full' : 'crop')();
      if (url) urls.set(placement.card.objectId, url);
    }
    return urls;
  });

  readonly artists = computed(() => {
    const names = new Map<string, string>();
    const urls = this.urls();
    for (const placement of this.layout().placements) {
      if (placement.space === 'camera' || !urls.has(placement.card.objectId)) continue;
      const artist = this.art.artistFor(placement.card)();
      if (artist) names.set(placement.card.objectId, artist);
    }
    return names;
  });
}
