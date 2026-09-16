import { Clock, Group, Mesh, Scene, WebGLRenderer } from 'three';
import { type AnchorSet, AnchorPublisher } from './anchors';
import { CameraRig, type CameraView } from './camera-rig';
import { CardFaceCache } from './card-face-cache';
import {
  CardObject,
  HAND_RIM_SCALE,
  HOVER_LIFT,
  HOVER_SCALE,
  RIM_SCALE,
  cardBodyGeometry,
  cardGeometry,
} from './card-object';
import { ATTACHMENT_THICKNESS, CARD_THICKNESS } from './sizes';
import { FocusRing } from './focus-ring';
import { HandAnimator } from './hand-animator';
import { type BoardLayout, type Placement, type SlotKind, zoneOf } from './layout';
import type { ZoneRef } from '../../rules/zones';
import { PointerInput, type PointerCallbacks } from './pointer-input';
import { rimGlow } from './rim-glow';
import { seatMetrics } from './seat-metrics';
import { TableMesh } from './table-mesh';
import { THEME } from './theme';

export type { CameraView } from './camera-rig';
export type { CardAnchor, SeatAnchor, StackAnchor, ZoneAnchor } from './anchors';

export interface SceneState {
  layout: BoardLayout;

  playableIds: Set<string>;

  actionableIds: Set<string>;
  chosenIds: Set<string>;
  hoveredId: string | null;
  inspectedId: string | null;

  hoveredZone: ZoneRef | null;
  openZone: ZoneRef | null;

  trackedIds: ReadonlySet<string>;
  artUrls: Map<string, string>;
  artists: Map<string, string>;

  handAway: boolean;
}

export interface SceneCallbacks extends PointerCallbacks {
  onAnchors: (anchors: AnchorSet) => void;
}

const TAKEOFF = { x: 0, y: 0.4, z: 0 };

const OVERLAY_LAYER = 1;

export class BoardScene {
  readonly available: boolean;
  readonly failure: string | null;

  private readonly renderer!: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly faces: CardFaceCache;
  private readonly clock = new Clock();

  private readonly table!: TableMesh;
  private readonly cameraRig!: CameraRig;
  private readonly pointer!: PointerInput;
  private readonly hand!: HandAnimator;
  private readonly focusRing!: FocusRing;
  private readonly anchors!: AnchorPublisher;

  private readonly cards = new Map<string, CardObject>();
  private readonly cardRoot = new Group();

