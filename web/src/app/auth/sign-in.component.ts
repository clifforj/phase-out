import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../core/auth-store';
import { GameStore } from '../core/game-store';
import { GoogleIdentityLoader } from '../core/google-identity';
import { LogoComponent } from '../ui/logo.component';
import { VoidSceneComponent } from '../ui/void-scene.component';

@Component({
  selector: 'app-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent, VoidSceneComponent, RouterLink],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.css',
})
export class SignInComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(GameStore);
  private readonly googleIdentity = inject(GoogleIdentityLoader);

  private readonly buttonHost = viewChild<ElementRef<HTMLElement>>('googleButton');
  protected readonly loadError = signal<string | null>(null);

  private rendered = false;

  constructor() {
    effect(() => {
      const host = this.buttonHost()?.nativeElement;
      const clientId = this.auth.googleClientId();
      if (this.rendered || !host || !clientId) return;
      this.rendered = true;

      this.googleIdentity
        .load()
        .then((google) => {
          google.accounts.id.initialize({
            client_id: clientId,

            callback: (response) => this.store.loginWithGoogleToken(response.credential),

            use_fedcm_for_prompt: true,

            auto_select: false,
          });
          google.accounts.id.renderButton(host, {
            type: 'standard',

            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',

            width: 304,
          });
        })
        .catch((error: unknown) => this.loadError.set(String(error)));
    });
  }
}
