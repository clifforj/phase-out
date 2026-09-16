import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-game-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'result' },
  template: `
    <h2>Game over</h2>
    @if (text(); as text) {
      <p class="verdict">{{ text }}</p>
    }
    @if (matchInfo(); as info) {
      <p class="muted">{{ info }}</p>
    }
    <p class="muted">The table behind this is the final state.</p>
    <button type="button" class="dismiss" (click)="dismiss.emit()">look at the board</button>
  `,
  styles: `
    :host {
      position: absolute;
      top: calc((100% - var(--hand-space)) / 2);
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      align-items: center;
      width: min(26rem, calc(100vw - 2rem));
      padding: 1rem 1.2rem 1.1rem;
      border: 1px solid var(--commander);
      border-radius: var(--radius-modal);
      background:
        linear-gradient(160deg, oklch(0.7 0.14 55 / 18%), transparent 60%), rgb(20 19 26 / 56%);
      backdrop-filter: blur(28px) saturate(170%);
      text-align: center;
      pointer-events: auto;
      z-index: 3;
      box-shadow: var(--shadow-modal);
    }

    h2 {
      margin: 0;
      color: var(--commander);
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    p {
      margin: 0;
      font-size: 0.8rem;
    }

    .verdict {
      font-weight: 600;
    }

    .muted {
      color: var(--muted);
      font-size: 0.72rem;
    }

    .dismiss {
      margin-top: 0.6rem;
      padding: 0.35rem 1rem;
      border: 1px solid var(--commander);
      border-radius: var(--radius-pill);
      background: none;
      color: var(--commander);
      font: inherit;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
    }

    .dismiss:hover {
      background: color-mix(in srgb, var(--commander) 18%, transparent);
    }
  `,
})
export class GameResultComponent {
  readonly text = input<string | null | undefined>(null);
  readonly matchInfo = input<string | null | undefined>(null);
  readonly dismiss = output<void>();
}
