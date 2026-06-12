import type { DeskConfig } from '../types';

export const DESK_Y = 3;   // desk surface world-y
export const SNAP_CM = 2;

export interface DeskBounds {
  mX0: number; mX1: number; mZ1: number;
  eX0: number; eX1: number; eZ1: number;
  totalW: number; totalD: number;
  cx: number; cz: number;
}

export function bounds(desk: DeskConfig): DeskBounds {
  const { main_w, main_d, ext_w, ext_d, ext_side } = desk;
  const mX0 = ext_side === 'right' ? 0 : ext_w;
  const eX0 = ext_side === 'right' ? main_w : 0;
  return {
    mX0, mX1: mX0 + main_w, mZ1: main_d,
    eX0, eX1: eX0 + ext_w, eZ1: ext_d,
    totalW: main_w + ext_w,
    totalD: Math.max(main_d, ext_d),
    cx: (main_w + ext_w) / 2,
    cz: Math.max(main_d, ext_d) / 2,
  };
}

export function isOnDesk(desk: DeskConfig, x: number, z: number, w = 0, d = 0): boolean {
  const b = bounds(desk);
  const inMain = x + w > b.mX0 && x < b.mX1 && z + d > 0 && z < b.mZ1;
  const inExt = x + w > b.eX0 && x < b.eX1 && z + d > 0 && z < b.eZ1;
  return inMain || inExt;
}

export const snapCm = (v: number) => Math.round(v / SNAP_CM) * SNAP_CM;

export function computeFloorY(devices: { elevation?: number }[]): number {
  let minBase = 0; // desk bottom is at Y=0
  for (const dev of devices) {
    const base = DESK_Y + (dev.elevation || 0);
    if (base < minBase) minBase = base;
  }
  return minBase - 1;
}

/** Line-segment vertex positions for a flat rectangular grid in the XZ plane. */
export function rectGridPositions(w: number, d: number, cell: number): Float32Array {
  const pts: number[] = [];
  for (let x = 0; x <= w + 0.01; x += cell) pts.push(x, 0, 0, x, 0, d);
  for (let z = 0; z <= d + 0.01; z += cell) pts.push(0, 0, z, w, 0, z);
  return new Float32Array(pts);
}
