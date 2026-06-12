import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useSceneStore, type SceneCable, type SceneDevice } from '../../stores/sceneStore';
import { CABLE_TYPES } from '../../lib/constants';
import { DESK_Y } from '../../lib/desk';
import { getPort, type PortInfo } from '../../lib/ports3d';
import { usePlaneDrag } from './usePlaneDrag';

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

/** Port socket tabs for every routed connection. Cable geometry itself is gone —
 *  the routing feature is being rethought; ports are its surviving anchor points. */
export default function Ports() {
  const mode = useSceneStore(s => s.mode);
  const routed = useSceneStore(s => s.routed);
  const cables = useSceneStore(s => s.cables);
  const devices = useSceneStore(s => s.devices);

  if (mode !== '3d' || !routed) return null;

  const devMap = new Map(devices.map(d => [d.id, d]));
  return (
    <group>
      {cables.map(c => {
        const devA = devMap.get(c.fromId);
        const devB = devMap.get(c.toId);
        if (!devA || !devB) return null;
        const color = (CABLE_TYPES[c.cableType] ?? CABLE_TYPES.Other).color;
        const portA = getPort(devA, devB, c.portOffA || 0, c.portHtA ?? null, c.portFaceA || null);
        const portB = getPort(devB, devA, c.portOffB || 0, c.portHtB ?? null, c.portFaceB || null);
        return (
          <group key={c.id}>
            <PortMarker cable={c} port={portA} isFromPort dev={devA} color={color} />
            <PortMarker cable={c} port={portB} isFromPort={false} dev={devB} color={color} />
          </group>
        );
      })}
    </group>
  );
}
