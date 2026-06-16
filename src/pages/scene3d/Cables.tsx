import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useSceneStore, type SceneCable, type SceneDevice } from '../../stores/sceneStore';
import type { DeskConfig } from '../../types';
import { CABLE_TYPES } from '../../lib/constants';
import { DESK_Y, snapCm, isOnDesk } from '../../lib/desk';
import { distToSegment } from '../../lib/geometry2d';
import { getPort, type PortInfo } from '../../lib/ports3d';
import { CABLE_RADIUS, computeAutoPath, computeStraightPath } from '../../lib/autopath';
import { ROUTE_Y, computeSurfaceRoute, portExit, type RoutePoint } from '../../lib/obstaclePath';
import { usePlaneDrag } from './usePlaneDrag';

const UP = new THREE.Vector3(0, 1, 0);
const routePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ROUTE_Y);

// Segments where two or more cables run together are drawn near-black — that is where
// a sleeve would wrap the bundle, so the dark stretches mark exactly where to add one.
const SLEEVE_COLOR = '#0a0a0a';

interface Seg { position: THREE.Vector3; quaternion: THREE.Quaternion; length: number }

function seg(a: THREE.Vector3, b: THREE.Vector3): Seg {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const quaternion = new THREE.Quaternion();
  if (length >= 0.001) {
    dir.normalize();
    if (Math.abs(dir.dot(UP)) > 0.9999) { if (dir.y < 0) quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI); }
    else quaternion.setFromUnitVectors(UP, dir);
  }
  return { position: a.clone().addScaledVector(dir, length / 2), quaternion, length };
}

function buildSegments(pts: THREE.Vector3[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = seg(pts[i], pts[i + 1]);
    if (s.length >= 0.001) out.push(s);
  }
  return out;
}

/** Splits a straight a→b run into evenly spaced dash cylinders (wireless look). */
function buildDashes(a: THREE.Vector3, b: THREE.Vector3, dashLen = 1.4, gapLen = 1.1): Seg[] {
  const dir = new THREE.Vector3().subVectors(b, a);
  const total = dir.length();
  if (total < 1e-4) return [];
  dir.normalize();
  const quaternion = new THREE.Quaternion();
  if (Math.abs(dir.dot(UP)) > 0.9999) { if (dir.y < 0) quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI); }
  else quaternion.setFromUnitVectors(UP, dir);
  const period = dashLen + gapLen;
  const segs: Seg[] = [];
  for (let t = 0; t < total - 1e-3; t += period) {
    const length = Math.min(dashLen, total - t);
    if (length < 0.05) continue;
    segs.push({ position: a.clone().addScaledVector(dir, t + length / 2), quaternion, length });
  }
  return segs;
}

