import { useLocation, useNavigate } from 'react-router-dom';
import { useSceneStore, type Mode3D } from '../stores/sceneStore';

/** Shared view-navigation menu: 2D View / Table View / 3D View.
 *  Table and 3D both live on the /3d route and differ only by scene mode, so
 *  within that page we flip the mode; from the 2D page we navigate to /3d and
 *  pass the desired mode via router state (see Scene3DPage). */
export default function NavMenu() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sceneMode = useSceneStore(s => s.mode);

  const on3d = pathname === '/3d';
  const is2D = !on3d;
  const isTable = on3d && sceneMode === 'layout';
  const is3D = on3d && sceneMode === '3d';

  const goScene = (mode: Mode3D) => {
    if (on3d) useSceneStore.getState().setMode(mode);
    else navigate('/3d', { state: { mode } });
  };

  return (
    <div className="nav-menu">
      <button
        className={`tool-btn ${is2D ? 'active' : ''}`}
        title="2D schematic editor"
        onClick={() => { if (!is2D) navigate('/'); }}
      >
        Schema View
      </button>
      <button
        className={`tool-btn ${isTable ? 'active' : ''}`}
        title="Arrange devices on the desk"
        onClick={() => goScene('layout')}
      >
        Table View
      </button>
      <button
        className={`tool-btn ${is3D ? 'active' : ''}`}
        title="3D desk view with routed cables"
        onClick={() => goScene('3d')}
      >
        3D View
      </button>
    </div>
  );
}
