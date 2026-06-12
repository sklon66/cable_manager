import { create } from 'zustand';
import type { CableTypeName, DeskConfig, DeviceType, LayoutDoc, PortFace, Waypoint3D } from '../types';
import { DEVICE_DEFAULTS } from '../lib/constants';
import { snapCm } from '../lib/desk';
import { loadScene3D, saveScene3D } from '../lib/persistence';
import { showToast } from './toastStore';

export interface SceneDevice {
  id: number;
  type: DeviceType;
  name: string;
  color: string;
  x: number; z: number;
  w: number; d: number; h: number;
  elevation: number;
  rotation: number;
}

export interface SceneCable {
  id: number;
  fromId: number;
  toId: number;
  cableType: CableTypeName;
  portOffA: number; portHtA: number | null; portFaceA: PortFace | null;
  portOffB: number; portHtB: number | null; portFaceB: PortFace | null;
  userWaypoints: Waypoint3D[];
  routeIdx: number | null;
}

export type Mode3D = 'layout' | '3d';

interface SceneState {
  mode: Mode3D;
  desk: DeskConfig;
  devices: SceneDevice[];
  cables: SceneCable[];
  selected: number | null;
  selectedWP: { cableId: number; wpIndex: number } | null;
  routed: boolean;
  labelsVisible: boolean;
  rawData: LayoutDoc | null;
  /** Three canvas only renders after the desk has been confirmed at least once. */
  started: boolean;
  setupOpen: boolean;
  /** True while a device/port/waypoint drag is active — disables OrbitControls. */
  dragging: boolean;

  init: (rawData: LayoutDoc | null) => void;
  setRawData: (doc: LayoutDoc) => void;
  openSetup: () => void;
  closeSetup: () => void;
  applyDeskAndStart: (desk: DeskConfig) => void;
  setMode: (mode: Mode3D) => void;
  setSelected: (id: number | null) => void;
  setSelectedWP: (wp: { cableId: number; wpIndex: number } | null) => void;
  setDragging: (d: boolean) => void;
  moveDevice: (id: number, x: number, z: number) => void;
  updateDevice: (id: number, patch: Partial<SceneDevice>) => void;
  rotateDevice: (id: number, deg: number) => void;
  commitDrag: () => void;
  routeCables: () => void;
  clearCables: () => void;
  toggleLabels: () => void;
  setPortFace: (cableId: number, isFrom: boolean, face: PortFace | null) => void;
  setPort: (cableId: number, isFrom: boolean, off: number, ht: number) => void;
  addUserWaypoint: (cableId: number, wp: Waypoint3D) => void;
  moveUserWaypoint: (cableId: number, index: number, wp: Waypoint3D) => void;
  removeUserWaypoint: (cableId: number, index: number) => void;
  clearUserWaypoints: (cableId: number) => void;
}

function persist(s: Pick<SceneState, 'desk' | 'devices' | 'cables'>) {
  saveScene3D({
    desk: { ...s.desk },
    devices3d: s.devices.map(d => ({
      id: d.id, x: d.x, z: d.z, w: d.w, d: d.d, h: d.h,
      name: d.name, elevation: d.elevation || 0, rotation: d.rotation || 0,
    })),
    cables3d: s.cables.map(c => ({
      id: c.id,
      portOffA: c.portOffA || 0, portHtA: c.portHtA ?? null, portFaceA: c.portFaceA || null,
      portOffB: c.portOffB || 0, portHtB: c.portHtB ?? null, portFaceB: c.portFaceB || null,
      userWaypoints: c.userWaypoints || [],
    })),
  });
}

