import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Layers, Search } from 'lucide';
import type { PromptView } from '../../core/protocol';
import { stripTags } from '../../rules/text-format';
import { CardListPanelComponent } from './card-list-panel.component';

@Component({
  selector: 'app-card-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardListPanelComponent],
  template: `
    <app-card-list-panel
      [heading]="heading()"
      [icon]="icon()"
      [cards]="prompt().cards"
      [selectableIds]="selectableIds()"
      [chosenTargetIds]="chosenTargetIds()"
      [emptyMessage]="emptyMessage()"
      [showOrdinal]="false"
      (close)="cancel.emit()"
      (pick)="pick.emit($event)"
    />
  `,
})
export class CardChoiceComponent {
  readonly prompt = input.required<PromptView>();
  readonly selectableIds = input<ReadonlySet<string>>(new Set());
  readonly chosenTargetIds = input<ReadonlySet<string>>(new Set());

  readonly cancel = output<void>();
  readonly pick = output<string>();

  protected readonly isLibrarySearch = computed(() => this.prompt().targetZone === 'LIBRARY');

  readonly heading = computed(() => {
    const message = this.prompt().message;
    if (message) return stripTags(message);
    return this.isLibrarySearch() ? 'Search your library' : 'Choose a card';
  });
  readonly icon = computed(() => (this.isLibrarySearch() ? Search : Layers));
  readonly emptyMessage = computed(() =>
    this.isLibrarySearch() ? 'Nothing left in the library to search.' : 'Nothing left to choose.',
  );
}
