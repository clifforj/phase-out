import type { GameStateView, PlayerStateView } from '../core/protocol';
import { sameTurnText } from './turn-timeline';

export interface TurnState {
  turn: number;

  round: number;
  phase: string | null;
  step: string | null;
  activeSeat: PlayerStateView | null;
  activePlayerId: string | null;
  activeName: string | null;
  activeIsMe: boolean;

  chipLabel: string | null;
}

export function turnStateOf(game: GameStateView | null, round: number): TurnState | null {
  if (!game) return null;
  const activeSeat = game.players.find((player) => player.isActive) ?? null;
  const phase = game.phase ?? null;
  const step = game.step ?? null;
  return {
    turn: game.turn,
    round,
    phase,
    step,
    activeSeat,
    activePlayerId: activeSeat?.playerId ?? null,
    activeName: activeSeat?.name ?? game.activePlayerName ?? null,
    activeIsMe: activeSeat?.isMe ?? false,
    chipLabel:
      phase && step ? (sameTurnText(phase, step) ? phase : `${phase} · ${step}`) : (phase ?? step),
  };
}