/** Legacy loadDevices: merge 2D layout with saved 3D positions/ports by device id. */
function buildSceneFromLayout(rawData: LayoutDoc | null, desk: DeskConfig): { devices: SceneDevice[]; cables: SceneCable[] } {
  const saved = loadScene3D();
  const savedDevs = new Map(saved.devices3d.map(d => [d.id, d]));
  const savedCables = new Map(saved.cables3d.map(c => [c.id, c]));

  const cables: SceneCable[] = (rawData?.cables ?? []).map(c => {
    const sv = savedCables.get(c.id);
    return {
      id: c.id, fromId: c.fromId, toId: c.toId, cableType: c.cableType,
      portOffA: sv?.portOffA || 0, portHtA: sv?.portHtA ?? null, portFaceA: sv?.portFaceA || null,
      portOffB: sv?.portOffB || 0, portHtB: sv?.portHtB ?? null, portFaceB: sv?.portFaceB || null,
      userWaypoints: sv?.userWaypoints || [],
      routeIdx: null,
    };
  });

  const devs2d = rawData?.devices ?? [];
  if (!devs2d.length) return { devices: [], cables };

  // Map normalized 2D positions onto the main desk section for unsaved devices
  const { main_w, main_d, ext_w, ext_side } = desk;
  const mX0 = ext_side === 'right' ? 0 : ext_w;
  const mX1 = mX0 + main_w, mZ1 = main_d;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  devs2d.forEach(d => {
    minX = Math.min(minX, d.x || 0); minY = Math.min(minY, d.y || 0);
    maxX = Math.max(maxX, d.x || 0); maxY = Math.max(maxY, d.y || 0);
  });
  const rX = Math.max(maxX - minX, 1), rY = Math.max(maxY - minY, 1);
  const PAD = 8;

  const devices = devs2d.map(d => {
    const def = DEVICE_DEFAULTS[d.type] ?? DEVICE_DEFAULTS.other;
    const sv = savedDevs.get(d.id);
    const normX = ((d.x || 0) - minX) / rX;
    const normY = ((d.y || 0) - minY) / rY;
    const nx = snapCm(mX0 + PAD + normX * Math.max(0, mX1 - mX0 - PAD * 2 - def.w));
    const nz = snapCm(PAD + normY * Math.max(0, mZ1 - PAD * 2 - def.d));
    return {
      id: d.id,
      type: (d.type || 'other') as DeviceType,
      name: sv ? sv.name : (d.name || def.label),
      color: d.color || def.color,
      x: sv ? sv.x : Math.max(0, nx),
      z: sv ? sv.z : Math.max(0, nz),
      w: sv ? sv.w : def.w,
      d: sv ? sv.d : def.d,
      h: sv ? sv.h : def.h,
      elevation: sv ? (sv.elevation || 0) : 0,
      rotation: sv ? (sv.rotation || 0) : 0,
    };
  });

  return { devices, cables };
}

const DEFAULT_DESK: DeskConfig = { main_w: 140, main_d: 60, ext_w: 80, ext_d: 120, ext_side: 'right' };

