import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Skull, Sparkles } from 'lucide';
import type { CardView } from '../../core/protocol';
import type { ZoneKind } from '../../rules/zones';
import { CardListPanelComponent } from './card-list-panel.component';

@Component({
  selector: 'app-zone-browser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardListPanelComponent],
  template: `
    <app-card-list-panel
      [heading]="heading()"
      [icon]="icon()"
      [cards]="orderedCards()"
      [selectableIds]="selectableIds()"
      [chosenTargetIds]="chosenTargetIds()"
      [emptyMessage]="emptyMessage()"
      [showOrdinal]="true"
      orderHint="top of the pile first"
      (close)="close.emit()"
      (pick)="pick.emit($event)"
    />
  `,
})
export class ZoneBrowserComponent {
  readonly kind = input.required<ZoneKind>();
  readonly ownerName = input<string | null>(null);

  readonly cards = input.required<CardView[]>();
  readonly selectableIds = input<ReadonlySet<string>>(new Set());
  readonly chosenTargetIds = input<ReadonlySet<string>>(new Set());

  readonly close = output<void>();
  readonly pick = output<string>();

  readonly icon = computed(() => (this.kind() === 'graveyard' ? Skull : Sparkles));
  readonly heading = computed(() =>
    this.ownerName() ? `${this.ownerName()}’s ${this.kind()}` : this.kind(),
  );
  readonly emptyMessage = computed(() =>
    this.kind() === 'graveyard'
      ? 'Nothing in here yet. Cards land here when they die or are discarded.'
      : 'Nothing in here yet. Cards land here when something exiles them.',
  );
  readonly orderedCards = computed(() => [...this.cards()].reverse());
}
