import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Toolbar3D from './Toolbar3D';
import DeskSetupModal from './DeskSetupModal';
import PropsPanel3D from './PropsPanel3D';
import Scene from './Scene';
import { useSceneStore, type Mode3D } from '../../stores/sceneStore';
import { loadLayoutRaw } from './loadLayoutRaw';
import './scene3d.css';

export default function Scene3DPage() {
  const started = useSceneStore(s => s.started);
  const location = useLocation();

  useEffect(() => {
    useSceneStore.getState().init(loadLayoutRaw());
    // The nav menu passes a desired view when arriving from the 2D page; init
    // always lands in 'layout', so apply the requested mode on top of it.
    const desired = (location.state as { mode?: Mode3D } | null)?.mode;
    if (desired) useSceneStore.getState().setMode(desired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // R rotates the selected device; Delete removes the selected routing waypoint;
  // Esc clears the current device/waypoint selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useSceneStore.getState();
      if (e.key === 'Escape') {
        s.setSelected(null);
        s.setSelectedWP(null);
        return;
      }
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
