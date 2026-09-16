import type { GameStateView, ServerFrame } from '../../core/protocol';
import { FIXTURES } from '../../testing/fixture';
import { loadFixture } from '../../testing/fixture-loader';
import { defaultFocusPlayerId, layoutBoard } from './layout';
import {
  ATTACHMENT_SCALE,
  BOARD_CARD_H,
  BOARD_CARD_W,
  BOARD_CREDIT_H,
  CARD_H,
  CARD_THICKNESS,
  CARD_W,
  LAND_SCALE,
  PILE_AREA_W,
  PILE_DEPTH,
  PILE_SCALE,
  RIM_DEPTH,
  ROW_Z,
  TABLE_Y,
} from './sizes';
import { seatFlipped } from './placement';
import { TABLE_RADIUS, seatMetrics, seatPlayers, seatYaw, toWorld } from './seat-metrics';
import { rowX } from './spacing';

describe('board layout', () => {
  const frames = loadFixture(FIXTURES.spectatorDuel).map((line) => line.frame);
  const states = frames.filter(
    (frame): frame is Extract<ServerFrame, { type: 'gameState' }> => frame.type === 'gameState',
  );
  const lastGame = states.at(-1)!.game;

  const combatGame: GameStateView = states
    .map((frame) => frame.game)
    .reduce((best, game) => {
      const attackers = (game: GameStateView) =>
        game.combat.reduce((sum, group) => sum + group.attackers.length, 0);
      return attackers(game) > attackers(best) ? game : best;
    }, states[0].game);

  it('places every permanent, command object and stack card somewhere finite', () => {
    const layout = layoutBoard(lastGame, defaultFocusPlayerId(lastGame));

    const permanents = lastGame.players.flatMap((player) => player.battlefield);
    expect(permanents.length).toBeGreaterThan(0);
    for (const permanent of permanents) {
      const placement = layout.placements.find((p) => p.objectId === permanent.card.objectId);
      expect(placement, `${permanent.card.name} was not placed`).toBeTruthy();
    }

    const commanders = lastGame.players
      .flatMap((player) => player.commandZone)
      .filter((object) => object.card);
    for (const commander of commanders) {
      expect(layout.placements.some((p) => p.objectId === commander.objectId)).toBe(true);
    }

    for (const placement of layout.placements) {
      for (const value of [
        placement.position.x,
        placement.position.y,
        placement.position.z,
        placement.spin,
        placement.tilt,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('gives each player their own side of the table, with the focus player nearest', () => {
    const [first, second] = lastGame.players;
    const layout = layoutBoard(lastGame, second.playerId);

    expect(layout.seats[0].player.playerId).toBe(second.playerId);
    expect(layout.seats[0].angle).toBe(0);
    expect(layout.seats[1].player.playerId).toBe(first.playerId);

    const zFor = (playerId: string) => {
      const seat = layout.seats.find((s) => s.player.playerId === playerId)!;
      const cards = layout.placements.filter((p) => p.seat === seat.index && p.kind !== 'stack');
      return cards.reduce((sum, p) => sum + p.position.z, 0) / cards.length;
    };
    expect(zFor(second.playerId)).toBeGreaterThan(0);
    expect(zFor(first.playerId)).toBeLessThan(0);
  });

  it('keeps the pod in turn order however it is rotated', () => {
    const players = lastGame.players;
    const order = (focus: string) => seatPlayers(players, focus).map((seat) => seat.player.name);
    const first = order(players[0].playerId);
    const second = order(players[1].playerId);

    expect(second).toEqual([...first.slice(1), first[0]]);
  });

  it('turns a tapped permanent 30 degrees and leaves the rest alone', () => {
    const layout = layoutBoard(lastGame, null);
    const tapped = layout.placements.filter((p) => p.permanent?.tapped);
    const untapped = layout.placements.filter((p) => p.permanent && !p.permanent.tapped);
    expect(tapped.length + untapped.length).toBeGreaterThan(0);
    for (const placement of tapped) expect(placement.spin).toBeCloseTo(-Math.PI / 6);
    for (const placement of untapped) expect(placement.spin).toBe(0);
  });

  it('pulls attackers into the middle and points an arrow at what they are attacking', () => {
    const attackerCount = combatGame.combat.reduce((sum, group) => sum + group.attackers.length, 0);
    expect(attackerCount, 'the capture contains no combat at all').toBeGreaterThan(0);

    const layout = layoutBoard(combatGame, defaultFocusPlayerId(combatGame));
    const attackers = layout.placements.filter((p) => p.kind === 'attacker');
    expect(attackers.length).toBe(attackerCount);

    const rowCreatures = layout.placements.filter((p) => p.kind === 'creature');
    const nearest = Math.min(...rowCreatures.map((p) => Math.abs(p.position.z)));
    for (const attacker of attackers) {
      expect(Math.abs(attacker.position.z)).toBeLessThan(nearest);
    }

    expect(layout.arrows.length).toBe(combatGame.combat.length);
    for (const arrow of layout.arrows) {
      expect(Math.hypot(arrow.to.x - arrow.from.x, arrow.to.z - arrow.from.z)).toBeGreaterThan(0.5);
    }
  });

  it('draws one arrow to every blocker assigned to an attacker, not just the first', () => {
    const attacker = { ...lastGame.players[0].battlefield[0], card: cardNamed('attacker') };
    const blockerA = { ...lastGame.players[1].battlefield[0], card: cardNamed('blocker-a') };
    const blockerB = { ...lastGame.players[1].battlefield[0], card: cardNamed('blocker-b') };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [attacker] },
        { ...lastGame.players[1], battlefield: [blockerA, blockerB] },
      ],
      combat: [
        {
          defenderId: lastGame.players[1].playerId,
          blocked: true,
          attackers: [attacker.card],
          blockers: [blockerA.card, blockerB.card],
        },
      ],
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    expect(layout.arrows.length).toBe(2);
    const attackerPlacement = layout.placements.find((p) => p.objectId === attacker.card.objectId)!;
    for (const arrow of layout.arrows) {
      expect(arrow.blocked).toBe(true);
      expect(arrow.from).toEqual(attackerPlacement.position);
    }
    const targets = layout.arrows.map((arrow) => `${arrow.to.x},${arrow.to.z}`);
    expect(new Set(targets).size).toBe(2);
  });

  it('points the arrow at a planeswalker being attacked, not at the middle of the table', () => {
    const walker = {
      ...lastGame.players[1].battlefield[0],
      card: { ...cardNamed('a-planeswalker'), typeLine: 'Legendary Planeswalker - Nixilis' },
    };
    const attacker = { ...lastGame.players[0].battlefield[0], card: cardNamed('attacker') };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [attacker] },
        { ...lastGame.players[1], battlefield: [walker] },
      ],
      combat: [
        {
          defenderId: walker.card.objectId,
          defenderName: 'a-planeswalker',
          blocked: false,
          attackers: [attacker.card],
          blockers: [],
        },
      ],
    };

    const layout = layoutBoard(game, game.players[0].playerId);

    const walkerPlacement = layout.placements.find((p) => p.objectId === walker.card.objectId)!;
    expect(walkerPlacement.kind).toBe('permanent');

    expect(layout.arrows.length).toBe(1);
    const [arrow] = layout.arrows;
    const attackerPlacement = layout.placements.find((p) => p.objectId === attacker.card.objectId)!;
    expect(arrow.from).toEqual(attackerPlacement.position);
    expect(arrow.blocked).toBe(false);

    const toWalker = Math.hypot(
      walkerPlacement.position.x - arrow.to.x,
      walkerPlacement.position.z - arrow.to.z,
    );
    expect(toWalker).toBeGreaterThan(0);
    expect(toWalker).toBeLessThan(0.6);
    expect(Math.hypot(arrow.to.x, arrow.to.z)).toBeGreaterThan(1);
  });

  it('still aims at where a player is sitting when the defender is a player', () => {
    const attacker = { ...lastGame.players[0].battlefield[0], card: cardNamed('attacker') };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [attacker] },
        { ...lastGame.players[1], battlefield: [] },
      ],
      combat: [
        {
          defenderId: lastGame.players[1].playerId,
          blocked: false,
          attackers: [attacker.card],
          blockers: [],
        },
      ],
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    const defenderSeat = layout.seats.find(
      (s) => s.player.playerId === lastGame.players[1].playerId,
    )!;
    const [arrow] = layout.arrows;

    expect(arrow.to).toEqual(toWorld(defenderSeat.angle, 0, 3.55, TABLE_Y));
  });

  it('stands each group of blockers opposite its own attackers rather than mirrored', () => {
    const attackerA = { ...lastGame.players[0].battlefield[0], card: cardNamed('attacker-a') };
    const attackerB = { ...lastGame.players[0].battlefield[0], card: cardNamed('attacker-b') };
    const blockerA = { ...lastGame.players[1].battlefield[0], card: cardNamed('blocker-a') };
    const blockerB = { ...lastGame.players[1].battlefield[0], card: cardNamed('blocker-b') };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [attackerA, attackerB] },
        { ...lastGame.players[1], battlefield: [blockerA, blockerB] },
      ],
      combat: [
        {
          defenderId: lastGame.players[1].playerId,
          blocked: true,
          attackers: [attackerA.card],
          blockers: [blockerA.card],
        },
        {
          defenderId: lastGame.players[1].playerId,
          blocked: true,
          attackers: [attackerB.card],
          blockers: [blockerB.card],
        },
      ],
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    expect(layout.arrows.length).toBe(2);

    for (const arrow of layout.arrows) {
      expect(arrow.to.x).toBeCloseTo(arrow.from.x);
      expect(arrow.from.z).toBeGreaterThan(arrow.to.z);
    }

    expect(layout.arrows[0].from.x).not.toBeCloseTo(layout.arrows[1].from.x);
    expect(crossings(layout.arrows)).toBe(0);
  });

  it('shingles a wide attack instead of laying every attacker at the same height', () => {
    const attackers = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((name) => ({
      ...lastGame.players[0].battlefield[0],
      card: cardNamed(`attacker-${name}`),
    }));
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: attackers },
        { ...lastGame.players[1], battlefield: [] },
      ],
      combat: attackers.map((attacker) => ({
        defenderId: lastGame.players[1].playerId,
        blocked: false,
        attackers: [attacker.card],
        blockers: [],
      })),
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    const placed = layout.placements.filter((p) => p.kind === 'attacker');
    expect(placed.length).toBe(attackers.length);

    expect(new Set(placed.map((p) => p.position.y)).size).toBe(placed.length);

    const acrossTable = [...placed].sort((a, b) => a.position.x - b.position.x);
    for (let index = 1; index < acrossTable.length; index += 1) {
      expect(acrossTable[index].position.y).toBeGreaterThan(acrossTable[index - 1].position.y);
    }

    for (let index = 1; index < acrossTable.length; index += 1) {
      const gap = acrossTable[index].position.x - acrossTable[index - 1].position.x;
      expect(gap).toBeGreaterThan(CARD_W / 4);
    }
  });

  it('keeps a group with several blockers inside its own lane', () => {
    const attackerA = { ...lastGame.players[0].battlefield[0], card: cardNamed('attacker-a') };
    const attackerB = { ...lastGame.players[0].battlefield[0], card: cardNamed('attacker-b') };
    const gang = ['x', 'y', 'z'].map((name) => ({
      ...lastGame.players[1].battlefield[0],
      card: cardNamed(`gang-${name}`),
    }));
    const lone = { ...lastGame.players[1].battlefield[0], card: cardNamed('lone') };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [attackerA, attackerB] },
        { ...lastGame.players[1], battlefield: [...gang, lone] },
      ],
      combat: [
        {
          defenderId: lastGame.players[1].playerId,
          blocked: true,
          attackers: [attackerA.card],
          blockers: gang.map((blocker) => blocker.card),
        },
        {
          defenderId: lastGame.players[1].playerId,
          blocked: true,
          attackers: [attackerB.card],
          blockers: [lone.card],
        },
      ],
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    const at = (objectId: string) =>
      layout.placements.find((p) => p.objectId === objectId)!.position;
    const gangX = gang.map((blocker) => at(blocker.card.objectId).x);

    const loneX = at(lone.card.objectId).x;
    const side = Math.sign(loneX - gangX[1]);
    for (const x of gangX) {
      expect(Math.sign(loneX - x)).toBe(side);
      expect(Math.abs(loneX - x)).toBeGreaterThanOrEqual(CARD_W);
    }

    expect(at(attackerA.card.objectId).x).toBeCloseTo(gangX[1]);

    expect(crossings(layout.arrows)).toBe(0);
  });

  it('puts a group in the lane its arrow is headed for, so the lines fan out instead of crossing', () => {
    const walker = {
      ...lastGame.players[1].battlefield[0],
      card: { ...cardNamed('a-planeswalker'), typeLine: 'Legendary Planeswalker - Nixilis' },
    };
    const atPlayer = { ...lastGame.players[0].battlefield[0], card: cardNamed('at-player') };
    const atWalker = { ...lastGame.players[0].battlefield[0], card: cardNamed('at-walker') };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [atPlayer, atWalker] },
        { ...lastGame.players[1], battlefield: [walker] },
      ],

      combat: [
        {
          defenderId: lastGame.players[1].playerId,
          blocked: false,
          attackers: [atPlayer.card],
          blockers: [],
        },
        {
          defenderId: walker.card.objectId,
          defenderName: 'a-planeswalker',
          blocked: false,
          attackers: [atWalker.card],
          blockers: [],
        },
      ],
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    expect(layout.arrows.length).toBe(2);
    expect(crossings(layout.arrows)).toBe(0);

    const walkerPlacement = layout.placements.find((p) => p.objectId === walker.card.objectId)!;
    const attackerPlacement = layout.placements.find((p) => p.objectId === atWalker.card.objectId)!;
    const toWalker = layout.arrows.find((arrow) => arrow.from.x === attackerPlacement.position.x)!;
    expect(Math.sign(toWalker.from.x)).toBe(Math.sign(walkerPlacement.position.x));
  });

  it('draws an Equipment against the creature it is attached to, not in the side column', () => {
    const creature = {
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed('germ'), typeLine: 'Creature - Phyrexian Germ' },
      attachedTo: undefined,
      attachments: ['id-lashwrithe'],
    };
    const equipment = {
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed('lashwrithe'), typeLine: 'Artifact - Equipment' },
      attachedTo: creature.card.objectId,
      attachments: [],
    };

    const bystander = {
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed('bystander'), typeLine: 'Creature - Bear' },
      attachedTo: undefined,
      attachments: [],
    };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [creature, bystander, equipment] },
        { ...lastGame.players[1], battlefield: [] },
      ],
      combat: [],
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    const host = layout.placements.find((p) => p.objectId === creature.card.objectId)!;
    const attached = layout.placements.find((p) => p.objectId === equipment.card.objectId)!;

    expect(attached.kind).toBe('attachment');
    expect(attached.scale).toBe(ATTACHMENT_SCALE);
    expect(
      Math.hypot(attached.position.x - host.position.x, attached.position.z - host.position.z),
    ).toBeLessThan(BOARD_CARD_W);

    expect(attached.position.y).toBeLessThan(host.position.y);
    expect(attached.position.x).toBeGreaterThan(host.position.x);
    expect(attached.position.z).toBeLessThan(host.position.z);

    const neighbour = layout.placements.find((p) => p.objectId === bystander.card.objectId)!;
    expect(attached.position.y).toBeGreaterThan(neighbour.position.y);
  });

  it('slides a hovered attachment and everything stacked under it out from behind its host', () => {
    const creature = {
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed('germ'), typeLine: 'Creature - Phyrexian Germ' },
      attachedTo: undefined,
      attachments: ['id-a', 'id-b', 'id-c'],
    };
    const carried = ['a', 'b', 'c'].map((name) => ({
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed(name), typeLine: 'Artifact - Equipment' },
      attachedTo: creature.card.objectId,
      attachments: [],
    }));
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [creature, ...carried] },
        { ...lastGame.players[1], battlefield: [] },
      ],
      combat: [],
    };

    const stackFor = (raisedIds?: string[]) => {
      const layout = layoutBoard(game, game.players[0].playerId, { raisedIds });
      const host = layout.placements.find((p) => p.objectId === creature.card.objectId)!;
      return carried.map(
        (permanent) =>
          host.position.z -
          layout.placements.find((p) => p.objectId === permanent.card.objectId)!.position.z,
      );
    };

    const resting = stackFor();
    expect(resting[1] - resting[0]).toBeCloseTo(resting[2] - resting[1]);
    expect(resting[0]).toBeGreaterThan(0);

    const middle = stackFor([carried[1].card.objectId]);
    expect(middle[0]).toBeCloseTo(resting[0]);
    expect(middle[1] - resting[1]).toBeCloseTo(middle[2] - resting[2]);
    expect(middle[1]).toBeGreaterThan(resting[1]);

    for (const raised of [carried[0].card.objectId, creature.card.objectId]) {
      const all = stackFor([raised]);
      all.forEach((offset, index) => {
        expect(offset - resting[index]).toBeCloseTo(middle[1] - resting[1]);
      });
    }
  });

  it('takes an attachment with its host into the combat row', () => {
    const attacker = {
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed('germ'), typeLine: 'Creature - Phyrexian Germ' },
      attachedTo: undefined,
      attachments: ['id-lashwrithe', 'id-second'],
    };
    const equipment = {
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed('lashwrithe'), typeLine: 'Artifact - Equipment' },
      attachedTo: attacker.card.objectId,
      attachments: [],
    };
    const second = {
      ...equipment,
      card: { ...cardNamed('second'), typeLine: 'Artifact - Equipment' },
    };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [attacker, equipment, second] },
        { ...lastGame.players[1], battlefield: [] },
      ],
      combat: [
        {
          defenderId: lastGame.players[1].playerId,
          blocked: false,
          attackers: [attacker.card],
          blockers: [],
        },
      ],
    };

    const layout = layoutBoard(game, game.players[0].playerId);
    const host = layout.placements.find((p) => p.objectId === attacker.card.objectId)!;
    expect(host.kind).toBe('attacker');

    const carried = [equipment, second].map((permanent) =>
      layout.placements.find((p) => p.objectId === permanent.card.objectId)!,
    );
    for (const placement of carried) {
      expect(placement.kind).toBe('attachment');
      expect(
        Math.hypot(placement.position.x - host.position.x, placement.position.z - host.position.z),
      ).toBeLessThan(BOARD_CARD_W);
    }

    expect(carried[0].position.z).not.toBeCloseTo(carried[1].position.z);
  });

  it('leaves a permanent attached to something off-board in its own row', () => {
    const orphan = {
      ...lastGame.players[0].battlefield[0],
      card: { ...cardNamed('aura'), typeLine: 'Enchantment - Aura' },
      attachedTo: 'a-permanent-that-is-not-here',
      attachments: [],
    };
    const game: GameStateView = {
      ...lastGame,
      players: [
        { ...lastGame.players[0], battlefield: [orphan] },
        { ...lastGame.players[1], battlefield: [] },
      ],
      combat: [],
    };

    const placement = layoutBoard(game, game.players[0].playerId).placements.find(
      (p) => p.objectId === orphan.card.objectId,
    )!;
    expect(placement.kind).toBe('permanent');
    expect(placement.scale).toBe(1);
  });

  it('sticks the stack to the camera with the next thing to resolve on top', () => {
    const game: GameStateView = {
      ...lastGame,

      stack: [cardNamed('top'), cardNamed('bottom')],
    };
    const layout = layoutBoard(game, null);
    const stack = layout.placements.filter((p) => p.kind === 'stack');

    expect(stack.map((p) => p.card.name)).toEqual(['bottom', 'top']);
    for (const placement of stack) {
      expect(placement.seat).toBe(-1);

      expect(placement.space).toBe('camera');
      expect(placement.position.z).toBeLessThan(0);
      expect(placement.scale).toBeGreaterThan(1.4);
    }

    const top = stack.find((placement) => placement.card.name === 'top')!;
    const bottom = stack.find((placement) => placement.card.name === 'bottom')!;
    expect(top.position.x).toBeGreaterThan(bottom.position.x);
    expect(top.position.y).toBe(bottom.position.y);
    expect(stack.indexOf(top)).toBeGreaterThan(stack.indexOf(bottom));

    expect(stack[1].position.z).toBe(stack[0].position.z);

    for (const placement of layout.placements.filter((p) => p.kind !== 'stack')) {
      expect(placement.space).toBe('table');
      expect(placement.scale).toBe(tableScaleOf(placement.kind));
    }
  });

  it('keeps a tall stack in frame by tightening the fan', () => {
    const many = (count: number) =>
      layoutBoard(
        { ...lastGame, stack: Array.from({ length: count }, (_, i) => cardNamed(`s${i}`)) },
        null,
      ).placements.filter((p) => p.kind === 'stack');

    const short = many(2);
    const tall = many(8);
    expect(tall.at(-1)!.position.x - tall[0].position.x).toBeLessThan(2.9);

    expect(tall[1].position.x - tall[0].position.x).toBeLessThan(
      short[1].position.x - short[0].position.x,
    );
  });

  it('shows a pile rather than a zone: the graveyard is capped and the count lives in the HUD', () => {
    const player = {
      ...lastGame.players[0],
      graveyard: Array.from({ length: 30 }, (_, i) => cardNamed(`gy-${i}`)),
    };
    const layout = layoutBoard(
      { ...lastGame, players: [player, lastGame.players[1]] },
      player.playerId,
    );

    const pile = layout.placements.filter((p) => p.kind === 'graveyard' && p.seat === 0);

    expect(pile.length).toBe(4);

    expect(pile.at(-1)!.card.name).toBe('gy-29');
  });

  it('gives every seat a graveyard area, counted — exile is not drawn on the table at all', () => {
    const layout = layoutBoard(lastGame, defaultFocusPlayerId(lastGame));

    expect(layout.zones.length).toBe(lastGame.players.length);
    expect(layout.zones.every((zone) => zone.kind === 'graveyard')).toBe(true);
    for (const seat of layout.seats) {
      const zone = layout.zones.find((z) => z.seat === seat.index);
      expect(zone, `seat ${seat.index} has no graveyard area`).toBeTruthy();

      expect(zone!.count).toBe(seat.player.graveyard.length);
      for (const value of [
        zone!.position.x,
        zone!.position.z,
        zone!.labelPosition.x,
        zone!.labelPosition.z,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('keeps every zone area, and its label, on the mat', () => {
    const players = [0, 1, 2, 3].map((index) => ({
      ...lastGame.players[index % 2],
      playerId: `p${index}`,
    }));
    const layout = layoutBoard({ ...lastGame, players }, 'p0');
    expect(layout.zones.length).toBe(4);

    for (const zone of layout.zones) {
      for (const across of [-0.5, 0.5]) {
        for (const outward of [-0.5, 0.5]) {
          const corner = toWorld(zone.angle, across * zone.width, outward * zone.height, 0);
          const x = zone.position.x + corner.x;
          const z = zone.position.z + corner.z;
          expect(Math.hypot(x, z), `a ${zone.kind} corner is off the mat`).toBeLessThan(
            layout.table.radius,
          );
        }
      }
      expect(Math.hypot(zone.labelPosition.x, zone.labelPosition.z)).toBeLessThan(
        layout.table.radius,
      );
    }
  });

  it('keeps the pile inside the area drawn round it', () => {
    const filled = lastGame.players.map((player) => ({
      ...player,
      graveyard: Array.from({ length: 12 }, (_, index) => cardNamed(`gy-${index}`)),
    }));
    const layout = layoutBoard({ ...lastGame, players: filled }, filled[0].playerId);

    for (const zone of layout.zones) {
      const cards = layout.placements.filter((p) => p.seat === zone.seat && p.kind === zone.kind);
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        const dx = card.position.x - zone.position.x;
        const dz = card.position.z - zone.position.z;
        const local = toWorld(-zone.angle, dx, dz, 0);

        expect(Math.abs(local.x) + (BOARD_CARD_W * PILE_SCALE) / 2).toBeLessThanOrEqual(
          zone.width / 2,
        );
        expect(Math.abs(local.z) + (BOARD_CARD_H * PILE_SCALE) / 2).toBeLessThanOrEqual(
          zone.height / 2,
        );
      }
    }
  });

  it('overlaps a huge row instead of letting it slide off the table', () => {
    const wide = Array.from({ length: 40 }, (_, index) => rowX(40, index));
    const extent = Math.max(...wide) - Math.min(...wide);

    expect(extent + CARD_W).toBeLessThanOrEqual(4.8);

    expect(rowX(2, 1) - rowX(2, 0)).toBeGreaterThan(CARD_W);
    expect(wide[1] - wide[0]).toBeLessThan(CARD_W);
  });

  it('keeps a full land row clear of the pile column beside it', () => {
    const layout = layoutBoard(landRowGame(14), 'p-lands');
    const metrics = layout.table;
    const row = layout.placements.filter((p) => p.seat === 0 && p.kind === 'land');
    expect(row.length).toBe(14);

    const pileEdge = metrics.graveyardX + PILE_AREA_W / 2;
    for (const land of row) {
      expect(
        land.position.x - CARD_W / 2,
        `${land.card.name} is inside the pile column`,
      ).toBeGreaterThan(pileEdge);
    }
  });

  it('lays a revealed top card of library face up beside the graveyard', () => {
    const game = landRowGame(3);
    const player = { ...game.players[0], libraryCount: 40, topCard: cardNamed('Future Sight top') };
    const layout = layoutBoard({ ...game, players: [player, game.players[1]] }, 'p-lands');

    const top = layout.placements.find((placement) => placement.kind === 'library')!;
    expect(top.objectId).toBe('id-Future Sight top');
    expect(top.position.x).toBeCloseTo(layout.table.graveyardX, 10);

    expect(top.position.y).toBeGreaterThan(0);
    expect(top.position.y).toBeLessThan(PILE_DEPTH * CARD_THICKNESS * PILE_SCALE + 0.05);
    expect(BOARD_CARD_W * PILE_SCALE).toBeLessThanOrEqual(CARD_W * PILE_SCALE);
    expect(BOARD_CARD_H * PILE_SCALE).toBeLessThanOrEqual(CARD_H * PILE_SCALE);

    expect(
      layoutBoard(game, 'p-lands').placements.some((placement) => placement.kind === 'library'),
    ).toBe(false);
  });

  it('parts a packed row around the card being pointed at, and leaves a roomy one alone', () => {
    const rowFor = (count: number, raisedIds?: string[]) =>
      layoutBoard(landRowGame(count), 'p-lands', { raisedIds })
        .placements.filter((p) => p.seat === 0 && p.kind === 'land')
        .map((p) => p.position.x);

    const packed = rowFor(12);
    const raisedId = layoutBoard(landRowGame(12), 'p-lands').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    )[5].objectId;
    const parted = rowFor(12, [raisedId]);

    expect(parted[5]).toBeCloseTo(packed[5]);

    const spacing = packed[1] - packed[0];
    expect(packed[4] - parted[4]).toBeGreaterThan(spacing * 0.35);
    expect(parted[6] - packed[6]).toBeGreaterThan(spacing * 0.35);

    expect(parted[8]).toBeCloseTo(packed[8]);
    expect(parted[1]).toBeCloseTo(packed[1]);

    for (const x of parted) expect(Math.abs(x) + CARD_W / 2).toBeLessThanOrEqual(4.8 / 2 + 1e-9);

    const roomy = rowFor(4);
    const roomyId = layoutBoard(landRowGame(4), 'p-lands').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    )[1].objectId;
    expect(rowFor(4, [roomyId])).toEqual(roomy);
  });

  it('lifts each card in a row clear of the card below it, and of its rim', () => {
    const row = layoutBoard(landRowGame(12), 'p-lands').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    );

    for (let index = 1; index < row.length; index += 1) {
      const step = row[index].position.y - row[index - 1].position.y;
      expect(step, 'a row that does not climb is a row that z-fights').toBeGreaterThan(RIM_DEPTH);
    }

    expect(row.at(-1)!.position.y - row[0].position.y).toBeLessThan(BOARD_CARD_H / 4);
  });

  it('puts artifacts and enchantments beside the seat, not in a row behind its creatures', () => {
    const layout = layoutBoard(lastGame, defaultFocusPlayerId(lastGame));
    const support = layout.placements.filter((p) => p.kind === 'permanent');
    expect(support.length, 'the capture has no non-creature, non-land permanents').toBeGreaterThan(
      0,
    );

    for (const seat of layout.seats) {
      const own = support.filter((p) => p.seat === seat.index);
      if (!own.length) continue;

      const local = own.map((p) => toWorld(-seat.angle, p.position.x, p.position.z, 0));
      const rows = layout.placements
        .filter((p) => p.seat === seat.index && (p.kind === 'creature' || p.kind === 'land'))
        .map((p) => toWorld(-seat.angle, p.position.x, p.position.z, 0));

      for (const at of local) {
        for (const card of rows) expect(Math.abs(at.x - card.x)).toBeGreaterThan(CARD_W);

        expect(at.z).toBeLessThan(Math.max(...rows.map((card) => card.z)) + 1);
      }
    }
  });

  it('keeps every card on the mat, for a four-player pod as well as a duel', () => {
    const players = [0, 1, 2, 3].map((index) => ({
      ...lastGame.players[index % 2],
      playerId: `p${index}`,
    }));
    for (const game of [lastGame, { ...lastGame, players }]) {
      const layout = layoutBoard(game, null);
      const table = layout.placements.filter((p) => p.space === 'table');
      expect(table.length).toBeGreaterThan(0);
      for (const placement of table) {
        const scale = tableScaleOf(placement.kind);
        const halfDepth = (BOARD_CARD_H * scale) / 2;
        const halfWidth = (CARD_W * scale) / 2;

        const reach = Math.hypot(
          Math.abs(placement.position.x) + halfWidth,
          Math.abs(placement.position.z) + halfDepth,
        );
        expect(
          reach,
          `${placement.card.name} (${placement.kind}) hangs off the table`,
        ).toBeLessThan(layout.table.radius);
      }
    }
  });

  it('keeps every seat inside its own wedge of the table, for three players and for four', () => {
    for (const count of [3, 4]) {
      const layout = layoutBoard(podGame(count), 'p0');
      const wedge = Math.tan(Math.PI / count);
      expect(layout.seats.length).toBe(count);

      const rowKinds = ['land', 'creature', 'permanent', 'command', 'graveyard'];
      for (const placement of layout.placements.filter((p) => rowKinds.includes(p.kind))) {
        const seat = layout.seats[placement.seat];

        const scale = tableScaleOf(placement.kind);
        const local = toWorld(-seat.angle, placement.position.x, placement.position.z, 0);
        const across = Math.abs(local.x) + (CARD_W * scale) / 2;
        const outward = local.z - (BOARD_CARD_H * scale) / 2;
        expect(
          across,
          `${placement.card.name} (${placement.kind}) reaches into the next seat, ${count}-player`,
        ).toBeLessThanOrEqual(outward * wedge + 1e-9);
      }

      for (const zone of layout.zones) {
        for (const side of [-0.5, 0.5]) {
          const corner = toWorld(-zone.angle, zone.position.x, zone.position.z, 0);
          expect(Math.abs(corner.x + side * zone.width)).toBeLessThanOrEqual(
            (corner.z - zone.height / 2) * wedge + 1e-9,
          );
        }
        const label = toWorld(-zone.angle, zone.labelPosition.x, zone.labelPosition.z, 0);
        expect(Math.abs(label.x)).toBeLessThanOrEqual(label.z * wedge + 1e-9);
      }
    }
  });

  it('spreads nine cards in a pod row without overlapping them', () => {
    for (const count of [3, 4]) {
      const metrics = seatMetrics(count);
      expect(metrics.rowMaxW).toBeGreaterThan(seatMetrics(2).rowMaxW);

      const row = Array.from({ length: 9 }, (_, index) => rowX(9, index, metrics.rowMaxW));
      for (let index = 1; index < row.length; index += 1) {
        expect(
          row[index] - row[index - 1],
          `${count}-player row of nine is packed`,
        ).toBeGreaterThan(CARD_W);
      }

      expect(Math.abs(row[0]) + CARD_W / 2).toBeLessThanOrEqual(metrics.rowMaxW / 2 + 1e-9);
    }
  });

  it("lays each seat's cards along that seat, without turning any of them upside down", () => {
    expect(seatYaw(0)).toBe(0);
    expect(seatYaw(Math.PI)).toBeCloseTo(0);
    expect(seatYaw(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(seatYaw((2 * Math.PI) / 3)).toBeCloseTo(-Math.PI / 3);
    expect(seatYaw((4 * Math.PI) / 3)).toBeCloseTo(Math.PI / 3);
    for (const angle of [0, 1, 2, 3, 4, 5, 6])
      expect(Math.abs(seatYaw(angle))).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);

    const layout = layoutBoard(podGame(3), 'p0');
    for (const seat of layout.seats) {
      expect(Math.abs(Math.sin(seat.angle - seat.yaw))).toBeLessThan(1e-9);
      const own = layout.placements.filter((p) => p.seat === seat.index && p.space === 'table');
      expect(own.length).toBeGreaterThan(0);
      for (const placement of own) expect(placement.yaw).toBe(seat.yaw);
    }

    const held = { ...lastGame, players: podGame(3).players, myHand: [cardNamed('held-1')] };
    for (const placement of layoutBoard(held, 'p0').placements.filter(
      (p) => p.space === 'camera',
    )) {
      expect(placement.yaw).toBe(0);
    }
  });

  it('leaves the two-player table close to what it was', () => {
    const duel = seatMetrics(2);
    expect(duel.ring).toBe(0);
    expect(duel.rowMaxW).toBe(4.8);
    expect(duel.combatZ).toBeCloseTo(0.3872, 3);
    expect(duel.radius).toBeCloseTo(4.86, 1);

    const layout = layoutBoard(lastGame, defaultFocusPlayerId(lastGame));
    for (const seat of layout.seats) expect(seat.ring).toBe(0);

    for (const placement of layout.placements) expect(placement.yaw).toBeCloseTo(0);
  });

  it('pins the hand to the bottom of the frame rather than to the table', () => {
    const held = [cardNamed('held-1'), cardNamed('held-2'), cardNamed('held-3')];
    const me = { ...lastGame.players[1], isMe: true };
    const game: GameStateView = { ...lastGame, players: [lastGame.players[0], me], myHand: held };
    const hand = layoutBoard(game, null).placements.filter((p) => p.kind === 'hand');

    expect(hand.map((p) => p.card.name)).toEqual(['held-1', 'held-2', 'held-3']);
    for (const placement of hand) {
      expect(placement.space).toBe('camera');
      expect(placement.anchor).toBe('bottom');
      expect(placement.position.z).toBeLessThan(0);

      expect(placement.scale).toBe(1);
      expect(placement.position.y).toBe(0);

      expect(game.players[placement.seat].isMe).toBe(true);
    }

    expect(hand[0].position.x).toBeLessThan(0);
    expect(hand[1].position.x).toBeCloseTo(0);
    expect(hand[2].position.x).toBeGreaterThan(0);

    expect(hand[2].position.x - hand[1].position.x).toBeLessThan(1);
  });

  it('places nothing for the hand when it is put away', () => {
    const game: GameStateView = { ...lastGame, myHand: [cardNamed('held-1')] };
    const layout = layoutBoard(game, null, { showHand: false });
    expect(layout.placements.some((p) => p.kind === 'hand')).toBe(false);

    expect(layout.placements.length).toBe(layoutBoard(game, null).placements.length - 1);
  });

  it('rotates a seat frame without moving seat 0', () => {
    expect(toWorld(0, 1.5, 2, 0.1)).toEqual({ x: 1.5, y: 0.1, z: 2 });
    const opposite = toWorld(Math.PI, 1.5, 2, 0.1);
    expect(opposite.x).toBeCloseTo(-1.5);
    expect(opposite.z).toBeCloseTo(-2);
  });

  it('faces the player who is "me", and falls back to a stable seat for a spectator', () => {
    expect(lastGame.players.some((player) => player.isMe)).toBe(false);
    expect(defaultFocusPlayerId(lastGame)).toBe(lastGame.players[0].playerId);

    const seated = {
      ...lastGame,
      players: [lastGame.players[0], { ...lastGame.players[1], isMe: true }],
    };
    expect(defaultFocusPlayerId(seated)).toBe(lastGame.players[1].playerId);
    expect(defaultFocusPlayerId(null)).toBeNull();
  });

  function podGame(count: number): GameStateView {
    const players = Array.from({ length: count }, (_, index) => ({
      ...lastGame.players[index % lastGame.players.length],
      playerId: `p${index}`,
    }));
    return { ...lastGame, players, combat: [] };
  }

  function landRowGame(count: number): GameStateView {
    const template = lastGame.players[0].battlefield[0];
    const battlefield = Array.from({ length: count }, (_, index) => ({
      ...template,
      card: { ...cardNamed(`land-${index}`), typeLine: 'Land', rules: [`({T}: Add {C}${index}.)`] },
      attachedTo: undefined,
      attachments: [],
      tapped: false,
    }));
    return {
      ...lastGame,
      players: [
        {
          ...lastGame.players[0],
          playerId: 'p-lands',
          battlefield,
          commandZone: [],
          graveyard: [],
        },
        { ...lastGame.players[1], battlefield: [] },
      ],
      combat: [],
    };
  }

  function landStackGame(
    lands: { name: string; typeLine: string; rules?: string[]; tapped?: boolean }[],
    opponentLands: { name: string; typeLine: string; rules?: string[]; tapped?: boolean }[] = [],
  ): GameStateView {
    const template = lastGame.players[0].battlefield[0];
    const toBattlefield = (list: typeof lands) =>
      list.map((land) => ({
        ...template,
        card: { ...cardNamed(land.name), typeLine: land.typeLine, rules: land.rules ?? [] },
        attachedTo: undefined,
        attachments: [],
        tapped: land.tapped ?? false,
      }));
    return {
      ...lastGame,
      players: [
        {
          ...lastGame.players[0],
          playerId: 'p-stack',
          battlefield: toBattlefield(lands),
          commandZone: [],
          graveyard: [],
        },
        {
          ...lastGame.players[1],
          battlefield: toBattlefield(opponentLands),
          commandZone: [],
          graveyard: [],
        },
      ],
      combat: [],
    };
  }

  it('stacks lands that produce the same mana into one pile', () => {
    const game = landStackGame([
      { name: 'Forest 1', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 2', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 3', typeLine: 'Basic Land — Forest' },
      { name: 'Island 1', typeLine: 'Basic Land — Island' },
      { name: 'Island 2', typeLine: 'Basic Land — Island' },
      { name: 'Taiga', typeLine: 'Land — Mountain Forest', rules: ['({T}: Add {R} or {G}.)'] },
      { name: 'Snow Forest', typeLine: 'Basic Snow Land — Forest' },
    ]);
    const land = layoutBoard(game, 'p-stack').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    );
    expect(land.length).toBe(7);

    const byPile = (name: string) => land.find((p) => p.card.name === name)!;
    const forest1 = byPile('Forest 1');
    const forest2 = byPile('Forest 2');
    const snowForest = byPile('Snow Forest');
    const island1 = byPile('Island 1');
    const taiga = byPile('Taiga');

    expect(forest2.position.x).not.toBeCloseTo(forest1.position.x);
    expect(Math.abs(snowForest.position.x - forest1.position.x)).toBeGreaterThan(
      Math.abs(forest2.position.x - forest1.position.x),
    );

    expect(Math.abs(island1.position.x - forest1.position.x)).toBeGreaterThan(CARD_W / 2);
    expect(Math.abs(taiga.position.x - forest1.position.x)).toBeGreaterThan(CARD_W / 2);
  });

  it('keeps a tapped land in a separate pile from the untapped lands of the same mana', () => {
    const game = landStackGame([
      { name: 'Forest 1', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 2', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 3', typeLine: 'Basic Land — Forest', tapped: true },
    ]);
    const land = layoutBoard(game, 'p-stack').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    );
    const untapped = land.find((p) => p.card.name === 'Forest 2')!;
    const tapped = land.find((p) => p.card.name === 'Forest 3')!;
    expect(tapped.tapped).toBe(true);

    expect(Math.abs(tapped.position.x - untapped.position.x)).toBeGreaterThan(CARD_W / 2);
  });

  it('spaces every card in a deep pile far enough to clear the one above it', () => {
    const lands = Array.from({ length: 8 }, (_, index) => ({
      name: `Forest ${index}`,
      typeLine: 'Basic Land — Forest',
    }));
    const land = layoutBoard(landStackGame(lands), 'p-stack')
      .placements.filter((p) => p.seat === 0 && p.kind === 'land')
      .sort((a, b) => a.card.name.localeCompare(b.card.name, undefined, { numeric: true }));
    expect(land.length).toBe(8);

    for (let index = 1; index < land.length; index += 1) {
      const gap = land[index].position.z - land[index - 1].position.z;
      expect(gap === 0 || gap > BOARD_CREDIT_H).toBe(true);
    }
  });

  it('keeps a deep pile clear of the land pile beside it', () => {
    const lands = [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Forest ${index}`,
        typeLine: 'Basic Land — Forest',
      })),
      { name: 'Island 1', typeLine: 'Basic Land — Island' },
    ];
    const land = layoutBoard(landStackGame(lands), 'p-stack').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    );
    const forestCards = land.filter((p) => p.card.name.startsWith('Forest'));
    const island = land.find((p) => p.card.name === 'Island 1')!;

    for (const forest of forestCards) {
      expect(Math.abs(forest.position.x - island.position.x)).toBeGreaterThanOrEqual(CARD_W);
    }
  });

  it('spaces a deep tapped pile across, not outward, to clear the rotated credit strip', () => {
    const lands = Array.from({ length: 8 }, (_, index) => ({
      name: `Forest ${index}`,
      typeLine: 'Basic Land — Forest',
      tapped: true,
    }));
    const land = layoutBoard(landStackGame(lands), 'p-stack')
      .placements.filter((p) => p.seat === 0 && p.kind === 'land')
      .sort((a, b) => a.card.name.localeCompare(b.card.name, undefined, { numeric: true }));
    expect(land.length).toBe(8);
    for (let index = 1; index < land.length; index += 1) {
      const acrossGap = Math.abs(land[index].position.x - land[index - 1].position.x);
      expect(acrossGap === 0 || acrossGap > BOARD_CREDIT_H).toBe(true);
    }
  });

  it('gives a deep tapped pile less across-the-row reach than the same depth untapped', () => {
    const untappedLands = Array.from({ length: 6 }, (_, index) => ({
      name: `Untapped Forest ${index}`,
      typeLine: 'Basic Land — Forest',
    }));
    const tappedLands = Array.from({ length: 6 }, (_, index) => ({
      name: `Tapped Forest ${index}`,
      typeLine: 'Basic Land — Forest',
      tapped: true,
    }));
    const reachOf = (lands: { name: string; typeLine: string; tapped?: boolean }[]) => {
      const land = layoutBoard(landStackGame(lands), 'p-stack').placements.filter(
        (p) => p.seat === 0 && p.kind === 'land',
      );
      const xs = land.map((p) => p.position.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(reachOf(tappedLands)).toBeLessThan(reachOf(untappedLands));
  });

  it('puts the tapped pile to the left of the untapped pile it came from', () => {
    const game = landStackGame([
      { name: 'Forest 1', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 2', typeLine: 'Basic Land — Forest', tapped: true },
    ]);
    const land = layoutBoard(game, 'p-stack').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    );
    const untapped = land.find((p) => p.card.name === 'Forest 1')!;
    const tapped = land.find((p) => p.card.name === 'Forest 2')!;
    expect(tapped.position.x).toBeLessThan(untapped.position.x);
  });

  it('mirrors the across-the-row fan for a flipped seat, so it still clears the artist credit', () => {
    const lands = [
      { name: 'Forest 1', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 2', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 3', typeLine: 'Basic Land — Forest' },
    ];
    const game = landStackGame(lands, lands);
    const layout = layoutBoard(game, 'p-stack');
    expect(layout.seats[1].angle).toBeCloseTo(Math.PI, 5);
    expect(layout.seats[1].yaw).toBeCloseTo(0, 5);

    const relativeFan = (seatIndex: number) => {
      const land = layout.placements
        .filter((p) => p.seat === seatIndex && p.kind === 'land')
        .sort((a, b) => a.card.name.localeCompare(b.card.name));
      const top = land.find((p) => p.card.name === 'Forest 1')!;
      const deepest = land.find((p) => p.card.name === 'Forest 3')!;
      return deepest.position.x - top.position.x;
    };

    const seat0Fan = relativeFan(0);
    const seat1Fan = relativeFan(1);
    expect(seat1Fan).toBeCloseTo(seat0Fan, 5);
    expect(Math.abs(seat0Fan)).toBeGreaterThan(0.01);
  });

  it('never lets a flipped seat’s land pile encroach on its own creature row', () => {
    const lands = Array.from({ length: 6 }, (_, index) => ({
      name: `Forest ${index}`,
      typeLine: 'Basic Land — Forest',
    }));
    const layout = layoutBoard(landStackGame([], lands), 'p-stack');
    const seat1 = layout.seats[1];
    expect(seatFlipped(seat1)).toBe(true);
    const baseline = seat1.ring + ROW_Z.land;
    const land = layout.placements.filter((p) => p.seat === 1 && p.kind === 'land');
    expect(land.length).toBe(6);
    for (const placement of land) {
      const localOutward = -placement.position.z;
      expect(localOutward).toBeGreaterThanOrEqual(baseline - 1e-9);
    }
  });

  it('gives every land in a pile the same pileId, and different piles different ones', () => {
    const game = landStackGame([
      { name: 'Forest 1', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 2', typeLine: 'Basic Land — Forest' },
      { name: 'Forest 3', typeLine: 'Basic Land — Forest', tapped: true },
      { name: 'Island 1', typeLine: 'Basic Land — Island' },
    ]);
    const land = layoutBoard(game, 'p-stack').placements.filter(
      (p) => p.seat === 0 && p.kind === 'land',
    );
    const byName = (name: string) => land.find((p) => p.card.name === name)!;

    expect(byName('Forest 1').pileId).toBeTruthy();
    expect(byName('Forest 2').pileId).toBe(byName('Forest 1').pileId);

    expect(byName('Forest 3').pileId).not.toBe(byName('Forest 1').pileId);

    expect(byName('Island 1').pileId).not.toBe(byName('Forest 1').pileId);
  });

  it('survives having no game at all', () => {
    const layout = layoutBoard(null, null);
    expect(layout).toEqual({
      seats: [],
      placements: [],
      arrows: [],
      zones: [],
      table: seatMetrics(0),
    });

    expect(layout.table.radius).toBe(TABLE_RADIUS);
  });
});

function tableScaleOf(kind: string): number {
  if (kind === 'graveyard' || kind === 'command' || kind === 'library') return PILE_SCALE;
  if (kind === 'attachment') return ATTACHMENT_SCALE;
  if (kind === 'land') return LAND_SCALE;
  return 1;
}

function crossings(
  arrows: { from: { x: number; z: number }; to: { x: number; z: number } }[],
): number {
  const side = (
    a: { x: number; z: number },
    b: { x: number; z: number },
    p: { x: number; z: number },
  ) => Math.sign((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
  const shared = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z) < 1e-6;

  let count = 0;
  for (let i = 0; i < arrows.length; i += 1) {
    for (let j = i + 1; j < arrows.length; j += 1) {
      const [first, second] = [arrows[i], arrows[j]];
      const ends = [first.from, first.to];
      if (ends.some((end) => shared(end, second.from) || shared(end, second.to))) continue;
      const straddles =
        side(first.from, first.to, second.from) * side(first.from, first.to, second.to) < 0 &&
        side(second.from, second.to, first.from) * side(second.from, second.to, first.to) < 0;
      if (straddles) count += 1;
    }
  }
  return count;
}

function cardNamed(name: string) {
  return {
    objectId: `id-${name}`,
    name,
    rules: [],
    colors: [],
    icons: [],
    faceDown: false,
    isToken: false,
    counters: [],
    targets: [],
  };
}
