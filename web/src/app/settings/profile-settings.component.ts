import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthStore } from '../core/auth-store';
import { GameStore } from '../core/game-store';
import { Preferences } from '../core/preferences';
import { AVATAR_HUES, accentHueFor } from '../ui/accents';
import { AvatarComponent } from '../ui/avatar.component';
import { PlaymatSettingsComponent } from './playmat-settings.component';

@Component({
  selector: 'app-profile-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, PlaymatSettingsComponent],
  templateUrl: './profile-settings.component.html',
  styleUrls: ['./settings-field.css', './profile-settings.component.css'],
})
export class ProfileSettingsComponent {
  protected readonly prefs = inject(Preferences);
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(GameStore);
  protected readonly hues = AVATAR_HUES;

  protected readonly playerName = computed(
    () => this.auth.account()?.playerName ?? this.store.userName() ?? '…',
  );
  protected readonly email = computed(() => this.auth.account()?.email ?? null);

  protected readonly avatarName = computed(
    () => this.auth.account()?.displayName ?? this.playerName(),
  );

  protected readonly activeHue = computed(
    () => this.prefs.avatarHue() ?? accentHueFor(this.playerName()),
  );

  protected readonly editedPlayerName = signal<string | null>(null);
  protected readonly playerNameField = computed(() => this.editedPlayerName() ?? this.playerName());

  protected savePlayerName(): void {
    const value = this.editedPlayerName();
    this.editedPlayerName.set(null);
    if (value === null) return;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === this.playerName()) return;
    this.store.setPlayerName(trimmed);
  }
}
