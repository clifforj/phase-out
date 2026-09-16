import { signal } from '@angular/core';
import {
  BoardScene,
  type CameraView,
  type SceneCallbacks,
  type SceneState,
} from './scene/board-scene';

export class SceneHost {
  private readonly scene = signal<BoardScene | null>(null);

  readonly failure = signal<string | null>(null);

  start(
    canvas: HTMLCanvasElement | undefined,
    viewport: HTMLElement | null,
    callbacks: SceneCallbacks,
  ): void {
    if (!canvas) {
      this.failure.set('the canvas element is missing');
      return;
    }
    const scene = new BoardScene(canvas, callbacks);
    if (!scene.available) {
      this.failure.set(scene.failure ?? 'WebGL is unavailable in this browser');
      scene.dispose();
      return;
    }

    scene.setViewport(viewport);
    this.scene.set(scene);
  }

  update(state: () => SceneState): void {
    const scene = this.scene();
    if (scene) scene.update(state());
  }

  setView(view: CameraView): void {
    this.scene()?.setView(view);
  }

  dispose(): void {
    this.scene()?.dispose();
  }
}
