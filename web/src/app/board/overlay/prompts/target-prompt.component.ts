import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore, PASS_AHEAD_ACTIONS } from '../../../core/game-store';
import { stripTags } from '../../../rules/text-format';
import { specialAction as computeSpecialAction } from '../../../rules/mana-special-action';
import { ManaTextComponent } from '../../../ui/mana-symbol.component';
import {
  TARGET_LIST_THRESHOLD,
  boardTargets,
  declaredCombatants,
  promptContext,
  zoneTargetCount,
} from '../../../rules/prompt-actions';

@Component({
  selector: 'app-target-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent],
  styleUrls: ['./prompt-controls.css'],
  template: `
    @if (kind() === 'GAME_SELECT') {
      @if (contextHint(); as hint) {
        <p class="hint">{{ hint }}</p>
      }

      @if (declared().length) {
        <div class="controls targets">
          @for (one of declared(); track one.id) {
            <button
              type="button"
              class="target chosen"
              [title]="
                'press to take this ' +
                (context() === 'declare-attackers' ? 'attack' : 'block') +
                ' back'
              "
              (click)="store.activate(one.id)"
            >
              <span class="target-name">{{ one.label }}</span>
              <span class="target-detail">{{ againstLabel() }} {{ one.against }} - remove</span>
            </button>
          }
        </div>
      }
      <div class="controls">
        @if (specialAction(); as special) {
          <button type="button" class="special" [title]="special.title" (click)="store.special()">
            <app-mana-text [text]="special.label" />
          </button>
        }
        <button type="button" class="primary" (click)="store.passPriority()">
          {{ passLabel() }}
        </button>
      </div>
      @if (context() === 'priority') {
        <div class="controls skip-ahead">
          <button type="button" class="secondary" (click)="skipToEndOfTurn()">
            skip to end of turn
          </button>
          <button type="button" class="secondary" (click)="skipToMyNextTurn()">
            pass to my next turn
          </button>
        </div>
      }
    } @else if (kind() === 'GAME_TARGET') {
      @if (permanentTargetsOverflow()) {
        <div class="controls">
          <button type="button" class="secondary" (click)="store.targetListOpen.set(true)">
            browse {{ permanentTargets().length }} more legal
            {{ permanentTargets().length === 1 ? 'target' : 'targets' }}
          </button>
        </div>
      } @else if (permanentTargets().length) {
        <div class="controls targets">
          @for (target of permanentTargets(); track target.id) {
            <button
              type="button"
              class="target"
              [class.chosen]="target.chosen"
              [title]="target.chosen ? 'chosen - press again to unpick' : target.detail"
              (click)="store.chooseTarget(target.id)"
            >
              <span class="target-name">{{ target.label }}</span>
              <span class="target-detail">{{ target.detail }}</span>
            </button>
          }
        </div>
      }
      @if (playerTargets().length) {
        <div class="controls targets">
          @for (target of playerTargets(); track target.id) {
            <button
              type="button"
              class="target"
              [class.chosen]="target.chosen"
              [title]="target.chosen ? 'chosen - press again to unpick' : target.detail"
              (click)="store.chooseTarget(target.id)"
            >
              <span class="target-name">{{ target.label }}</span>
              <span class="target-detail">{{ target.detail }}</span>
            </button>
          }
        </div>
      }
      <p class="hint">{{ targetHint() }}</p>
      <div class="controls">
        <button
          type="button"
          class="primary"
          [disabled]="store.decision()?.required"
          (click)="store.cancel()"
        >
          {{ targetButtonLabel() }}
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .controls.skip-ahead {
      margin-top: 0.15rem;
    }

    .controls.skip-ahead button {
      font-size: 0.68rem;
      color: var(--muted);
    }

    .controls.targets {
      flex-direction: column;
      align-items: stretch;
      gap: 0.3rem;
      max-height: 14rem;
      overflow-y: auto;
      padding-right: 0.15rem;
    }

    .hint {
      margin: 0;
      color: var(--muted);
      font-size: 0.7rem;
    }

    button.target {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.15rem;
      border-color: color-mix(in srgb, var(--fg) 45%, transparent);
      text-align: left;
    }

    button.target.chosen {
      border-color: var(--commander);
      color: var(--commander);
    }

    .target-detail {
      color: var(--muted);
      font-size: 0.66rem;
    }

    button.special {
      border-color: var(--commander);
      color: var(--commander);
    }
  `,
})
export class TargetPromptComponent {
  protected readonly store = inject(GameStore);

