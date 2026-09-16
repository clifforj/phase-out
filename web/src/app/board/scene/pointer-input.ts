import { Mesh, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sameZone, type ZoneRef } from '../../rules/zones';

export interface PointerCallbacks {
  onHover(objectId: string | null): void;
  onPick(objectId: string | null): void;

  onContextMenu(objectId: string | null, x: number, y: number): void;
  onZoneHover(zone: ZoneRef | null): void;
  onZonePick(zone: ZoneRef): void;
}

export interface PointerHost {
  clearBox(): { y: number; height: number };
  recenterAt(x: number, z: number): void;
}

const DRAG_SLOP = 8;

const LONG_PRESS_MS = 450;

interface Press {
  id: number;
  touch: boolean;
  x: number;
  y: number;

  peeking: boolean;
  ended: boolean;

  answered: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export class PointerInput {
  private hoveredCard: string | null = null;
  private hoveredZoneRef: ZoneRef | null = null;
  private pointerInside = false;
  private pointerMoved = false;

  private press: Press | null = null;

  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly groundHit = new Vector3();
  private raycastTargets: Mesh[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly callbacks: PointerCallbacks,
    private readonly host: PointerHost,
    private readonly invalidate: () => void,
  ) {
    this.raycaster.layers.enableAll();
    this.attachPointer();
  }

  get hovered(): string | null {
    return this.hoveredCard;
  }

  get hoveredZone(): ZoneRef | null {
    return this.hoveredZoneRef;
  }

  setTargets(targets: Mesh[]): void {
    this.raycastTargets = targets;
  }

  dispose(): void {
    if (this.press) this.cancelLongPress(this.press);
  }

  private attachPointer(): void {
    this.canvas.addEventListener('pointermove', (event) => {
      const press = this.press;
      if (press && !press.ended) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_SLOP)
          this.cancelLongPress(press);

        if (press.touch && (!press.peeking || event.pointerId !== press.id)) return;
      }
      this.aimAt(event);
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (this.press?.peeking) return;
      this.pointerInside = false;
      this.pointerMoved = true;
    });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.press && !this.press.ended) {
        this.cancelLongPress(this.press);
        return;
      }
      const touch = event.pointerType !== 'mouse';
      const press: Press = {
        id: event.pointerId,
        touch,
        x: event.clientX,
        y: event.clientY,
        peeking: touch && this.inHandBand(event),
        ended: false,
        answered: false,
        timer: null,
      };
      this.press = press;

      if (press.peeking) {
        this.controls.enabled = false;
        this.canvas.setPointerCapture(event.pointerId);
        this.aimAt(event);
      } else if (touch) {
        this.pointerInside = false;
        this.pointerMoved = true;
      }
      if (touch) {
        press.timer = setTimeout(() => {
          press.timer = null;
          press.answered = true;
          this.controls.enabled = true;
          this.openMenuAt(event.clientX, event.clientY);
        }, LONG_PRESS_MS);
      }
      this.invalidate();
    });
    const release = (event: PointerEvent) => {
      const press = this.press;
      if (!press || press.ended || event.pointerId !== press.id) return;
      this.cancelLongPress(press);
      press.ended = true;
      this.controls.enabled = true;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);

    this.canvas.addEventListener('click', (event) => {
      const press = this.press;
      this.press = null;
      if (press?.answered) return;
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_SLOP) return;

      const wasInside = this.pointerInside;
      const wasRaised = this.hoveredCard;
      this.aimAt(event);
      this.updateHover();

      const raisingOnly = !!press?.peeking && !!this.hoveredCard && this.hoveredCard !== wasRaised;
      if (this.hoveredZoneRef) {
        this.callbacks.onZonePick(this.hoveredZoneRef);
      } else if (!raisingOnly) {
        this.callbacks.onPick(this.hoveredCard);
        if (!this.hoveredCard && !press?.peeking) this.recenterAt();
      }

      if (!wasInside && !press?.peeking) {
        this.pointerInside = false;
        this.pointerMoved = true;
        this.invalidate();
      }
    });

    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const press = this.press;
      if (press) {
        if (press.answered) return;
        this.cancelLongPress(press);
        press.answered = true;
        this.controls.enabled = true;

        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_SLOP) return;
      }
      this.openMenuAt(event.clientX, event.clientY);
    });
  }

  private openMenuAt(clientX: number, clientY: number): void {
    this.aimAt({ clientX, clientY });
    this.updateHover();
    const rect = this.canvas.getBoundingClientRect();
    this.callbacks.onContextMenu(
      this.hoveredZoneRef ? null : this.hoveredCard,
      clientX - rect.left,
      clientY - rect.top,
    );
    this.invalidate();
  }

  private recenterAt(): void {
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit)) return;
    this.host.recenterAt(this.groundHit.x, this.groundHit.z);
  }

  private cancelLongPress(press: { timer: ReturnType<typeof setTimeout> | null }): void {
    if (press.timer === null) return;
    clearTimeout(press.timer);
    press.timer = null;
  }

  private inHandBand(event: { clientY: number }): boolean {
    const clear = this.host.clearBox();
    const rect = this.canvas.getBoundingClientRect();
    return event.clientY - rect.top >= clear.y + clear.height / 2;
  }

  private aimAt(event: { clientX: number; clientY: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.pointerInside = true;
    this.pointerMoved = true;
  }

  updateHover(): void {
    if (!this.pointerMoved) return;
    this.pointerMoved = false;

    let found: string | null = null;
    let zone: ZoneRef | null = null;
    if (this.pointerInside) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.raycastTargets, false)[0];
      zone = (hit?.object.userData['zone'] as ZoneRef | undefined) ?? null;
      found = zone ? null : ((hit?.object.userData['objectId'] as string | undefined) ?? null);
    }

    this.canvas.style.cursor = found || zone ? 'pointer' : 'grab';

    if (!sameZone(zone, this.hoveredZoneRef)) {
      this.hoveredZoneRef = zone;
      this.callbacks.onZoneHover(zone);
    }
    if (found === this.hoveredCard) return;
    this.hoveredCard = found;
    this.callbacks.onHover(found);
  }
}
