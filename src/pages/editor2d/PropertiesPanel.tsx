import { CABLE_TYPES, DEVICE_TYPES } from '../../lib/constants';
import { useLayoutStore } from '../../stores/layoutStore';
import type { Cable, CableTypeName, Device, DeviceType, Direction } from '../../types';

function DeviceProps({ device }: { device: Device }) {
  const { updateDevice, removeDevice } = useLayoutStore.getState();
  return (
    <div id="props-content">
      <div className="prop-group">
        <label className="prop-label">Name</label>
        <input
          className="prop-input"
          type="text"
          value={device.name}
          onChange={e => updateDevice(device.id, { name: e.target.value })}
        />
      </div>
      <div className="prop-group">
        <label className="prop-label">Type</label>
        <select
          className="prop-input"
          value={device.type}
          onChange={e => updateDevice(device.id, { type: e.target.value as DeviceType })}
        >
          {Object.entries(DEVICE_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
      </div>
      <div className="prop-group">
        <label className="prop-label">Color</label>
        <div className="color-row">
          <div className="color-swatch">
            <input
              type="color"
              value={device.color}
              onChange={e => updateDevice(device.id, { color: e.target.value })}
            />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{device.color}</span>
        </div>
      </div>
      <button className="prop-delete-btn" onClick={() => removeDevice(device.id)}>Delete Device</button>
    </div>
  );
}

function CableProps({ cable }: { cable: Cable }) {
  const { updateCable, removeCable } = useLayoutStore.getState();
  const devices = useLayoutStore(s => s.devices);
  const fromName = devices.find(d => d.id === cable.fromId)?.name ?? '?';
  const toName = devices.find(d => d.id === cable.toId)?.name ?? '?';
  return (
    <div id="props-content">
      <div className="prop-group">
        <label className="prop-label">Connection</label>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          {fromName} → {toName}
        </div>
      </div>
      <div className="prop-group">
        <label className="prop-label">Cable Type</label>
        <select
          className="prop-input"
          value={cable.cableType}
          onChange={e => updateCable(cable.id, { cableType: e.target.value as CableTypeName })}
        >
          {Object.keys(CABLE_TYPES).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div className="prop-group">
        <label className="prop-label">Direction</label>
        <select
          className="prop-input"
          value={cable.direction ?? 'to'}
          onChange={e => updateCable(cable.id, { direction: e.target.value as Direction })}
        >
          <option value="to">→ To destination</option>
          <option value="from">← From destination</option>
          <option value="both">↔ Both directions</option>
          <option value="none">— No arrow</option>
        </select>
      </div>
      <div className="prop-group">
        <label className="prop-label">Custom Label</label>
        <input
          className="prop-input"
          type="text"
          placeholder="e.g. Ch1, 4K@60"
          value={cable.label}
          onChange={e => updateCable(cable.id, { label: e.target.value })}
        />
      </div>
      <button className="prop-delete-btn" onClick={() => removeCable(cable.id)}>Delete Cable</button>
    </div>
  );
}

export default function PropertiesPanel() {
  const selected = useLayoutStore(s => s.selected);
  const devices = useLayoutStore(s => s.devices);
  const cables = useLayoutStore(s => s.cables);

  const device = selected?.kind === 'device' ? devices.find(d => d.id === selected.id) : undefined;
  const cable = selected?.kind === 'cable' ? cables.find(c => c.id === selected.id) : undefined;

  return (
    <div id="props">
      <h3>Properties</h3>
      {device ? (
        <DeviceProps device={device} />
      ) : cable ? (
        <CableProps cable={cable} />
      ) : (
        <div id="props-empty">
          <span>Select a device or cable to edit its properties</span>
        </div>
      )}
    </div>
  );
}
