import { Injectable, computed, inject, signal } from '@angular/core';
import { BridgeClient } from './bridge-client';
import { DiagnosticsStore } from './diagnostics-store';
import { DeckDetail, DeckImported, DeckSummary, Decks } from './protocol';

@Injectable({ providedIn: 'root' })
export class DeckStore {
  private readonly bridge = inject(BridgeClient);
  private readonly diagnostics = inject(DiagnosticsStore);

  readonly decks = signal<DeckSummary[]>([]);

  readonly builtInDecks = signal<DeckSummary[]>([]);

  readonly selectedDeckId = signal<string | null>(null);

  readonly selectedDeck = computed(() => {
    const chosen = this.selectedDeckId();
    if (!chosen) return null;
    return [...this.decks(), ...this.builtInDecks()].find((deck) => deck.deckId === chosen) ?? null;
  });

  readonly deckDetail = signal<DeckDetail | null>(null);
  readonly deckDetailPending = signal(false);

  readonly lastImport = signal<DeckImported | null>(null);
  readonly importPending = signal(false);

  selectDeck(deckId: string | null): void {
    this.selectedDeckId.set(deckId);
  }

  importDeck(text: string, name?: string, commanders?: string[]): void {
    this.lastImport.set(null);
    this.importPending.set(true);
    if (!this.bridge.send({ type: 'importDeck', text, name, commanders }))
      this.importPending.set(false);
  }

  previewImport(text: string, name?: string, commanders?: string[]): void {
    this.lastImport.set(null);
    this.importPending.set(true);
    if (!this.bridge.send({ type: 'importDeck', text, name, commanders, preview: true })) {
      this.importPending.set(false);
    }
  }

  refreshDecks(): void {
    this.bridge.send({ type: 'listDecks' });
  }

  deleteDeck(deckId: string): void {
    if (this.selectedDeckId() === deckId) this.selectedDeckId.set(null);
    this.bridge.send({ type: 'deleteDeck', deckId });
  }

  viewDeck(deckId: string): void {
    this.deckDetail.set(null);
    this.deckDetailPending.set(true);
    if (!this.bridge.send({ type: 'viewDeck', deckId })) this.deckDetailPending.set(false);
  }

  cancelViewDeck(): void {
    this.deckDetailPending.set(false);
  }

  onDeckImportedFrame(frame: DeckImported): void {
    this.importPending.set(false);
    this.lastImport.set(frame);
    if (frame.ok && frame.deck) {
      this.selectedDeckId.set(frame.deck.deckId);
      this.refreshDecks();
      this.diagnostics.toast(
        'INFO',
        `Imported ${frame.deck.name} - ${frame.deck.cardCount} cards.`,
      );
    }
  }

  onDecksFrame(frame: Decks): void {
    this.decks.set(frame.decks);
    this.builtInDecks.set(frame.builtIn ?? []);

    const chosen = this.selectedDeckId();
    const offered = [...frame.decks, ...(frame.builtIn ?? [])];
    if (chosen && !offered.some((d) => d.deckId === chosen)) this.selectedDeckId.set(null);
  }

  onDeckDetailFrame(frame: DeckDetail): void {
    this.deckDetailPending.set(false);
    this.deckDetail.set(frame);
  }

  clearForSignOut(): void {
    this.decks.set([]);
    this.builtInDecks.set([]);
    this.selectedDeckId.set(null);
    this.lastImport.set(null);
  }
}
