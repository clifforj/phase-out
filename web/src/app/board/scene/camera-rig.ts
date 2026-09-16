import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PIVOT_HEIGHT, pivotZ } from './camera-pivot';

export type CameraView = 'table' | 'top' | 'seat';

const BOARD_SHAPE = 1.5;

const ZOOM_PER_NOTCH = 1.14;
const ZOOM_LAMBDA = 16;
const ZOOM_SETTLED = 0.002;

const PIVOT_LAMBDA = 5;
const PIVOT_SETTLED = 0.002;

const FRAMING_LAMBDA = 4.5;
const FRAMING_SETTLED = 0.4;
const FLY_LAMBDA = 4.5;

const HAND_BAND_FALLBACK = 0.34;

const VIEWS: Record<CameraView, { back: number; height: number; target: number }> = {
  table: { back: 5.1, height: 5.75, target: 0 },
  top: { back: 0.5, height: 7.9, target: 0 },
  seat: { back: 6.9, height: 3.5, target: -0.4 },
};

interface ClearArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;

  private cameraGoal: { position: Vector3; target: Vector3 } | null = null;
  private zoomGoal: number | null = null;
  private view: CameraView = 'table';
  private readonly presetPosition = new Vector3();

  private manualPivot: { x: number; z: number } | null = null;

  private panning = false;
  private readonly touchPointers = new Set<number>();

  private boardScale = 1;
  private fieldZ = 0;

  private viewport: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameSize = { width: 0, height: 0 };

  private clearShown: ClearArea | null = null;
  private clearGoal: ClearArea = { x: 0, y: 0, width: 0, height: 0 };

  readonly clearFraction = { x: 1, y: 1 };

  bottomFraction = 1;

  bandPixels = 0;
  framePixels = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly invalidate: () => void,
    private readonly onResize: (width: number, height: number) => void,
    private readonly onManualPivot: (x: number, z: number) => void,
  ) {
    this.camera = new PerspectiveCamera(42, 1, 0.1, 40);

    this.attachZoom();
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 22;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.42;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => (this.cameraGoal = null));

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse') this.touchPointers.add(event.pointerId);
      this.panning = event.button === 2 || this.touchPointers.size >= 2;
    });
    const stopPan = (event: PointerEvent) => {
      this.touchPointers.delete(event.pointerId);
      this.panning = this.touchPointers.size >= 2;
    };
    this.canvas.addEventListener('pointerup', stopPan);
    this.canvas.addEventListener('pointercancel', stopPan);

    this.controls.addEventListener('change', () => {
      if (!this.panning) return;
      this.manualPivot = { x: this.controls.target.x, z: this.controls.target.z };
      this.onManualPivot(this.manualPivot.x, this.manualPivot.z);
    });
  }

  get currentView(): CameraView {
    return this.view;
  }

  setViewport(element: HTMLElement | null): void {
    this.viewport = element;
    if (element) this.resizeObserver?.observe(element);
    this.applySize();
  }

  observeSize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    this.resizeObserver = new ResizeObserver(() => this.applySize());
    this.resizeObserver.observe(parent);
    this.applySize();
  }

  setBoardShape(boardScale: number, fieldZ: number): void {
    this.boardScale = boardScale;
    this.fieldZ = fieldZ;
  }

  setView(view: CameraView, immediate = false): void {
    this.view = view;
    this.manualPivot = null;
    const preset = VIEWS[view];
    const reach = Math.max(
      1 / Math.max(0.35, this.clearFraction.y),
      BOARD_SHAPE / (this.camera.aspect * Math.max(0.25, this.clearFraction.x)),
    );

    const target = new Vector3(0, PIVOT_HEIGHT, preset.target * this.boardScale);
    const position = new Vector3(0, preset.height, preset.back)
      .multiplyScalar(this.boardScale)
      .sub(target)
      .multiplyScalar(reach)
      .add(target);
    this.presetPosition.copy(position);

    target.z = pivotZ(position.distanceTo(target), target.z, this.fieldZ, this.boardScale);
    this.zoomGoal = null;
    if (immediate) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.cameraGoal = null;
    } else {
      this.cameraGoal = { position, target };
    }
    this.invalidate();
  }

  recenterTo(x: number, z: number): void {
    const target = new Vector3(x, PIVOT_HEIGHT, z);
    const position = this.camera.position.clone().add(target).sub(this.controls.target);
    this.manualPivot = { x, z };
    this.zoomGoal = null;
    this.cameraGoal = { position, target };
    this.invalidate();
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.controls.dispose();
  }

  private attachZoom(): void {
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const perNotch = event.deltaMode === 1 ? 3 : event.deltaMode === 2 ? 1 : 100;
        const notches = MathUtils.clamp(event.deltaY / perNotch, -3, 3);
        const from = this.zoomGoal ?? this.controls.getDistance();
        this.zoomGoal = MathUtils.clamp(
          from * Math.pow(ZOOM_PER_NOTCH, notches),
          this.controls.minDistance,
          this.controls.maxDistance,
        );
        this.cameraGoal = null;
        this.invalidate();
      },
      { passive: false },
    );
  }

  stepZoom(dt: number): boolean {
    const goal = this.zoomGoal;
    if (goal === null) return false;
    const distance = this.controls.getDistance();
    const remaining = Math.log(goal / distance);
    if (Math.abs(remaining) < ZOOM_SETTLED) {
      this.zoomGoal = null;
      return false;
    }
    const next = distance * Math.exp(MathUtils.damp(0, remaining, ZOOM_LAMBDA, dt));
    this.camera.position
      .sub(this.controls.target)
      .multiplyScalar(next / distance)
      .add(this.controls.target);
    return true;
  }

  steerPivot(dt: number): boolean {
    const wanted = this.manualPivot
      ? this.manualPivot.z
      : pivotZ(
          this.controls.getDistance(),
          VIEWS[this.view].target * this.boardScale,
          this.fieldZ,
          this.boardScale,
        );
    const gap = wanted - this.controls.target.z;
    if (Math.abs(gap) < PIVOT_SETTLED) return false;
    this.controls.target.z = MathUtils.damp(this.controls.target.z, wanted, PIVOT_LAMBDA, dt);
    return true;
  }

  flyCamera(dt: number): boolean {
    const goal = this.cameraGoal;
    if (!goal) return false;
    const factor = 1 - Math.exp(-FLY_LAMBDA * dt);
    this.camera.position.lerp(goal.position, factor);
    this.controls.target.lerp(goal.target, factor);
    if (this.camera.position.distanceTo(goal.position) < 0.02) {
      this.camera.position.copy(goal.position);
      this.controls.target.copy(goal.target);
      this.cameraGoal = null;
    }
    return true;
  }

  applySize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.onResize(width, height);

    const resized = width !== this.frameSize.width || height !== this.frameSize.height;
    this.frameSize = { width, height };
    this.clearGoal = this.clearArea(width, height);
    if (resized || !this.clearShown) this.clearShown = { ...this.clearGoal };
    this.applyFraming();
    this.invalidate();
  }

  private applyFraming(): void {
    const { width, height } = this.frameSize;
    const clear = this.clearShown!;
    const fullWidth = 2 * Math.max(clear.x, width - clear.x);
    const fullHeight = 2 * Math.max(clear.y, height - clear.y);
    this.clearFraction.x = clear.width / fullWidth;
    this.clearFraction.y = clear.height / fullHeight;
    const band = height - (this.clearGoal.y + this.clearGoal.height / 2);
    this.framePixels = fullHeight;
    this.bandPixels = band > 8 ? band : (HAND_BAND_FALLBACK * fullHeight) / 2;
    this.bottomFraction = (height - clear.y) / (fullHeight / 2);
    this.camera.aspect = fullWidth / fullHeight;
    this.camera.setViewOffset(
      fullWidth,
      fullHeight,
      fullWidth / 2 - clear.x,
      fullHeight / 2 - clear.y,
      width,
      height,
    );
    this.camera.updateProjectionMatrix();
    this.reframe();
  }

  stepFraming(dt: number): boolean {
    const shown = this.clearShown;
    if (!shown) return false;
    const goal = this.clearGoal;
    const gap = Math.max(
      Math.abs(shown.x - goal.x),
      Math.abs(shown.y - goal.y),
      Math.abs(shown.width - goal.width),
      Math.abs(shown.height - goal.height),
    );
    if (gap < FRAMING_SETTLED) {
      if (gap === 0) return false;
      this.clearShown = { ...goal };
      this.applyFraming();
      return true;
    }
    shown.x = MathUtils.damp(shown.x, goal.x, FRAMING_LAMBDA, dt);
    shown.y = MathUtils.damp(shown.y, goal.y, FRAMING_LAMBDA, dt);
    shown.width = MathUtils.damp(shown.width, goal.width, FRAMING_LAMBDA, dt);
    shown.height = MathUtils.damp(shown.height, goal.height, FRAMING_LAMBDA, dt);
    this.applyFraming();
    return true;
  }

  private reframe(): void {
    if (this.manualPivot) return;
    if (!this.cameraGoal && this.camera.position.distanceTo(this.presetPosition) > 0.5) return;
    this.setView(this.view, !this.cameraGoal);
  }

  private clearArea(width: number, height: number): ClearArea {
    const whole = { x: width / 2, y: height / 2, width, height };
    if (!this.viewport) return whole;
    const box = this.viewport.getBoundingClientRect();
    if (box.width < 80 || box.height < 80) return whole;
    const canvas = this.canvas.getBoundingClientRect();
    if (!canvas.width || !canvas.height) return whole;
    return {
      x: box.left - canvas.left + box.width / 2,
      y: box.top - canvas.top + box.height / 2,
      width: box.width,
      height: box.height,
    };
  }

  clearBox(): { y: number; height: number } {
    const clear = this.clearShown ?? this.clearGoal;
    return { y: clear.y, height: clear.height };
  }
}
