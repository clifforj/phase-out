import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CardArtService } from '../core/card-art';
import { ago } from '../core/format';
import { DeckStore } from '../core/deck-store';
import { ArtistCreditComponent } from '../ui/artist-credit.component';
import { DialogComponent } from '../ui/dialog.component';
import { FanDisclaimerComponent } from '../ui/fan-disclaimer.component';
import { ManaCostComponent, ManaSymbolComponent } from '../ui/mana-symbol.component';
import { manaSymbol } from '../rules/mana-symbol';
import type { DeckCardEntry, DeckSummary } from '../core/protocol';
import { artFor, artistFor } from './deck-presentation';

const CATEGORY_ORDER = [
  'Creatures',
  'Planeswalkers',
  'Battles',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Enchantments',
  'Lands',
  'Other',
];

interface Shelf {
  category: string;
  cards: DeckCardEntry[];
  count: number;
}

@Component({
  selector: 'app-deck-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ManaSymbolComponent,
    ManaCostComponent,
    ArtistCreditComponent,
    DialogComponent,
    FanDisclaimerComponent,
  ],
  templateUrl: './deck-detail.component.html',
  styleUrl: './deck-detail.component.css',
})
export class DeckDetailComponent {
  protected readonly decks = inject(DeckStore);
  private readonly art_ = inject(CardArtService);
  private readonly router = inject(Router);

  readonly deckId = input.required<string>();

  protected readonly detail = this.decks.deckDetail;
  protected readonly pending = this.decks.deckDetailPending;

  protected readonly summary = computed<DeckSummary | undefined>(() => {
    const id = this.deckId();
    return (
      this.decks.decks().find((d) => d.deckId === id) ??
      this.decks.builtInDecks().find((d) => d.deckId === id)
    );
  });

  protected readonly isBuiltIn = computed(() =>
    this.decks.builtInDecks().some((d) => d.deckId === this.deckId()),
  );

  protected readonly commanders = computed(
    () => this.detail()?.cards.filter((c) => c.commander) ?? [],
  );

  private readonly expandedOverride = signal<string | null>(null);

  protected readonly expandedCommanderKey = computed(() => {
    const commanders = this.commanders();
    const override = this.expandedOverride();
    if (override && commanders.some((c) => this.commanderKey(c) === override)) return override;
    return commanders[0] ? this.commanderKey(commanders[0]) : null;
  });

  protected readonly colorIdentity = computed(() => {
    const found = new Set(this.commanders().flatMap((c) => c.colors ?? []));
    return [...'WUBRG'].filter((c) => found.has(c));
  });

  protected readonly identitySymbols = computed(() => {
    const colors = this.colorIdentity();
    return (colors.length ? colors : ['C']).map((c) => manaSymbol(c)!);
  });

  protected readonly identityLabel = computed(() =>
    this.identitySymbols()
      .map((s) => s.label)
      .join(', '),
  );

  protected readonly shelves = computed<Shelf[]>(() => {
    const cards = this.detail()?.cards.filter((c) => !c.commander) ?? [];
    const byCategory = new Map<string, DeckCardEntry[]>();
    for (const card of cards) {
      const bucket = byCategory.get(card.category);
      if (bucket) bucket.push(card);
      else byCategory.set(card.category, [card]);
    }
    for (const bucket of byCategory.values()) bucket.sort((a, b) => a.name.localeCompare(b.name));

    const known = CATEGORY_ORDER.filter((c) => byCategory.has(c));
    const unknown = [...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
    return [...known, ...unknown].map((category) => {
      const cardsInShelf = byCategory.get(category)!;
      return {
        category,
        cards: cardsInShelf,
        count: cardsInShelf.reduce((sum, c) => sum + c.amount, 0),
      };
    });
  });

  protected readonly viewing = signal<DeckCardEntry | null>(null);

  protected readonly confirmingDelete = signal(false);

  constructor() {
    effect(() => {
      this.decks.viewDeck(this.deckId());
    });
  }

  protected art(card: DeckCardEntry, variant: 'full' | 'crop' = 'full'): string | null {
    return artFor(this.art_, card, variant);
  }

  protected artist(card: DeckCardEntry): string | null {
    return artistFor(this.art_, card);
  }

  protected openCard(card: DeckCardEntry): void {
    this.viewing.set(card);
  }

  protected expandCommander(card: DeckCardEntry): void {
    this.expandedOverride.set(this.commanderKey(card));
  }

  protected commanderKey(card: DeckCardEntry): string {
    return card.setCode + card.cardNumber;
  }

  protected closeCard(): void {
    this.viewing.set(null);
  }

  protected deleteDeck(): void {
    this.confirmingDelete.set(false);
    this.decks.deleteDeck(this.deckId());

    this.router.navigate(['/decks']);
  }

  protected readonly ago = ago;
}
