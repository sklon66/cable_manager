import { useRef } from 'react';
import NavMenu from '../../components/NavMenu';
import { useSceneStore } from '../../stores/sceneStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { exportLayoutJSON, readLayoutFile } from '../../lib/persistence';
import { showToast } from '../../stores/toastStore';

export default function Toolbar3D() {
  const mode = useSceneStore(s => s.mode);
  const labelsVisible = useSceneStore(s => s.labelsVisible);
  const fileRef = useRef<HTMLInputElement>(null);
  const s = () => useSceneStore.getState();

  const onExport = () => exportLayoutJSON(useLayoutStore.getState());

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const doc = await readLayoutFile(file);
      // Keep the 2D view in sync (also persists scene3d when bundled), then
      // rebuild the scene; a 2D-only file reopens the desk setup modal.
      useLayoutStore.getState().importDoc(doc);
      s().init(doc);
      showToast('Layout imported');
    } catch {
      showToast('Failed to import — invalid JSON');
    }
  };

  return (
    <div id="toolbar">
      <span className="logo">⌨ CableManager5000</span>

      <NavMenu />

      <div className="op-menu">
        {mode === 'layout' && (
          <>
            <button className="tool-btn" title="Edit desk dimensions" onClick={() => s().openSetup()}>⚙ Desk</button>
            <div className="sep" />
          </>
        )}
        {mode === '3d' && (
          <>
            <button className="tool-btn" title="Route cables" onClick={() => s().routeCables()}>Route Cables</button>
            <button className="tool-btn danger" title="Clear cables" onClick={() => s().clearCables()}>Clear Cables</button>
            <button
              className={`tool-btn ${labelsVisible ? 'active' : ''}`}
              title="Toggle labels"
              onClick={() => s().toggleLabels()}
            >
              Labels
            </button>
            <div className="sep" />
          </>
        )}

        <button className="tool-btn" title="Import JSON" onClick={() => fileRef.current?.click()}>Import</button>
        <button className="tool-btn" title="Export JSON" onClick={onExport}>Export</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onImportFile} />
      </div>
    </div>
  );
}