const cellKey = (c: RoutePoint) => `${Math.round(c.x)}_${Math.round(c.z)}`;
const edgeKey = (a: RoutePoint, b: RoutePoint) => {
  const ka = cellKey(a), kb = cellKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

// A cable's run height: on the desk surface, or low when an endpoint is below the table.
const runHeight = (pA: PortInfo, pB: PortInfo) => Math.min(ROUTE_Y, pA.y, pB.y);
const cellHeight = (desk: DeskConfig, c: RoutePoint, runY: number) =>
  (isOnDesk(desk, c.x, c.z) ? ROUTE_Y : runY);
// Overlap key includes a height band (~2cm) so cables crossing the same spot at
// different heights aren't counted as one bundle — only stacked-together runs are.
const edgeKeyH = (a: RoutePoint, b: RoutePoint, ya: number, yb: number) =>
  `${edgeKey(a, b)}@${Math.round((ya + yb) / 4)}`;

// ── routing data assembled once for all cables ──────────────────────────────

type CableRender =
  | { kind: 'wireless'; cable: SceneCable; color: string; portA: PortInfo; portB: PortInfo; pts: THREE.Vector3[] }
  | { kind: 'fallback'; cable: SceneCable; color: string; portA: PortInfo; portB: PortInfo; pts: THREE.Vector3[] }
  | { kind: 'surface'; cable: SceneCable; color: string; portA: PortInfo; portB: PortInfo; cells: RoutePoint[] };

function computeAll(cables: SceneCable[], devices: SceneDevice[], desk: DeskConfig) {
  const devMap = new Map(devices.map(d => [d.id, d]));
  const perCable: CableRender[] = [];
  const edgeCount = new Map<string, number>();

  for (const cable of cables) {
    const devA = devMap.get(cable.fromId);
    const devB = devMap.get(cable.toId);
    if (!devA || !devB) continue;
    const color = (CABLE_TYPES[cable.cableType] ?? CABLE_TYPES.Other).color;
    const portA = getPort(devA, devB, cable.portOffA || 0, cable.portHtA ?? null, cable.portFaceA || null);
    const portB = getPort(devB, devA, cable.portOffB || 0, cable.portHtB ?? null, cable.portFaceB || null);

    if (cable.wireless) {
      perCable.push({ kind: 'wireless', cable, color, portA, portB, pts: computeStraightPath(portA, portB) });
      continue;
    }

    const obstacles = devices
      .filter(d => d.id !== devA.id && d.id !== devB.id)
      .map(d => ({
        x: d.x, z: d.z, w: d.w, d: d.d, rotation: d.rotation,
        base: DESK_Y + (d.elevation || 0), top: DESK_Y + (d.elevation || 0) + d.h,
      }));
    const wps = cable.userWaypoints.map(w => ({ x: w.x, z: w.z }));
    const cells = computeSurfaceRoute(portExit(portA), portExit(portB), wps, obstacles, desk);

    if (cells && cells.length) {
      perCable.push({ kind: 'surface', cable, color, portA, portB, cells });
      const runY = runHeight(portA, portB);
      for (let i = 0; i < cells.length - 1; i++) {
        const ya = cellHeight(desk, cells[i], runY), yb = cellHeight(desk, cells[i + 1], runY);
        const k = edgeKeyH(cells[i], cells[i + 1], ya, yb);
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      }
    } else {
      perCable.push({ kind: 'fallback', cable, color, portA, portB, pts: computeAutoPath(portA, portB) });
    }
  }
  return { perCable, edgeCount };
}

// ── rendering ───────────────────────────────────────────────────────────────

/** How a cable is drawn relative to the current device selection. */
type Emphasis = 'normal' | 'on' | 'dim';

/** Phong material props for a cable: glow when its device is selected, fade the rest.
 *  `transparent` stays true in every state — toggling it at runtime needs a shader
 *  recompile that R3F won't trigger, so we only vary opacity (which updates live). */
function cableMat(color: string, emphasis: Emphasis) {
  const dim = emphasis === 'dim';
  return {
    color,
    transparent: true,
    opacity: dim ? 0.5 : 1,
    depthWrite: !dim,
    emissive: emphasis === 'on' ? color : '#000000',
    emissiveIntensity: emphasis === 'on' ? 0.55 : 0,
  };
}

/** Port-tab material: a glowing handle that follows its cable's emphasis. */
function portMat(color: string, emphasis: Emphasis) {
  const dim = emphasis === 'dim';
  return {
    color,
    transparent: true,
    opacity: dim ? 0.5 : 1,
    depthWrite: !dim,
    emissive: color,
    emissiveIntensity: emphasis === 'on' ? 0.6 : dim ? 0.15 : 0.4,
  };
}

function Cylinders({ segs, radius, color, emphasis = 'normal', onDoubleClick }: {
  segs: Seg[]; radius: number; color: string; emphasis?: Emphasis; onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <>
      {segs.map((s, i) => (
        <mesh key={i} position={s.position} quaternion={s.quaternion} onDoubleClick={onDoubleClick}>
          <cylinderGeometry args={[radius, radius, s.length, 8]} />
          <meshPhongMaterial {...cableMat(color, emphasis)} />
        </mesh>
      ))}
    </>
  );
}

function CableRun({ pts, color, emphasis = 'normal' }: { pts: THREE.Vector3[]; color: string; emphasis?: Emphasis }) {
  const segments = useMemo(() => buildSegments(pts), [pts]);
  return (
    <group>
      <Cylinders segs={segments} radius={CABLE_RADIUS} color={color} emphasis={emphasis} />
      {pts.slice(1, -1).map((p, i) => (
        <mesh key={`j${i}`} position={p}>
          <sphereGeometry args={[CABLE_RADIUS, 8, 8]} />
          <meshPhongMaterial {...cableMat(color, emphasis)} />
        </mesh>
      ))}
    </group>
  );
}

function WirelessRun({ pts, color, emphasis = 'normal' }: { pts: THREE.Vector3[]; color: string; emphasis?: Emphasis }) {
  const dashes = useMemo(() => buildDashes(pts[0], pts[1]), [pts]);
  return <group><Cylinders segs={dashes} radius={CABLE_RADIUS} color={color} emphasis={emphasis} /></group>;
}

function PortMarker({ cable, port, isFromPort, dev, color, emphasis = 'normal' }: {
  cable: SceneCable; port: PortInfo; isFromPort: boolean; dev: SceneDevice; color: string; emphasis?: Emphasis;
}) {
  const startPlaneDrag = usePlaneDrag();
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const planeNorm = new THREE.Vector3(port.nx, 0, port.nz).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNorm, new THREE.Vector3(port.x, 0, port.z));
    startPlaneDrag(
      plane,
      pt => {
        const st = useSceneStore.getState();
        const d = st.devices.find(dd => dd.id === dev.id);
        if (!d) return;
        const cx = d.x + d.w / 2, cz = d.z + d.d / 2;
        const rawAlong = (pt.x - cx) * port.worldAlongX + (pt.z - cz) * port.worldAlongZ;
        const along = Math.max(-port.halfExt, Math.min(port.halfExt, rawAlong));
        const baseY = DESK_Y + (d.elevation || 0);
        const ht = Math.max(0.5, Math.min(d.h - 0.5, pt.y - baseY));
        st.setPort(cable.id, isFromPort, along, ht);
      },
      () => useSceneStore.getState().commitDrag(),
    );
  };
  return (
    <mesh
      position={[port.x + port.nx * 0.25, port.y, port.z + port.nz * 0.25]}
      rotation-y={Math.atan2(port.nx, port.nz)}
      onPointerDown={onPointerDown}
    >
      <boxGeometry args={[2.5, 2.5, 0.5]} />
      <meshPhongMaterial {...portMat(color, emphasis)} />
    </mesh>
  );
}

