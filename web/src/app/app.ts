import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SignInComponent } from './auth/sign-in.component';
import { AuthStore } from './core/auth-store';
import { GameStore } from './core/game-store';
import { LogoComponent } from './ui/logo.component';
import { ToastListComponent } from './ui/toast-list.component';
import { VoidSceneComponent } from './ui/void-scene.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SignInComponent, VoidSceneComponent, LogoComponent, ToastListComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(GameStore);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly isPublicRoute = computed(() => this.url().startsWith('/privacy'));

  constructor() {
    // Connect before the sign-in gate can render the routed view.
    this.store.connect();

    effect(() => {
      const tableId = this.store.rejoinPrompt();
      if (!tableId) return;
      this.store.clearRejoinPrompt();
      void this.router.navigate(['/game', tableId]);
    });
  }
}
