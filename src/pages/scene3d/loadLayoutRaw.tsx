import type { LayoutDoc } from '../../types';

/**
 * The 3D view reads the 2D tool's saved layout directly (legacy behavior:
 * raw read of kvm-vis-state with NO default fallback — missing data shows
 * the import prompt in the setup modal instead).
 */
export function loadLayoutRaw(): LayoutDoc | null {
  try {
    const raw = localStorage.getItem('kvm-vis-state');
    if (!raw) return null;
    return JSON.parse(raw) as LayoutDoc;
  } catch {
    return null;
  }
}
