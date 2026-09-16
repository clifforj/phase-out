import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { LogoComponent } from '../ui/logo.component';
import { SiteFooterComponent } from '../ui/site-footer.component';

const LAST_UPDATED = '11 September 2026';

@Component({
  selector: 'app-privacy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LogoComponent, SiteFooterComponent],
  template: `
    <div class="void-page">
      <nav class="topbar">
        <a routerLink="/" class="brand" aria-label="Home">
          <app-logo [size]="34" />
        </a>
      </nav>

      <main class="page-column">
        <article class="panel panel-flat">
          <h1>Privacy Policy</h1>
          <p class="updated">Last updated {{ lastUpdated }}</p>

          <p>
            Phase Out ("this site") is a small, unofficial, non-commercial fan project for playing
            Commander (Magic: The Gathering) online with people you invite. This page covers what it
            collects, why, and how to get it deleted. There is no advertising and nothing here is
            sold or shared with data brokers.
          </p>

          <h2>What is collected</h2>
          <ul>
            <li>
              <strong>Sign-in identity.</strong> Signing in uses Google Sign-In; Google shares your
              name, email address, and profile picture with this site's own server, which verifies
              it and issues a session directly; no separate auth provider is involved. This site's
              own server never sees your Google password.
            </li>
            <li>
              <strong>Account data.</strong> A player handle, display name, and account id are
              stored against your sign-in so the site can recognize you across visits.
            </li>
            <li>
              <strong>Decks.</strong> Any deck lists you save or import are stored against your
              account.
            </li>
            <li>
              <strong>Game activity.</strong> While a game is in progress, other players at the
              table can see your player name and your plays, the same as in an in-person game. Game
              state is not retained once a match ends.
            </li>
            <li>
              <strong>Local storage.</strong> A signed session ticket and a few display preferences
              (e.g. board settings) are kept in your browser's local storage. Nothing here is a
              tracking or advertising cookie.
            </li>
          </ul>

          <h2>What is not collected</h2>
          <p>
            No analytics or advertising trackers run on this site, and no payment information is
            collected; there is nothing to buy here.
          </p>

          <h2>Third parties</h2>
          <p>
            Besides Google (sign-in), this site loads card images from
            <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>'s public CDN
            and fonts from Google Fonts as the page loads. Those requests go straight from your
            browser to those services and are subject to their own privacy policies.
          </p>

          <h2>Data deletion</h2>
          <p>
            To delete your account and everything stored against it (decks included), email
            <a href="mailto:{{ contactEmail }}">{{ contactEmail }}</a> from the address you signed
            in with, or the request will need another way to confirm it's you.
          </p>

          <h2>Changes</h2>
          <p>
            If this policy changes in a way that matters, the "last updated" date above will move
            and, where practical, signed-in users will be told.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy or your data:
            <a href="mailto:{{ contactEmail }}">{{ contactEmail }}</a>
          </p>
        </article>
      </main>

      <app-site-footer />
    </div>
  `,
  styles: `
    .topbar {
      padding: 14px 32px;
    }

    .brand {
      display: flex;
      width: fit-content;
    }

    article.panel {
      max-width: 720px;
      margin: 8px auto 0;
      padding: 40px 44px 48px;
    }

    h1 {
      margin: 0 0 4px;
      font-family: var(--font-display);
      font-size: 30px;
      color: var(--heading);
    }

    .updated {
      margin: 0 0 28px;
      color: var(--faint);
      font-size: 13px;
    }

    h2 {
      margin: 28px 0 10px;
      font-family: var(--font-display);
      font-size: 17px;
      color: var(--heading);
    }

    p,
    li {
      color: var(--dim);
      font-size: 14.5px;
      line-height: 1.6;
    }

    ul {
      margin: 0;
      padding-left: 20px;
    }

    li + li {
      margin-top: 10px;
    }

    a {
      color: var(--violet-soft);
    }

    a:hover {
      color: var(--fg);
    }

    @media (max-width: 640px) {
      .topbar {
        padding: 12px 18px;
      }

      article.panel {
        padding: 28px 22px 32px;
      }
    }
  `,
})
export class PrivacyComponent {
  protected readonly lastUpdated = LAST_UPDATED;
  protected readonly contactEmail = environment.contactEmail;
}
