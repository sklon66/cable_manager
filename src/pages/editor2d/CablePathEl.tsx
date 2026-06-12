import { useLayoutEffect, useRef, useState } from 'react';
import { CABLE_TYPES } from '../../lib/constants';
import { beginDrag } from '../../lib/drag';
import { buildCablePath, polylinePoint, snap } from '../../lib/geometry2d';
import { useLayoutStore } from '../../stores/layoutStore';
import type { Cable, Device } from '../../types';

interface Props {
  cable: Cable;
  from: Device;
  to: Device;
  isSelected: boolean;
  pairGroups: Record<string, number[]>;
}

function Arrow({ pts, t, flip, color, opacity }: {
  pts: { x: number; y: number }[]; t: number; flip: boolean; color: string; opacity: number;
}) {
  const { x, y, angle } = polylinePoint(pts, t);
  return (
    <path
      d="M -6,-4 L 6,0 L -6,4 Z"
      transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(angle + (flip ? 180 : 0)).toFixed(1)})`}
      fill={color}
      opacity={opacity}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export default function CablePathEl({ cable, from, to, isSelected, pairGroups }: Props) {
  const ct = CABLE_TYPES[cable.cableType] ?? CABLE_TYPES.Other;
  const dir = cable.direction ?? 'to';
  const wp = cable.waypoints ?? [];
  const { d: pathD, pts } = buildCablePath(cable, from, to, pairGroups);

  const labelText = cable.label || ct.label;
  const textRef = useRef<SVGTextElement>(null);
  const [labelWidth, setLabelWidth] = useState(28);
  useLayoutEffect(() => {
    const len = textRef.current?.getComputedTextLength() ?? 0;
    setLabelWidth(Math.max(28, len + 16));
  }, [labelText]);

  const { x: lx, y: ly } = polylinePoint(pts, 0.5);

  /** Client coords → world coords via the svg origin (svg sits at world 0,0). */
  const toWorld = (el: SVGElement, clientX: number, clientY: number) => {
    const r = el.ownerSVGElement!.getBoundingClientRect();
    const zoom = useLayoutStore.getState().zoom;
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  };

  const onHitDoubleClick = (e: React.MouseEvent<SVGPathElement>) => {
    e.stopPropagation();
    const w = toWorld(e.currentTarget, e.clientX, e.clientY);
    useLayoutStore.getState().addWaypoint(cable.id, snap(w.x), snap(w.y));
  };

  const startWaypointDrag = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    const orig = wp[index];
    beginDrag(e, {
      onMove: (dx, dy) => {
        const s = useLayoutStore.getState();
        s.moveWaypoint(cable.id, index, {
          x: snap(orig.x + dx / s.zoom),
          y: snap(orig.y + dy / s.zoom),
        });
      },
      onEnd: () => useLayoutStore.getState().commitDrag(),
    });
  };

  return (
    <g className={isSelected ? 'cable-selected' : undefined}>
      <path
        d={pathD}
        stroke="transparent"
        strokeWidth={16}
        fill="none"
        className="cable-hit"
        style={{ pointerEvents: 'stroke' }}
        onClick={e => { e.stopPropagation(); useLayoutStore.getState().select('cable', cable.id); }}
        onDoubleClick={onHitDoubleClick}
      />
      <path
        d={pathD}
        stroke={ct.color}
        strokeDasharray={isSelected ? '6,3' : 'none'}
        opacity={isSelected ? 1 : 0.85}
        className="cable-line"
      />
      {(dir === 'from' || dir === 'both') && (
        <Arrow pts={pts} t={0.28} flip color={ct.color} opacity={isSelected ? 1 : 0.9} />
      )}
      {(dir === 'to' || dir === 'both') && (
        <Arrow pts={pts} t={0.72} flip={false} color={ct.color} opacity={isSelected ? 1 : 0.9} />
      )}
      <rect
        x={lx - labelWidth / 2}
        y={ly - 9}
        width={labelWidth}
        height={18}
        rx={4}
        fill="#1a1d27"
        stroke={ct.color}
        strokeWidth={1}
      />
      <text ref={textRef} x={lx} y={ly} className="cable-label-text" fill={ct.color}>
        {labelText}
      </text>
      {isSelected
        ? wp.map((w, i) => (
            <circle
              key={i}
              cx={w.x}
              cy={w.y}
              r={6}
              fill={ct.color}
              stroke="#fff"
              strokeWidth={1.5}
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onPointerDown={e => startWaypointDrag(e, i)}
              onDoubleClick={e => { e.stopPropagation(); useLayoutStore.getState().removeWaypoint(cable.id, i); }}
            />
          ))
        : wp.map((w, i) => (
            <circle
              key={i}
              cx={w.x}
              cy={w.y}
              r={3}
              fill={ct.color}
              opacity={0.4}
              style={{ pointerEvents: 'none' }}
            />
          ))}
    </g>
  );
}
