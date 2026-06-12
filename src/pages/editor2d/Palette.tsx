import type { RefObject } from 'react';
import { CABLE_TYPES, DEVICE_TYPES } from '../../lib/constants';
import { useLayoutStore } from '../../stores/layoutStore';
import type { DeviceType } from '../../types';

const kbdStyle: React.CSSProperties = {
  background: 'var(--surface2)',
  padding: '1px 5px',
  borderRadius: 3,
  border: '1px solid var(--border)',
};

const SHORTCUTS: [string, string][] = [
  ['S', 'Select mode'],
  ['C', 'Cable mode'],
  ['Del', 'Delete selected'],
  ['Esc', 'Cancel / Deselect'],
];

export default function Palette({ wrapRef }: { wrapRef: RefObject<HTMLDivElement> }) {
  const addAtCenter = (type: DeviceType) => {
    const wrap = wrapRef.current;
    const s = useLayoutStore.getState();
    const cx = wrap ? (wrap.clientWidth / 2 - s.pan.x) / s.zoom - 55 : 200;
    const cy = wrap ? (wrap.clientHeight / 2 - s.pan.y) / s.zoom - 40 : 200;
    s.addDevice(type, Math.round(cx), Math.round(cy));
  };

  return (
    <div id="palette">
      <h3>Devices</h3>
      {(Object.entries(DEVICE_TYPES) as [DeviceType, typeof DEVICE_TYPES[DeviceType]][]).map(([type, def]) => (
        <div
          key={type}
          className="palette-item"
          draggable
          onDragStart={e => e.dataTransfer.setData('deviceType', type)}
          onClick={() => addAtCenter(type)}
        >
          <span className="pi-icon">{def.icon}</span>
          <div>
            <div className="pi-label">{def.label}</div>
            <div className="pi-hint">Click or drag</div>
          </div>
        </div>
      ))}

      <h3 style={{ marginTop: 12 }}>Cable Types</h3>
      <div className="legend" style={{ padding: '0 12px 12px' }}>
        {Object.entries(CABLE_TYPES).filter(([k]) => k !== 'Other').map(([name, ct]) => (
          <div className="legend-item" key={name}>
            <div className="legend-dot" style={{ background: ct.color }} />
            <span className="legend-label">{name}</span>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 4 }}>Shortcuts</h3>
      <div style={{ padding: '6px 12px 12px', lineHeight: 1.9 }}>
        {SHORTCUTS.map(([key, desc]) => (
          <div key={key} style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            <kbd style={kbdStyle}>{key}</kbd> {desc}
          </div>
        ))}
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Scroll to zoom</div>
      </div>
    </div>
  );
}
