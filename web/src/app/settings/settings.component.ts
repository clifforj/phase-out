import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ProfileSettingsComponent } from './profile-settings.component';
import { SkipPrioritySettingsComponent } from './skip-priority-settings.component';
import { TableDefaultsComponent } from './table-defaults.component';

type Tab = 'account' | 'gameplay';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProfileSettingsComponent, TableDefaultsComponent, SkipPrioritySettingsComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  protected readonly tab = signal<Tab>('account');
}