  protected readonly kind = computed(() => this.store.decision()?.kind);

  protected readonly context = computed(() => promptContext(this.store.decision()));

  protected readonly declared = computed(() =>
    declaredCombatants(this.context(), this.store.snapshot()),
  );

  protected readonly passLabel = computed(() => {
    const count = this.declared().length;
    switch (this.context()) {
      case 'declare-attackers':
        return count ? `done - attack with ${creatures(count)}` : 'pass - attack with none';
      case 'declare-blockers':
        return count ? `done - block with ${creatures(count)}` : 'pass - block with none';
      default:
        return 'pass priority';
    }
  });

  protected readonly againstLabel = computed(() =>
    this.context() === 'declare-attackers' ? 'attacking' : 'blocking',
  );

  protected readonly boardTargets = computed(() =>
    boardTargets(this.store.decision(), this.store.snapshot()),
  );

  protected readonly playerTargets = computed(() => {
    const playerIds = new Set(
      (this.store.snapshot()?.players ?? []).map((player) => player.playerId),
    );
    return this.boardTargets().filter((target) => playerIds.has(target.id));
  });

  protected readonly permanentTargets = computed(() => {
    const playerIds = new Set(
      (this.store.snapshot()?.players ?? []).map((player) => player.playerId),
    );
    return this.boardTargets().filter((target) => !playerIds.has(target.id));
  });

  protected readonly permanentTargetsOverflow = computed(
    () => this.permanentTargets().length > TARGET_LIST_THRESHOLD,
  );

  protected readonly contextHint = computed(() => {
    const done = this.declared().length
      ? 'press done when you have them all'
      : 'or press pass to skip combat';
    switch (this.context()) {
      case 'declare-attackers':
        return `click a highlighted creature to attack, one at a time - ${done}. If your opponent has a planeswalker or a battle, you are then asked which to attack`;
      case 'declare-blockers':
        return `click a highlighted creature to block, one at a time - ${done}. You are then asked which attacker it blocks`;
      default:
        return null;
    }
  });

  protected readonly targetButtonLabel = computed(() => {
    const p = this.store.decision();
    if (!p) return 'done';
    if (p.cancelButtonText) return this.clean(p.cancelButtonText);
    return p.chosenTargets.length > 0 ? 'done' : 'cancel';
  });

  protected readonly targetHint = computed(() => {
    const p = this.store.decision();
    if (!p) return '';

    if (!p.selectableTargets.length && !p.cards.length) {
      return 'nothing on the board can be chosen for this - press cancel to go back';
    }
    const count = `${p.chosenTargets.length} chosen`;

    const inPiles = zoneTargetCount(p, this.store.snapshot());
    const how = [
      this.boardTargets().length
        ? 'press one above, or click a highlighted card'
        : 'click a highlighted card',
      inPiles ? `or open a marked graveyard/exile pile for ${inPiles} more` : '',
    ]
      .filter(Boolean)
      .join(', ');
    return p.required
      ? `${count} - ${how}; at least one more is required`
      : `${count} - ${how}, or press ${this.targetButtonLabel()} when finished`;
  });

  protected readonly specialAction = computed(() => computeSpecialAction(this.store));

  protected skipToEndOfTurn(): void {
    this.store.playerAction(PASS_AHEAD_ACTIONS.endOfTurn);
  }

  protected skipToMyNextTurn(): void {
    this.store.playerAction(PASS_AHEAD_ACTIONS.nextTurn);
  }

  private clean(text: string | undefined): string {
    return text ? stripTags(text) : '';
  }
}

function creatures(count: number): string {
  return `${count} creature${count === 1 ? '' : 's'}`;
}
