export const MOTION_ALLOWED =
  typeof matchMedia === 'undefined' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
