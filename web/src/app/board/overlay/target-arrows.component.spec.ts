import { TestBed } from '@angular/core/testing';
import type { StackTargetLink } from '../../rules/stack-targets';
import type { CardAnchor, SeatAnchor, StackAnchor } from '../scene/board-scene';
import { arrowShape, edgeToward, targetArrowsFor, type TargetArrow } from '../target-arrows';
import { TargetArrowsComponent } from './target-arrows.component';

describe('target arrows', () => {
  const stackCard: StackAnchor = {
    objectId: 'spell',
    y: 300,
    left: 200,
    right: 320,
    top: 216,
    bottom: 384,
  };

  const permanent: StackTargetLink = {
    sourceId: 'spell',
    target: { kind: 'permanent', objectId: 'bear' },
  };
  const player: StackTargetLink = { sourceId: 'spell', target: { kind: 'player', playerId: 'p1' } };

  const bear: CardAnchor = { objectId: 'bear', x: 900, y: 500, visible: true };
  const seat: SeatAnchor = { seat: 1, x: 700, y: 90, visible: true };

  function anchors(overrides: Partial<Parameters<typeof targetArrowsFor>[1]> = {}) {
    return {
      stack: [stackCard],
      cards: [bear],
      seats: [{ playerId: 'p1', anchor: seat }],
      ...overrides,
    };
  }

  describe('targetArrowsFor', () => {
    it('draws one arrow per target, from the card that named it', () => {
      const arrows = targetArrowsFor([permanent, player], anchors());
      expect(arrows.map((arrow) => arrow.kind)).toEqual(['permanent', 'player']);

      expect(arrows.map((arrow) => arrow.id)).toEqual(['spell bear', 'spell p1']);
      expect(arrows[0].to).toEqual({ x: 900, y: 500 });
      expect(arrows[1].to).toEqual({ x: 700, y: 90 });
    });

    it('starts on the outline of the stack card, on the side the target is', () => {
      const [toBear] = targetArrowsFor([permanent], anchors());

      expect(toBear.from.x).toBeGreaterThan(stackCard.right);
      expect(toBear.from.x).toBeLessThan(stackCard.right + 20);
      expect(toBear.from.y).toBeGreaterThan(stackCard.y);

      const above = { playerId: 'p1', anchor: { ...seat, x: 300, y: 60 } };
      const [toSeat] = targetArrowsFor([player], anchors({ seats: [above] }));
      expect(toSeat.from.y).toBeLessThan(stackCard.top);
      expect(toSeat.from.y).toBeGreaterThan(stackCard.top - 20);
    });

    it('drops an arrow it cannot honestly place', () => {
      expect(targetArrowsFor([permanent], anchors({ stack: [] }))).toEqual([]);

      expect(targetArrowsFor([permanent], anchors({ cards: [] }))).toEqual([]);

      expect(
        targetArrowsFor([permanent], anchors({ cards: [{ ...bear, visible: false }] })),
      ).toEqual([]);
      expect(
        targetArrowsFor([player], anchors({ seats: [{ playerId: 'p1', anchor: null }] })),
      ).toEqual([]);

      expect(targetArrowsFor([player], anchors({ seats: [] }))).toEqual([]);
    });

    it('points at the visible edge of a spell it is countering, not into the fan', () => {
      const below: StackAnchor = {
        objectId: 'bolt',
        y: 420,
        left: 200,
        right: 320,
        top: 336,
        bottom: 504,
      };
      const [arrow] = targetArrowsFor(
        [{ sourceId: 'spell', target: { kind: 'stack', objectId: 'bolt' } }],
        anchors({ stack: [stackCard, below] }),
      );

      expect(arrow.to).toEqual({ x: 260, y: 504 });
      expect(arrow.to.y).toBeGreaterThan(stackCard.bottom);
    });
  });

  describe('arrowShape', () => {
    it('is a curve in a local frame, pointing along +x and stopping short of the tip', () => {
      const shape = arrowShape({ x: 100, y: 100 }, { x: 500, y: 100 })!;
      expect(shape.shaft).toMatch(/^M 0 0 Q /);

      const [, tipX, tipY] = shape.shaft.match(/Q [\d.-]+ [\d.-]+ ([\d.-]+) ([\d.-]+)$/)!;

      expect(Number(tipX)).toBeCloseTo(382, 5);
      expect(Number(tipY)).toBeCloseTo(0, 5);

      const [, controlY] = shape.shaft.match(/Q [\d.-]+ ([\d.-]+)/)!;
      expect(Math.abs(Number(controlY))).toBeGreaterThan(20);
    });

    it('bows to the same local side however it is aimed, so a sheaf of them does not knot', () => {
      const bowOf = (to: { x: number; y: number }) => {
        const [, , controlY] = arrowShape({ x: 300, y: 300 }, to)!.shaft.match(
          /Q ([\d.-]+) ([\d.-]+)/,
        )!;
        return Number(controlY);
      };

      expect(bowOf({ x: 700, y: 300 })).toBeGreaterThan(0);
      expect(bowOf({ x: 300, y: 700 })).toBeGreaterThan(0);
      expect(bowOf({ x: -100, y: 300 })).toBeGreaterThan(0);
    });

    it('carries the local shaft to its real position and heading', () => {
      const rightward = arrowShape({ x: 300, y: 300 }, { x: 700, y: 300 })!;
      expect(rightward.transform).toBe('translate(300 300) rotate(0)');

      const downward = arrowShape({ x: 300, y: 300 }, { x: 300, y: 700 })!;
      expect(downward.transform).toBe('translate(300 300) rotate(90)');

      const leftward = arrowShape({ x: 300, y: 300 }, { x: -100, y: 300 })!;
      expect(leftward.transform).toBe('translate(300 300) rotate(180)');
    });

    it('draws nothing between two things that are on top of each other', () => {
      expect(arrowShape({ x: 100, y: 100 }, { x: 120, y: 110 })).toBeNull();
      expect(arrowShape({ x: 100, y: 100 }, { x: 100, y: 100 })).toBeNull();
    });
  });

  describe('edgeToward', () => {
    const box = { left: 0, right: 100, top: 0, bottom: 200 };

    it('leaves through whichever edge the ray reaches first', () => {
      expect(edgeToward(box, { x: 500, y: 100 }, 10)).toEqual({ x: 110, y: 100 });

      expect(edgeToward(box, { x: 50, y: 900 }, 10)).toEqual({ x: 50, y: 210 });
    });

    it('never lands inside the box it is leaving', () => {
      for (const angle of [0, 0.3, 1.1, 2.4, 3.5, 4.7, 5.9]) {
        const point = edgeToward(box, {
          x: 50 + Math.cos(angle) * 400,
          y: 100 + Math.sin(angle) * 400,
        });
        const outside =
          point.x <= box.left ||
          point.x >= box.right ||
          point.y <= box.top ||
          point.y >= box.bottom;
        expect(outside, `${angle} rad landed at ${point.x},${point.y}`).toBe(true);
      }
    });

    it('gives up on a target in the exact middle rather than dividing by nothing', () => {
      expect(edgeToward(box, { x: 50, y: 100 })).toEqual({ x: 50, y: 100 });
    });
  });

  describe('the component', () => {
    function render(arrows: TargetArrow[]) {
      const fixture = TestBed.createComponent(TargetArrowsComponent);
      fixture.componentRef.setInput('arrows', arrows);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('draws a shaft per arrow, and hides the lot from a screen reader', () => {
      const element = render([
        { id: 'a', kind: 'permanent', from: { x: 100, y: 100 }, to: { x: 500, y: 300 } },
        { id: 'b', kind: 'player', from: { x: 100, y: 100 }, to: { x: 200, y: 600 } },
      ]);

      expect(element.querySelectorAll('g.arrow')).toHaveLength(2);

      expect(element.querySelectorAll('path')).toHaveLength(4);
      expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

      expect(element.querySelector('g.at-player')).not.toBeNull();
    });

    it('drops an arrow too short to be a picture rather than drawing a smudge', () => {
      const element = render([
        { id: 'a', kind: 'permanent', from: { x: 100, y: 100 }, to: { x: 110, y: 105 } },
      ]);
      expect(element.querySelectorAll('g.arrow')).toHaveLength(0);
    });
  });
});
