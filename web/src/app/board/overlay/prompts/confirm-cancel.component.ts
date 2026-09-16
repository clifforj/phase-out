import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ManaTextComponent } from '../../../ui/mana-symbol.component';

@Component({
  selector: 'app-confirm-cancel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent],
  template: `
    <div class="controls">
      <button type="button" class="primary" [disabled]="disabled()" (click)="confirm.emit()">
        <app-mana-text [text]="confirmLabel()" />
      </button>
      <button type="button" class="secondary" (click)="cancel.emit()">
        <app-mana-text [text]="cancelLabel()" />
      </button>
    </div>
  `,
  styleUrl: './prompt-controls.css',
})
export class ConfirmCancelComponent {
  readonly confirmLabel = input('confirm');
  readonly cancelLabel = input('cancel');

  readonly disabled = input(false);

  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
