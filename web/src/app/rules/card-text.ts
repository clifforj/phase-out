import type { CardView } from '../core/protocol';
import { stripTags } from './text-format';

export function cardDisplayName(card: CardView): string {
  if (card.faceDown) return card.displayName || 'Face-down card';
  return card.displayName || card.name || 'Unknown card';
}

export function isCreature(card: CardView): boolean {
  return card.typeLine?.toLowerCase().includes('creature') ?? false;
}

export function isLand(card: CardView): boolean {
  return card.typeLine?.toLowerCase().includes('land') ?? false;
}

export function isCommander(card: CardView): boolean {
  return card.icons.some((icon) => icon.type === 'COMMANDER');
}

export function statLine(card: CardView): string {
  if (isCreature(card) && (card.power || card.toughness))
    return `${card.power ?? '?'}/${card.toughness ?? '?'}`;
  if (card.loyalty) return `♦ ${card.loyalty}`;
  return '';
}

export function printingOf(card: CardView): string {
  return [card.setCode, card.cardNumber].filter(Boolean).join(' ');
}

export function abilityLine(card: CardView): string {
  return stripTags(card.rules.join(' · '), card.name).trim() || 'ability';
}
