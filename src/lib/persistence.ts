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
    // 3D bundle is optional and only meaningful with a desk config
    ...(d.scene3d?.desk ? { scene3d: {
      desk: d.scene3d.desk,
      devices3d: d.scene3d.devices3d ?? [],
      cables3d: d.scene3d.cables3d ?? [],
    } } : {}),
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
  // Bundle the 3D scene (desk, device sizes/positions, ports) when one exists,
  // so a single file restores both views. Legacy importers ignore the extra key.
  const saved3d = loadScene3D();
  const payload = {
    nextId: doc.nextId,
    devices: doc.devices,
    cables: doc.cables,
    ...(saved3d.desk ? { scene3d: {
      desk: saved3d.desk,
      devices3d: saved3d.devices3d,
      cables3d: saved3d.cables3d,
    } } : {}),
  };
  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kvm-setup-${String(Date.now()).slice(-4)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Read + leniently parse a layout JSON file; rejects on invalid JSON. */
export function readLayoutFile(file: File): Promise<LayoutDoc> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        resolve(parseLayoutDoc(JSON.parse(String(ev.target?.result))));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
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
