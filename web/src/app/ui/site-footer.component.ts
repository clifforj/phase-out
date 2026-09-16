import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from './logo.component';

@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent, RouterLink],
  template: `
    <footer [style.--footer-width.px]="width()">
      <div class="inner">
        <p class="disclaimer">
          Phase Out is unofficial Fan Content permitted under the Fan Content Policy. Not
          approved/endorsed by Wizards. Portions of the materials used are property of Wizards of
          the Coast. &copy;Wizards of the Coast LLC.
        </p>
        <app-logo [size]="22" />
        <div class="footer-links">
          <a routerLink="/privacy">Privacy</a>
        </div>
      </div>
    </footer>
  `,
  styles: `
    footer {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
    }

    .inner {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 12px 20px;
      align-items: center;
      max-width: var(--footer-width);
      margin: 0 auto;
      padding: 28px 32px 36px;
      border-top: 1px solid var(--line);
    }

    app-logo {
      justify-self: center;
      opacity: 0.8;

      --logo-hole-scale: 0.8;
    }

    .disclaimer {
      margin: 0;
      color: oklch(0.55 0.02 264);
      font-size: 11.5px;
      text-align: left;
    }

    .footer-links {
      display: flex;
      justify-self: end;
      gap: 20px;
    }

    .footer-links a {
      color: oklch(0.55 0.02 264);
      font-size: 12px;
    }

    .footer-links a:hover {
      color: var(--muted);
    }

    @media (max-width: 640px) {
      .inner {
        grid-template-columns: 1fr;
        justify-items: center;
        padding: 24px 18px 28px;
        text-align: center;
      }

      .footer-links {
        justify-self: center;
      }
    }
  `,
})
export class SiteFooterComponent {
  readonly width = input(1080);
}
