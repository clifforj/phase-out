import type { PromptView } from '../core/protocol';

export function triggerOrderPrompt(prompt: PromptView | null): PromptView | null {
  if (!prompt || prompt.kind !== 'GAME_TARGET' || prompt.targetZone) return null;
  if (prompt.cards.length < 2 || !prompt.cards.every((card) => card.isAbility)) return null;
  return prompt;
}

export function triggerPickSequence(resolutionOrder: readonly string[]): string[] {
  return [...resolutionOrder].reverse().slice(0, -1);
}

export function ordinalLabel(place: number): string {
  const suffix =
    place % 100 >= 11 && place % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th');
  return `${place}${suffix}`;
}
