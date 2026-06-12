import type { Cable, Device } from '../types';
import { CARD_ANCHOR, ZOOM_MAX, ZOOM_MIN } from './constants';

export const GRID = 32;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

export interface Point { x: number; y: number }

/** Point + tangent angle at fraction t (0..1) along a polyline. */
export function polylinePoint(pts: Point[], t: number): { x: number; y: number; angle: number } {
  if (pts.length < 2) return { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0, angle: 0 };
  const segs: { len: number; dx: number; dy: number; x0: number; y0: number }[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segs.push({ len, dx, dy, x0: pts[i].x, y0: pts[i].y });
    total += len;
  }
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (acc + s.len >= target || i === segs.length - 1) {
      const f = s.len > 0 ? Math.min(1, (target - acc) / s.len) : 0;
      return { x: s.x0 + s.dx * f, y: s.y0 + s.dy * f, angle: Math.atan2(s.dy, s.dx) * 180 / Math.PI };
    }
    acc += s.len;
  }
  const s = segs[segs.length - 1];
  return { x: s.x0 + s.dx, y: s.y0 + s.dy, angle: Math.atan2(s.dy, s.dx) * 180 / Math.PI };
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
  if (!lenSq) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export const cableAnchor = (d: Device): Point => ({ x: d.x + CARD_ANCHOR.x, y: d.y + CARD_ANCHOR.y });

/** Cables without waypoints sharing a device pair get fanned apart; key → cable ids. */
export function buildPairGroups(cables: Cable[]): Record<string, number[]> {
  const groups: Record<string, number[]> = {};
  for (const c of cables) {
    if (!c.waypoints?.length) {
      const key = `${Math.min(c.fromId, c.toId)}-${Math.max(c.fromId, c.toId)}`;
      (groups[key] ??= []).push(c.id);
    }
  }
  return groups;
}

/**
 * SVG path + sampled polyline for a cable. With waypoints: straight segments.
 * Without: quadratic bezier offset perpendicular by fan position.
 */
export function buildCablePath(
  cable: Cable,
  from: Device,
  to: Device,
  pairGroups: Record<string, number[]>,
): { d: string; pts: Point[] } {
  const { x: x1, y: y1 } = cableAnchor(from);
  const { x: x2, y: y2 } = cableAnchor(to);
  const wp = cable.waypoints ?? [];

  if (wp.length > 0) {
    const pts = [{ x: x1, y: y1 }, ...wp, { x: x2, y: y2 }];
    return { d: 'M' + pts.map(p => `${p.x},${p.y}`).join(' L'), pts };
  }

  const pairKey = `${Math.min(cable.fromId, cable.toId)}-${Math.max(cable.fromId, cable.toId)}`;
  const group = pairGroups[pairKey] || [cable.id];
  const count = group.length;
  const idx = group.indexOf(cable.id);
  const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len, py = dx / len;
  const off = (idx - (count - 1) / 2) * 42 + (count === 1 ? 22 : 0);
  const cxq = (x1 + x2) / 2 + px * off, cyq = (y1 + y2) / 2 + py * off;
  const d = `M${x1},${y1} Q${cxq},${cyq} ${x2},${y2}`;
  const pts: Point[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push({
      x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cxq + t * t * x2,
      y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cyq + t * t * y2,
    });
  }
  return { d, pts };
}

/** Index at which to insert a new waypoint: nearest segment of the current polyline. */
export function waypointInsertIndex(cable: Cable, from: Device, to: Device, x: number, y: number): number {
  const pts = [cableAnchor(from), ...(cable.waypoints ?? []), cableAnchor(to)];
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** New pan/zoom keeping the world point under (cx, cy) fixed. */
export function zoomAtPoint(
  pan: Point, zoom: number, factor: number, cx: number, cy: number,
): { pan: Point; zoom: number } {
  const newZoom = clampZoom(zoom * factor);
  const worldX = (cx - pan.x) / zoom;
  const worldY = (cy - pan.y) / zoom;
  return { pan: { x: cx - worldX * newZoom, y: cy - worldY * newZoom }, zoom: newZoom };
}

/** Pan/zoom fitting all devices into a viewport of (vw, vh). */
export function fitViewTransform(devices: Device[], vw: number, vh: number): { pan: Point; zoom: number } | null {
  if (!devices.length) return null;
  const xs = devices.map(d => d.x);
  const ys = devices.map(d => d.y);
  const minX = Math.min(...xs) - 40;
  const minY = Math.min(...ys) - 40;
  const maxX = Math.max(...xs) + 180;
  const maxY = Math.max(...ys) + 120;
  const w = maxX - minX, h = maxY - minY;
  const zoom = clampZoom(Math.min(vw / w, vh / h) * 0.9);
  return {
    zoom,
    pan: { x: (vw - w * zoom) / 2 - minX * zoom, y: (vh - h * zoom) / 2 - minY * zoom },
  };
}
