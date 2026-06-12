import { Link } from 'react-router-dom';
import { useSceneStore } from '../../stores/sceneStore';

export default function Toolbar3D() {
  const mode = useSceneStore(s => s.mode);
  const labelsVisible = useSceneStore(s => s.labelsVisible);
  const s = () => useSceneStore.getState();

  return (
    <div id="toolbar">
      <span className="logo">⌨ CableManager5000</span>

      <Link className="tool-btn" title="Back to 2D tool" to="/">← 2D Tool</Link>
      {mode === 'layout' && (
        <button className="tool-btn" title="Edit desk dimensions" onClick={() => s().openSetup()}>⚙ Desk</button>
      )}

      <div className="sep" />

      {mode === 'layout' ? (
        <button className="tool-btn" title="Switch to 3D view" onClick={() => s().setMode('3d')}>Switch to 3D →</button>
      ) : (
        <>
          <button className="tool-btn" title="Back to layout" onClick={() => s().setMode('layout')}>← Layout</button>
          <button className="tool-btn" title="Route cables" onClick={() => s().routeCables()}>Route Cables</button>
          <button className="tool-btn danger" title="Clear cables" onClick={() => s().clearCables()}>Clear Cables</button>
          <button
            className={`tool-btn ${labelsVisible ? 'active' : ''}`}
            title="Toggle labels"
            onClick={() => s().toggleLabels()}
          >
            Labels
          </button>
        </>
      )}
    </div>
  );
}
