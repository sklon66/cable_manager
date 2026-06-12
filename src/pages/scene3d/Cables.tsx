import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useSceneStore, type SceneCable, type SceneDevice } from '../../stores/sceneStore';
import { CABLE_TYPES } from '../../lib/constants';
import { DESK_Y } from '../../lib/desk';
import { CABLE_RADIUS, computeCablePath, type PortInfo } from '../../lib/cableRouting3d';
import { usePlaneDrag } from './usePlaneDrag';

const UP = new THREE.Vector3(0, 1, 0);

interface Segment {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
}

function buildSegments(pts: THREE.Vector3[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    if (length < 0.001) continue;
    dir.normalize();
    const quaternion = new THREE.Quaternion();
    if (Math.abs(dir.dot(UP)) > 0.9999) {
      // Degenerate setFromUnitVectors case: vertical segments
      if (dir.y < 0) quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    } else {
      quaternion.setFromUnitVectors(UP, dir);
    }
    const position = a.clone().addScaledVector(dir, length / 2);
    segs.push({ position, quaternion, length });
  }
  return segs;
}

function PortMarker({ cable, port, isFromPort, dev, color }: {
  cable: SceneCable; port: PortInfo; isFromPort: boolean; dev: SceneDevice; color: string;
}) {
  const startPlaneDrag = usePlaneDrag();

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // Drag along the device face: plane through the port with the face normal
    const planeNorm = new THREE.Vector3(port.nx, 0, port.nz).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNorm,
      new THREE.Vector3(port.x, 0, port.z),
    );
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
      <meshPhongMaterial color={color} emissive={color} emissiveIntensity={0.4} />
    </mesh>
  );
}

function WaypointMarker({ cable, index, position, color }: {
  cable: SceneCable; index: number; position: THREE.Vector3; color: string;
}) {
  const startPlaneDrag = usePlaneDrag();

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    useSceneStore.getState().setSelectedWP({ cableId: cable.id, wpIndex: index });
    const y = position.y;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    startPlaneDrag(
      plane,
      pt => useSceneStore.getState().moveUserWaypoint(cable.id, index, { x: pt.x, y, z: pt.z }),
      () => useSceneStore.getState().commitDrag(),
    );
  };

  return (
    <mesh position={position} onPointerDown={onPointerDown}>
      <sphereGeometry args={[2.5, 10, 10]} />
      <meshPhongMaterial
        color={color} emissive={color} emissiveIntensity={0.35}
        transparent opacity={0.85}
      />
    </mesh>
  );
}

function CableRun({ cable, devA, devB }: { cable: SceneCable; devA: SceneDevice; devB: SceneDevice }) {
  const desk = useSceneStore(s => s.desk);
  const color = (CABLE_TYPES[cable.cableType] ?? CABLE_TYPES.Other).color;

  const { pts, portA, portB, routingY } = useMemo(
    () => computeCablePath(cable, devA, devB, desk, cable.routeIdx ?? 0),
    [cable, devA, devB, desk],
  );
  const segments = useMemo(() => buildSegments(pts), [pts]);

  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useSceneStore.getState().addUserWaypoint(cable.id, {
      x: e.point.x, y: e.point.y, z: e.point.z,
    });
  };

  return (
    <group>
      {segments.map((seg, i) => (
        <mesh
          key={`s${i}-${seg.length.toFixed(2)}`}
          position={seg.position}
          quaternion={seg.quaternion}
          onDoubleClick={onDoubleClick}
        >
          <cylinderGeometry args={[CABLE_RADIUS, CABLE_RADIUS, seg.length, 8]} />
          <meshPhongMaterial color={color} />
        </mesh>
      ))}
      {pts.slice(1, -1).map((p, i) => (
        <mesh key={`j${i}`} position={p} onDoubleClick={onDoubleClick}>
          <sphereGeometry args={[CABLE_RADIUS, 8, 8]} />
          <meshPhongMaterial color={color} />
        </mesh>
      ))}
      <PortMarker cable={cable} port={portA} isFromPort dev={devA} color={color} />
      <PortMarker cable={cable} port={portB} isFromPort={false} dev={devB} color={color} />
      {cable.userWaypoints.map((wp, i) => (
        <WaypointMarker
          key={`w${i}`}
          cable={cable}
          index={i}
          position={new THREE.Vector3(wp.x, wp.y ?? routingY, wp.z)}
          color={color}
        />
      ))}
    </group>
  );
}

export default function Cables() {
  const mode = useSceneStore(s => s.mode);
  const routed = useSceneStore(s => s.routed);
  const cables = useSceneStore(s => s.cables);
  const devices = useSceneStore(s => s.devices);

  if (mode !== '3d' || !routed) return null;

  const devMap = new Map(devices.map(d => [d.id, d]));
  return (
    <group>
      {cables.map(c => {
        if (c.routeIdx == null) return null;
        const devA = devMap.get(c.fromId);
        const devB = devMap.get(c.toId);
        if (!devA || !devB) return null;
        return <CableRun key={c.id} cable={c} devA={devA} devB={devB} />;
      })}
    </group>
  );
}
