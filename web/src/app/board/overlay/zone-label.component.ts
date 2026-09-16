import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Skull, Sparkles, type IconNode } from 'lucide';
import type { Half } from '../keep-out';
import type { ZoneAnchor } from '../scene-types';
import type { ZoneKind } from '../../rules/zones';
import { IconComponent } from '../../ui/icon.component';
import { clampedLeft, clampedTop } from './anchored';

export const ZONE_LABEL_HALF: Half = { x: 60, y: 14 };

const ICONS: Record<ZoneKind, IconNode> = { graveyard: Skull, exile: Sparkles };

@Component({
  selector: 'app-zone-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './zone-label.component.html',
  styleUrl: './zone-label.component.css',
})
export class ZoneLabelComponent {
  readonly anchor = input.required<ZoneAnchor & { count: number }>();
  readonly ownerName = input<string | null>(null);

  readonly active = input(false);

  readonly needsTarget = input(false);

  readonly hover = output<boolean>();
  readonly open = output<void>();

  readonly icon = computed(() => ICONS[this.anchor().kind]);
  readonly left = computed(() => clampedLeft(this.anchor().x, 3.2));
  readonly top = computed(() => clampedTop(this.anchor().y, 2.6, 1.4));

  readonly title = computed(() => {
    const anchor = this.anchor();
    const owner = this.ownerName();
    const whose = owner ? `${owner}’s ${anchor.kind}` : anchor.kind;
    if (this.needsTarget()) return `${whose} has a legal target - click to choose one`;
    if (!anchor.count) return `${whose} is empty`;
    return `browse ${whose} - ${anchor.count} ${anchor.count === 1 ? 'card' : 'cards'}`;
  });
}
