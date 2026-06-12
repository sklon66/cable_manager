/** Window-level pointer drag: calls onMove with deltas from the start point until pointerup. */
export function beginDrag(
  start: { clientX: number; clientY: number },
  handlers: {
    onMove: (dx: number, dy: number, ev: PointerEvent) => void;
    onEnd?: () => void;
  },
): void {
  const sx = start.clientX, sy = start.clientY;
  const move = (ev: PointerEvent) => handlers.onMove(ev.clientX - sx, ev.clientY - sy, ev);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    handlers.onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
