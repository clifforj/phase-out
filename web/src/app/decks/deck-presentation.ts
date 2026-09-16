import type { CardArtService, CardArtVariant } from '../core/card-art';
import type { DeckSummary } from '../core/protocol';

interface Printing {
  setCode: string;
  cardNumber: string;
}

export function artFor(
  art_: CardArtService,
  printing: Printing | undefined,
  variant: CardArtVariant = 'full',
): string | null {
  if (!printing) return null;
  return art_.artForPrinting(printing.setCode, printing.cardNumber, variant)();
}

export function artistFor(art_: CardArtService, printing: Printing | undefined): string | null {
  if (!printing) return null;
  return art_.artistForPrinting(printing.setCode, printing.cardNumber)();
}

export function commanderArt(art_: CardArtService, deck: DeckSummary): string | null {
  return artFor(art_, deck.commanders?.[0], 'crop');
}

export function commanderArtist(art_: CardArtService, deck: DeckSummary): string | null {
  return artistFor(art_, deck.commanders?.[0]);
}
