import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useSceneStore } from '../../stores/sceneStore';
import { DESK_Y, bounds, computeFloorY, rectGridPositions } from '../../lib/desk';
import DeviceBox from './DeviceBox';
import Ports from './Ports';

function Cameras() {
  const mode = useSceneStore(s => s.mode);
  const desk = useSceneStore(s => s.desk);
  const dragging = useSceneStore(s => s.dragging);
  const size = useThree(s => s.size);

  const b = bounds(desk);
  const asp = size.width / size.height;
  let hW = b.totalW / 2 * 1.25, hH = b.totalD / 2 * 1.25;
  if (hW / hH > asp) hH = hW / asp; else hW = hH * asp;

  return (
    <>
      <OrthographicCamera
        makeDefault={mode === 'layout'}
        left={-hW} right={hW} top={hH} bottom={-hH}
        near={0.1} far={2000}
        position={[b.cx, 500, b.cz]}
        up={[0, 0, -1]}
        onUpdate={c => { c.lookAt(b.cx, 0, b.cz); c.updateProjectionMatrix(); }}
      />
      <PerspectiveCamera
        makeDefault={mode === '3d'}
        fov={50} near={0.1} far={5000}
        position={[b.cx, b.totalD * 1.3, b.totalD * 2.0]}
      />
      {mode === '3d' && (
        <OrbitControls makeDefault enabled={!dragging} target={[b.cx, DESK_Y, b.cz]} />
      )}
    </>
  );
}

function RectGrid({ w, d, cell, color, position }: {
  w: number; d: number; cell: number; color: number; position: [number, number, number];
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(rectGridPositions(w, d, cell), 3));
    return geo;
  }, [w, d, cell]);
  return (
    <lineSegments geometry={geometry} position={position}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function Slab({ w, d, cx, cz }: { w: number; d: number; cx: number; cz: number }) {
  const geometry = useMemo(() => new THREE.BoxGeometry(w, DESK_Y, d), [w, d]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  return (
    <>
      <mesh geometry={geometry} position={[cx, DESK_Y / 2, cz]}>
        <meshLambertMaterial color={0x7a5230} />
      </mesh>
      <lineSegments geometry={edges} position={[cx, DESK_Y / 2, cz]}>
        <lineBasicMaterial color={0x5a3a1a} />
      </lineSegments>
      <RectGrid w={w} d={d} cell={5} color={0x2e3350} position={[cx - w / 2, DESK_Y + 0.05, cz - d / 2]} />
    </>
  );
}

function DimLabel({ text, position, visible }: { text: string; position: [number, number, number]; visible: boolean }) {
  if (!visible) return null;
  return (
    <Html position={position} center zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
      <div className="dim-label">{text}</div>
    </Html>
  );
}

function Desk() {
  const desk = useSceneStore(s => s.desk);
  const labelsVisible = useSceneStore(s => s.labelsVisible);
  const { main_w, main_d, ext_w, ext_d, ext_side } = desk;
  const b = bounds(desk);
  const hasExt = ext_w > 0 && ext_d > 0;
  const Y = DESK_Y + 0.5;

  return (
    <group>
      <Slab w={main_w} d={main_d} cx={b.mX0 + main_w / 2} cz={main_d / 2} />
      {hasExt && <Slab w={ext_w} d={ext_d} cx={b.eX0 + ext_w / 2} cz={ext_d / 2} />}

      <DimLabel text={`↔ ${main_w} cm`} position={[b.mX0 + main_w / 2, Y, main_d + 7]} visible={labelsVisible} />
      <DimLabel text={`↕ ${main_d} cm`} position={[b.mX0 - 7, Y, main_d / 2]} visible={labelsVisible} />
      {hasExt && (
        <>
          <DimLabel text={`↔ ${ext_w} cm`} position={[b.eX0 + ext_w / 2, Y, ext_d + 7]} visible={labelsVisible} />
          <DimLabel
            text={`↕ ${ext_d} cm`}
            position={[ext_side === 'right' ? b.eX1 + 7 : b.eX0 - 7, Y, ext_d / 2]}
            visible={labelsVisible}
          />
        </>
      )}
    </group>
  );
}

function Floor() {
  const desk = useSceneStore(s => s.desk);
  const devices = useSceneStore(s => s.devices);
  const b = bounds(desk);
  const fy = computeFloorY(devices);
  const PAD = 80;
  const fw = b.totalW + PAD * 2;
  const fd = b.totalD + PAD * 2;

  const geometry = useMemo(() => new THREE.BoxGeometry(fw, 0.5, fd), [fw, fd]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  if (!devices.length) return null;
  return (
    <group>
      <mesh geometry={geometry} position={[b.totalW / 2, fy - 0.25, b.totalD / 2]}>
        <meshLambertMaterial color={0x141720} />
      </mesh>
      <lineSegments geometry={edges} position={[b.totalW / 2, fy - 0.25, b.totalD / 2]}>
        <lineBasicMaterial color={0x1e2235} />
      </lineSegments>
      <RectGrid w={fw} d={fd} cell={20} color={0x181c2a} position={[-PAD, fy + 0.3, -PAD]} />
    </group>
  );
}

export default function Scene() {
  const devices = useSceneStore(s => s.devices);

  return (
    <Canvas
      legacy
      flat
      dpr={window.devicePixelRatio}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        // Match the legacy three 0.128 renderer: linear output, no sRGB transform
        gl.outputColorSpace = THREE.LinearSRGBColorSpace;
        gl.setClearColor(0x0f1117);
      }}
      onPointerMissed={() => {
        const s = useSceneStore.getState();
        if (s.mode === 'layout') s.setSelected(null);
      }}
    >
      <color attach="background" args={[0x0f1117]} />
      {/* three r155+ interprets intensity physically; ×π matches the legacy look */}
      <ambientLight intensity={0.6 * Math.PI} />
      <directionalLight intensity={0.9 * Math.PI} position={[60, 120, 60]} />

      <Cameras />
      <Desk />
      <Floor />
      {devices.map(d => <DeviceBox key={d.id} device={d} />)}
      <Ports />
    </Canvas>
  );
}
