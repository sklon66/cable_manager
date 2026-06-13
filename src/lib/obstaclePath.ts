import * as THREE from 'three';
import type { DeskConfig } from '../types';
import { DESK_Y, bounds } from './desk';
import type { PortInfo } from './ports3d';

// Cables run just above the desk surface and weave around device footprints,
// so they never pass through another device or down into the table slab.
const ROUTE_Y = DESK_Y + 0.5;
const CELL = 4;          // grid resolution (cm)
const PAD = 24;          // routable margin beyond the desk edge (cm)
const OBST_EXPAND = 4;   // grow obstacle footprints so cables keep clear (>= CELL avoids slip-through)
const CLEARANCE = 6;     // straight stub out of the port before the first turn
const TURN = 1.5;        // A* turn penalty (in cell steps) — favors straighter routes

export interface RouteObstacle {
  x: number; z: number; w: number; d: number;
  rotation?: number;
  base: number; top: number; // world-Y vertical span
}

interface RoutePoint { x: number; z: number }

/** Rotation-aware axis-aligned bounding box of a device footprint, grown by clearance. */
function footprintAABB(o: RouteObstacle) {
  const r = (o.rotation || 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return {
    cx: o.x + o.w / 2,
    cz: o.z + o.d / 2,
    halfW: (o.w * c + o.d * s) / 2 + OBST_EXPAND,
    halfD: (o.w * s + o.d * c) / 2 + OBST_EXPAND,
  };
}

class MinHeap<T extends { f: number }> {
  private a: T[] = [];
  get size() { return this.a.length; }
  push(x: T) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop(): T {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/** Orthogonal A* on the desk grid from start to end, avoiding obstacle footprints. */
function routeAround(start: RoutePoint, end: RoutePoint, obstacles: RouteObstacle[], desk: DeskConfig): RoutePoint[] | null {
  const b = bounds(desk);
  const minX = Math.min(0, b.mX0, b.eX0) - PAD;
  const minZ = -PAD;
  const maxX = Math.max(b.mX1, b.eX1) + PAD;
  const maxZ = Math.max(b.mZ1, b.eZ1) + PAD;
  const cols = Math.ceil((maxX - minX) / CELL) + 1;
  const rows = Math.ceil((maxZ - minZ) / CELL) + 1;
  const idx = (ci: number, ri: number) => ri * cols + ci;

  // Only footprints that actually occupy the routing height block the surface
  const rects = obstacles
    .filter(o => o.base <= ROUTE_Y + 1 && o.top >= ROUTE_Y - 1)
    .map(footprintAABB);

  const blocked = new Uint8Array(cols * rows);
  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const x = minX + ci * CELL, z = minZ + ri * CELL;
      for (const r of rects) {
        if (Math.abs(x - r.cx) <= r.halfW && Math.abs(z - r.cz) <= r.halfD) { blocked[idx(ci, ri)] = 1; break; }
      }
    }
  }

  const toCell = (p: RoutePoint) => ({
    ci: Math.max(0, Math.min(cols - 1, Math.round((p.x - minX) / CELL))),
    ri: Math.max(0, Math.min(rows - 1, Math.round((p.z - minZ) / CELL))),
  });
  const nearestFree = (ci: number, ri: number) => {
    if (!blocked[idx(ci, ri)]) return { ci, ri };
    for (let rad = 1; rad < Math.max(cols, rows); rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
          const nc = ci + dc, nr = ri + dr;
          if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !blocked[idx(nc, nr)]) return { ci: nc, ri: nr };
        }
      }
    }
    return { ci, ri };
  };

  const sc = toCell(start), ec = toCell(end);
  const s0 = nearestFree(sc.ci, sc.ri);
  const e0 = nearestFree(ec.ci, ec.ri);
  if (blocked[idx(e0.ci, e0.ri)]) return null;

  // A* over (cell, incoming-direction) states so turns can be penalized
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const stateId = (ci: number, ri: number, dir: number) => (ri * cols + ci) * 5 + dir;
  const h = (ci: number, ri: number) => Math.abs(ci - e0.ci) + Math.abs(ri - e0.ri);

  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open = new MinHeap<{ f: number; s: number; ci: number; ri: number; dir: number }>();
  const startState = stateId(s0.ci, s0.ri, 4);
  g.set(startState, 0);
  open.push({ f: h(s0.ci, s0.ri), s: startState, ci: s0.ci, ri: s0.ri, dir: 4 });

  let endState = -1;
  while (open.size) {
    const cur = open.pop();
    if (cur.ci === e0.ci && cur.ri === e0.ri) { endState = cur.s; break; }
    const cg = g.get(cur.s)!;
    if (cg + h(cur.ci, cur.ri) < cur.f - 1e-9) continue; // stale heap entry
    for (let d = 0; d < 4; d++) {
      const nc = cur.ci + DIRS[d][0], nr = cur.ri + DIRS[d][1];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || blocked[idx(nc, nr)]) continue;
      const ng = cg + 1 + (cur.dir !== 4 && cur.dir !== d ? TURN : 0);
      const ns = stateId(nc, nr, d);
      if (ng < (g.get(ns) ?? Infinity)) {
        g.set(ns, ng);
        came.set(ns, cur.s);
        open.push({ f: ng + h(nc, nr), s: ns, ci: nc, ri: nr, dir: d });
      }
    }
  }
  if (endState < 0) return null;

  const cells: RoutePoint[] = [];
  let s: number | undefined = endState;
  while (s !== undefined) {
    const cell = Math.floor(s / 5);
    cells.push({ x: minX + (cell % cols) * CELL, z: minZ + Math.floor(cell / cols) * CELL });
    s = came.get(s);
  }
  cells.reverse();

  // Collapse collinear runs to corner points
  const out: RoutePoint[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (i > 0 && i < cells.length - 1) {
      const a = cells[i - 1], b = cells[i], c = cells[i + 1];
      if ((a.x === b.x && b.x === c.x) || (a.z === b.z && b.z === c.z)) continue;
    }
    out.push(cells[i]);
  }
  return out;
}

