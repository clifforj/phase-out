import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  type ManaSymbol,
  manaSymbolSvgUrl,
  parseManaCost,
  splitManaText,
} from '../rules/mana-symbol';

@Component({
  selector: 'app-mana-symbol',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = symbol();
    <img [src]="url(s)" [attr.alt]="s.label" [title]="s.label" />
  `,
  styles: `
    :host {
      display: inline-block;
      width: 1em;
      height: 1em;

      vertical-align: -0.14em;
      flex-shrink: 0;
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class ManaSymbolComponent {
  readonly symbol = input.required<ManaSymbol>();

  protected url(symbol: ManaSymbol): string {
    return manaSymbolSvgUrl(symbol.code);
  }
}

@Component({
  selector: 'app-mana-cost',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaSymbolComponent],
  template: `
    @for (symbol of symbols(); track $index) {
      <app-mana-symbol [symbol]="symbol" />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.1em;

      flex-shrink: 0;
      white-space: nowrap;
    }
  `,
})
export class ManaCostComponent {
  readonly cost = input<string | undefined>();
  readonly symbols = computed(() => parseManaCost(this.cost()));
}

@Component({
  selector: 'app-mana-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaSymbolComponent],
  template: `
    @for (run of runs(); track $index) {
      @if (run.symbol) {
        <app-mana-symbol [symbol]="run.symbol" />
      } @else {
        <span>{{ run.text }}</span>
      }
    }
  `,
  styles: `
    :host {
      display: inline;
    }
  `,
})
export class ManaTextComponent {
  readonly text = input<string>('');
  readonly runs = computed(() => splitManaText(this.text()));
}
