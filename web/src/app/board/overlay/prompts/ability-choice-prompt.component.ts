import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../core/game-store';
import { stripTags } from '../../../rules/text-format';
import { ManaTextComponent } from '../../../ui/mana-symbol.component';
import { ConfirmCancelComponent } from './confirm-cancel.component';

@Component({
  selector: 'app-ability-choice-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent, ConfirmCancelComponent],
  styleUrls: ['./prompt-controls.css'],
  template: `
    @switch (kind()) {
      @case ('GAME_ASK') {
        <app-confirm-cancel
          [confirmLabel]="clean(store.decision()?.okButtonText) || 'Yes'"
          [cancelLabel]="clean(store.decision()?.cancelButtonText) || 'No'"
          (confirm)="store.answer(true)"
          (cancel)="store.answer(false)"
        />
      }
      @case ('GAME_CHOOSE_ABILITY') {
        <div class="controls">
          @for (choice of abilityChoices(); track choice.key) {
            <button type="button" (click)="store.chooseAbility(choice.key)">
              <app-mana-text [text]="choice.label" />
            </button>
          }
          <button type="button" class="secondary" (click)="store.cancel()">cancel</button>
        </div>
      }
      @case ('GAME_CHOOSE_CHOICE') {
        @if (choiceListOverflow()) {
          <div class="controls">
            <button type="button" class="secondary" (click)="store.choiceListOpen.set(true)">
              browse {{ choiceList().length }} choices
            </button>
          </div>
        } @else {
          <div class="controls">
            @for (choice of choiceList(); track choice.key) {
              <button type="button" (click)="store.chooseValue(choice.key)">
                <app-mana-text [text]="clean(choice.label)" />
              </button>
            }
          </div>
        }
      }
      @case ('GAME_CHOOSE_PILE') {
        <div class="controls">
          <button type="button" (click)="store.answer(true)">
            pile 1 ({{ pileCounts()[0] }} card{{ pileCounts()[0] === 1 ? '' : 's' }})
          </button>
          <button type="button" (click)="store.answer(false)">
            pile 2 ({{ pileCounts()[1] }} card{{ pileCounts()[1] === 1 ? '' : 's' }})
          </button>
        </div>
      }
    }
  `,
})
export class AbilityChoicePromptComponent {
  protected readonly store = inject(GameStore);

  protected readonly kind = computed(() => this.store.decision()?.kind);

  protected readonly pileCounts = computed((): [number, number] => {
    const p = this.store.decision();
    return [p?.cards.length ?? 0, p?.cards2.length ?? 0];
  });

  protected readonly choiceList = computed(() => this.store.decision()?.choices ?? []);

  private static readonly CHOICE_LIST_THRESHOLD = 8;

  protected readonly choiceListOverflow = computed(
    () => this.choiceList().length > AbilityChoicePromptComponent.CHOICE_LIST_THRESHOLD,
  );

  protected readonly abilityChoices = computed(() =>
    (this.store.decision()?.choices ?? []).map((choice) => ({
      key: choice.key,
      label: this.clean(choice.label).replace(/^\d+\.\s+/, ''),
    })),
  );

  protected clean(text: string | undefined): string {
    return text ? stripTags(text) : '';
  }
}
