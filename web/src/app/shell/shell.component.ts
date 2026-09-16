import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '../core/auth-store';
import { GameStore } from '../core/game-store';
import { Preferences } from '../core/preferences';
import { AvatarComponent } from '../ui/avatar.component';
import { LogoComponent } from '../ui/logo.component';
import { PopoverDirective } from '../ui/popover.directive';
import { SiteFooterComponent } from '../ui/site-footer.component';

const NAV = [
  { path: '/', label: 'Home', exact: true },
  { path: '/decks', label: 'Decks', exact: false },
] as const;

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LogoComponent,
    SiteFooterComponent,
    AvatarComponent,
    PopoverDirective,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  protected readonly prefs = inject(Preferences);
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(GameStore);
  private readonly router = inject(Router);
  protected readonly nav = NAV;

  protected readonly menuOpen = signal(false);

  protected readonly name = computed(() => {
    const account = this.auth.account();
    return account?.playerName ?? account?.displayName ?? this.store.userName() ?? 'player';
  });

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly pageWidth = computed(() => (this.url().startsWith('/settings') ? 900 : 1080));

  constructor() {
    this.store.connect();
  }
}
