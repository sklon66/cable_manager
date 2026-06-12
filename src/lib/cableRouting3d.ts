import * as THREE from 'three';
import type { DeskConfig, PortFace } from '../types';
import { DESK_Y, UNDER_Y, bounds, isOnDesk, type DeskBounds } from './desk';

export const CABLE_RADIUS = 0.3; // cm
const CLEARANCE = 6;

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

export function nearestDeskEdge(px: number, pz: number, b: DeskBounds): { x: number; z: number } {
  const { mX0, mX1, mZ1, eX0, eX1, eZ1 } = b;
  const totalD = Math.max(mZ1, eZ1);
  const segs: [number, number, number, number][] = [
    [mX0, 0, mX1, 0], [eX0, 0, eX1, 0],
    [mX0, mZ1, mX1, mZ1], [eX0, eZ1, eX1, eZ1],
    [Math.min(mX0, eX0), 0, Math.min(mX0, eX0), totalD],
    [Math.max(mX1, eX1), 0, Math.max(mX1, eX1), totalD],
    [eX1, eZ1, eX1, mZ1], [eX0, eZ1, eX0, mZ1],
  ];
  const nearestOnSeg = (ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    if (len2 < 0.0001) return { x: ax, z: az };
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    return { x: ax + t * dx, z: az + t * dz };
  };
  let best: { x: number; z: number } | null = null, bestD = Infinity;
  for (const [ax, az, bx, bz] of segs) {
    if (ax === bx && az === bz) continue;
    const pt = nearestOnSeg(ax, az, bx, bz);
    const d = Math.hypot(pt.x - px, pt.z - pz);
    if (d < bestD) { bestD = d; best = pt; }
  }
  return best || { x: px, z: 0 };
}

// Traces from (px,pz) along the face normal (nx,nz) to find where it exits
// the desk footprint, returning the axis-aligned edge point.
export function exitEdgeAlongNormal(
  px: number, pz: number, nx: number, nz: number, b: DeskBounds,
): { x: number; z: number } {
  const { mX0, mX1, mZ1, eX0, eX1, eZ1 } = b;
  if (Math.abs(nx) >= Math.abs(nz)) {
    if (nx > 0) {
      let edgeX = -Infinity;
      if (pz >= 0 && pz <= mZ1) edgeX = Math.max(edgeX, mX1);
      if (pz >= 0 && pz <= eZ1) edgeX = Math.max(edgeX, eX1);
      return { x: isFinite(edgeX) ? edgeX : px + 20, z: pz };
    }
    let edgeX = Infinity;
    if (pz >= 0 && pz <= mZ1) edgeX = Math.min(edgeX, mX0);
    if (pz >= 0 && pz <= eZ1) edgeX = Math.min(edgeX, eX0);
    return { x: isFinite(edgeX) ? edgeX : px - 20, z: pz };
  }
  if (nz > 0) {
    let edgeZ = -Infinity;
    if (px >= mX0 && px <= mX1) edgeZ = Math.max(edgeZ, mZ1);
    if (px >= eX0 && px <= eX1) edgeZ = Math.max(edgeZ, eZ1);
    return { x: px, z: isFinite(edgeZ) ? edgeZ : pz + 20 };
  }
  return { x: px, z: 0 };
}

export interface RoutableCable {
  portOffA?: number; portHtA?: number | null; portFaceA?: PortFace | null;
  portOffB?: number; portHtB?: number | null; portFaceB?: PortFace | null;
  userWaypoints?: { x: number; y?: number; z: number }[];
}

/** Full 3D polyline for one cable: port A → desk edge → under-desk run → port B. */
export function computeCablePath(
  cable: RoutableCable,
  devA: PortDevice,
  devB: PortDevice,
  desk: DeskConfig,
  routeIdx: number,
): { pts: THREE.Vector3[]; portA: PortInfo; portB: PortInfo; routingY: number } {
  const routingY = UNDER_Y - routeIdx * 2 * CABLE_RADIUS; // stack cables touching: one diameter apart
  const b = bounds(desk);

  const pA = getPort(devA, devB, cable.portOffA || 0, cable.portHtA ?? null, cable.portFaceA || null);
  const pB = getPort(devB, devA, cable.portOffB || 0, cable.portHtB ?? null, cable.portFaceB || null);

  const exitAX = pA.x + pA.nx * CLEARANCE, exitAZ = pA.z + pA.nz * CLEARANCE;
  const exitBX = pB.x + pB.nx * CLEARANCE, exitBZ = pB.z + pB.nz * CLEARANCE;

  // Brings one cable end from its exit point down to the routing plane, going
  // along the desk surface and over the edge if the exit is over the desk.
  const dropSeq = (exitX: number, exitZ: number, nx: number, nz: number) => {
    if (isOnDesk(desk, exitX, exitZ)) {
      const edge = exitEdgeAlongNormal(exitX, exitZ, nx, nz, b);
      return {
        pts: [
          new THREE.Vector3(exitX, DESK_Y, exitZ),
          new THREE.Vector3(edge.x, DESK_Y, edge.z),
          new THREE.Vector3(edge.x, routingY, edge.z),
        ],
        rx: edge.x, rz: edge.z,
      };
    }
    return { pts: [new THREE.Vector3(exitX, routingY, exitZ)], rx: exitX, rz: exitZ };
  };

  const dA = dropSeq(exitAX, exitAZ, pA.nx, pA.nz);
  const dB = dropSeq(exitBX, exitBZ, pB.nx, pB.nz);

  const wps = cable.userWaypoints || [];
  const pts = [
    new THREE.Vector3(pA.x, pA.y, pA.z),
    new THREE.Vector3(exitAX, pA.y, exitAZ),
    ...dA.pts,
  ];

  if (wps.length === 0) {
    const dx = Math.abs(dB.rx - dA.rx), dz = Math.abs(dB.rz - dA.rz);
    if (dx >= dz) pts.push(new THREE.Vector3(dB.rx, routingY, dA.rz)); // X-first elbow
    else pts.push(new THREE.Vector3(dA.rx, routingY, dB.rz));          // Z-first elbow
  } else {
    wps.forEach(wp => pts.push(new THREE.Vector3(wp.x, wp.y ?? routingY, wp.z)));
  }

  // Side B ascent: mirror of dropSeq in reverse
  for (let i = dB.pts.length - 1; i >= 0; i--) pts.push(dB.pts[i]);
  pts.push(
    new THREE.Vector3(exitBX, pB.y, exitBZ),
    new THREE.Vector3(pB.x, pB.y, pB.z),
  );

  return { pts, portA: pA, portB: pB, routingY };
}
