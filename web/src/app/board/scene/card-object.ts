import {
  BufferGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  ShapeGeometry,
  Vector3,
} from 'three';
import { cardEdgeMaterial } from './card-edge';
import { memoised, roundedRectShape } from './geometry';
import type { Placement } from './layout';
import type { ZoneRef } from '../../rules/zones';
import type { FaceStyle } from './paint-face';
import { rimGlow } from './rim-glow';
import {
  BOARD_CARD_H,
  BOARD_CARD_W,
  CARD_H,
  CARD_W,
  LAYER_STEP,
  RIM_DEPTH,
  TABLE_CARD_RENDER_ORDER,
} from './sizes';

export const MOVE_LAMBDA = 9;
const TURN_LAMBDA = 11;

const SETTLED = (LAYER_STEP / 4) ** 2;

export const RIM_SCALE = 1.28;
export const HAND_RIM_SCALE = 1.24;

export const HOVER_LIFT = 0.015;
export const HOVER_SCALE = 1.05;

const geometries = new Map<string, ShapeGeometry>();

export function cardGeometry(style: FaceStyle): ShapeGeometry {
  const portrait = style !== 'board';
  return memoised(geometries, portrait ? 'portrait' : 'landscape', () => {
    const cardW = portrait ? CARD_W : BOARD_CARD_W;
    const cardH = portrait ? CARD_H : BOARD_CARD_H;
    const geometry = new ShapeGeometry(roundedRectShape(cardW, cardH, cardW * 0.055), 6);
    const positions = geometry.attributes['position'];
    const uv = geometry.attributes['uv'];
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, (positions.getX(i) + cardW / 2) / cardW, (positions.getY(i) + cardH / 2) / cardH);
    }
    uv.needsUpdate = true;
    return geometry;
  });
}

const bodies = new Map<string, ExtrudeGeometry>();

export function cardBodyGeometry(style: FaceStyle, thickness: number): ExtrudeGeometry {
  const portrait = style !== 'board';
  return memoised(bodies, `${portrait ? 'portrait' : 'landscape'}:${thickness}`, () => {
    const cardW = portrait ? CARD_W : BOARD_CARD_W;
    const cardH = portrait ? CARD_H : BOARD_CARD_H;
    const geometry = new ExtrudeGeometry(roundedRectShape(cardW, cardH, cardW * 0.055), {
      depth: thickness,
      bevelEnabled: false,
      steps: 1,
    });
    const positions = geometry.attributes['position'];
    const uv = geometry.attributes['uv'];
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, (positions.getX(i) + cardW / 2) / cardW, (positions.getY(i) + cardH / 2) / cardH);
    }
    uv.needsUpdate = true;
    geometry.userData['thickness'] = thickness;
    return geometry;
  });
}

export interface Highlight {
  color: number;

  strength: number;
}

export class CardObject {
  readonly group = new Group();
  private _face: Mesh<BufferGeometry, MeshBasicMaterial | MeshBasicMaterial[]>;
  private readonly rim: Mesh<ShapeGeometry, MeshBasicMaterial>;

  private thickness: number;

  private readonly targetPosition = new Vector3();
  private targetSpin = 0;
  private targetTilt = 0;
  private targetYaw = 0;
  private targetScale = 1;
  private targetRoll = 0;

  private anchored = false;

  private readonly targetLocalOffset = new Vector3();
  private readonly currentLocalOffset = new Vector3();

  private localOffsetReady = false;
  private currentSpin = 0;
  private currentTilt = 0;
  private currentYaw = 0;
  private currentScale = 0.001;
  private currentRoll = 0;
  private rimScale = 1;

  private settled = false;

  seen = true;
  leaving = false;

