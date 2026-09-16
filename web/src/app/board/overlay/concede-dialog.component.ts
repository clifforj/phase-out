import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { DialogComponent } from '../../ui/dialog.component';

@Component({
  selector: 'app-concede-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <app-dialog heading="Concede this game?" (dismiss)="cancel.emit()">
      <p class="warning">
        You'll be out for the rest of this game - the others will keep playing without you.
      </p>
      <div class="actions">
        <button type="button" class="secondary" (click)="cancel.emit()">cancel</button>
        <button type="button" class="danger" (click)="confirm.emit()">concede</button>
      </div>
    </app-dialog>
  `,
  styles: `
    .warning {
      margin: 0;
      color: var(--muted);
      font-size: 0.82rem;
      line-height: 1.4;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .actions button {
      padding: 0.4rem 0.9rem;
      border: 1px solid var(--line-input);
      border-radius: var(--radius-pill);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }

    .secondary {
      background: none;
      color: var(--muted);
    }

    .secondary:hover {
      color: var(--fg);
    }

    .danger {
      border-color: var(--danger);
      background: color-mix(in srgb, var(--danger) 18%, transparent);
      color: var(--danger);
    }

    .danger:hover {
      background: color-mix(in srgb, var(--danger) 30%, transparent);
    }
  `,
})
export class ConcedeDialogComponent {
  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
