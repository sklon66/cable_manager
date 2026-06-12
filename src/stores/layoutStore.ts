import { create } from 'zustand';
import type { Cable, CableTypeName, Device, DeviceType, LayoutDoc, Mode2D, Selection, Waypoint } from '../types';
import { DEFAULT_STATE, DEVICE_TYPES } from '../lib/constants';
import { loadLayout, saveLayout, saveScene3D } from '../lib/persistence';
import { waypointInsertIndex } from '../lib/geometry2d';
import { showToast } from './toastStore';

interface Point { x: number; y: number }

interface LayoutState extends LayoutDoc {
  selected: Selection | null;
  mode: Mode2D;
  cableSource: number | null;
  pendingCable: { fromId: number; toId: number } | null;
  pan: Point;
  zoom: number;

  addDevice: (type: DeviceType, x?: number, y?: number) => Device;
  removeDevice: (id: number) => void;
  updateDevice: (id: number, patch: Partial<Device>) => void;
  /** Position update during drag — no persistence until commitDrag. */
  moveDevice: (id: number, x: number, y: number) => void;
  addCable: (fromId: number, toId: number, cableType: CableTypeName, label: string) => void;
  removeCable: (id: number) => void;
  updateCable: (id: number, patch: Partial<Cable>) => void;
  addWaypoint: (cableId: number, x: number, y: number) => void;
  removeWaypoint: (cableId: number, index: number) => void;
  moveWaypoint: (cableId: number, index: number, wp: Waypoint) => void;
  commitDrag: () => void;
  select: (kind: 'device' | 'cable', id: number) => void;
  clearSelection: () => void;
  setMode: (mode: Mode2D) => void;
  handleCableClick: (deviceId: number) => void;
  setPendingCable: (p: { fromId: number; toId: number } | null) => void;
  setPanZoom: (pan: Point, zoom: number) => void;
  importDoc: (doc: LayoutDoc) => void;
  reset: () => void;
}

const persist = (s: LayoutDoc) => saveLayout({ nextId: s.nextId, devices: s.devices, cables: s.cables });

const initial = loadLayout();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...initial,
  selected: null,
  mode: 'select',
  cableSource: null,
  pendingCable: null,
  pan: { x: 0, y: 0 },
  zoom: 1,

  addDevice: (type, x, y) => {
    const def = DEVICE_TYPES[type] ?? DEVICE_TYPES.other;
    const s = get();
    const count = s.devices.filter(d => d.type === type).length + 1;
    const device: Device = {
      id: s.nextId,
      type,
      name: count > 1 ? `${def.defaultName} ${count}` : def.defaultName,
      x: x ?? 200,
      y: y ?? 200,
      color: def.defaultColor,
    };
    set(st => {
      const next = {
        nextId: st.nextId + 1,
        devices: [...st.devices, device],
        selected: { kind: 'device', id: device.id } as Selection,
        cableSource: null,
      };
      persist({ ...st, ...next });
      return next;
    });
    return device;
  },

  removeDevice: id => set(st => {
    const next = {
      devices: st.devices.filter(d => d.id !== id),
      cables: st.cables.filter(c => c.fromId !== id && c.toId !== id),
      selected: st.selected?.id === id && st.selected.kind === 'device' ? null : st.selected,
    };
    persist({ ...st, ...next });
    return next;
  }),

  updateDevice: (id, patch) => set(st => {
    const next = { devices: st.devices.map(d => (d.id === id ? { ...d, ...patch } : d)) };
    persist({ ...st, ...next });
    return next;
  }),

  moveDevice: (id, x, y) => set(st => ({
    devices: st.devices.map(d => (d.id === id ? { ...d, x, y } : d)),
  })),

  addCable: (fromId, toId, cableType, label) => set(st => {
    const cable: Cable = { id: st.nextId, fromId, toId, cableType, label: label || '', direction: 'to', waypoints: [] };
    const next = {
      nextId: st.nextId + 1,
      cables: [...st.cables, cable],
      selected: { kind: 'cable', id: cable.id } as Selection,
      cableSource: null,
    };
    persist({ ...st, ...next });
    return next;
  }),

  removeCable: id => set(st => {
    const next = {
      cables: st.cables.filter(c => c.id !== id),
      selected: st.selected?.id === id && st.selected.kind === 'cable' ? null : st.selected,
    };
    persist({ ...st, ...next });
    return next;
  }),

  updateCable: (id, patch) => set(st => {
    const next = { cables: st.cables.map(c => (c.id === id ? { ...c, ...patch } : c)) };
    persist({ ...st, ...next });
    return next;
  }),

  addWaypoint: (cableId, x, y) => set(st => {
    const c = st.cables.find(c => c.id === cableId);
    const from = st.devices.find(d => d.id === c?.fromId);
    const to = st.devices.find(d => d.id === c?.toId);
    if (!c || !from || !to) return {};
    const idx = waypointInsertIndex(c, from, to, x, y);
    const waypoints = [...(c.waypoints ?? [])];
    waypoints.splice(idx, 0, { x, y });
    const next = {
      cables: st.cables.map(cc => (cc.id === cableId ? { ...cc, waypoints } : cc)),
      selected: { kind: 'cable', id: cableId } as Selection,
      cableSource: null,
    };
    persist({ ...st, ...next });
    return next;
  }),

  removeWaypoint: (cableId, index) => set(st => {
    const next = {
      cables: st.cables.map(c => {
        if (c.id !== cableId) return c;
        const waypoints = [...(c.waypoints ?? [])];
        waypoints.splice(index, 1);
        return { ...c, waypoints };
      }),
    };
    persist({ ...st, ...next });
    return next;
  }),

  moveWaypoint: (cableId, index, wp) => set(st => ({
    cables: st.cables.map(c => {
      if (c.id !== cableId) return c;
      const waypoints = [...(c.waypoints ?? [])];
      waypoints[index] = wp;
      return { ...c, waypoints };
    }),
  })),

  commitDrag: () => persist(get()),

  select: (kind, id) => {
    const st = get();
    if (st.mode === 'cable' && kind === 'device') {
      st.handleCableClick(id);
      return;
    }
    set({ selected: { kind, id }, cableSource: null });
  },

  clearSelection: () => set({ selected: null, cableSource: null }),

  setMode: mode => set({ mode, cableSource: null }),

  handleCableClick: deviceId => {
    const st = get();
    if (!st.cableSource) {
      set({ cableSource: deviceId });
      showToast('Now click the destination device');
    } else if (st.cableSource === deviceId) {
      set({ cableSource: null });
    } else {
      set({ pendingCable: { fromId: st.cableSource, toId: deviceId }, cableSource: null, mode: 'select' });
    }
  },

  setPendingCable: p => set({ pendingCable: p }),

  setPanZoom: (pan, zoom) => set({ pan, zoom }),

  importDoc: doc => set(st => {
    // Files exported with a 3D scene bundle restore the 3D view's storage too
    if (doc.scene3d) saveScene3D(doc.scene3d);
    const next = { nextId: doc.nextId, devices: doc.devices, cables: doc.cables, selected: null };
    persist({ ...st, ...next });
    return next;
  }),

  reset: () => set(st => {
    const def: LayoutDoc = JSON.parse(JSON.stringify(DEFAULT_STATE));
    const next = {
      ...def,
      selected: null,
      cableSource: null,
      mode: 'select' as Mode2D,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };
    persist({ ...st, ...next });
    return next;
  }),
}));