function simplify3D(pts: THREE.Vector3[]): THREE.Vector3[] {
  const dedup: THREE.Vector3[] = [];
  for (const p of pts) if (!dedup.length || dedup[dedup.length - 1].distanceToSquared(p) > 1e-6) dedup.push(p);
  const res: THREE.Vector3[] = [];
  for (let i = 0; i < dedup.length; i++) {
    if (i > 0 && i < dedup.length - 1) {
      const d1 = new THREE.Vector3().subVectors(dedup[i], dedup[i - 1]).normalize();
      const d2 = new THREE.Vector3().subVectors(dedup[i + 1], dedup[i]).normalize();
      if (d1.dot(d2) > 0.9999) continue;
    }
    res.push(dedup[i]);
  }
  return res;
}

/**
 * Full obstacle-avoiding 3D path: port A → out along its normal → down to the
 * desk surface → A* around device footprints → up to port B → port B.
 * Returns null if no surface route exists (caller falls back to the direct autopath).
 */
export function computeObstaclePath(
  pA: PortInfo, pB: PortInfo, obstacles: RouteObstacle[], desk: DeskConfig,
): THREE.Vector3[] | null {
  const exitA = { x: pA.x + pA.nx * CLEARANCE, z: pA.z + pA.nz * CLEARANCE };
  const exitB = { x: pB.x + pB.nx * CLEARANCE, z: pB.z + pB.nz * CLEARANCE };
  const route = routeAround(exitA, exitB, obstacles, desk);
  if (!route || !route.length) return null;

  const first = route[0], last = route[route.length - 1];
  const pts: THREE.Vector3[] = [
    new THREE.Vector3(pA.x, pA.y, pA.z),
    new THREE.Vector3(first.x, pA.y, first.z),                       // stub at port height
    ...route.map(r => new THREE.Vector3(r.x, ROUTE_Y, r.z)),         // surface run (incl. drop at start)
    new THREE.Vector3(last.x, pB.y, last.z),                         // rise at end
    new THREE.Vector3(pB.x, pB.y, pB.z),
  ];
  return simplify3D(pts);
}
