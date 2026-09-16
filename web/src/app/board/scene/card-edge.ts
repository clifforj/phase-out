import { MeshBasicMaterial } from 'three';
import { CARD_INK } from './theme';

let edge: MeshBasicMaterial | null = null;

export function cardEdgeMaterial(): MeshBasicMaterial {
  return (edge ??= new MeshBasicMaterial({ color: CARD_INK.base }));
}
