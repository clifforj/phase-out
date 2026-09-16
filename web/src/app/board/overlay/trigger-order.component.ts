import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { Zap } from 'lucide';
import type { CardView, PromptView } from '../../core/protocol';
import { abilityLine } from '../../rules/card-text';
import { ordinalLabel } from '../../rules/trigger-order';
import { SheetComponent } from '../../ui/sheet.component';
import { SheetHeaderComponent } from '../../ui/sheet-header.component';
import { frameColorsOf } from '../scene/theme';
import { CardPreviewComponent } from './card-preview.component';

@Component({
  selector: 'app-trigger-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardPreviewComponent, SheetComponent, SheetHeaderComponent],
  templateUrl: './trigger-order.component.html',
  styleUrls: ['./card-rows.css', './trigger-order.component.css'],
})
export class TriggerOrderComponent {
  readonly prompt = input.required<PromptView>();
  protected readonly icon = Zap;

  readonly commit = output<string[]>();

  readonly close = output<void>();

  protected readonly hovered = signal<string | null>(null);

  readonly order = linkedSignal<string, string[]>({
    source: () =>
      this.prompt()
        .cards.map((card) => card.objectId)
        .join('|'),
    computation: () => [],
  });

  protected readonly complete = computed(() => this.order().length === this.prompt().cards.length);
  protected readonly count = computed(() => `${this.prompt().cards.length} triggers`);

  protected readonly rows = computed(() => {
    const cards = this.prompt().cards;
    const order = this.order();
    const byId = new Map(cards.map((card) => [card.objectId, card]));
    const placed = order
      .map((id) => byId.get(id))
      .filter((card): card is CardView => card !== undefined);
    const rest = cards.filter((card) => !order.includes(card.objectId));
    const total = cards.length;

    return [...placed, ...rest].map((card, index) => {
      const place = index < placed.length ? index + 1 : null;
      return {
        card,
        place,
        isNext: place === null && index === placed.length,
        badge: place === null ? '–' : ordinalLabel(place),
        name: card.displayName || card.name || 'Ability',
        text: abilityLine(card),
        note:
          place === null
            ? ''
            : place === 1
              ? 'resolves first'
              : place === total
                ? 'resolves last'
                : 'then',
        stripe: frameColorsOf(card)[0] ?? 'var(--line)',
      };
    });
  });

  protected readonly shown = computed(() => {
    const rows = this.rows();
    const wanted = this.hovered();
    return (
      rows.find((row) => row.card.objectId === wanted) ??
      rows.find((row) => row.isNext) ??
      rows[0] ??
      null
    );
  });

  protected readonly summary = computed(() => {
    const rows = this.rows();
    const placed = rows.filter((row) => row.place !== null);
    if (!placed.length) return 'Pick the trigger that should resolve first.';
    if (placed.length < rows.length) return `${placed.length} of ${rows.length} placed.`;
    return placed.map((row) => row.name).join(' → ');
  });

  protected toggle(objectId: string): void {
    const total = this.prompt().cards.length;
    this.order.update((order) => {
      if (order.includes(objectId)) return order.filter((id) => id !== objectId);
      const next = [...order, objectId];
      if (next.length !== total - 1) return next;
      const last = this.prompt().cards.find((card) => !next.includes(card.objectId));
      return last ? [...next, last.objectId] : next;
    });
  }

  protected confirm(): void {
    if (this.complete()) this.commit.emit(this.order());
  }
}
