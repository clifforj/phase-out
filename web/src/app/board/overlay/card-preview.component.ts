import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CardArtService } from '../../core/card-art';
import type { CardView, PermanentStateView } from '../../core/protocol';
import { cardDisplayName } from '../../rules/card-text';
import { CardTileComponent } from './card-tile.component';

@Component({
  selector: 'app-card-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardTileComponent],
  template: `
    @if (printed(); as url) {
      <img class="printed" [src]="url" [alt]="name()" />
    } @else {
      <app-card-tile [card]="card()" [permanent]="permanent()" [upright]="true" />
    }
  `,
  styles: `
    :host {
      display: block;
      --tile-w: var(--preview-w, min(19rem, 40vw));
    }

    .printed {
      display: block;
      width: var(--preview-w, min(19rem, 40vw));
      aspect-ratio: 63 / 88;
      border-radius: 4.6% / 3.3%;
    }
  `,
})
export class CardPreviewComponent {
  private readonly art = inject(CardArtService);

  readonly card = input.required<CardView>();

  readonly permanent = input<PermanentStateView | null>(null);

  protected readonly name = computed(() => cardDisplayName(this.card()));

  protected readonly printed = computed(() => {
    const card = this.card();
    if (card.faceDown || card.isAbility) return null;
    return this.art.artFor(card, 'full')();
  });
}
