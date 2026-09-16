import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Eye, EyeOff } from 'lucide';
import type { CardView } from '../../core/protocol';
import { IconComponent } from '../../ui/icon.component';
import { CardTileComponent } from './card-tile.component';

export interface CardWindow {
  name: string;
  cards: CardView[];
}

@Component({
  selector: 'app-card-windows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardTileComponent, IconComponent],
  host: { '[class.public]': 'variant() === "public"' },
  templateUrl: './card-windows.component.html',
  styleUrl: './card-windows.component.css',
})
export class CardWindowsComponent {
  readonly windows = input.required<readonly CardWindow[]>();
  readonly variant = input.required<'private' | 'public'>();

  readonly selectableIds = input<ReadonlySet<string>>(new Set<string>());
  readonly pick = output<string>();

  protected readonly clickable = computed(() => this.variant() === 'private');
  protected readonly icon = computed(() => (this.variant() === 'private' ? EyeOff : Eye));

  protected readonly tag = computed(() =>
    this.variant() === 'private' ? 'only you' : 'revealed to everyone',
  );

  protected cardTitle(objectId: string): string {
    return this.selectableIds().has(objectId)
      ? 'click to play this card'
      : 'only you can see this card';
  }
}
