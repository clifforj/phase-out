import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-void-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scene">
      <div class="ring-outer" aria-hidden="true"></div>
      <div class="ring-inner" aria-hidden="true"></div>
      <div class="core" aria-hidden="true"></div>

      <div class="card" [class.wide]="wide()">
        <ng-content />
      </div>

      <div class="copyright">
        <span>
          Phase Out is unofficial Fan Content permitted under the Fan Content Policy. Not
          approved/endorsed by Wizards. Portions of the materials used are property of Wizards of
          the Coast. &copy;Wizards of the Coast LLC.
        </span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .scene {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 100vh;
      padding: 24px;
      background: var(--void-deep);
      overflow: hidden;
    }

    .ring-outer,
    .ring-inner,
    .core {
      position: absolute;
      border-radius: 50%;
    }

    .ring-outer {
      width: 920px;
      height: 920px;
      background: conic-gradient(
        from 0deg,
        oklch(0.6 0.17 291 / 50%),
        transparent 25%,
        oklch(0.68 0.15 55 / 45%) 50%,
        transparent 75%,
        oklch(0.6 0.17 291 / 50%)
      );
      filter: blur(90px);
      animation: void-spin 46s linear infinite;
    }

    .ring-inner {
      width: 560px;
      height: 560px;
      background: conic-gradient(
        from 90deg,
        transparent,
        oklch(0.65 0.15 240 / 35%),
        transparent 60%
      );
      filter: blur(70px);
      animation: void-spin-rev 32s linear infinite;
    }

    .core {
      width: 280px;
      height: 280px;
      background: radial-gradient(circle, #000 0%, #000 42%, transparent 72%);
      box-shadow: 0 0 140px 46px oklch(0.6 0.17 291 / 32%);
      animation: void-pulse 6s ease-in-out infinite;
    }

    .card {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 26px;
      align-items: center;
      width: 380px;
      max-width: 100%;
      padding: 44px 38px;
      border: 1px solid var(--line-input);
      border-radius: var(--radius-modal);
      background: var(--glass);
      text-align: center;
      backdrop-filter: blur(26px) saturate(150%);
      box-shadow: 0 24px 70px rgb(0 0 0 / 55%);
    }

    .card.wide {
      width: 640px;
      text-align: left;
    }

    .copyright {
      position: absolute;
      right: 24px;
      bottom: 22px;
      left: 24px;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
      color: oklch(0.45 0.02 264);
      font-size: 11.5px;
      text-align: center;
    }

    @keyframes void-spin {
      from {
        transform: rotate(0deg);
      }

      to {
        transform: rotate(360deg);
      }
    }

    @keyframes void-spin-rev {
      from {
        transform: rotate(0deg);
      }

      to {
        transform: rotate(-360deg);
      }
    }

    @keyframes void-pulse {
      0%,
      100% {
        opacity: 0.45;
        transform: scale(1);
      }

      50% {
        opacity: 0.7;
        transform: scale(1.06);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ring-outer,
      .ring-inner,
      .core {
        animation: none;
      }
    }
  `,
})
export class VoidSceneComponent {
  readonly wide = input(false);
}
