import { type Signal, computed, effect, signal } from '@angular/core';
import type { GameStore } from '../core/game-store';
import { hasBoardReachableTarget, type ZoneTargetGroup } from '../rules/prompt-actions';
import { type Box, inflate, inside } from './keep-out';
import { ZONE_LABEL_HALF } from './overlay/zone-label.component';
import type { AnchorSet, ZoneAnchor } from './scene/anchors';
import type { BoardLayout, ZoneMarker } from './scene/layout';
import { sameZone, type ZoneKind, type ZoneRef } from '../rules/zones';
import type { Seat } from './scene/seat-metrics';

export interface ZoneLabel extends ZoneAnchor {
  count: number;
  ownerName: string | null;
  needsTarget: boolean;
}

export function zoneLabelsFor(
  anchors: readonly ZoneAnchor[],
  zones: readonly ZoneMarker[],
  seats: readonly Seat[],
  stackBox: Box | null,
  targetGroups: readonly ZoneTargetGroup[],
  autoOpen: ZoneRef | null,
): ZoneLabel[] {
  const keepOut = inflate(stackBox, ZONE_LABEL_HALF);
  return anchors.flatMap((anchor) => {
    const marker = zones.find((zone) => sameZone(zone, anchor));
    if (!marker) return [];
    return [
      {
        ...anchor,
        visible: anchor.visible && !inside(keepOut, anchor),
        count: marker.count,
        ownerName: seats[anchor.seat]?.player.name ?? null,
        needsTarget:
          !sameZone(autoOpen, anchor) && targetGroups.some((group) => sameZone(group, anchor)),
      },
    ];
  });
}

export function autoOpenZoneFor(
  targetGroups: readonly ZoneTargetGroup[],
  dismissed: ZoneRef | null,
  store: Pick<GameStore, 'decision' | 'snapshot'>,
): ZoneRef | null {
  if (targetGroups.length !== 1) return null;
  const [only] = targetGroups;
  const zone: ZoneRef = { seat: only.seat, kind: only.kind };
  if (sameZone(dismissed, zone)) return null;
  if (hasBoardReachableTarget(store.decision(), store.snapshot())) return null;
  return zone;
}

export interface ZoneBrowsingDeps {
  layout: Signal<BoardLayout>;
  anchors: Signal<AnchorSet>;
  stackBox: Signal<Box | null>;
  targetGroups: Signal<readonly ZoneTargetGroup[]>;
}

export class ZoneBrowsing {
  private readonly pointed = signal<ZoneRef | null>(null);
  private readonly labelled = signal<ZoneRef | null>(null);
  readonly hovered = computed(() => this.labelled() ?? this.pointed());
  readonly open = signal<ZoneRef | null>(null);

  private readonly autoOpenDismissed = signal<ZoneRef | null>(null);

  readonly autoOpen = computed(() =>
    autoOpenZoneFor(this.deps.targetGroups(), this.autoOpenDismissed(), this.store),
  );

  readonly labels = computed(() => {
    const layout = this.deps.layout();
    return zoneLabelsFor(
      this.deps.anchors().zones,
      layout.zones,
      layout.seats,
      this.deps.stackBox(),
      this.deps.targetGroups(),
      this.autoOpen(),
    );
  });

  readonly openContents = computed(() => {
    const open = this.open();
    const seat = open ? this.deps.layout().seats[open.seat] : undefined;
    if (!open || !seat) return null;
    return {
      kind: open.kind,
      ownerName: seat.player.name,
      cards: open.kind === 'graveyard' ? seat.player.graveyard : seat.player.exile,
    };
  });

  constructor(
    private readonly store: Pick<GameStore, 'decision' | 'snapshot'>,
    private readonly deps: ZoneBrowsingDeps,
  ) {
    effect(() => {
      const zone = this.autoOpen();
      if (zone && !this.open()) this.open.set(zone);
    });

    effect(() => {
      if (!this.deps.targetGroups().length) this.autoOpenDismissed.set(null);
    });
  }

  pointAt(zone: ZoneRef | null): void {
    this.pointed.set(zone);
  }

  labelHover(zone: ZoneRef | null): void {
    this.labelled.set(zone ? { seat: zone.seat, kind: zone.kind } : null);
  }

  isLit(zone: ZoneRef): boolean {
    return sameZone(zone, this.hovered()) || sameZone(zone, this.open());
  }

  openFor(seat: number, kind: ZoneKind): void {
    this.open.set({ seat, kind });
  }

  close(): void {
    const auto = this.autoOpen();
    if (auto) this.autoOpenDismissed.set(auto);
    this.open.set(null);
  }
}
