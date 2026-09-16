import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameStore } from '../core/game-store';
import { CreateRoomPanelComponent } from './create-room-panel.component';
import { TableListComponent } from './table-list.component';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CreateRoomPanelComponent, TableListComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  protected readonly store = inject(GameStore);

  constructor() {
    this.store.connect();
  }
}
