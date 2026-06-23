import type { DeskConfig } from '../types';
import { DESK_Y, bounds } from './desk';
import { CABLE_RADIUS, CLEARANCE } from './autopath';
import type { PortInfo } from './ports3d';

// Cables run just above the desk surface and weave around device footprints,
// so they never pass through another device or down into the table slab.
export const ROUTE_Y = DESK_Y + 0.5;
export { CLEARANCE };             // re-exported from autopath: straight stub out of the port (single source)
const CELL = 2;                   // grid resolution (cm) — matches device snap, tight hugging
const PAD = 24;                   // routable margin beyond the desk edge (cm)
const OBST_EXPAND = CABLE_RADIUS; // only the cable's own radius — cables hug device edges
const TURN = 1.5;                 // A* turn penalty (in cell steps) — favors straighter routes

export interface RouteObstacle {
  x: number; z: number; w: number; d: number;
  rotation?: number;
  base: number; top: number; // world-Y vertical span
}

export interface RoutePoint { x: number; z: number }

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

interface Cell { ci: number; ri: number }

interface Grid {
  cols: number; rows: number; minX: number; minZ: number;
  blocked: Uint8Array;
  idx: (ci: number, ri: number) => number;
  toFreeCell: (p: RoutePoint) => Cell;
  cellWorld: (c: Cell) => RoutePoint;
}

/** Build the surface routing grid once; reused across all legs of a multi-anchor route. */
function buildGrid(obstacles: RouteObstacle[], desk: DeskConfig): Grid {
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

  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
  const toFreeCell = (p: RoutePoint): Cell => {
    const ci = clamp(Math.round((p.x - minX) / CELL), cols - 1);
    const ri = clamp(Math.round((p.z - minZ) / CELL), rows - 1);
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

  const cellWorld = (c: Cell): RoutePoint => ({ x: minX + c.ci * CELL, z: minZ + c.ri * CELL });
  return { cols, rows, minX, minZ, blocked, idx, toFreeCell, cellWorld };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Orthogonal, turn-penalized A* between two cells. Returns the full per-cell path. */
function astar(grid: Grid, s0: Cell, e0: Cell): Cell[] | null {
  const { cols, rows, blocked, idx } = grid;
  if (blocked[idx(e0.ci, e0.ri)]) return null;
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

  const cells: Cell[] = [];
  let s: number | undefined = endState;
  while (s !== undefined) {
    const cell = Math.floor(s / 5);
    cells.push({ ci: cell % cols, ri: Math.floor(cell / cols) });
    s = came.get(s);
  }
  cells.reverse();
  return cells;
}

/** XZ exit point a clearance step out of a port along its face normal. */
export function portExit(p: PortInfo): RoutePoint {
  return { x: p.x + p.nx * CLEARANCE, z: p.z + p.nz * CLEARANCE };
}

/**
 * Full surface cell path (world XZ at ROUTE_Y, one point per grid cell) from
 * exitA through the ordered user waypoints to exitB, avoiding obstacle
 * footprints with only 90° turns. Null if any leg is unreachable.
 */
export function computeSurfaceRoute(
  exitA: RoutePoint, exitB: RoutePoint, waypoints: RoutePoint[],
  obstacles: RouteObstacle[], desk: DeskConfig,
): RoutePoint[] | null {
  const grid = buildGrid(obstacles, desk);
  const anchors = [exitA, ...waypoints, exitB].map(p => grid.toFreeCell(p));

  const cells: Cell[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const leg = astar(grid, anchors[i], anchors[i + 1]);
    if (!leg) return null;
    // Drop the shared boundary cell between consecutive legs
    for (let j = i === 0 ? 0 : 1; j < leg.length; j++) cells.push(leg[j]);
  }
  if (!cells.length) return null;
  return cells.map(c => grid.cellWorld(c));
}
