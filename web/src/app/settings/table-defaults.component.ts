import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DeckStore } from '../core/deck-store';
import { Preferences, SEAT_CHOICES } from '../core/preferences';
import { gameTypeForSeats } from '../core/protocol';

@Component({
  selector: 'app-table-defaults',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './table-defaults.component.html',
  styleUrls: ['./settings-field.css', './table-defaults.component.css'],
})
export class TableDefaultsComponent {
  protected readonly prefs = inject(Preferences);
  protected readonly decks = inject(DeckStore);
  protected readonly seatChoices = SEAT_CHOICES;
  protected readonly gameType = gameTypeForSeats;

  constructor() {
    this.decks.refreshDecks();
  }

  protected pickDeck(value: string): void {
    this.decks.selectDeck(value || null);
  }
}
