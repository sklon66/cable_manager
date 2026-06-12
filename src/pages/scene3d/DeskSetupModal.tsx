import { useEffect, useRef, useState } from 'react';
import { useSceneStore } from '../../stores/sceneStore';
import { drawDeskPreview } from '../../lib/deskPreview';
import { parseLayoutDoc, saveScene3D } from '../../lib/persistence';
import { showToast } from '../../stores/toastStore';
import type { DeskConfig } from '../../types';

export default function DeskSetupModal() {
  const setupOpen = useSceneStore(s => s.setupOpen);
  const desk = useSceneStore(s => s.desk);
  const rawData = useSceneStore(s => s.rawData);

  const [draft, setDraft] = useState(desk);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-seed the draft each time the modal opens
  useEffect(() => {
    if (setupOpen) setDraft(useSceneStore.getState().desk);
  }, [setupOpen]);

  useEffect(() => {
    if (setupOpen && canvasRef.current) drawDeskPreview(canvasRef.current, draft);
  }, [setupOpen, draft]);

  if (!setupOpen) return <div id="modal-overlay" />;

  const deviceCount = rawData?.devices?.length ?? null;

  const onStart = () => {
    const clean: DeskConfig = {
      main_w: Math.max(20, Math.floor(draft.main_w) || 140),
      main_d: Math.max(20, Math.floor(draft.main_d) || 60),
      ext_w: Math.max(0, Math.floor(draft.ext_w) || 80),
      ext_d: Math.max(0, Math.floor(draft.ext_d) || 120),
      ext_side: draft.ext_side,
    };
    useSceneStore.getState().applyDeskAndStart(clean);
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const doc = parseLayoutDoc(JSON.parse(String(ev.target?.result)));
        if (doc.scene3d) {
          // Full bundle: restore desk + sizes/positions/ports and start directly
          saveScene3D(doc.scene3d);
          useSceneStore.getState().init(doc);
        } else {
          useSceneStore.getState().setRawData(doc);
        }
      } catch {
        showToast('Invalid JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const num = (v: string) => parseInt(v, 10) || 0;

  return (
    <div id="modal-overlay" className="open">
      <div id="modal">
        <h2>Desk Setup</h2>

        <div className="modal-section-label">Main Section</div>
        <div className="modal-row">
          <div className="prop-group">
            <label className="prop-label">Width (cm)</label>
            <input
              className="prop-input" type="number" min={20} max={500}
              value={draft.main_w}
              onChange={e => setDraft({ ...draft, main_w: num(e.target.value) })}
            />
          </div>
          <div className="prop-group">
            <label className="prop-label">Depth (cm)</label>
            <input
              className="prop-input" type="number" min={20} max={300}
              value={draft.main_d}
              onChange={e => setDraft({ ...draft, main_d: num(e.target.value) })}
            />
          </div>
        </div>

        <div className="modal-section-label">Extension</div>
        <div className="modal-row">
          <div className="prop-group">
            <label className="prop-label">Width (cm)</label>
            <input
              className="prop-input" type="number" min={0} max={300}
              value={draft.ext_w}
              onChange={e => setDraft({ ...draft, ext_w: num(e.target.value) })}
            />
          </div>
          <div className="prop-group">
            <label className="prop-label">Depth (cm)</label>
            <input
              className="prop-input" type="number" min={0} max={500}
              value={draft.ext_d}
              onChange={e => setDraft({ ...draft, ext_d: num(e.target.value) })}
            />
          </div>
        </div>
        <div className="prop-group" style={{ marginTop: 8 }}>
          <label className="prop-label">Extension Side</label>
          <select
            className="prop-input"
            value={draft.ext_side}
            onChange={e => setDraft({ ...draft, ext_side: e.target.value as DeskConfig['ext_side'] })}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>

        <canvas
          ref={canvasRef}
          id="desk-preview"
          width={332}
          height={130}
          style={{ marginTop: 14, borderRadius: 6, display: 'block' }}
        />

        <div className="modal-section-label" style={{ marginTop: 12 }}>Data Source</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
          {deviceCount !== null
            ? `✓ Loaded ${deviceCount} device${deviceCount !== 1 ? 's' : ''} from 2D tool`
            : 'No 2D tool data found.'}
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onImportFile} />
        {deviceCount === null && (
          <button
            className="btn"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
        )}

        <div className="modal-actions">
          <button className="btn primary" onClick={onStart}>Start →</button>
        </div>
      </div>
    </div>
  );
}
