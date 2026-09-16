import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { DeckSummary } from '../core/protocol';
import { DialogComponent } from '../ui/dialog.component';

@Component({
  selector: 'app-join-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <app-dialog heading="Confirm your deck" (dismiss)="cancel.emit()">
      @if (deck(); as chosen) {
        <p class="deck-name">{{ chosen.name }}</p>
        @if (chosen.commanders?.length) {
          <p class="commanders">{{ commanderNames(chosen) }}</p>
        }
      } @else {
        <p class="deck-name">Dealt for you</p>
        <p class="commanders">No deck picked - the bridge will deal you one of its own.</p>
      }
      <div class="actions">
        <button type="button" class="btn btn-ghost" (click)="cancel.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" (click)="confirm.emit()">Join Table</button>
      </div>
    </app-dialog>
  `,
  styles: `
    .deck-name {
      margin: 0;
      color: var(--heading);
      font-weight: 600;
    }

    .commanders {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  `,
})
export class JoinConfirmDialogComponent {
  readonly deck = input<DeckSummary | null>(null);
  readonly confirm = output<void>();
  readonly cancel = output<void>();

  protected commanderNames(deck: DeckSummary): string {
    return (deck.commanders ?? []).map((c) => c.name).join(' & ');
  }
}
