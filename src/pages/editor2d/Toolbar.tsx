import { useRef, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useLayoutStore } from '../../stores/layoutStore';
import { fitViewTransform, zoomAtPoint } from '../../lib/geometry2d';
import { exportLayoutJSON, parseLayoutDoc } from '../../lib/persistence';
import { showToast } from '../../stores/toastStore';

export default function Toolbar({ wrapRef }: { wrapRef: RefObject<HTMLDivElement> }) {
  const mode = useLayoutStore(s => s.mode);
  const fileRef = useRef<HTMLInputElement>(null);

  const adjustZoom = (factor: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const s = useLayoutStore.getState();
    const next = zoomAtPoint(s.pan, s.zoom, factor, wrap.clientWidth / 2, wrap.clientHeight / 2);
    s.setPanZoom(next.pan, next.zoom);
  };

  const fitView = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const s = useLayoutStore.getState();
    const next = fitViewTransform(s.devices, wrap.clientWidth, wrap.clientHeight);
    if (next) s.setPanZoom(next.pan, next.zoom);
  };

  const onDelete = () => {
    const s = useLayoutStore.getState();
    if (!s.selected) return;
    if (s.selected.kind === 'device') s.removeDevice(s.selected.id);
    else s.removeCable(s.selected.id);
  };

  const onReset = () => {
    if (!confirm('Reset to default layout? This will remove all your cables and custom positions.')) return;
    useLayoutStore.getState().reset();
    showToast('Reset to default layout');
  };

  const onExport = () => exportLayoutJSON(useLayoutStore.getState());

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const doc = parseLayoutDoc(JSON.parse(String(ev.target?.result)));
        useLayoutStore.getState().importDoc(doc);
        showToast('Layout imported');
      } catch {
        showToast('Failed to import — invalid JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div id="toolbar">
      <span className="logo">⌨ CableManager5000</span>

      <button
        className={`tool-btn ${mode === 'select' ? 'active' : ''}`}
        title="Select / Move (S)"
        onClick={() => useLayoutStore.getState().setMode('select')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l7 4-4 1-2 4z" fill="currentColor" /></svg>
        Select
      </button>
      <button
        className={`tool-btn ${mode === 'cable' ? 'active' : ''}`}
        title="Add Cable (C)"
        onClick={() => useLayoutStore.getState().setMode('cable')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10 Q6 2 10 2" stroke="currentColor" strokeWidth="2" fill="none" /><circle cx="2" cy="10" r="1.5" fill="currentColor" /><circle cx="10" cy="2" r="1.5" fill="currentColor" /></svg>
        Add Cable
      </button>
      <button className="tool-btn danger" title="Delete selected (Del)" onClick={onDelete}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        Delete
      </button>

      <div className="sep" />

      <button className="tool-btn" title="Zoom Out" onClick={() => adjustZoom(0.8)}>－</button>
      <button className="tool-btn" title="Fit all devices" onClick={fitView}>Fit</button>
      <button className="tool-btn" title="Zoom In" onClick={() => adjustZoom(1.2)}>＋</button>

      <div className="sep" />

      <button className="tool-btn" title="Import JSON" onClick={() => fileRef.current?.click()}>Import</button>
      <button className="tool-btn" title="Export JSON" onClick={onExport}>Export</button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onImportFile} />

      <div className="sep" />

      <button className="tool-btn danger" title="Reset to default layout" onClick={onReset}>Reset</button>

      <div className="sep" />

      <Link className="tool-btn" title="Open 3D desk view" to="/3d">3D View →</Link>
    </div>
  );
}
