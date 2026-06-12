import { useEffect, type RefObject } from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { beginDrag } from '../../lib/drag';
import { zoomAtPoint } from '../../lib/geometry2d';
import DeviceCard from './DeviceCard';
import CableLayer from './CableLayer';
import type { DeviceType } from '../../types';

export default function Canvas2D({ wrapRef }: { wrapRef: RefObject<HTMLDivElement> }) {
  const devices = useLayoutStore(s => s.devices);
  const mode = useLayoutStore(s => s.mode);
  const pan = useLayoutStore(s => s.pan);
  const zoom = useLayoutStore(s => s.zoom);

  // Wheel zoom toward cursor — native listener so preventDefault works reliably
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const s = useLayoutStore.getState();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const next = zoomAtPoint(s.pan, s.zoom, factor, e.clientX - rect.left, e.clientY - rect.top);
      s.setPanZoom(next.pan, next.zoom);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [wrapRef]);

  const isEmptyTarget = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    return t === wrapRef.current || t.id === 'canvas-inner' || t.id === 'cables';
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !isEmptyTarget(e) || mode === 'cable') return;
    e.preventDefault();
    const wrap = wrapRef.current!;
    const start = useLayoutStore.getState().pan;
    wrap.style.cursor = 'grabbing';
    beginDrag(e, {
      onMove: (dx, dy) => {
        const s = useLayoutStore.getState();
        s.setPanZoom({ x: start.x + dx, y: start.y + dy }, s.zoom);
      },
      onEnd: () => { wrap.style.cursor = ''; },
    });
  };

  const onClick = (e: React.MouseEvent) => {
    if (isEmptyTarget(e) && mode !== 'cable') useLayoutStore.getState().clearSelection();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('deviceType') as DeviceType;
    if (!type) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const s = useLayoutStore.getState();
    const x = (e.clientX - rect.left - s.pan.x) / s.zoom;
    const y = (e.clientY - rect.top - s.pan.y) / s.zoom;
    s.addDevice(type, Math.round(x - 55), Math.round(y - 40));
  };

  return (
    <div
      id="canvas-wrap"
      ref={wrapRef}
      className={mode === 'cable' ? 'mode-cable' : ''}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
        id="canvas-inner"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        <CableLayer />
        {devices.map(d => <DeviceCard key={d.id} device={d} />)}
      </div>
    </div>
  );
}
