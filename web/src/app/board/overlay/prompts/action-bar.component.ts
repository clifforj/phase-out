import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GameStore, PASS_AHEAD_ACTIONS } from '../../../core/game-store';
import { AbilityChoicePromptComponent } from './ability-choice-prompt.component';
import { AmountPromptComponent } from './amount-prompt.component';
import { stripTags } from '../../../rules/text-format';
import { ManaPromptComponent } from './mana-prompt.component';
import { ManaTextComponent } from '../../../ui/mana-symbol.component';
import { promptContext } from '../../../rules/prompt-actions';
import { TargetPromptComponent } from './target-prompt.component';

@Component({
  selector: 'app-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ManaTextComponent,
    TargetPromptComponent,
    AbilityChoicePromptComponent,
    AmountPromptComponent,
    ManaPromptComponent,
  ],
  styleUrls: ['./prompt-controls.css'],
  template: `
    @if (store.role() === 'player') {
      <div class="bar" [class.active]="store.needsAction()">
        @let p = store.decision();
        @if (!p) {
          <p class="waiting">{{ waitingOn() }}</p>
          @if (store.autoPassing()) {
            <p class="hint">nothing to respond with - passing…</p>
          }

          @if (store.autoPaying()) {
            <p class="hint">paying the cost…</p>
          }
          @if (store.activeSkip(); as skip) {
            <p class="hint">
              {{ skip === 'endOfTurn' ? 'skipping to end of turn' : 'skipping to my next turn' }}…
            </p>
            <div class="controls">
              <button type="button" class="secondary" (click)="cancelSkip()">
                take priority back
              </button>
            </div>
          }
        } @else {
          <p class="headline">{{ headline() }}</p>
          @if (messageText(); as message) {
            <p class="message"><app-mana-text [text]="message" /></p>
          }
          @if (subject(); as subject) {
            <p class="subject">
              for <strong><app-mana-text [text]="subject" /></strong>
            </p>
          }

          @switch (p.kind) {
            @case ('GAME_SELECT') {
              <app-target-prompt />
            }
            @case ('GAME_PLAY_MANA') {
              @if (!autoPayShownElsewhere()) {
                <app-mana-prompt />
              }
            }
            @case ('GAME_ASK') {
              <app-ability-choice-prompt />
            }
            @case ('GAME_TARGET') {
              <app-target-prompt />
            }
            @case ('GAME_CHOOSE_ABILITY') {
              <app-ability-choice-prompt />
            }
            @case ('GAME_CHOOSE_CHOICE') {
              <app-ability-choice-prompt />
            }
            @case ('GAME_CHOOSE_PILE') {
              <app-ability-choice-prompt />
            }
            @case ('GAME_PLAY_XMANA') {
              <app-amount-prompt />
            }
            @case ('GAME_GET_AMOUNT') {
              <app-amount-prompt />
            }
            @case ('GAME_GET_MULTI_AMOUNT') {
              <app-amount-prompt />
            }
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    @property --void-angle {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }

    .bar {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      min-width: 16rem;
      max-width: 100%;
      padding: 1rem 1.1rem;
      border: 1px solid var(--line-panel);
      border-radius: var(--radius-panel);

      background: rgb(16 16 20 / 74%);
      backdrop-filter: blur(16px) saturate(150%);
      box-shadow: var(--shadow-panel);
      pointer-events: auto;
    }

    .bar::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 0;
      padding: 1.5px;
      border-radius: inherit;
      background: conic-gradient(
        from var(--void-angle),
        oklch(0.62 0.19 291 / 90%),
        oklch(0.7 0.14 55 / 80%) 33%,
        oklch(0.65 0.15 240 / 85%) 66%,
        oklch(0.62 0.19 291 / 90%)
      );
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0;
      transition: opacity 250ms ease;
      animation: void-angle-spin 5s linear infinite;
      animation-play-state: paused;
      pointer-events: none;
    }

    .bar.active::before {
      opacity: 1;
      animation-play-state: running;
    }

    .bar > * {
      position: relative;
      z-index: 1;
    }

    @keyframes void-angle-spin {
      to {
        --void-angle: 360deg;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bar::before {
        animation: none;
      }
    }

    .waiting {
      margin: 0;
      color: var(--muted);
      font-size: 0.78rem;
    }

    .headline {
      margin: 0;
      font-family: var(--font-display);
      font-size: 0.9rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: var(--playable);
    }

    .message {
      margin: 0;
      font-size: 0.78rem;
    }

    .subject {
      margin: 0;
      color: var(--muted);
      font-size: 0.75rem;
    }

    .subject strong {
      color: var(--fg);
    }

    .hint {
      margin: 0;
      color: var(--muted);
      font-size: 0.7rem;
    }
  `,
})
export class ActionBarComponent {
  protected readonly store = inject(GameStore);

  readonly autoPayShownElsewhere = input(false);

  protected readonly context = computed(() => promptContext(this.store.decision()));

  protected readonly headline = computed(() => {
    switch (this.context()) {
      case 'declare-attackers':
        return 'Declare attackers';
      case 'declare-blockers':
        return 'Declare blockers';
      case 'priority':
        return 'Your priority';
      default:
        return promptLabel(this.store.decision()?.kind);
    }
  });

  protected readonly subject = computed(() => {
    const p = this.store.decision();
    const subject = this.clean(p?.secondMessage);
    if (!subject) return null;
    return this.clean(p?.message).includes(subject) ? null : subject;
  });

  protected readonly messageText = computed(() => {
    const message = this.clean(this.store.decision()?.message);
    if (!message) return null;
    const names = this.store.snapshot()?.players.map((player) => player.name) ?? [];
    return names.includes(message) ? null : message;
  });

  protected readonly waitingOn = computed(() => {
    const game = this.store.snapshot();
    if (!game) return 'waiting for the game…';

    if (this.store.watchState() === 'over') return 'this game is over';

    if (this.store.eliminated()) return 'you are out - watching the rest of the pod';
    const active = game.players.find((player) => player.isActive);
    if (active?.isMe) return 'your turn - waiting on the others…';
    const name = active?.name ?? game.activePlayerName;
    return name ? `${name}’s turn…` : 'waiting…';
  });

  protected clean(text: string | undefined): string {
    return text ? stripTags(text) : '';
  }

  protected cancelSkip(): void {
    this.store.playerAction(PASS_AHEAD_ACTIONS.cancel);
  }
}

function promptLabel(kind: string | undefined): string {
  switch (kind) {
    case 'GAME_ASK':
      return 'A question';
    case 'GAME_TARGET':
      return 'Choose targets';
    case 'GAME_CHOOSE_ABILITY':
      return 'Choose an ability';
    case 'GAME_CHOOSE_PILE':
      return 'Choose a pile';
    case 'GAME_CHOOSE_CHOICE':
      return 'Choose one';
    case 'GAME_PLAY_MANA':
      return 'Pay a cost';
    case 'GAME_PLAY_XMANA':
      return 'Choose X';
    case 'GAME_GET_AMOUNT':
    case 'GAME_GET_MULTI_AMOUNT':
      return 'Choose a number';
    default:
      return 'Waiting';
  }
}
