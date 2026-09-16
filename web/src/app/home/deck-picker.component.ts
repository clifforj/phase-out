import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardArtService } from '../core/card-art';
import { DeckStore } from '../core/deck-store';
import type { DeckSummary } from '../core/protocol';
import { commanderArt } from '../decks/deck-presentation';
import { ManaPipsComponent } from '../ui/mana-pips.component';
import { PopoverDirective } from '../ui/popover.directive';

@Component({
  selector: 'app-deck-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ManaPipsComponent, PopoverDirective],
  templateUrl: './deck-picker.component.html',
  styleUrl: './deck-picker.component.css',
})
export class DeckPickerComponent {
  protected readonly decks = inject(DeckStore);
  private readonly art_ = inject(CardArtService);

  protected readonly deckOpen = signal(false);
  protected readonly deckSearch = signal('');

  constructor() {
    this.decks.refreshDecks();
  }

  protected readonly allDecks = computed(() => [
    ...this.decks.decks(),
    ...this.decks.builtInDecks(),
  ]);

  protected readonly filteredDecks = computed(() => {
    const needle = this.deckSearch().trim().toLowerCase();
    if (!needle) return this.allDecks();
    return this.allDecks().filter(
      (deck) =>
        deck.name.toLowerCase().includes(needle) ||
        (deck.commanders ?? []).some((c) => c.name.toLowerCase().includes(needle)),
    );
  });

  protected readonly selectedDeck = computed(() => {
    const chosen = this.decks.selectedDeckId();
    if (!chosen) return null;
    return this.allDecks().find((deck) => deck.deckId === chosen) ?? null;
  });

  protected isBuiltIn(deck: DeckSummary): boolean {
    return this.decks.builtInDecks().some((other) => other.deckId === deck.deckId);
  }

  protected art(deck: DeckSummary): string | null {
    return commanderArt(this.art_, deck);
  }

  protected pick(deckId: string | null): void {
    this.decks.selectDeck(deckId);
    this.deckOpen.set(false);
    this.deckSearch.set('');
  }
}
