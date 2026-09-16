import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../core/game-store';
import type { ManaType } from '../../../core/protocol';
import { specialAction as computeSpecialAction } from '../../../rules/mana-special-action';
import { type ManaSymbol, manaSymbol } from '../../../rules/mana-symbol';
import {
  ManaCostComponent,
  ManaSymbolComponent,
  ManaTextComponent,
} from '../../../ui/mana-symbol.component';

const POOL_ENTRIES: {
  type: ManaType;

  symbol: ManaSymbol;
  get: (pool: { [k: string]: number }) => number;
}[] = [
  { type: 'WHITE', symbol: manaSymbol('W')!, get: (p) => p['white'] },
  { type: 'BLUE', symbol: manaSymbol('U')!, get: (p) => p['blue'] },
  { type: 'BLACK', symbol: manaSymbol('B')!, get: (p) => p['black'] },
  { type: 'RED', symbol: manaSymbol('R')!, get: (p) => p['red'] },
  { type: 'GREEN', symbol: manaSymbol('G')!, get: (p) => p['green'] },
  { type: 'COLORLESS', symbol: manaSymbol('C')!, get: (p) => p['colorless'] },
];

@Component({
  selector: 'app-mana-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaCostComponent, ManaSymbolComponent, ManaTextComponent],
  styleUrls: ['./prompt-controls.css'],
  template: `
    <div class="controls">
      @if (store.manaPaymentPlan()) {
        <button
          type="button"
          class="primary"
          [title]="autoPayTitle()"
          (click)="store.autoPayMana()"
        >
          <span>auto-pay</span><app-mana-cost [cost]="store.unpaidManaCost()" />
        </button>
      }
      @for (entry of poolEntries(); track entry.type) {
        <button
          type="button"
          class="pool"
          [title]="'pay ' + entry.type.toLowerCase() + ' from pool'"
          (click)="store.payManaFromPool(entry.type)"
        >
          <app-mana-symbol [symbol]="entry.symbol" />{{ entry.count }}
        </button>
      }
      @if (specialAction(); as special) {
        <button type="button" class="special" [title]="special.title" (click)="store.special()">
          <app-mana-text [text]="special.label" />
        </button>
      }
      <button type="button" class="secondary" (click)="store.cancel()">cancel</button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    button.primary {
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
    }

    button.primary span {
      display: inline-block;
    }

    button.primary span::first-letter {
      text-transform: uppercase;
    }

    button.pool {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.3rem 0.5rem;
      font-size: 0.7rem;
    }

    button.secondary {
      border-color: transparent;
      background: transparent;
    }

    button.secondary:hover:not(:disabled) {
      background: var(--glass-hover);
    }

    button.special {
      border-color: var(--commander);
      color: var(--commander);
    }
  `,
})
export class ManaPromptComponent {
  protected readonly store = inject(GameStore);

  protected readonly poolEntries = computed(() => {
    const game = this.store.snapshot();
    const me = game?.players.find((player) => player.isMe);
    if (!me) return [];
    const pool: Record<string, number> = {
      white: me.manaPool.white,
      blue: me.manaPool.blue,
      black: me.manaPool.black,
      red: me.manaPool.red,
      green: me.manaPool.green,
      colorless: me.manaPool.colorless,
    };
    return POOL_ENTRIES.map((entry) => ({
      type: entry.type,
      symbol: entry.symbol,
      count: entry.get(pool),
    })).filter((entry) => entry.count > 0);
  });

  protected readonly specialAction = computed(() => computeSpecialAction(this.store));

  protected readonly autoPayTitle = computed(() => {
    const plan = this.store.manaPaymentPlan();
    if (!plan?.length) return '';
    return `pay the whole cost: ${plan.map((step) => step.label).join(', ')}`;
  });
}
