import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneStore } from '../../stores/sceneStore';

/**
 * Window-level drag that reprojects each pointermove onto a world plane with
 * the current camera. Marks the store as dragging so OrbitControls pause.
 */
export function usePlaneDrag() {
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);

  return (
    plane: THREE.Plane,
    onPoint: (pt: THREE.Vector3) => void,
    onEnd?: () => void,
  ) => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pt = new THREE.Vector3();
    useSceneStore.getState().setDragging(true);

    const move = (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, pt)) onPoint(pt);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useSceneStore.getState().setDragging(false);
      onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}
