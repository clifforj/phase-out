import { type Signal, computed, signal } from '@angular/core';
import type { LogLine } from '../core/game-log';
import type { GameStore } from '../core/game-store';
import type { CardView } from '../core/protocol';
import { stackHint } from '../rules/stack-hint';
import { type StackTargetLink, stackTargetLinks } from '../rules/stack-targets';
import { type Box, seatsOnTheStack, stackKeepOut } from './keep-out';
import { SEAT_CHIP_HALF } from './overlay/seat-hud.component';
import type { AnchorSet, SeatAnchor, StackAnchor } from './scene/anchors';
import type { Seat } from './scene/seat-metrics';
import { targetArrowsFor } from './target-arrows';

export interface StackText {
  objectId: string;
  headline: string;
  detail: string;
}

export const STACK_LIST_THRESHOLD = 2;

export function stackTextFor(stack: readonly CardView[], log: readonly LogLine[]): StackText[] {
  return stack.map((card) => {
    const hint = stackHint(card, log);
    return hint
      ? { objectId: card.objectId, ...hint }
      : {
          objectId: card.objectId,
          headline: 'being cast - cost not paid yet',
          detail: card.typeLine?.trim() ?? '',
        };
  });
}

export function topStackLabel(
  top: CardView | undefined,
  text: readonly StackText[],
  anchors: readonly StackAnchor[],
): (StackAnchor & StackText)[] {
  if (!top) return [];
  const anchor = anchors.find((candidate) => candidate.objectId === top.objectId);
  const hint = text.find((entry) => entry.objectId === top.objectId);
  return anchor && hint ? [{ ...anchor, ...hint }] : [];
}

export function stackListButtonFor(
  count: number,
  box: Box | null,
): { count: number; left: number; top: number } | null {
  if (count <= STACK_LIST_THRESHOLD || !box) return null;
  return { count, left: (box.left + box.right) / 2, top: box.top - 14 };
}

export function costTagFor(
  spell: CardView | undefined,
  anchors: readonly StackAnchor[],
  box: Box | null,
): { spellName: string; left: number; top: number } | null {
  if (!spell) return null;
  const anchor = anchors.find((candidate) => candidate.objectId === spell.objectId);
  if (!anchor) return null;
  return {
    spellName: spell.displayName || spell.name || 'this spell',
    left: box ? (box.left + box.right) / 2 : anchor.left,
    top: box ? box.bottom : anchor.y,
  };
}

export function topStackLinks(
  topId: string | undefined,
  links: readonly StackTargetLink[],
): StackTargetLink[] {
  return topId ? links.filter((link) => link.sourceId === topId) : [];
}

export function trackedPermanentIds(links: readonly StackTargetLink[]): Set<string> {
  const ids = new Set<string>();
  for (const link of links) if (link.target.kind === 'permanent') ids.add(link.target.objectId);
  return ids;
}

export interface StackViewDeps {
  anchors: Signal<AnchorSet>;
  seats: Signal<readonly Seat[]>;
  seatAnchor: (seat: number) => SeatAnchor | null;

  payingMana: Signal<boolean>;
}

export class StackView {
  constructor(
    private readonly store: Pick<GameStore, 'snapshot' | 'log'>,
    private readonly deps: StackViewDeps,
  ) {}

  readonly cards = computed(() => this.store.snapshot()?.stack ?? []);
  readonly top = computed(() => this.cards()[0]);

  readonly listOpen = signal(false);

  readonly box = computed(() => stackKeepOut(this.deps.anchors().stack));

  readonly chipsOnTheStack = computed(() =>
    seatsOnTheStack(this.box(), this.deps.anchors().seats, SEAT_CHIP_HALF),
  );

  private readonly text = computed(() => stackTextFor(this.cards(), this.store.log()));
  readonly hints = computed(() =>
    topStackLabel(this.top(), this.text(), this.deps.anchors().stack),
  );
  readonly listButton = computed(() => stackListButtonFor(this.cards().length, this.box()));
  readonly listHints = computed(
    () => new Map(this.text().map((entry) => [entry.objectId, entry.headline])),
  );
  readonly costTag = computed(() =>
    this.deps.payingMana() ? costTagFor(this.top(), this.deps.anchors().stack, this.box()) : null,
  );

  private readonly topLinks = computed(() =>
    topStackLinks(this.top()?.objectId, stackTargetLinks(this.store.snapshot())),
  );

  readonly trackedIds = computed(() => trackedPermanentIds(this.topLinks()));
  readonly arrows = computed(() =>
    targetArrowsFor(this.topLinks(), {
      stack: this.deps.anchors().stack,
      cards: this.deps.anchors().cards,
      seats: this.deps
        .seats()
        .map((seat) => ({
          playerId: seat.player.playerId,
          anchor: this.deps.seatAnchor(seat.index),
        })),
    }),
  );
}
