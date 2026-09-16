import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import { customPlaymatImageId, isCustomPlaymatId, playerMatById } from '../../core/player-mats';
import { playmatImageUrl } from '../../core/playmat-images';
import { AURORA_SPIN, type AuroraRing, auroraRing, disposeAurora, spinAurora } from './aurora';
import { ImageCache } from './image-cache';
import type { CombatArrow, Vec3, ZoneMarker } from './layout';
import { sameZone, type ZoneRef } from '../../rules/zones';
import { MOTION_ALLOWED } from './motion';
import { TABLE_RADIUS, seatMetrics, toWorld, type Seat, type SeatMetrics } from './seat-metrics';
import { LAYER_STEP } from './sizes';
import { FELT, TABLE_AURORA, THEME } from './theme';
import {
  arrowGlowTexture,
  centreMatFadeTexture,
  playmatFadeTexture,
  playmatImageTexture,
  playmatShadeTexture,
  playmatTexture,
  tableEdgeTexture,
} from './textures';
import { ZoneObject } from './zone-mesh';

const PLAYER_MAT_Y = 0.001;
const CENTRE_MAT_Y = PLAYER_MAT_Y + LAYER_STEP;
const PLAYER_MAT_ARC_SEGMENTS = 48;
const CENTRE_MAT_INNER_FRACTION = 0.88;

const CENTRE_MAT_RADIUS_FRACTION = 0.5;

const PLAYER_MAT_RENDER_ORDER = 1;
const SEAT_DIVIDER_W = 0.03;

const ARROW_GLOW_TILE = 0.5;
const EDGE_OVERHANG = 0.55;

const zoneKey = (zone: ZoneRef) => `${zone.seat}:${zone.kind}`;

function seatWedgeGeometry(
  seat: Seat,
  seatCount: number,
  outerRadius: number,
  customUv: boolean,
): BufferGeometry {
  const halfAngle = Math.PI / seatCount;
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 0];
  for (let i = 0; i <= PLAYER_MAT_ARC_SEGMENTS; i++) {
    const t = i / PLAYER_MAT_ARC_SEGMENTS;
    const theta = -halfAngle + t * (2 * halfAngle);
    const point = toWorld(
      seat.angle,
      outerRadius * Math.sin(theta),
      outerRadius * Math.cos(theta),
      0,
    );
    positions.push(point.x, 0, point.z);
    if (customUv) uvs.push(0.5 + Math.sin(theta) / 2, Math.cos(theta));
    else uvs.push(t, 1);
  }
  const indices: number[] = [];
  for (let i = 1; i <= PLAYER_MAT_ARC_SEGMENTS; i++) indices.push(0, i, i + 1);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function arrowGeometry(from: Vec3, to: Vec3): BufferGeometry | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.35) return null;

  const ux = dx / length;
  const uz = dz / length;
  const px = -uz;
  const pz = ux;
  const half = 0.09;
  const headLength = Math.min(0.55, length * 0.35);
  const headHalf = 0.18;
  const baseY = 0.006;
  const peak = Math.min(0.85, Math.max(0.1, length * 0.16));
  const shaftEnd = length - headLength;
  const segments = 20;

  const vertices: number[] = [];
  const uvs: number[] = [];
  const push = (along: number, across: number) => {
    const t = along / length;
    vertices.push(
      from.x + ux * along + px * across,
      baseY + peak * 4 * t * (1 - t),
      from.z + uz * along + pz * across,
    );
    uvs.push(along / ARROW_GLOW_TILE, (across / half + 1) / 2);
  };
  for (let segment = 0; segment < segments; segment++) {
    const near = (shaftEnd * segment) / segments;
    const far = (shaftEnd * (segment + 1)) / segments;
    push(near, -half);
    push(far, -half);
    push(far, half);
    push(near, -half);
    push(far, half);
    push(near, half);
  }
  push(shaftEnd, -headHalf);
  push(length, 0);
  push(shaftEnd, headHalf);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeVertexNormals();
  return geometry;
}

export class TableMesh {
  readonly zoneRoot = new Group();
  readonly arrowRoot = new Group();
  private readonly dividerRoot = new Group();
  private readonly playmatRoot = new Group();

  readonly zones = new Map<string, ZoneObject>();
  private readonly playmats = new Map<number, Mesh<BufferGeometry, MeshLambertMaterial>>();
  private readonly playmatImages: ImageCache;
  private readonly playmatTextures = new Map<string, CanvasTexture>();
  private lastPlaymatSeats: Seat[] = [];