function WaypointMarker({ cableId, index, point, selected, color }: {
  cableId: number; index: number; point: THREE.Vector3; selected: boolean; color: string;
}) {
  const startPlaneDrag = usePlaneDrag();
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    useSceneStore.getState().setSelectedWP({ cableId, wpIndex: index });
    startPlaneDrag(
      routePlane,
      pt => useSceneStore.getState().moveUserWaypoint(cableId, index, { x: snapCm(pt.x), y: ROUTE_Y, z: snapCm(pt.z) }),
      () => useSceneStore.getState().commitDrag(),
    );
  };
  return (
    <mesh position={point} onPointerDown={onPointerDown}>
      <sphereGeometry args={[selected ? 1.2 : 0.9, 12, 12]} />
      <meshPhongMaterial color={selected ? '#ffffff' : color} emissive={color} emissiveIntensity={selected ? 0.5 : 0.3} />
    </mesh>
  );
}

/** Surface run rendered with per-segment radius scaled by how many cables share each edge. */
function SurfaceConnection({ cr, edgeCount, desk, emphasis = 'normal' }: { cr: Extract<CableRender, { kind: 'surface' }>; edgeCount: Map<string, number>; desk: DeskConfig; emphasis?: Emphasis }) {
  const { cable, color, portA, portB, cells } = cr;
  const selectedWP = useSceneStore(s => s.selectedWP);

  // A port below the table keeps the cable low instead of rising onto the desktop
  // first. The run drops to the lower endpoint while it is OFF the desk footprint,
  // but stays at the desk surface where it crosses over the desktop so it never
  // passes through the table slab — it climbs to the surface at the desk edge.
  const runY = runHeight(portA, portB);
  const cellY = (c: RoutePoint) => cellHeight(desk, c, runY);

  const { stubSegs, runSegs, joints } = useMemo(() => {
    const countFor = (a: RoutePoint, b: RoutePoint) => edgeCount.get(edgeKeyH(a, b, cellY(a), cellY(b))) ?? 1;
    const radiusFor = (a: RoutePoint, b: RoutePoint) => {
      const count = countFor(a, b);
      const off = count > 1 ? (cable.id % 4) * 0.04 : 0; // nest overlapping cables to avoid z-fighting
      return CABLE_RADIUS * Math.sqrt(count) - off;
    };
    const pts3 = cells.map(c => new THREE.Vector3(c.x, cellY(c), c.z));
    const first = cells[0], last = cells[cells.length - 1];

    // Port stubs + vertical drops at base radius — rise/drop to the run's local height
    const stubs = [
      ...buildSegments([
        new THREE.Vector3(portA.x, portA.y, portA.z),
        new THREE.Vector3(first.x, portA.y, first.z),
        new THREE.Vector3(first.x, pts3[0].y, first.z),
      ]),
      ...buildSegments([
        new THREE.Vector3(last.x, pts3[pts3.length - 1].y, last.z),
        new THREE.Vector3(last.x, portB.y, last.z),
        new THREE.Vector3(portB.x, portB.y, portB.z),
      ]),
    ];

    // Surface run: merge consecutive edges sharing direction + radius into one cylinder.
    // Only merge level (constant-height) edges so the slopes that climb onto the desk
    // stay intact instead of being collapsed into a straight diagonal.
    const edgeR: number[] = [];
    const edgeN: number[] = [];
    for (let i = 0; i < cells.length - 1; i++) {
      edgeR.push(radiusFor(cells[i], cells[i + 1]));
      edgeN.push(countFor(cells[i], cells[i + 1]));
    }
    const dirKey = (i: number) => `${Math.sign(cells[i + 1].x - cells[i].x)},${Math.sign(cells[i + 1].z - cells[i].z)}`;
    const level = (i: number) => pts3[i].y === pts3[i + 1].y;

    const runSegs: { s: Seg; r: number; shared: boolean }[] = [];
    let i = 0;
    while (i < edgeR.length) {
      let j = i;
      if (level(i)) {
        while (j + 1 < edgeR.length && level(j + 1) && pts3[j + 1].y === pts3[i].y
          && dirKey(j + 1) === dirKey(i) && Math.abs(edgeR[j + 1] - edgeR[i]) < 1e-6) j++;
      }
      runSegs.push({ s: seg(pts3[i], pts3[j + 1]), r: edgeR[i], shared: edgeN[i] > 1 });
      i = j + 1;
    }

    // Joints fill corners (incl. the drop/rise corners at the ends)
    const joints: { p: THREE.Vector3; r: number; shared: boolean }[] = [];
    for (let k = 0; k < pts3.length; k++) {
      const rPrev = k > 0 ? edgeR[k - 1] : CABLE_RADIUS;
      const rNext = k < edgeR.length ? edgeR[k] : CABLE_RADIUS;
      const nPrev = k > 0 ? edgeN[k - 1] : 1;
      const nNext = k < edgeN.length ? edgeN[k] : 1;
      joints.push({ p: pts3[k], r: Math.max(rPrev, rNext), shared: Math.max(nPrev, nNext) > 1 });
    }
    return { stubSegs: stubs, runSegs, joints };
  }, [cable.id, cells, portA, portB, runY, desk, edgeCount]);

  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const x = snapCm(e.point.x), z = snapCm(e.point.z);
    // Insert at the nearest leg of the anchor polyline (exitA, ...wps, exitB)
    const eA = portExit(portA), eB = portExit(portB);
    const anchors = [eA, ...cable.userWaypoints.map(w => ({ x: w.x, z: w.z })), eB];
    let best = 0, bestD = Infinity;
    for (let i = 0; i < anchors.length - 1; i++) {
      const d = distToSegment(x, z, anchors[i].x, anchors[i].z, anchors[i + 1].x, anchors[i + 1].z);
      if (d < bestD) { bestD = d; best = i; }
    }
    useSceneStore.getState().addUserWaypoint(cable.id, best, { x, y: ROUTE_Y, z });
  };

  return (
    <group>
      <Cylinders segs={stubSegs} radius={CABLE_RADIUS} color={color} emphasis={emphasis} />
      {runSegs.map((rs, i) => (
        <mesh key={i} position={rs.s.position} quaternion={rs.s.quaternion} onDoubleClick={onDoubleClick}>
          <cylinderGeometry args={[rs.r, rs.r, rs.s.length, 8]} />
          <meshPhongMaterial {...cableMat(rs.shared ? SLEEVE_COLOR : color, rs.shared ? 'normal' : emphasis)} />
        </mesh>
      ))}
      {joints.map((jt, i) => (
        <mesh key={`j${i}`} position={jt.p} onDoubleClick={onDoubleClick}>
          <sphereGeometry args={[jt.r, 8, 8]} />
          <meshPhongMaterial {...cableMat(jt.shared ? SLEEVE_COLOR : color, jt.shared ? 'normal' : emphasis)} />
        </mesh>
      ))}
      <PortMarker cable={cable} port={portA} isFromPort dev={{ id: cable.fromId } as SceneDevice} color={color} emphasis={emphasis} />
      <PortMarker cable={cable} port={portB} isFromPort={false} dev={{ id: cable.toId } as SceneDevice} color={color} emphasis={emphasis} />
      {/* Routing-point handles show only on cables wired to the selected device */}
      {emphasis === 'on' && cable.userWaypoints.map((w, i) => (
        <WaypointMarker
          key={i}
          cableId={cable.id}
          index={i}
          point={new THREE.Vector3(w.x, cellY(w), w.z)}
          selected={selectedWP?.cableId === cable.id && selectedWP.wpIndex === i}
          color={color}
        />
      ))}
    </group>
  );
}

