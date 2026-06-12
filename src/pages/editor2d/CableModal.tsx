import { useEffect, useRef, useState } from 'react';
import { CABLE_TYPES } from '../../lib/constants';
import { useLayoutStore } from '../../stores/layoutStore';
import type { CableTypeName } from '../../types';

export default function CableModal() {
  const pendingCable = useLayoutStore(s => s.pendingCable);
  const devices = useLayoutStore(s => s.devices);
  const [cableType, setCableType] = useState<CableTypeName>('USB-A');
  const [label, setLabel] = useState('');
  const typeRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (pendingCable) {
      setCableType('USB-A');
      setLabel('');
      typeRef.current?.focus();
    }
  }, [pendingCable]);

  if (!pendingCable) return <div id="modal-overlay" />;

  const fromName = devices.find(d => d.id === pendingCable.fromId)?.name ?? '?';
  const toName = devices.find(d => d.id === pendingCable.toId)?.name ?? '?';

  const close = () => useLayoutStore.getState().setPendingCable(null);
  const confirmAdd = () => {
    const s = useLayoutStore.getState();
    s.addCable(pendingCable.fromId, pendingCable.toId, cableType, label.trim());
    s.setPendingCable(null);
  };

  return (
    <div id="modal-overlay" className="open" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div id="modal">
        <h2>Add Cable</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fromName} → {toName}</div>

        <div className="prop-group">
          <label className="prop-label">Cable Type</label>
          <select
            ref={typeRef}
            className="prop-input"
            value={cableType}
            onChange={e => setCableType(e.target.value as CableTypeName)}
          >
            {Object.keys(CABLE_TYPES).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="prop-group">
          <label className="prop-label">Label (optional)</label>
          <input
            className="prop-input"
            type="text"
            placeholder="e.g. Channel 1, 4K@60Hz"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={confirmAdd}>Add Cable</button>
        </div>
      </div>
    </div>
  );
}
