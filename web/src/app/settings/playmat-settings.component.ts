import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CUSTOM_PLAYMAT_PREFIX, PLAYER_MATS } from '../core/player-mats';
import { PlaymatImages, playmatImageUrl } from '../core/playmat-images';
import { Preferences } from '../core/preferences';

@Component({
  selector: 'app-playmat-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './playmat-settings.component.html',
  styleUrls: ['./settings-field.css', './playmat-settings.component.css'],
})
export class PlaymatSettingsComponent {
  protected readonly prefs = inject(Preferences);
  private readonly playmatImages = inject(PlaymatImages);
  protected readonly playerMats = PLAYER_MATS;

  protected readonly uploadedPlaymatUrl = computed(() => {
    const id = this.prefs.uploadedPlaymatImageId();
    return id !== null ? playmatImageUrl(id) : null;
  });

  protected readonly customPlaymatSelected = computed(() => {
    const id = this.prefs.uploadedPlaymatImageId();
    return id !== null && this.prefs.playmatId() === `${CUSTOM_PLAYMAT_PREFIX}${id}`;
  });
  protected readonly playmatUploading = signal(false);
  protected readonly playmatUploadError = signal<string | null>(null);

  constructor() {
    this.playmatImages.fetchMine().then((id) => {
      if (id !== null) this.prefs.uploadedPlaymatImageId.set(id);
    });
  }

  protected async onPlaymatFileChosen(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.playmatUploadError.set(null);
    this.playmatUploading.set(true);
    try {
      const imageId = await this.playmatImages.upload(file);
      this.prefs.uploadedPlaymatImageId.set(imageId);
      this.prefs.playmatId.set(`${CUSTOM_PLAYMAT_PREFIX}${imageId}`);
    } catch (error) {
      this.playmatUploadError.set(error instanceof Error ? error.message : 'upload failed');
    } finally {
      this.playmatUploading.set(false);
    }
  }

  protected selectUploadedPlaymat(): void {
    const id = this.prefs.uploadedPlaymatImageId();
    if (id !== null) this.prefs.playmatId.set(`${CUSTOM_PLAYMAT_PREFIX}${id}`);
  }
}
