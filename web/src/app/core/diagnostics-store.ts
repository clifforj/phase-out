import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  level: 'INFO' | 'ERROR';
  title?: string;
  text: string;
}

const TOAST_MS = { INFO: 6_000, ERROR: 20_000 };

@Injectable({ providedIn: 'root' })
export class DiagnosticsStore {
  readonly toasts = signal<Toast[]>([]);
  readonly unmapped = signal<{ callbackMethod: string; payloadClass?: string; count: number }[]>(
    [],
  );
  readonly failures = signal<{ action?: string; reason: string }[]>([]);

  private nextToastId = 1;

  reportFailure(action: string | undefined, reason: string): void {
    this.failures.update((all) => [...all.slice(-49), { action, reason }]);
  }

  reportUnmapped(callbackMethod: string, payloadClass: string | undefined): void {
    this.unmapped.update((all) => {
      const existing = all.find((u) => u.callbackMethod === callbackMethod);
      if (existing) {
        return all.map((u) =>
          u.callbackMethod === callbackMethod ? { ...u, count: u.count + 1 } : u,
        );
      }
      return [...all, { callbackMethod, payloadClass, count: 1 }];
    });
  }

  toast(level: 'INFO' | 'ERROR', text: string, title?: string): void {
    const id = this.nextToastId++;
    this.toasts.update((all) => [...all, { id, level, text, title }]);
    setTimeout(() => this.dismissToast(id), TOAST_MS[level]);
  }

  dismissToast(id: number): void {
    this.toasts.update((all) => all.filter((t) => t.id !== id));
  }
}