  private state: SceneState | null = null;
  private dirty = true;
  private frame = 0;
  private handAway = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    callbacks: SceneCallbacks,
  ) {
    this.faces = new CardFaceCache(() => this.invalidate());

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      this.available = false;
      this.failure = error instanceof Error ? error.message : String(error);
      return;
    }
    this.renderer = renderer;
    this.available = true;
    this.failure = null;

    this.renderer.setClearColor(THEME.background, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;

    this.scene.add(this.cardRoot);
    this.table = new TableMesh(this.scene, () => this.invalidate());
    this.focusRing = new FocusRing(this.scene);
    this.cameraRig = new CameraRig(
      canvas,
      () => this.invalidate(),
      (width, height) => this.renderer.setSize(width, height, false),
      (x, z) => this.focusRing.show(x, z),
    );
    this.pointer = new PointerInput(
      canvas,
      this.cameraRig.camera,
      this.cameraRig.controls,
      callbacks,
      { clearBox: () => this.cameraRig.clearBox(), recenterAt: (x, z) => this.recenterAt(x, z) },
      () => this.invalidate(),
    );
    this.hand = new HandAnimator(this.cameraRig, () => this.invalidate());
    this.anchors = new AnchorPublisher(callbacks.onAnchors);

    this.cameraRig.observeSize();
    this.cameraRig.setView('table', true);
    this.tick();
  }

  update(state: SceneState): void {
    if (!this.available) return;
    this.state = state;

    if (state.handAway !== this.handAway) {
      this.handAway = state.handAway;
      this.cameraRig.applySize();
    }

    if (state.layout.table.radius !== this.table.radius) {
      this.table.setShape(state.layout.table, state.layout.seats.length);
      this.cameraRig.setBoardShape(
        state.layout.table.reach / seatMetrics(2).reach,
        this.table.fieldZ,
      );
      this.cameraRig.setView(this.cameraRig.currentView);
    }

    for (const card of this.cards.values()) card.seen = false;
    const wasHand = this.hand.beginSnapshot();
    const piles = raisedPiles(state);

    for (const placement of state.layout.placements) this.placeCard(placement, state, piles);

    for (const card of this.cards.values()) {
      if (card.seen || card.leaving) continue;
      const held = state.handAway ? wasHand.get(card.objectId) : undefined;
      if (held) this.hand.beginExit(card, held);
      else card.retire();
    }
    if (!state.handAway && this.hand.hasParked) this.hand.retireParked();
    this.hand.endSnapshot();

    this.table.updateZones(state.layout.zones, state.hoveredZone, state.openZone);
    this.table.updatePlaymats(state.layout.seats);
    this.table.updateArrows(state.layout.arrows);
    this.refreshRaycastTargets();
    this.invalidate();
  }

  private placeCard(placement: Placement, state: SceneState, piles: RaisedPiles): void {
    const anchored = placement.space === 'camera';
    const style = anchored ? 'printed' : 'board';
    const material = this.faces.material({
      card: placement.card,
      permanent: placement.permanent,
      artUrl: state.artUrls.get(placement.card.objectId) ?? null,
      artist: state.artists.get(placement.card.objectId) ?? null,
      faded: placement.faded,
      style,
    });
    const geometry = cardGeometry(style);

    const body = anchored
      ? null
      : cardBodyGeometry(
          style,
          placement.kind === 'attachment' ? ATTACHMENT_THICKNESS : CARD_THICKNESS,
        );

    let card = this.cards.get(placement.objectId);
    const born = !card;
    if (!card) {
      card = new CardObject(placement.objectId, material, geometry, body);

      const from = anchored ? TAKEOFF : placement.position;
      card.group.position.set(from.x, from.y + 0.6, from.z);
      this.cards.set(placement.objectId, card);
      this.cardRoot.add(card.group);
    }
    card.setGeometry(geometry, material, body);
    const fromNothing = born || card.leaving;
    card.seen = true;
    card.leaving = false;
    this.hand.stopHandExit(card, placement.kind === 'hand');

    const zone = zoneOf(placement.kind, placement.seat);
    card.setZone(zone);

    const inspectionLifts = placement.kind !== 'hand' && placement.objectId === state.inspectedId;
    const inHoveredPile = !!placement.pileId && placement.pileId === piles.hovered;
    const inInspectedPile = !!placement.pileId && placement.pileId === piles.inspected;
    const lifted =
      !zone &&
      (placement.objectId === state.hoveredId ||
        inspectionLifts ||
        inHoveredPile ||
        inInspectedPile);

    if (anchored) {
      this.hand.place(
        card,
        placement.position,
        placement.scale,
        lifted,
        placement.anchor ?? 'centre',
        fromNothing,
      );
      card.setLayer(OVERLAY_LAYER);
    } else {
      const lift = lifted && placement.kind !== 'attachment' ? HOVER_LIFT : 0;
      card.setTarget(placement, lift, placement.scale * (lifted ? HOVER_SCALE : 1));
      card.setLayer(0);
    }
    card.setHighlight(
      highlightFor(placement.kind, placement.objectId, inHoveredPile, inInspectedPile, state),
    );
    card.setRimScale(placement.kind === 'hand' ? HAND_RIM_SCALE : RIM_SCALE);
  }

  private refreshRaycastTargets(): void {
    this.pointer.setTargets([
      ...[...this.cards.values()].filter((card) => !card.leaving).map((card) => card.face),
      ...[...this.table.zones.values()].map((zone) => zone.plate),
    ]);
  }

  setViewport(element: HTMLElement | null): void {
    if (!this.available) return;
    this.cameraRig.setViewport(element);
  }

  setView(view: CameraView, immediate = false): void {
    if (!this.available) return;
    this.cameraRig.setView(view, immediate);
    this.focusRing.hide();
  }

  private recenterAt(x: number, z: number): void {
    const radius = Math.max(0.5, this.table.radius - 0.3);
    const distance = Math.hypot(x, z);
    const scale = distance > radius ? radius / distance : 1;
    this.cameraRig.recenterTo(x * scale, z * scale);
    this.focusRing.show(x * scale, z * scale);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    if (!this.available) return;
    this.pointer.dispose();
    this.cameraRig.dispose();
    this.focusRing.dispose();
    for (const card of this.cards.values()) card.dispose();
    this.cards.clear();
    this.table.dispose();
    this.faces.dispose();
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
    this.renderer.dispose();
  }

  private invalidate(): void {
    this.dirty = true;
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (typeof document !== 'undefined' && document.hidden) return;

    let moving = this.cameraRig.stepFraming(dt);
    if (this.table.stepAurora(dt)) moving = true;
    if (this.table.stepArrows(dt)) moving = true;
    if (this.focusRing.step(dt)) moving = true;
    if (this.cameraRig.flyCamera(dt)) moving = true;
    if (this.cameraRig.stepZoom(dt)) moving = true;
    if (this.cameraRig.steerPivot(dt)) moving = true;
    const cameraMoved = this.cameraRig.controls.update();
    this.hand.placeAnchoredCards(dt);

    let cardsRemoved = false;
    let anyHighlighted = false;
    for (const [objectId, card] of this.cards) {
      if (card.needsStep && card.step(dt, this.cameraRig.camera)) moving = true;
      if (card.highlighted) anyHighlighted = true;
      if (card.gone) {
        this.cardRoot.remove(card.group);
        card.dispose();
        this.cards.delete(objectId);
        cardsRemoved = true;
      }
    }
    if (cardsRemoved) this.refreshRaycastTargets();
    if (rimGlow.step(dt, anyHighlighted)) moving = true;
    for (const zone of this.table.zones.values()) {
      if (zone.step(dt)) moving = true;
    }

    this.pointer.updateHover();

    if (!this.dirty && !moving && !cameraMoved) return;
    this.dirty = false;
    this.draw();
    this.anchors.update(this.cameraRig.camera, this.canvas, {
      seats: this.state?.layout.seats ?? [],
      radius: this.table.radius,
      stackCards: this.hand.stackCards,
      zones: this.table.zones.values(),
      trackedIds: this.state?.trackedIds ?? [],
      cards: this.cards,
    });
  };

  private draw(): void {
    const camera = this.cameraRig.camera;
    this.renderer.clear();
    camera.layers.set(0);
    this.renderer.render(this.scene, camera);
    camera.layers.set(OVERLAY_LAYER);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, camera);
    camera.layers.set(0);
  }
}

