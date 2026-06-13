import { useEffect } from 'react';
import Toolbar3D from './Toolbar3D';
import DeskSetupModal from './DeskSetupModal';
import PropsPanel3D from './PropsPanel3D';
import Scene from './Scene';
import { useSceneStore } from '../../stores/sceneStore';
import { loadLayoutRaw } from './loadLayoutRaw';
import './scene3d.css';

export default function Scene3DPage() {
  const started = useSceneStore(s => s.started);

  useEffect(() => {
    useSceneStore.getState().init(loadLayoutRaw());
  }, []);

  // R rotates the selected device; Delete removes the selected routing waypoint
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useSceneStore.getState();
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedWP) {
        s.removeUserWaypoint(s.selectedWP.cableId, s.selectedWP.wpIndex);
        return;
      }
      if ((e.key === 'r' || e.key === 'R') && s.selected !== null) {
        s.rotateDevice(s.selected, 90);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="page-3d">
      <Toolbar3D />
      <div id="main">
        <div id="canvas3d">{started && <Scene />}</div>
        <PropsPanel3D />
      </div>
      <DeskSetupModal />
    </div>
  );
}
