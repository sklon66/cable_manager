import type { LayoutDoc, Scene3DDoc, DeskConfig, Device3D, Cable3D } from '../types';
import { DEFAULT_STATE } from './constants';

// Keys must stay identical to the legacy app so saved layouts keep working.
const LAYOUT_KEY = 'kvm-vis-state';
const SCENE3D_KEY = 'kvm-3d-state';

/** Lenient parse matching legacy importJSON/loadState fallbacks. */
export function parseLayoutDoc(data: unknown): LayoutDoc {
  const d = (data ?? {}) as Partial<LayoutDoc>;
  return {
    nextId: d.nextId ?? 1,
    devices: d.devices ?? [],
    cables: d.cables ?? [],
  };
}

export function loadLayout(): LayoutDoc {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return parseLayoutDoc(JSON.parse(raw));
  } catch { /* fall through to default */ }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

export function saveLayout(doc: LayoutDoc): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({
      nextId: doc.nextId, devices: doc.devices, cables: doc.cables,
    }));
  } catch { /* storage full / unavailable */ }
}

export function exportLayoutJSON(doc: LayoutDoc): void {
  const blob = new Blob(
    [JSON.stringify({ nextId: doc.nextId, devices: doc.devices, cables: doc.cables }, null, 2)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kvm-setup-${String(Date.now()).slice(-4)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── 3D ──────────────────────────────────────────────────────────────────────

export interface Scene3DSaved {
  desk: DeskConfig | null;
  devices3d: Device3D[];
  cables3d: Cable3D[];
}

export function loadScene3D(): Scene3DSaved {
  try {
    const s = JSON.parse(localStorage.getItem(SCENE3D_KEY) || '{}') as Partial<Scene3DDoc>;
    return {
      desk: s.desk ?? null,
      devices3d: s.devices3d ?? [],
      cables3d: s.cables3d ?? [],
    };
  } catch {
    return { desk: null, devices3d: [], cables3d: [] };
  }
}

export function saveScene3D(doc: Scene3DDoc): void {
  try {
    localStorage.setItem(SCENE3D_KEY, JSON.stringify(doc));
  } catch { /* storage full / unavailable */ }
}
