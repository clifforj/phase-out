import { fieldShare, pivotZ } from './camera-pivot';
import { seatMetrics } from './seat-metrics';

describe('camera pivot', () => {
  const duel = seatMetrics(2);
  const pod = seatMetrics(4);

  const presetDistance = Math.hypot(5.75 - 0.7, 5.1);

  it('leaves a preset framed on the table', () => {
    expect(presetDistance).toBeGreaterThan(6);
    expect(fieldShare(presetDistance)).toBe(0);
    expect(pivotZ(presetDistance, 0, duel.fieldZ)).toBe(0);

    expect(fieldShare(presetDistance * 1.3)).toBe(0);
  });

  it("arrives on the near seat's board before the camera runs out of room", () => {
    expect(fieldShare(4)).toBe(1);
    expect(pivotZ(4, 0, duel.fieldZ)).toBeCloseTo(duel.fieldZ, 6);

    expect(duel.fieldZ).toBeGreaterThan(1);
  });

  it('slides smoothly and only ever forwards as the camera closes in', () => {
    let previous = -1;
    for (let distance = 12; distance >= 4; distance -= 0.05) {
      const share = fieldShare(distance);
      expect(share).toBeGreaterThanOrEqual(previous);
      previous = share;
    }

    const band = (from: number, to: number) => Math.abs(fieldShare(from) - fieldShare(to));
    expect(band(7.1, 6.87)).toBeLessThan(band(6.02, 5.79) / 3);
    expect(band(5.03, 4.8)).toBeLessThan(band(6.02, 5.79) / 3);
  });

  it('treats a bigger table at the same relative distance', () => {
    const scale = pod.reach / duel.reach;
    expect(scale).toBeGreaterThan(1);

    expect(fieldShare(6.5 * scale, scale)).toBeCloseTo(fieldShare(6.5), 6);

    expect(pivotZ(4 * scale, 0, pod.fieldZ, scale)).toBeCloseTo(pod.fieldZ, 6);
    expect(pod.fieldZ).toBeGreaterThan(duel.fieldZ);
  });

  it('starts from whatever the current preset aims at', () => {
    expect(pivotZ(presetDistance, -0.4, duel.fieldZ)).toBe(-0.4);
    expect(pivotZ(4, -0.4, duel.fieldZ)).toBeCloseTo(duel.fieldZ, 6);
    const middle = pivotZ(6, -0.4, duel.fieldZ);
    expect(middle).toBeGreaterThan(-0.4);
    expect(middle).toBeLessThan(duel.fieldZ);
  });
});
