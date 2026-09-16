import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="mark" [style.--logo-size.px]="size()" aria-hidden="true">
      <span class="ring"></span>
    </span>
  `,
  styles: `
    :host {
      display: flex;
      flex: none;
    }

    .mark {
      position: relative;
      display: block;
      width: var(--logo-size);
      height: var(--logo-size);
      border-radius: 50%;
    }

    .ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(
        from 92deg,
        oklch(0.62 0.29 287),
        oklch(0.7 0.14 55) 40%,
        oklch(0.45 0.14 240) 65%,
        oklch(0.62 0.29 287)
      );
      box-shadow: 0 0 calc(var(--logo-size) * 0.34) oklch(0.62 0.29 287 / 45%);

      mask-image: radial-gradient(
        circle,
        transparent calc(var(--logo-size) * 0.34 * var(--logo-hole-scale, 1)),
        black calc(var(--logo-size) * 0.36 * var(--logo-hole-scale, 1))
      );
      -webkit-mask-image: radial-gradient(
        circle,
        transparent calc(var(--logo-size) * 0.34 * var(--logo-hole-scale, 1)),
        black calc(var(--logo-size) * 0.36 * var(--logo-hole-scale, 1))
      );
      animation: logo-spin 90s linear infinite;
    }

    @keyframes logo-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ring {
        animation: none;
      }
    }
  `,
})
export class LogoComponent {
  readonly size = input(34);
}
