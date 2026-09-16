import { Injectable, inject } from '@angular/core';
import { AuthStore } from './auth-store';

export const PLAYMAT_IMAGE_PATH = '/playmats';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const MAX_BYTES = 6 * 1024 * 1024;

export function playmatImageUrl(imageId: string): string {
  return `${PLAYMAT_IMAGE_PATH}/${imageId}`;
}

@Injectable({ providedIn: 'root' })
export class PlaymatImages {
  private readonly authStore = inject(AuthStore);

  async upload(file: File): Promise<string> {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new Error('playmats must be a PNG, JPEG, or WEBP image');
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`image is too large - the limit is ${MAX_BYTES / (1024 * 1024)} MB`);
    }

    const credential = this.authStore.credential();
    const headers: Record<string, string> = { 'Content-Type': file.type };
    if (credential && 'sessionToken' in credential) {
      headers['Authorization'] = `Bearer ${credential.sessionToken}`;
    }

    const response = await fetch(PLAYMAT_IMAGE_PATH, {
      method: 'POST',
      headers,
      body: file,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error ?? `upload failed (${response.status})`);
    }
    return body.id as string;
  }

  async fetchMine(): Promise<string | null> {
    const credential = this.authStore.credential();
    const headers: Record<string, string> = {};
    if (credential && 'sessionToken' in credential) {
      headers['Authorization'] = `Bearer ${credential.sessionToken}`;
    }
    try {
      const response = await fetch(PLAYMAT_IMAGE_PATH + '/mine', { headers });
      if (!response.ok) return null;
      const body = await response.json();
      return typeof body?.id === 'string' ? body.id : null;
    } catch {
      return null;
    }
  }
}
