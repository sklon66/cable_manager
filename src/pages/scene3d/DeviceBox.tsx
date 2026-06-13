import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useSceneStore, type SceneDevice } from '../../stores/sceneStore';
import { DESK_Y, snapCm } from '../../lib/desk';
import { usePlaneDrag } from './usePlaneDrag';

const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_Y);

export default function DeviceBox({ device }: { device: SceneDevice }) {
  const mode = useSceneStore(s => s.mode);
  const isSelected = useSceneStore(s => s.selected === device.id);
  const labelsVisible = useSceneStore(s => s.labelsVisible);
  const startPlaneDrag = usePlaneDrag();

  const isLayout = mode !== '3d';
  const mh = isLayout ? 1 : device.h;
  const posY = isLayout ? DESK_Y + 0.5 : DESK_Y + (device.elevation || 0) + mh / 2;

  const geometry = useMemo(() => new THREE.BoxGeometry(device.w, mh, device.d), [device.w, mh, device.d]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = useSceneStore.getState();

    // Layout mode flattens every device to the same height, so overlapping
    // footprints are hit at the same distance and the bigger box often wins.
    // Prefer the smallest-footprint device under the cursor so a small device
    // resting on a large one is selectable. (3D keeps closest-wins.)
    if (s.mode === 'layout') {
      const hits = e.intersections.filter(i => i.object.userData?.isDevice);
      if (hits.length > 1) {
        let best = hits[0];
        for (const h of hits) {
          if (h.object.userData.footprint < best.object.userData.footprint) best = h;
        }
        if (best.object.userData.deviceId !== device.id) return; // let the smaller one handle it
      }
    }

    e.stopPropagation();
    s.setSelected(device.id);
    if (s.mode !== 'layout') return;

    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(deskPlane, hit)) return;
    const offX = hit.x - (device.x + device.w / 2);
    const offZ = hit.z - (device.z + device.d / 2);
    startPlaneDrag(
      deskPlane,
      pt => {
        const st = useSceneStore.getState();
        const dev = st.devices.find(d => d.id === device.id);
        if (!dev) return;
        st.moveDevice(device.id, snapCm(pt.x - offX - dev.w / 2), snapCm(pt.z - offZ - dev.d / 2));
      },
      () => useSceneStore.getState().commitDrag(),
    );
  };

  return (
    <mesh
      geometry={geometry}
      position={[device.x + device.w / 2, posY, device.z + device.d / 2]}
      rotation-y={-(device.rotation || 0) * Math.PI / 180}
      onPointerDown={onPointerDown}
      userData={{ isDevice: true, deviceId: device.id, footprint: device.w * device.d }}
    >
      <meshLambertMaterial color={device.color} />
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={isSelected ? 0x6366f1 : 0xffffff}
          transparent
          opacity={isSelected ? 0.9 : 0.25}
        />
      </lineSegments>
      {labelsVisible && (
        <Html position={[0, mh / 2 + 4, 0]} center zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
          <div className="device-label">{device.name}</div>
        </Html>
      )}
    </mesh>
  );
}
