import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardArtService } from '../core/card-art';
import { ago } from '../core/format';
import { deckColors } from '../core/protocol';
import type { DeckSummary } from '../core/protocol';
import { ManaPipsComponent } from '../ui/mana-pips.component';
import { commanderArt, commanderArtist } from './deck-presentation';
import type { DeckCardTab } from './deck-card.component';

@Component({
  selector: 'app-deck-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaPipsComponent, RouterLink],
  templateUrl: './deck-row.component.html',
  styleUrl: './deck-row.component.css',
})
export class DeckRowComponent {
  private readonly art_ = inject(CardArtService);

  readonly deck = input.required<DeckSummary>();
  readonly tab = input.required<DeckCardTab>();
  readonly chosen = input.required<boolean>();

  readonly play = output<void>();

  protected readonly commanders = computed(() =>
    (this.deck().commanders ?? []).map((commander) => commander.name).join(', '),
  );

  protected readonly art = computed(() => commanderArt(this.art_, this.deck()));
  protected readonly artist = computed(() => commanderArtist(this.art_, this.deck()));

  protected readonly wash = computed(() => {
    const colors = deckColors(this.deck());
    const stops = (colors.length ? colors : ['C']).map(
      (color) => `var(--pip-${color.toLowerCase()})`,
    );
    return `linear-gradient(135deg, ${(stops.length === 1 ? [stops[0], stops[0]] : stops).join(', ')})`;
  });

  protected readonly ago = ago;
}
