import { Group, Scene } from 'three';
import { AURORA_SPIN, type AuroraRing, auroraRing, disposeAurora, spinAurora } from './aurora';
import { MOTION_ALLOWED } from './motion';
import { TABLE_CARD_RENDER_ORDER } from './sizes';
import { FOCUS_RING_BAND, FOCUS_RING_GLOW } from './theme';

const RADIUS = 0.07;

const Y = { outer: 0.003, inner: 0.0031 };

export class FocusRing {
  private readonly group = new Group();
  private readonly outer: AuroraRing;
  private readonly inner: AuroraRing;

  constructor(scene: Scene) {
    const shared = {
      radius: RADIUS,
      segments: 64,
      band: FOCUS_RING_BAND,
      renderOrder: TABLE_CARD_RENDER_ORDER,
    };
    this.outer = auroraRing({ ...shared, stops: FOCUS_RING_GLOW.outer, seed: 4, y: Y.outer });
    this.inner = auroraRing({ ...shared, stops: FOCUS_RING_GLOW.inner, seed: 11, y: Y.inner });
    this.group.add(this.outer, this.inner);
    this.group.visible = false;
    scene.add(this.group);
  }

  show(x: number, z: number): void {
    this.group.position.x = x;
    this.group.position.z = z;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  step(dt: number): boolean {
    if (!MOTION_ALLOWED || !this.group.visible) return false;
    spinAurora(this.outer, AURORA_SPIN.outer, dt);
    spinAurora(this.inner, AURORA_SPIN.inner, dt);
    return true;
  }

  dispose(): void {
    disposeAurora(this.outer);
    disposeAurora(this.inner);
  }
}
