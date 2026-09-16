import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GameStore } from '../../core/game-store';
import { ManaCostComponent } from '../../ui/mana-symbol.component';
import { ManaPromptComponent } from './prompts/mana-prompt.component';

@Component({
  selector: 'app-cost-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaCostComponent, ManaPromptComponent],
  templateUrl: './cost-tag.component.html',
  styleUrl: './cost-tag.component.css',
  host: {
    '[style.left.px]': 'left()',
    '[style.top.px]': 'top()',
  },
})
export class CostTagComponent {
  protected readonly store = inject(GameStore);

  readonly spellName = input.required<string>();
  readonly left = input.required<number>();
  readonly top = input.required<number>();
}
