import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { GameStore } from '../../../core/game-store';
import { stripTags } from '../../../rules/text-format';
import { ManaTextComponent } from '../../../ui/mana-symbol.component';
import { ConfirmCancelComponent } from './confirm-cancel.component';

@Component({
  selector: 'app-amount-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent, ConfirmCancelComponent],
  styleUrls: ['./prompt-controls.css'],
  template: `
    @switch (kind()) {
      @case ('GAME_GET_MULTI_AMOUNT') {
        <div class="controls multi">
          @for (amount of store.decision()?.amounts ?? []; track $index) {
            <label class="amount-label">
              <app-mana-text [text]="clean(amount.message)" />
              <input
                type="number"
                [min]="amount.min"
                [max]="amount.max"
                [value]="amountValues()[$index] ?? amount.defaultValue"
                (input)="setAmountAt($index, $event)"
              />
            </label>
          }

          <p class="hint" [class.invalid]="!amountTotalValid()">{{ amountTotalHint() }}</p>
          <app-confirm-cancel
            [disabled]="!amountTotalValid()"
            (confirm)="store.setAmounts(amountValues())"
            (cancel)="store.cancel()"
          />
        </div>
      }
      @default {
        @if (isSingleAmount()) {
          <div class="controls">
            <input
              type="number"
              [min]="store.decision()?.min ?? 0"
              [max]="store.decision()?.max ?? 99"
              [value]="amountValues()[0] ?? 0"
              (input)="setAmountAt(0, $event)"
            />
            <app-confirm-cancel
              (confirm)="store.setAmount(amountValues()[0] ?? 0)"
              (cancel)="store.cancel()"
            />
          </div>
        }
      }
    }
  `,
  styles: `
    .controls.multi {
      flex-direction: column;
      align-items: stretch;
    }

    .hint {
      margin: 0;
      color: var(--muted);
      font-size: 0.7rem;
    }

    .hint.invalid {
      color: var(--danger);
    }

    .amount-label {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.72rem;
    }
  `,
})
export class AmountPromptComponent {
  protected readonly store = inject(GameStore);

  protected readonly kind = computed(() => this.store.decision()?.kind);

  protected readonly isSingleAmount = computed(() => {
    const k = this.kind();
    return k === 'GAME_PLAY_XMANA' || k === 'GAME_GET_AMOUNT';
  });

  private readonly amountDefaults = computed(() => {
    const p = this.store.decision();
    if (!p) return [];
    if (p.kind === 'GAME_GET_MULTI_AMOUNT') return p.amounts.map((a) => a.defaultValue);
    if (p.kind === 'GAME_PLAY_XMANA' || p.kind === 'GAME_GET_AMOUNT') return [p.min ?? 0];
    return [];
  });

  protected readonly amountTotalValid = computed(() => {
    const p = this.store.decision();
    if (!p || p.kind !== 'GAME_GET_MULTI_AMOUNT') return true;
    const values = this.amountValues();
    if (values.length !== p.amounts.length) return false;
    const total = values.reduce((sum, value) => sum + value, 0);
    if (p.min !== undefined && total < p.min) return false;
    if (p.max !== undefined && total > p.max) return false;
    return p.amounts.every(
      (amount, index) => values[index] >= amount.min && values[index] <= amount.max,
    );
  });

  protected readonly amountTotalHint = computed(() => {
    const p = this.store.decision();
    if (!p || p.kind !== 'GAME_GET_MULTI_AMOUNT') return '';
    const total = this.amountValues().reduce((sum, value) => sum + value, 0);
    const range = p.min === p.max ? `${p.min}` : `${p.min ?? 0}–${p.max ?? 0}`;
    return `total: ${total} (need ${range})`;
  });

  protected readonly amountValues = signal<number[]>([]);

  constructor() {
    effect(() => this.amountValues.set(this.amountDefaults()));
  }

  protected setAmountAt(index: number, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.amountValues.update((values) => {
      const next = values.slice();
      next[index] = Number.isFinite(value) ? value : 0;
      return next;
    });
  }

  protected clean(text: string | undefined): string {
    return text ? stripTags(text) : '';
  }
}