interface RaisedPiles {
  hovered?: string;
  inspected?: string;
}

function raisedPiles(state: SceneState): RaisedPiles {
  const piles: RaisedPiles = {};
  for (const placement of state.layout.placements) {
    if (!placement.pileId) continue;
    if (placement.objectId === state.hoveredId) piles.hovered = placement.pileId;
    if (placement.objectId === state.inspectedId) piles.inspected = placement.pileId;
  }
  return piles;
}

function highlightFor(
  kind: SlotKind,
  objectId: string,
  inHoveredPile: boolean,
  inInspectedPile: boolean,
  state: SceneState,
): { color: number; strength: number } | null {
  const inZone = kind === 'graveyard' || kind === 'exile';
  if (kind === 'stack') return null;
  if (!inZone && (objectId === state.hoveredId || inHoveredPile))
    return { color: THEME.accent, strength: 0.95 };
  if (!inZone && (objectId === state.inspectedId || inInspectedPile))
    return { color: THEME.accent, strength: 0.7 };
  if (state.chosenIds.has(objectId)) return { color: THEME.chosen, strength: 0.9 };
  if (kind === 'attacker') return { color: THEME.danger, strength: 0.85 };
  if (kind === 'blocker') return { color: THEME.blocker, strength: 0.8 };
  if (state.actionableIds.has(objectId)) return { color: THEME.actionable, strength: 0.95 };
  if (state.playableIds.has(objectId)) return { color: THEME.playable, strength: 0.5 };
  return null;
}
