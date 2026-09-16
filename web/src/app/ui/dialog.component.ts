import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { X } from 'lucide';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="scrim" (click)="dismiss.emit()">
      <div
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="heading()"
        [style.width.px]="width()"
        (click)="$event.stopPropagation()"
      >
        <header>
          @if (heading(); as text) {
            <div>
              <h2>{{ text }}</h2>
              @if (lead(); as leadText) {
                <p class="lead">{{ leadText }}</p>
              }
            </div>
          }
          <button type="button" class="close" aria-label="close" (click)="dismiss.emit()">
            <app-icon [icon]="closeIcon" />
          </button>
        </header>
        <ng-content />
      </div>
    </div>
  `,
  host: { '(document:keydown.escape)': 'dismiss.emit()' },
  styles: `
    :host {
      pointer-events: auto;
    }

    .scrim {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgb(4 4 6 / 60%);
      backdrop-filter: blur(4px);
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 100%;
      max-height: calc(100vh - 48px);
      padding: 28px;
      border: 1px solid var(--line-input);
      border-radius: var(--radius-modal);
      background: var(--modal-glass);
      overflow-y: auto;
      backdrop-filter: var(--blur-modal);
      box-shadow: var(--shadow-modal);
    }

    header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
    }

    h2 {
      margin: 0;
      color: var(--heading);
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: 600;
    }

    .lead {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .close {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;

      margin-left: auto;
      width: 28px;
      height: 28px;
      border: 1px solid var(--line-input);
      border-radius: 50%;
      background: var(--glass-control);
      color: oklch(0.8 0.01 264);
      font-size: 14px;
      cursor: pointer;
    }

    .close:hover {
      background: var(--glass-hover);
    }
  `,
})
export class DialogComponent {
  readonly heading = input<string | null>(null);
  readonly lead = input<string | null>(null);

  readonly width = input(440);
  readonly dismiss = output<void>();

  protected readonly closeIcon = X;
}
