import type { GameStateView, PlayerStateView, ServerFrame } from '../core/protocol';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';
import { stackTargetLinks } from './stack-targets';

describe('stackTargetLinks', () => {
  function states(name: string): GameStateView[] {
    return loadFixture(name)
      .map((line) => line.frame as ServerFrame)
      .map((frame) => (frame.type === 'gameState' || frame.type === 'prompt' ? frame.game : null))
      .filter((game): game is GameStateView => !!game);
  }

  function named(game: GameStateView): string[] {
    return stackTargetLinks(game).map(({ sourceId, target }) => {
      const source = game.stack.find((card) => card.objectId === sourceId);
      const name =
        target.kind === 'player'
          ? game.players.find((player) => player.playerId === target.playerId)?.name
          : nameOf(game, target.objectId);
      return `${source?.name} → ${name}`;
    });
  }

  function nameOf(game: GameStateView, objectId: string): string | undefined {
    for (const player of game.players) {
      const permanent = player.battlefield.find((entry) => entry.card.objectId === objectId);
      if (permanent) return permanent.card.name;
    }
    return game.stack.find((card) => card.objectId === objectId)?.name;
  }

  const captured = states(FIXTURES.playerVsAi);

  it('points a spell at the permanent it named', () => {
    const drawn = captured.flatMap(named);
    expect(drawn).toContain('Tragic Slip → Vampire Hexmage');

    expect(drawn).toContain('Ability → Swamp');
  });

  it('says nothing about a target that has left for a graveyard', () => {
    const fizzling = captured.find((game) =>
      game.stack.some(
        (card) =>
          card.name === 'Tragic Slip' &&
          card.targets.some((id) => game.players.some((player) => inGraveyard(player, id))),
      ),
    );
    expect(fizzling, 'the capture no longer contains a spell whose target has died').toBeDefined();

    expect(named(fizzling!)).not.toContain('Tragic Slip → Vampire Hexmage');
    expect(stackTargetLinks(fizzling!).map((link) => link.sourceId)).not.toContain(
      fizzling!.stack.find((card) => card.name === 'Tragic Slip')!.objectId,
    );
  });

  it('never invents a link, in any frame of either capture', () => {
    for (const game of [...captured, ...states(FIXTURES.spectatorDuel)]) {
      for (const link of stackTargetLinks(game)) {
        const source = game.stack.find((card) => card.objectId === link.sourceId);
        expect(source, 'an arrow from something that is not on the stack').toBeDefined();

        const targetId =
          link.target.kind === 'player' ? link.target.playerId : link.target.objectId;

        expect(source!.targets).toContain(targetId);
        expect(targetId).not.toBe(link.sourceId);
        expect(
          placed(game, link.target.kind, targetId),
          `${targetId} is not where it was said to be`,
        ).toBe(true);
      }
    }
  });

  it('has nothing to say about an empty or absent board', () => {
    expect(stackTargetLinks(null)).toEqual([]);
    expect(stackTargetLinks({ ...captured[0], stack: [] })).toEqual([]);
  });

  it('finds a player, and a spell on the stack under another one', () => {
    const game = captured.find((state) => state.players.length === 2)!;
    const [player] = game.players;
    const spell = { ...game.stack[0], objectId: 'bolt', targets: [player.playerId] };
    const counter = { ...game.stack[0], objectId: 'counterspell', targets: ['bolt'] };

    expect(stackTargetLinks({ ...game, stack: [counter, spell] })).toEqual([
      { sourceId: 'counterspell', target: { kind: 'stack', objectId: 'bolt' } },
      { sourceId: 'bolt', target: { kind: 'player', playerId: player.playerId } },
    ]);
  });

  it('drops a target it cannot find anywhere at all', () => {
    const game = captured.find((state) => state.stack.length > 0)!;
    const spell = { ...game.stack[0], objectId: 'spell', targets: ['nothing-in-this-snapshot'] };
    expect(stackTargetLinks({ ...game, stack: [spell] })).toEqual([]);
  });
});

function inGraveyard(player: PlayerStateView, objectId: string): boolean {
  return player.graveyard.some((card) => card.objectId === objectId);
}

function placed(game: GameStateView, kind: string, objectId: string): boolean {
  if (kind === 'player') return game.players.some((player) => player.playerId === objectId);
  if (kind === 'stack') return game.stack.some((card) => card.objectId === objectId);
  return game.players.some((player) =>
    player.battlefield.some((permanent) => permanent.card.objectId === objectId),
  );
}
