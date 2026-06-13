import { useSceneStore, type SceneCable, type SceneDevice } from '../../stores/sceneStore';
import { DEVICE_DEFAULTS } from '../../lib/constants';
import type { PortFace } from '../../types';

/** Commits on blur/Enter like the legacy `change` event listeners. */
function CommitInput({ value, onCommit, ...rest }: {
  value: string | number;
  onCommit: (raw: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue'>) {
  return (
    <input
      {...rest}
      key={String(value)}
      className="prop-input"
      defaultValue={value}
      onBlur={e => onCommit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function PortSections({ dev }: { dev: SceneDevice }) {
  const cables = useSceneStore(s => s.cables);
  const devices = useSceneStore(s => s.devices);
  const conn = cables.filter(c => c.fromId === dev.id || c.toId === dev.id);
  if (!conn.length) return null;

  const otherName = (cable: SceneCable) => {
    const otherId = cable.fromId === dev.id ? cable.toId : cable.fromId;
    return devices.find(d => d.id === otherId)?.name ?? '?';
  };

  return (
    <>
      <div className="prop-divider" />
      <div className="prop-label" style={{ paddingBottom: 4 }}>
        Port faces <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>drag tab to reposition</span>
      </div>
      {conn.map(cable => {
        const isFrom = cable.fromId === dev.id;
        const fv = (isFrom ? cable.portFaceA : cable.portFaceB) ?? '';
        return (
          <div className="prop-group" key={`pf-${cable.id}`}>
            <label className="prop-label" style={{ fontSize: 9 }}>
              {cable.cableType} → {otherName(cable)}
            </label>
            <select
              className="prop-input"
              value={fv}
              onChange={e => useSceneStore.getState().setPortFace(
                cable.id, isFrom, (e.target.value || null) as PortFace | null)}
            >
              <option value="">Auto</option>
              <option value="r">Right</option>
              <option value="l">Left</option>
              <option value="f">Front</option>
              <option value="b">Back</option>
            </select>
            <label style={{ fontSize: 9, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <input
                type="checkbox"
                checked={cable.wireless}
                onChange={e => useSceneStore.getState().setWireless(cable.id, e.target.checked)}
              />
              Wireless (straight, dotted)
            </label>
          </div>
        );
      })}
    </>
  );
}

export default function PropsPanel3D() {
  const selected = useSceneStore(s => s.selected);
  const devices = useSceneStore(s => s.devices);
  const mode = useSceneStore(s => s.mode);
  const routed = useSceneStore(s => s.routed);

  const dev = selected !== null ? devices.find(d => d.id === selected) : undefined;

  if (!dev) {
    return (
      <div id="props">
        <h3>Properties</h3>
        <div id="props-empty">Select a device to edit its dimensions</div>
      </div>
    );
  }

  const def = DEVICE_DEFAULTS[dev.type] ?? DEVICE_DEFAULTS.other;
  const update = (patch: Partial<SceneDevice>) => useSceneStore.getState().updateDevice(dev.id, patch);
  const dim = (raw: string) => Math.max(1, parseInt(raw, 10) || 1);

  return (
    <div id="props">
      <h3>Properties</h3>
      <div id="props-content">
        <div className="prop-group">
          <label className="prop-label">Name</label>
          <CommitInput type="text" value={dev.name} onCommit={v => update({ name: v })} />
        </div>
        <div className="prop-type-badge">{def.label}</div>
        <div className="prop-divider" />
        <div className="prop-group">
          <label className="prop-label">Width (cm)</label>
          <CommitInput type="number" min={2} max={300} value={dev.w} onCommit={v => update({ w: dim(v) })} />
        </div>
        <div className="prop-group">
          <label className="prop-label">Depth (cm)</label>
          <CommitInput type="number" min={2} max={300} value={dev.d} onCommit={v => update({ d: dim(v) })} />
        </div>
        <div className="prop-group">
          <label className="prop-label">Height (cm)</label>
          <CommitInput type="number" min={1} max={300} value={dev.h} onCommit={v => update({ h: dim(v) })} />
        </div>
        <div className="prop-divider" />
        <div className="prop-group">
          <label className="prop-label">Elevation (cm above desk)</label>
          <CommitInput
            type="number" min={-200} max={200} step={1}
            value={dev.elevation || 0}
            onCommit={v => update({ elevation: parseInt(v, 10) || 0 })}
          />
        </div>
        <div className="prop-group">
          <label className="prop-label">
            Rotation (°) <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>R = +90°</span>
          </label>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <button
              className="btn" style={{ padding: '4px 10px', flexShrink: 0 }}
              onClick={() => useSceneStore.getState().rotateDevice(dev.id, -90)}
            >↺</button>
            <CommitInput
              type="number" min={-360} max={360} step={5}
              value={dev.rotation || 0}
              onCommit={v => update({ rotation: ((parseInt(v, 10) || 0) + 3600) % 360 })}
            />
            <button
              className="btn" style={{ padding: '4px 10px', flexShrink: 0 }}
              onClick={() => useSceneStore.getState().rotateDevice(dev.id, 90)}
            >↻</button>
          </div>
        </div>
        {mode === '3d' && routed && <PortSections dev={dev} />}
      </div>
    </div>
  );
}
