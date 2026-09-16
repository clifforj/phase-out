import type { CardView } from '../core/protocol';
import type { BoardLayout, Placement } from './scene/layout';

export interface Inspection {
  placement: Placement;
  ownerName: string | null;

  attachedToName: string | null;
  attachmentNames: string[];

  stackDepth: { index: number; total: number } | null;
}

export function inspectionFor(
  objectId: string | null,
  layout: BoardLayout,
  stack: readonly CardView[],
): Inspection | null {
  if (!objectId) return null;
  const placement = layout.placements.find((candidate) => candidate.objectId === objectId);
  if (!placement || placement.kind === 'hand') return null;

  const nameOf = (id: string): string | null => {
    const card = layout.placements.find((entry) => entry.objectId === id)?.card;
    return card ? card.displayName || card.name || null : null;
  };
  const attachedTo = placement.permanent?.attachedTo;
  const index =
    placement.kind === 'stack' ? stack.findIndex((card) => card.objectId === objectId) : -1;

  return {
    placement,
    ownerName: placement.seat >= 0 ? (layout.seats[placement.seat]?.player.name ?? null) : null,
    attachedToName: attachedTo ? nameOf(attachedTo) : null,
    attachmentNames: (placement.permanent?.attachments ?? [])
      .map(nameOf)
      .filter((name): name is string => name !== null),
    stackDepth: index < 0 ? null : { index, total: stack.length },
  };
}
