export interface PlayerMat {
  id: string;
  label: string;

  fill: number;

  edge: number;
}

export const PLAYER_MATS: PlayerMat[] = [
  { id: 'forest', label: 'Forest', fill: 0x1f6b3a, edge: 0x123d21 },
  { id: 'ocean', label: 'Ocean', fill: 0x1f5f8b, edge: 0x123650 },
  { id: 'crimson', label: 'Crimson', fill: 0x8b1f2b, edge: 0x501219 },
  { id: 'violet', label: 'Violet', fill: 0x5b3b8b, edge: 0x362350 },
  { id: 'slate', label: 'Slate', fill: 0x3a4451, edge: 0x21272e },
  { id: 'amber', label: 'Amber', fill: 0x8b6a1f, edge: 0x503c12 },
];

export function playerMatById(id: string | null | undefined): PlayerMat | null {
  if (!id) return null;
  return PLAYER_MATS.find((mat) => mat.id === id) ?? null;
}

export const CUSTOM_PLAYMAT_PREFIX = 'img:';

export function isCustomPlaymatId(id: string | null | undefined): id is string {
  return !!id && id.startsWith(CUSTOM_PLAYMAT_PREFIX);
}

export function customPlaymatImageId(playmatId: string): string {
  return playmatId.slice(CUSTOM_PLAYMAT_PREFIX.length);
}
