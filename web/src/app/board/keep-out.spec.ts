import type { SeatAnchor, StackAnchor } from './scene/board-scene';
import { inflate, inside, seatsOnTheStack, stackKeepOut } from './keep-out';
import { SEAT_CHIP_HALF } from './overlay/seat-hud.component';
import { ZONE_LABEL_HALF } from './overlay/zone-label.component';

describe('keep-out', () => {
  const card = (top: number, bottom: number): StackAnchor => ({
    objectId: `stack-${top}`,
    left: 250,
    right: 430,
    top,
    bottom,
    y: (top + bottom) / 2,
  });

  const seat = (index: number, x: number, y: number): SeatAnchor => ({
    seat: index,
    x,
    y,
    visible: true,
  });

  it('holds the whole fan, not just the card on top', () => {
    const box = stackKeepOut([card(120, 340), card(200, 420)]);
    expect(box).toEqual({ left: 250, right: 430, top: 120, bottom: 420 });
  });

  it('is nothing at all when the stack is empty', () => {
    expect(stackKeepOut([])).toBeNull();
    expect(inflate(null, SEAT_CHIP_HALF)).toBeNull();
    expect(inside(null, { x: 300, y: 300 })).toBe(false);
    expect(seatsOnTheStack(null, [seat(0, 340, 300)], SEAT_CHIP_HALF).size).toBe(0);
  });

  it('keeps a chip clear by its own half-width, not by a pixel', () => {
    const box = stackKeepOut([card(200, 420)])!;

    const grazing = seat(1, box.right + SEAT_CHIP_HALF.x - 20, 300);
    expect(inside(box, grazing)).toBe(false);
    expect(inside(inflate(box, SEAT_CHIP_HALF), grazing)).toBe(true);

    expect(
      inside(inflate(box, SEAT_CHIP_HALF), seat(1, box.right + SEAT_CHIP_HALF.x + 20, 300)),
    ).toBe(false);
  });

  it('gives a zone label a smaller berth than a seat chip', () => {
    const box = stackKeepOut([card(200, 420)])!;
    expect(ZONE_LABEL_HALF.x).toBeLessThan(SEAT_CHIP_HALF.x);
    expect(ZONE_LABEL_HALF.y).toBeLessThan(SEAT_CHIP_HALF.y);

    const spot = { x: box.right + (ZONE_LABEL_HALF.x + SEAT_CHIP_HALF.x) / 2, y: 300 };
    expect(inside(inflate(box, ZONE_LABEL_HALF), spot)).toBe(false);
    expect(inside(inflate(box, SEAT_CHIP_HALF), spot)).toBe(true);
  });

  it('names the seats that are over it, and only those', () => {
    const box = stackKeepOut([card(200, 420)])!;
    const covered = seatsOnTheStack(
      box,
      [
        seat(0, 340, 300),
        seat(1, 900, 300),
        seat(2, 340, 700),
        seat(3, box.left - SEAT_CHIP_HALF.x + 20, 250),
      ],
      SEAT_CHIP_HALF,
    );
    expect([...covered].sort()).toEqual([0, 3]);
  });

  it('answers with one and the same empty set while the camera is moved', () => {
    const box = stackKeepOut([card(200, 420)]);
    const clear = [seat(0, 900, 300)];

    expect(seatsOnTheStack(box, clear, SEAT_CHIP_HALF)).toBe(
      seatsOnTheStack(box, clear, SEAT_CHIP_HALF),
    );
    expect(seatsOnTheStack(null, clear, SEAT_CHIP_HALF)).toBe(
      seatsOnTheStack(box, clear, SEAT_CHIP_HALF),
    );
  });
});