  constructor(
    readonly objectId: string,
    material: MeshBasicMaterial,
    geometry: ShapeGeometry,
    body: ExtrudeGeometry | null = null,
  ) {
    this.thickness = (body?.userData['thickness'] as number | undefined) ?? 0;
    this._face = body
      ? new Mesh(body, [material, cardEdgeMaterial()])
      : new Mesh(geometry, material);
    this._face.userData['objectId'] = objectId;

    this.rim = new Mesh(
      geometry,
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        alphaMap: rimGlow.variantFor(objectId),
      }),
    );
    this.rim.position.z = this.thickness - RIM_DEPTH;
    this.rim.scale.setScalar(RIM_SCALE);
    this.rim.raycast = () => {};

    this.group.add(this.rim, this._face);

    this.group.rotation.order = 'YXZ';
    this.group.scale.setScalar(this.currentScale);
    this.setRenderOrder(TABLE_CARD_RENDER_ORDER);
  }

  get face(): Mesh<BufferGeometry, MeshBasicMaterial | MeshBasicMaterial[]> {
    return this._face;
  }

  setMaterial(material: MeshBasicMaterial): void {
    if (Array.isArray(this._face.material)) {
      if (this._face.material[0] !== material) this._face.material[0] = material;
    } else if (this._face.material !== material) {
      this._face.material = material;
    }
  }

  setRimScale(scale: number): void {
    this.rimScale = scale;
    if (this.rim.material.opacity > 0) this.rim.scale.setScalar(scale);
  }

  setGeometry(
    geometry: ShapeGeometry,
    material: MeshBasicMaterial,
    body: ExtrudeGeometry | null = null,
  ): void {
    const wantsBody = body !== null;
    const current = wantsBody ? body : geometry;
    const matches =
      wantsBody === Array.isArray(this._face.material) && this._face.geometry === current;
    if (matches) {
      this.setMaterial(material);
    } else {
      const { renderOrder } = this._face;
      const layerMask = this._face.layers.mask;
      const zone = this._face.userData['zone'] as ZoneRef | null;
      this.group.remove(this._face);
      this._face = body
        ? new Mesh(body, [material, cardEdgeMaterial()])
        : new Mesh(geometry, material);
      this._face.userData['objectId'] = this.objectId;
      this._face.userData['zone'] = zone;
      this._face.renderOrder = renderOrder;
      this._face.layers.mask = layerMask;
      this.group.add(this._face);
      this.thickness = (body?.userData['thickness'] as number | undefined) ?? 0;
      this.rim.position.z = this.thickness - RIM_DEPTH;
    }
    if (this.rim.geometry !== geometry) this.rim.geometry = geometry;
  }

  setZone(zone: ZoneRef | null): void {
    this._face.userData['zone'] = zone;
  }

  setRenderOrder(order: number): void {
    this._face.renderOrder = order;
    this.rim.renderOrder = order;
  }

  setLayer(layer: number): void {
    this.group.layers.set(layer);
    this._face.layers.set(layer);
    this.rim.layers.set(layer);
  }

  setTarget(placement: Placement, lift: number, scale: number): void {
    this.targetPosition.set(
      placement.position.x,
      placement.position.y + lift,
      placement.position.z,
    );
    this.targetSpin = placement.spin;
    this.targetTilt = placement.tilt;
    this.targetYaw = placement.yaw;
    this.targetScale = scale;
    this.settled = false;
    if (this.anchored) {
      this.anchored = false;
      this.setRenderOrder(TABLE_CARD_RENDER_ORDER);
    }
  }

  anchorAt(localOffset: Vector3, scale: number, roll = 0): void {
    if (!this.anchored) {
      this.anchored = true;
      this.localOffsetReady = false;
    }
    this.targetLocalOffset.copy(localOffset);
    this.targetScale = scale;
    this.targetSpin = 0;
    this.targetTilt = 0;
    this.targetYaw = 0;
    this.targetRoll = roll;
  }

  anchorFrom(localOffset: Vector3, scale: number, roll: number): void {
    this.currentLocalOffset.copy(localOffset);
    this.localOffsetReady = true;
    this.currentScale = scale;
    this.currentRoll = roll;
  }

  setHighlight(highlight: Highlight | null): void {
    const material = this.rim.material;
    if (!highlight) {
      material.opacity = 0;
      this.rim.scale.setScalar(1);
      return;
    }
    this.rim.scale.setScalar(this.rimScale);
    material.color.setHex(highlight.color);
    material.opacity = highlight.strength;
  }

  get highlighted(): boolean {
    return this.rim.material.opacity > 0;
  }

  retire(): void {
    this.leaving = true;
    this.targetScale = 0.001;
    this.settled = false;
  }

  step(dt: number, camera: PerspectiveCamera): boolean {
    const group = this.group;
    let before: number;

    if (this.anchored) {
      if (!this.localOffsetReady) {
        this.currentLocalOffset.copy(group.position);
        camera.worldToLocal(this.currentLocalOffset);
        this.localOffsetReady = true;
      }
      before = this.currentLocalOffset.distanceToSquared(this.targetLocalOffset);
      dampVector(this.currentLocalOffset, this.targetLocalOffset, dt);
      group.position.copy(this.currentLocalOffset);
      camera.localToWorld(group.position);
    } else {
      before = group.position.distanceToSquared(this.targetPosition);
      dampVector(group.position, this.targetPosition, dt);
    }

    this.currentSpin = MathUtils.damp(this.currentSpin, this.targetSpin, TURN_LAMBDA, dt);
    this.currentTilt = MathUtils.damp(this.currentTilt, this.targetTilt, TURN_LAMBDA, dt);
    this.currentYaw = MathUtils.damp(this.currentYaw, this.targetYaw, TURN_LAMBDA, dt);
    this.currentScale = MathUtils.damp(this.currentScale, this.targetScale, MOVE_LAMBDA, dt);
    this.currentRoll = MathUtils.damp(this.currentRoll, this.targetRoll, TURN_LAMBDA, dt);

    if (this.anchored) {
      group.quaternion.copy(camera.quaternion);
      if (this.currentRoll) group.rotateZ(this.currentRoll);
    } else {
      group.rotation.set(-Math.PI / 2 + this.currentTilt, this.currentYaw, this.currentSpin);
    }
    group.scale.setScalar(this.currentScale);

    const moving =
      before > SETTLED ||
      Math.abs(this.currentSpin - this.targetSpin) > 0.002 ||
      Math.abs(this.currentTilt - this.targetTilt) > 0.002 ||
      Math.abs(this.currentYaw - this.targetYaw) > 0.002 ||
      Math.abs(this.currentScale - this.targetScale) > 0.002 ||
      Math.abs(this.currentRoll - this.targetRoll) > 0.002;

    if (!moving && !this.anchored) group.position.copy(this.targetPosition);
    this.settled = !moving;
    return moving;
  }

  get needsStep(): boolean {
    return this.anchored || !this.settled;
  }

  get gone(): boolean {
    return this.leaving && this.currentScale < 0.02;
  }

  dispose(): void {
    this.rim.material.dispose();
  }
}

function dampVector(current: Vector3, target: Vector3, dt: number): void {
  current.x = MathUtils.damp(current.x, target.x, MOVE_LAMBDA, dt);
  current.y = MathUtils.damp(current.y, target.y, MOVE_LAMBDA, dt);
  current.z = MathUtils.damp(current.z, target.z, MOVE_LAMBDA, dt);
}