function Connection({ cr, edgeCount, desk, emphasis }: { cr: CableRender; edgeCount: Map<string, number>; desk: DeskConfig; emphasis: Emphasis }) {
  if (cr.kind === 'surface') return <SurfaceConnection cr={cr} edgeCount={edgeCount} desk={desk} emphasis={emphasis} />;
  return (
    <group>
      {cr.kind === 'wireless'
        ? <WirelessRun pts={cr.pts} color={cr.color} emphasis={emphasis} />
        : <CableRun pts={cr.pts} color={cr.color} emphasis={emphasis} />}
      <PortMarker cable={cr.cable} port={cr.portA} isFromPort dev={{ id: cr.cable.fromId } as SceneDevice} color={cr.color} emphasis={emphasis} />
      <PortMarker cable={cr.cable} port={cr.portB} isFromPort={false} dev={{ id: cr.cable.toId } as SceneDevice} color={cr.color} emphasis={emphasis} />
    </group>
  );
}

/** Routed connections: obstacle-avoiding surface runs (90° turns) with overlap-thickened
 *  bundles, draggable port tabs, and user routing waypoints. */
export default function Cables() {
  const mode = useSceneStore(s => s.mode);
  const routed = useSceneStore(s => s.routed);
  const cables = useSceneStore(s => s.cables);
  const devices = useSceneStore(s => s.devices);
  const desk = useSceneStore(s => s.desk);
  const selected = useSceneStore(s => s.selected);

  const active = mode === '3d' && routed;
  const data = useMemo(() => (active ? computeAll(cables, devices, desk) : null), [active, cables, devices, desk]);
  if (!data) return null;

  // With a device selected, glow the cables wired to it and fade the rest.
  const emphasisFor = (cr: CableRender): Emphasis =>
    selected == null ? 'normal'
      : (cr.cable.fromId === selected || cr.cable.toId === selected) ? 'on' : 'dim';

  return (
    <group>
      {data.perCable.map((cr, i) => (
        <Connection key={cr.cable?.id ?? i} cr={cr} edgeCount={data.edgeCount} desk={desk} emphasis={emphasisFor(cr)} />
      ))}
    </group>
  );
}
