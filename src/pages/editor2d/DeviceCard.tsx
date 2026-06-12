import { DEVICE_TYPES } from '../../lib/constants';
import { beginDrag } from '../../lib/drag';
import { useLayoutStore } from '../../stores/layoutStore';
import type { Device } from '../../types';

export default function DeviceCard({ device }: { device: Device }) {
  const isSelected = useLayoutStore(
    s => s.selected?.kind === 'device' && s.selected.id === device.id,
  );
  const isCableSource = useLayoutStore(s => s.cableSource === device.id);
  const def = DEVICE_TYPES[device.type] ?? DEVICE_TYPES.other;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useLayoutStore.getState();
    if (s.mode === 'cable') {
      s.handleCableClick(device.id);
      return;
    }
    s.select('device', device.id);
    const { x: origX, y: origY } = device;
    beginDrag(e, {
      onMove: (dx, dy) => {
        const st = useLayoutStore.getState();
        st.moveDevice(device.id, origX + dx / st.zoom, origY + dy / st.zoom);
      },
      onEnd: () => useLayoutStore.getState().commitDrag(),
    });
  };

  return (
    <div
      className={`device-card${isSelected ? ' selected' : ''}${isCableSource ? ' cable-source' : ''}`}
      style={{ left: device.x, top: device.y }}
      onPointerDown={onPointerDown}
      onClick={e => e.stopPropagation()}
    >
      <div className="dc-color-bar" style={{ background: device.color }} />
      <div className="dc-icon">{def.icon}</div>
      <div className="dc-name">{device.name}</div>
      <div className="dc-type">{def.label}</div>
    </div>
  );
}
