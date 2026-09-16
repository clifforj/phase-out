import type { GameStore } from '../core/game-store';
import { stripTags } from './text-format';

const ALTERNATE_PAYMENTS: { keyword: string; how: string }[] = [
  { keyword: 'improvise', how: 'tap artifacts to pay' },
  { keyword: 'convoke', how: 'tap creatures to pay' },
  { keyword: 'delve', how: 'exile cards from your graveyard to pay' },
  { keyword: 'assist', how: 'let another player pay' },
  { keyword: 'offering', how: 'sacrifice a creature to pay' },
];

export function alternatePayment(store: GameStore): { keyword: string; how: string } | null {
  if (store.decision()?.kind !== 'GAME_PLAY_MANA') return null;
  const rules = (store.snapshot()?.stack[0]?.rules ?? []).join(' ').toLowerCase();
  return ALTERNATE_PAYMENTS.find((payment) => rules.includes(payment.keyword)) ?? null;
}

export function specialAction(store: GameStore): { label: string; title: string } | null {
  const p = store.decision();
  if (p?.specialButtonText) return { label: clean(p.specialButtonText), title: '' };
  if (!store.snapshot()?.specialActionAvailable) return null;
  const payment = alternatePayment(store);
  return payment
    ? {
        label: `${payment.keyword} - ${payment.how}`,
        title: `pay part of this cost with ${payment.keyword}`,
      }
    : {
        label: 'special action',
        title: 'this spell or permanent offers a special action - press to use it',
      };
}

function clean(text: string | undefined): string {
  return text ? stripTags(text) : '';
}