  private readonly playerMatFade = playmatFadeTexture();
  private readonly playerMatShade = playmatShadeTexture();
  private readonly centreMatFade = centreMatFadeTexture(CENTRE_MAT_INNER_FRACTION);
  private readonly arrowGlow = arrowGlowTexture();

  private tableMat!: Mesh;
  private tableEdge!: Mesh;
  private glowOuter!: AuroraRing;
  private glowInner!: AuroraRing;
  private centreMat!: Mesh<CircleGeometry, MeshLambertMaterial>;

  radius = TABLE_RADIUS;
  fieldZ = seatMetrics(2).fieldZ;

  constructor(
    private readonly scene: Scene,
    onLoad: () => void = () => {},
  ) {
    this.playmatImages = new ImageCache((imageId, image) => {
      this.playmatTextures.set(imageId, playmatImageTexture(image));
      this.updatePlaymats(this.lastPlaymatSeats);
      onLoad();
    });
    this.scene.add(this.zoneRoot, this.arrowRoot, this.playmatRoot, this.dividerRoot);
    this.build();
    this.buildLights();
  }

  private build(): void {
    this.tableMat = new Mesh(
      new CircleGeometry(1, 72),
      new MeshLambertMaterial({ map: playmatTexture(), color: 0xffffff }),
    );
    this.tableMat.rotation.x = -Math.PI / 2;

    this.tableEdge = new Mesh(
      new CircleGeometry(1, 72),
      new MeshBasicMaterial({ map: tableEdgeTexture(), transparent: true, depthWrite: false }),
    );
    this.tableEdge.rotation.x = -Math.PI / 2;
    this.tableEdge.position.y = -0.02;

    const ring = { radius: 1.4, segments: 96 };
    this.glowOuter = auroraRing({ ...ring, stops: TABLE_AURORA.outer, seed: 0, y: -0.021 });
    this.glowInner = auroraRing({ ...ring, stops: TABLE_AURORA.inner, seed: 7, y: -0.022 });

    this.centreMat = new Mesh(
      new CircleGeometry(1, 96),
      new MeshLambertMaterial({
        color: FELT[FELT.length - 1],
        alphaMap: this.centreMatFade,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.centreMat.rotation.x = -Math.PI / 2;
    this.centreMat.position.y = CENTRE_MAT_Y;
    this.centreMat.renderOrder = PLAYER_MAT_RENDER_ORDER + 1;

    this.scene.add(this.tableMat, this.tableEdge, this.glowOuter, this.glowInner, this.centreMat);
    this.setShape(seatMetrics(2), 2);
  }

  stepAurora(dt: number): boolean {
    if (!MOTION_ALLOWED) return false;
    spinAurora(this.glowOuter, AURORA_SPIN.outer, dt);
    spinAurora(this.glowInner, AURORA_SPIN.inner, dt);
    return true;
  }

  stepArrows(dt: number): boolean {
    if (!MOTION_ALLOWED || this.arrowRoot.children.length === 0) return false;
    this.arrowGlow.offset.x = (this.arrowGlow.offset.x + dt * 0.05) % 1;
    return true;
  }

  setShape(table: SeatMetrics, seatCount: number): void {
    this.tableMat.scale.setScalar(table.radius);
    for (const disc of [this.tableEdge, this.glowOuter, this.glowInner])
      disc.scale.setScalar(table.radius + EDGE_OVERHANG);
    this.centreMat.scale.setScalar(table.centreRadius * CENTRE_MAT_RADIUS_FRACTION);
    this.radius = table.radius;
    this.fieldZ = table.fieldZ;

    for (const child of this.dividerRoot.children) {
      const line = child as Mesh<PlaneGeometry, MeshBasicMaterial>;
      line.geometry.dispose();
      line.material.dispose();
    }
    this.dividerRoot.clear();

    if (seatCount < 3) return;
    for (let index = 0; index < seatCount; index += 1) {
      const angle = ((index + 0.5) * 2 * Math.PI) / seatCount;
      const inner = Math.max(1.2, table.ring * 0.55);
      const line = new Mesh(
        new PlaneGeometry(SEAT_DIVIDER_W, table.radius - inner),
        new MeshBasicMaterial({ color: THEME.tableLine, transparent: true, opacity: 0.85 }),
      );
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = angle;
      const middle = (inner + table.radius) / 2;
      line.position.set(Math.sin(angle) * middle, 0.002, Math.cos(angle) * middle);
      this.dividerRoot.add(line);
    }
  }

  private buildLights(): void {
    this.scene.add(new AmbientLight(0xffffff, 0.55));
    this.scene.add(new HemisphereLight(0xcfe0ea, 0x120f1e, 0.4));
    const key = new DirectionalLight(0xfff3e0, 0.5);
    key.position.set(3.5, 9, 6);
    this.scene.add(key);
    const fill = new DirectionalLight(THEME.tableGlow, 0.16);
    fill.position.set(-4, 5, -5);
    this.scene.add(fill);
  }

  updateZones(markers: ZoneMarker[], hoveredZone: ZoneRef | null, openZone: ZoneRef | null): void {
    const seen = new Set<string>();
    for (const marker of markers) {
      const key = zoneKey(marker);
      seen.add(key);
      let zone = this.zones.get(key);
      if (!zone) {
        zone = new ZoneObject(marker);
        this.zones.set(key, zone);
        this.zoneRoot.add(zone.group);
      }
      zone.place(marker);
      zone.setHot(sameZone(marker, hoveredZone) || sameZone(marker, openZone));
    }
    for (const [key, zone] of this.zones) {
      if (seen.has(key)) continue;
      this.zoneRoot.remove(zone.group);
      zone.dispose();
      this.zones.delete(key);
    }
  }

  updatePlaymats(seats: Seat[]): void {
    this.lastPlaymatSeats = seats;
    const seen = new Set<number>();
    for (const seat of seats) {
      const playmatId = seat.player.playmatId;
      const imageId = isCustomPlaymatId(playmatId) ? customPlaymatImageId(playmatId) : null;
      const image = imageId ? this.playmatImage(imageId) : null;
      const mat = imageId ? null : playerMatById(playmatId);
      if (!mat && !image) continue;
      seen.add(seat.index);

      let mesh = this.playmats.get(seat.index);
      if (!mesh) {
        mesh = new Mesh(
          new BufferGeometry(),
          new MeshLambertMaterial({ transparent: true, depthWrite: false, side: DoubleSide }),
        );
        mesh.position.y = PLAYER_MAT_Y;
        mesh.renderOrder = PLAYER_MAT_RENDER_ORDER;
        this.playmatRoot.add(mesh);
        this.playmats.set(seat.index, mesh);
      }

      mesh.geometry.dispose();
      mesh.geometry = seatWedgeGeometry(seat, seats.length, this.radius, image !== null);
      const material = mesh.material;
      if (image) {
        material.map = image;
        material.alphaMap = null;
        material.color.set(0xffffff);
      } else if (mat) {
        material.map = this.playerMatShade;
        material.alphaMap = this.playerMatFade;
        material.color.set(mat.fill);
      }
      material.needsUpdate = true;
    }

    for (const [index, mesh] of this.playmats) {
      if (seen.has(index)) continue;
      this.playmatRoot.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.playmats.delete(index);
    }
  }

  private playmatImage(imageId: string): CanvasTexture | null {
    const texture = this.playmatTextures.get(imageId);
    if (texture) return texture;
    this.playmatImages.get(imageId, playmatImageUrl(imageId));
    return null;
  }

  updateArrows(arrows: CombatArrow[]): void {
    for (const child of this.arrowRoot.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.arrowRoot.clear();

    for (const arrow of arrows) {
      const geometry = arrowGeometry(arrow.from, arrow.to);
      if (!geometry) continue;
      const material = new MeshBasicMaterial({
        color: new Color(arrow.blocked ? THEME.blocker : THEME.danger),
        alphaMap: this.arrowGlow,
        transparent: true,
        opacity: 0.95,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = PLAYER_MAT_RENDER_ORDER + 2;
      this.arrowRoot.add(mesh);
    }
  }

  dispose(): void {
    for (const zone of this.zones.values()) zone.dispose();
    this.zones.clear();
    for (const mesh of this.playmats.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.playmats.clear();
    for (const texture of this.playmatTextures.values()) texture.dispose();
    this.playmatTextures.clear();
    this.playmatImages.clear();
    disposeAurora(this.glowOuter);
    disposeAurora(this.glowInner);
    this.playerMatFade.dispose();
    this.playerMatShade.dispose();
    this.centreMatFade.dispose();
    this.arrowGlow.dispose();
  }
}
