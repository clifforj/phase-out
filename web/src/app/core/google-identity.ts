import { Injectable } from '@angular/core';

export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

export interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;

    use_fedcm_for_prompt?: boolean;

    auto_select?: boolean;

    nonce?: string;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void;
  disableAutoSelect(): void;
}

export interface GoogleIdentity {
  accounts: { id: GoogleAccountsId };
}

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

@Injectable({ providedIn: 'root' })
export class GoogleIdentityLoader {
  private loading: Promise<GoogleIdentity> | null = null;

  load(): Promise<GoogleIdentity> {
    if (this.loading) return this.loading;

    this.loading = new Promise<GoogleIdentity>((resolve, reject) => {
      const existing = (globalThis as { google?: GoogleIdentity }).google;
      if (existing?.accounts?.id) {
        resolve(existing);
        return;
      }

      const script = document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const google = (globalThis as { google?: GoogleIdentity }).google;
        if (google?.accounts?.id) resolve(google);
        else
          reject(
            new Error('the Google Identity script loaded but did not define google.accounts.id'),
          );
      };
      script.onerror = () => reject(new Error(`could not load ${GIS_SCRIPT_URL}`));
      document.head.appendChild(script);
    });

    return this.loading;
  }
}
