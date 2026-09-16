import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Toast } from '../core/diagnostics-store';

@Component({
  selector: 'app-toast-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts">
      @for (toast of toasts(); track toast.id) {
        <div class="toast" [class]="'toast-' + toast.level.toLowerCase()">
          <button type="button" class="dismiss" (click)="dismiss.emit(toast.id)">×</button>
          @if (toast.title) {
            <strong>{{ toast.title }}</strong>
          }
          <span>{{ toast.text }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: 0.6rem;
      bottom: 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      max-width: min(30rem, 90vw);
      z-index: 10;
    }

    .toast {
      position: relative;
      padding: 0.55rem 1.6rem 0.55rem 0.7rem;
      border: 1px solid var(--line-input);
      border-radius: var(--radius-small);
      background: var(--popover-glass);
      font-size: 0.75rem;
      backdrop-filter: blur(20px);
      box-shadow: var(--shadow-popover);
    }

    .toast strong {
      display: block;
    }

    .toast-error {
      border-color: var(--danger);
    }

    .dismiss {
      position: absolute;
      top: 0.1rem;
      right: 0.2rem;
      border: 0;
      background: none;
      color: var(--muted);
      font-size: 0.9rem;
      cursor: pointer;
    }
  `,
})
export class ToastListComponent {
  readonly toasts = input.required<Toast[]>();
  readonly dismiss = output<number>();
}