export const useSceneStore = create<SceneState>((set, get) => ({
  mode: 'layout',
  desk: { ...DEFAULT_DESK },
  devices: [],
  cables: [],
  selected: null,
  selectedWP: null,
  routed: false,
  labelsVisible: true,
  rawData: null,
  started: false,
  setupOpen: true,
  dragging: false,

  init: rawData => {
    const saved = loadScene3D();
    const desk = saved.desk ? { ...DEFAULT_DESK, ...saved.desk } : { ...DEFAULT_DESK };
    if (saved.desk) {
      const { devices, cables } = buildSceneFromLayout(rawData, desk);
      set({ desk, rawData, devices, cables, started: true, setupOpen: false, mode: 'layout', routed: false, selected: null, selectedWP: null });
    } else {
      set({ desk, rawData, started: false, setupOpen: true });
    }
  },

  setRawData: doc => set({ rawData: doc }),
  openSetup: () => set({ setupOpen: true }),
  closeSetup: () => set({ setupOpen: false }),

  applyDeskAndStart: desk => {
    const { devices, cables } = buildSceneFromLayout(get().rawData, desk);
    set({ desk, devices, cables, started: true, setupOpen: false, mode: 'layout', routed: false, selected: null, selectedWP: null });
    persist(get());
  },

  setMode: mode => set(mode === 'layout'
    // Entering layout clears routed cables (legacy switchToLayout → clearCables)
    ? { mode, routed: false, selected: null, selectedWP: null }
    : { mode, selected: null }),

  setSelected: id => set({ selected: id }),
  setSelectedWP: wp => set({ selectedWP: wp }),
  setDragging: dragging => set({ dragging }),

  moveDevice: (id, x, z) => set(st => ({
    devices: st.devices.map(d => (d.id === id ? { ...d, x, z } : d)),
  })),

  updateDevice: (id, patch) => set(st => {
    const next = { devices: st.devices.map(d => (d.id === id ? { ...d, ...patch } : d)) };
    persist({ ...st, ...next });
    return next;
  }),

  rotateDevice: (id, deg) => set(st => {
    const next = {
      devices: st.devices.map(d =>
        d.id === id ? { ...d, rotation: ((d.rotation || 0) + deg + 3600) % 360 } : d),
    };
    persist({ ...st, ...next });
    return next;
  }),

  commitDrag: () => persist(get()),

  routeCables: () => {
    const st = get();
    const devIds = new Set(st.devices.map(d => d.id));
    const valid = st.cables.filter(c => devIds.has(c.fromId) && devIds.has(c.toId));
    if (!valid.length) {
      set({ routed: false, selectedWP: null });
      showToast('No cables to route');
      return;
    }
    let i = 0;
    set({
      cables: st.cables.map(c =>
        devIds.has(c.fromId) && devIds.has(c.toId) ? { ...c, routeIdx: i++ } : { ...c, routeIdx: null }),
      routed: true,
      selectedWP: null,
    });
    showToast(`Routed ${valid.length} cable${valid.length !== 1 ? 's' : ''}`);
  },

  clearCables: () => set({ routed: false, selectedWP: null }),

  toggleLabels: () => set(st => ({ labelsVisible: !st.labelsVisible })),

  setPortFace: (cableId, isFrom, face) => set(st => {
    const next = {
      cables: st.cables.map(c => {
        if (c.id !== cableId) return c;
        return isFrom
          ? { ...c, portFaceA: face, portOffA: 0, portHtA: null }
          : { ...c, portFaceB: face, portOffB: 0, portHtB: null };
      }),
    };
    persist({ ...st, ...next });
    return next;
  }),

  setPort: (cableId, isFrom, off, ht) => set(st => ({
    cables: st.cables.map(c => {
      if (c.id !== cableId) return c;
      return isFrom ? { ...c, portOffA: off, portHtA: ht } : { ...c, portOffB: off, portHtB: ht };
    }),
  })),

  addUserWaypoint: (cableId, wp) => set(st => {
    const next = {
      cables: st.cables.map(c =>
        c.id === cableId ? { ...c, userWaypoints: [...c.userWaypoints, wp] } : c),
    };
    persist({ ...st, ...next });
    return next;
  }),

  moveUserWaypoint: (cableId, index, wp) => set(st => ({
    cables: st.cables.map(c => {
      if (c.id !== cableId) return c;
      const userWaypoints = [...c.userWaypoints];
      userWaypoints[index] = wp;
      return { ...c, userWaypoints };
    }),
  })),

  removeUserWaypoint: (cableId, index) => set(st => {
    const next = {
      cables: st.cables.map(c => {
        if (c.id !== cableId) return c;
        const userWaypoints = [...c.userWaypoints];
        userWaypoints.splice(index, 1);
        return { ...c, userWaypoints };
      }),
      selectedWP: null,
    };
    persist({ ...st, ...next });
    return next;
  }),

  clearUserWaypoints: cableId => set(st => {
    const next = {
      cables: st.cables.map(c => (c.id === cableId ? { ...c, userWaypoints: [] } : c)),
      selectedWP: null,
    };
    persist({ ...st, ...next });
    return next;
  }),
}));
