import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Hand, Library, Skull, Sparkles } from 'lucide';
import type { PlayerStateView } from '../../core/protocol';
import { ManaSymbolComponent } from '../../ui/mana-symbol.component';
import { IconComponent } from '../../ui/icon.component';
import { manaSymbol } from '../../rules/mana-symbol';
import { counterIconClass } from '../../rules/counter-icon';
import type { Half } from '../keep-out';
import type { SeatAnchor } from '../scene-types';
import type { ZoneKind } from '../../rules/zones';
import { clampedLeft, clampedTop } from './anchored';

export const SEAT_CHIP_HALF: Half = { x: 136, y: 46 };

const MANA_LETTERS = [
  ['W', 'white'],
  ['U', 'blue'],
  ['B', 'black'],
  ['R', 'red'],
  ['G', 'green'],
  ['C', 'colorless'],
] as const;

@Component({
  selector: 'app-seat-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaSymbolComponent, IconComponent],
  templateUrl: './seat-hud.component.html',
  styleUrl: './seat-hud.component.css',
})
export class SeatHudComponent {
  protected readonly icons = { hand: Hand, library: Library, graveyard: Skull, exile: Sparkles };
  protected readonly counterIconClass = counterIconClass;

  readonly player = input.required<PlayerStateView>();
  readonly anchor = input.required<SeatAnchor | null>();
  readonly focused = input(false);

  readonly parked = input(false);

  readonly targetable = input(false);
  readonly lifeChange = input<number | null>(null);
  readonly onTheStack = input(false);

  readonly menu = output<{ x: number; y: number; primary: boolean }>();
  readonly openZone = output<ZoneKind>();

  protected onClick(event: MouseEvent): void {
    this.menu.emit({ x: event.clientX, y: event.clientY, primary: true });
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.menu.emit({ x: event.clientX, y: event.clientY, primary: false });
  }

  protected onMenuTrigger(event: MouseEvent): void {
    this.menu.emit({ x: event.clientX, y: event.clientY, primary: false });
  }

  readonly hidden = computed(() => this.onTheStack() && !this.parked() && !this.targetable());

  readonly seatTitle = computed(() =>
    this.targetable()
      ? `choose ${this.player().name} as a target`
      : `actions for ${this.player().name}`,
  );

  readonly left = computed(() => clampedLeft(this.anchor()?.x ?? 0, 8));
  readonly top = computed(() => clampedTop(this.anchor()?.y ?? 0, 4, 4));

  readonly mana = computed(() => {
    const pool = this.player().manaPool;
    return MANA_LETTERS.map(([letter, key]) => ({
      letter,
      count: pool[key],
      symbol: manaSymbol(letter)!,
    })).filter((entry) => entry.count > 0);
  });

  readonly flags = computed(() => {
    const player = this.player();
    const flags: { text: string; crown: boolean }[] = [];
    if (player.isActive) flags.push({ text: 'turn', crown: false });
    if (player.monarch) flags.push({ text: 'monarch', crown: true });
    if (player.initiative) flags.push({ text: 'initiative', crown: true });
    for (const designation of player.designations) flags.push({ text: designation, crown: true });
    return flags;
  });
}
