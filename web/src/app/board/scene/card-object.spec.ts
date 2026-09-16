import { MeshBasicMaterial, PerspectiveCamera } from 'three';
import { CardObject, cardGeometry } from './card-object';
import type { Placement } from './layout';
import { LAYER_STEP } from './sizes';

describe('card easing', () => {
  const camera = new PerspectiveCamera();
  const dt = 1 / 60;

  function card(at: { x: number; y: number; z: number }, scale = 1): CardObject {
    const object = new CardObject('c1', new MeshBasicMaterial(), cardGeometry('board'));
    object.group.position.set(at.x, at.y, at.z);
    object.setTarget(target(at), 0, scale);
    settle(object);
    return object;
  }

  function target(position: { x: number; y: number; z: number }): Placement {
    return {
      objectId: 'c1',
      card: { objectId: 'c1', name: 'Card' } as Placement['card'],
      permanent: null,
      seat: 0,
      kind: 'creature',
      position,
      spin: 0,
      yaw: 0,
      tilt: 0,
      space: 'table',
      scale: 1,
      tapped: false,
      faded: false,
    };
  }

  function settle(object: CardObject): number {
    let frames = 0;
    while (object.needsStep && frames < 600) {
      object.step(dt, camera);
      frames += 1;
    }
    return frames;
  }

  it('arrives on a lift of a few layers rather than near it', () => {
    const host = card({ x: 1, y: 0.05, z: 2 });
    const lifted = { x: 1, y: 0.05 + 5 * LAYER_STEP, z: 2 };
    host.setTarget(target(lifted), 0, 1);

    settle(host);

    expect(
      host.group.position.y,
      'a host that stops short of its lift is drawn under its own Equipment',
    ).toBe(lifted.y);
  });

  it('leaves an attachment under its host once both have settled', () => {
    const row = 0.05;
    const host = card({ x: 1, y: row, z: 2 });
    const equipment = card({ x: -2.5, y: row, z: 2.4 }, 0.6);
    host.setTarget(target({ x: 1, y: row + 5 * LAYER_STEP, z: 2 }), 0, 1);
    equipment.setTarget(target({ x: 1.3, y: row + 3.5 * LAYER_STEP, z: 1.6 }), 0, 0.6);

    while (host.needsStep || equipment.needsStep) {
      if (host.needsStep) host.step(dt, camera);
      if (equipment.needsStep) equipment.step(dt, camera);
    }

    expect(
      host.group.position.y - equipment.group.position.y,
      'the Equipment ends up on top of the creature it is attached to',
    ).toBeCloseTo(1.5 * LAYER_STEP, 10);
  });

  it('still stops in a reasonable number of frames', () => {
    const flying = card({ x: -3, y: 0.05, z: 3 });
    flying.setTarget(target({ x: 3, y: 0.05, z: -3 }), 0, 1);

    expect(settle(flying)).toBeLessThan(75);
  });
});
