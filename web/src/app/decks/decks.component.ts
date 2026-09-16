import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DeckStore } from '../core/deck-store';
import { Preferences } from '../core/preferences';
import { deckColors } from '../core/protocol';
import type { DeckSummary } from '../core/protocol';
import { DeckCardComponent } from './deck-card.component';
import { DeckRowComponent } from './deck-row.component';
import { ImportDeckComponent } from './import-deck.component';

type Shelf = 'mine' | 'ready';

const IDENTITY_CHOICES = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
type IdentityChip = (typeof IDENTITY_CHOICES)[number];

@Component({
  selector: 'app-decks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeckCardComponent, DeckRowComponent, ImportDeckComponent],
  templateUrl: './decks.component.html',
  styleUrl: './decks.component.css',
})
export class DecksComponent {
  protected readonly decks = inject(DeckStore);
  protected readonly prefs = inject(Preferences);

  protected readonly importing = signal(false);
  protected readonly search = signal('');
  protected readonly identity = signal<ReadonlySet<IdentityChip>>(new Set());

  protected readonly identityChoices = IDENTITY_CHOICES;

  protected readonly filtering = computed(
    () => this.search().trim().length > 0 || this.identity().size > 0,
  );

  protected readonly effectiveView = computed(() =>
    this.filtering() ? 'list' : this.prefs.deckView(),
  );

  protected readonly filtered = computed(() => {
    const needle = this.search().trim().toLowerCase();
    const chips = this.identity();
    const source: readonly { deck: DeckSummary; tab: Shelf }[] = [
      ...this.decks.decks().map((deck) => ({ deck, tab: 'mine' as const })),
      ...this.decks.builtInDecks().map((deck) => ({ deck, tab: 'ready' as const })),
    ];
    return source.filter(({ deck }) => {
      if (needle && !matchesSearch(deck, needle)) return false;
      if (chips.size && !matchesIdentity(deck, chips)) return false;
      return true;
    });
  });

  protected readonly mine = computed(() => this.filtered().filter((item) => item.tab === 'mine'));

  protected readonly ready = computed(() => this.filtered().filter((item) => item.tab === 'ready'));

  constructor() {
    this.decks.refreshDecks();
  }

  protected play(deckId: string): void {
    this.decks.selectDeck(deckId);
  }

  protected toggleIdentity(chip: IdentityChip): void {
    const next = new Set(this.identity());
    if (next.has(chip)) next.delete(chip);
    else next.add(chip);
    this.identity.set(next);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.identity.set(new Set());
  }
}

function matchesSearch(deck: DeckSummary, needle: string): boolean {
  return (
    deck.name.toLowerCase().includes(needle) ||
    (deck.commanders ?? []).some((commander) => commander.name.toLowerCase().includes(needle))
  );
}

function matchesIdentity(deck: DeckSummary, chips: ReadonlySet<IdentityChip>): boolean {
  const colors = new Set(deckColors(deck));
  const wanted = new Set([...chips].filter((chip) => chip !== 'C'));
  if (chips.has('C')) return colors.size === 0 && wanted.size === 0;
  return colors.size === wanted.size && [...wanted].every((chip) => colors.has(chip));
}
