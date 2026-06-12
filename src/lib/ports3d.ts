import type { PortFace } from '../types';
import { DESK_Y } from './desk';

export interface PortDevice {
  id: number;
  x: number; z: number;
  w: number; d: number; h: number;
  elevation?: number;
  rotation?: number;
}

export interface PortInfo {
  x: number; y: number; z: number;
  nx: number; nz: number;
  worldAlongX: number; worldAlongZ: number;
  halfExt: number;
}

// Returns world-space port position on a face of `dev`, fully rotation-aware.
// All computation happens in local (device) space then rotated into world space.
// faceOff — cm slide along the face tangent from its center.
// ht      — cm above device base; null = default (~35% height, max 8 cm).
// face    — explicit face: 'r'|'l'|'f'|'b'; null = auto-pick toward otherDev.
export function getPort(
  dev: PortDevice,
  otherDev: PortDevice,
  faceOff = 0,
  ht: number | null = null,
  face: PortFace | null = null,
): PortInfo {
  const cx = dev.x + dev.w / 2;
  const cz = dev.z + dev.d / 2;
  const hw = dev.w / 2, hd = dev.d / 2;

  const r = -(dev.rotation || 0) * Math.PI / 180;
  const cosR = Math.cos(r), sinR = Math.sin(r);
  const toWorldX = (lx: number, lz: number) => lx * cosR + lz * sinR;
  const toWorldZ = (lx: number, lz: number) => -lx * sinR + lz * cosR;
  const toLocalX = (wx: number, wz: number) => wx * cosR - wz * sinR;
  const toLocalZ = (wx: number, wz: number) => wx * sinR + wz * cosR;

  // Local-space face descriptors: [nx, nz, faceX, faceZ, alongX, alongZ, halfExt]
  type FaceDef = [number, number, number, number, number, number, number];
  const FACE_DEFS: Record<PortFace, FaceDef> = {
    r: [1, 0, hw, 0, 0, 1, Math.max(0.5, hd - 1)],
    l: [-1, 0, -hw, 0, 0, 1, Math.max(0.5, hd - 1)],
    f: [0, 1, 0, hd, 1, 0, Math.max(0.5, hw - 1)],
    b: [0, -1, 0, -hd, 1, 0, Math.max(0.5, hw - 1)],
  };

  let def: FaceDef;
  if (face) {
    def = FACE_DEFS[face];
  } else {
    // Convert direction-to-other into local space to pick the closest face
    const wdx = (otherDev.x + otherDev.w / 2) - cx;
    const wdz = (otherDev.z + otherDev.d / 2) - cz;
    const ldx = toLocalX(wdx, wdz), ldz = toLocalZ(wdx, wdz);
    if (Math.abs(ldx) >= Math.abs(ldz)) def = ldx >= 0 ? FACE_DEFS.r : FACE_DEFS.l;
    else def = ldz >= 0 ? FACE_DEFS.f : FACE_DEFS.b;
  }
  const [localNX, localNZ, localFX, localFZ, localAlongX, localAlongZ, halfExt] = def;

  // Apply faceOff (clamped) along local tangent, then rotate to world
  const clampedOff = Math.max(-halfExt, Math.min(halfExt, faceOff));
  const lPortX = localFX + clampedOff * localAlongX;
  const lPortZ = localFZ + clampedOff * localAlongZ;
  const px = cx + toWorldX(lPortX, lPortZ);
  const pz = cz + toWorldZ(lPortX, lPortZ);

  const nx = toWorldX(localNX, localNZ);
  const nz = toWorldZ(localNX, localNZ);
  const worldAlongX = toWorldX(localAlongX, localAlongZ);
  const worldAlongZ = toWorldZ(localAlongX, localAlongZ);

  const baseY = DESK_Y + (dev.elevation || 0);
  const py = ht !== null
    ? Math.max(baseY + 0.5, Math.min(baseY + dev.h - 0.5, baseY + ht))
    : baseY + Math.min(dev.h * 0.35, 8);

  return { x: px, y: py, z: pz, nx, nz, worldAlongX, worldAlongZ, halfExt };
}
