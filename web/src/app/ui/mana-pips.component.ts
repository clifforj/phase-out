import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { deckColors } from '../core/protocol';
import type { DeckSummary } from '../core/protocol';

@Component({
  selector: 'app-mana-pips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pips" [style.--pip-size.px]="size()" [attr.aria-label]="label()">
      @for (color of pips(); track $index) {
        <span class="pip" [class]="'pip-' + color"></span>
      }
    </span>
  `,
  styles: `
    :host {
      display: flex;
      flex: none;
    }
  `,
})
export class ManaPipsComponent {
  readonly deck = input<DeckSummary | null>(null);
  readonly colors = input<readonly string[] | null>(null);
  readonly size = input(14);

  protected readonly pips = computed(() => {
    const explicit = this.colors();
    const colors = explicit
      ? [...'WUBRG'].filter((c) => explicit.includes(c))
      : deckColors(this.deck());
    return colors.length ? colors : ['C'];
  });

  protected readonly label = computed(() => {
    const names: Record<string, string> = {
      W: 'white',
      U: 'blue',
      B: 'black',
      R: 'red',
      G: 'green',
      C: 'colourless',
    };
    return this.pips()
      .map((color) => names[color])
      .join(', ');
  });
}
