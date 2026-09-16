import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { IconNode } from 'lucide';
import type { CardView } from '../../core/protocol';
import {
  abilityLine,
  cardDisplayName,
  isCommander,
  printingOf,
  statLine,
} from '../../rules/card-text';
import { ManaCostComponent } from '../../ui/mana-symbol.component';
import { FanDisclaimerComponent } from '../../ui/fan-disclaimer.component';
import { SheetComponent } from '../../ui/sheet.component';
import { SheetHeaderComponent } from '../../ui/sheet-header.component';
import { frameColorsOf } from '../scene/theme';
import { CardPreviewComponent } from './card-preview.component';

@Component({
  selector: 'app-card-list-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardPreviewComponent,
    FanDisclaimerComponent,
    ManaCostComponent,
    SheetComponent,
    SheetHeaderComponent,
  ],
  templateUrl: './card-list-panel.component.html',
  styleUrls: ['./card-rows.css', './card-list-panel.component.css'],
})
export class CardListPanelComponent {
  readonly heading = input.required<string>();
  readonly icon = input.required<IconNode>();
  readonly cards = input.required<CardView[]>();

  readonly selectableIds = input<ReadonlySet<string>>(new Set());
  readonly chosenTargetIds = input<ReadonlySet<string>>(new Set());
  readonly emptyMessage = input.required<string>();

  readonly showOrdinal = input(true);

  readonly orderHint = input('');

  readonly hints = input<ReadonlyMap<string, string>>(new Map());

  readonly close = output<void>();
  readonly pick = output<string>();

  protected readonly hovered = signal<string | null>(null);
  protected readonly chosen = signal<string | null>(null);

  readonly rows = computed(() =>
    this.cards().map((card, index) => ({
      card,
      ordinal: index + 1,
      name: cardDisplayName(card),

      cost: card.isAbility ? undefined : card.manaCost,
      type:
        this.hints().get(card.objectId) ??
        (card.isAbility ? abilityLine(card) : (card.typeLine?.trim() ?? '')),
      stats: card.isAbility ? '' : statLine(card),
      commander: isCommander(card),
      printing: printingOf(card),
      stripe: frameColorsOf(card)[0] ?? 'var(--line)',
    })),
  );

  protected readonly count = computed(
    () => `${this.cards().length} ${this.cards().length === 1 ? 'card' : 'cards'}`,
  );

  readonly shown = computed(() => {
    const rows = this.rows();
    const wanted = this.hovered() ?? this.chosen();
    return rows.find((row) => row.card.objectId === wanted) ?? rows[0] ?? null;
  });

  protected rowClicked(objectId: string): void {
    this.chosen.set(objectId);
    if (this.selectableIds().has(objectId)) this.pick.emit(objectId);
  }

  protected clearChosen(): void {
    for (const objectId of this.chosenTargetIds()) this.pick.emit(objectId);
  }
}
