import { AdditiveBlending, CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { type AuroraBand, auroraTexture } from './textures';

export const AURORA_SPIN = { outer: (Math.PI * 2) / 46, inner: -(Math.PI * 2) / 32 } as const;

export type AuroraRing = Mesh<CircleGeometry, MeshBasicMaterial>;

export function auroraRing(options: {
  radius: number;
  segments: number;
  stops: ReadonlyArray<readonly [number, string]>;
  seed: number;
  y: number;
  band?: AuroraBand;
  renderOrder?: number;
}): AuroraRing {
  const mesh = new Mesh(
    new CircleGeometry(options.radius, options.segments),
    new MeshBasicMaterial({
      map: auroraTexture(options.stops, options.seed, options.band),
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = options.y;
  if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder;
  return mesh;
}

export function spinAurora(ring: AuroraRing, rate: number, dt: number): void {
  ring.material.map!.rotation += dt * rate;
}

export function disposeAurora(ring: AuroraRing): void {
  ring.geometry.dispose();
  ring.material.map!.dispose();
  ring.material.dispose();
}
