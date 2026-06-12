import { useEffect, useRef } from 'react';
import Toolbar from './Toolbar';
import Palette from './Palette';
import Canvas2D from './Canvas2D';
import PropertiesPanel from './PropertiesPanel';
import CableModal from './CableModal';
import { useLayoutStore } from '../../stores/layoutStore';
import './editor2d.css';

export default function Editor2DPage() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useLayoutStore.getState();
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected) {
        if (s.selected.kind === 'device') s.removeDevice(s.selected.id);
        else s.removeCable(s.selected.id);
      }
      if (e.key === 'Escape') {
        if (s.mode === 'cable') s.setMode('select');
        else s.clearSelection();
      }
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey) s.setMode('cable');
      if (e.key === 's' && !e.metaKey && !e.ctrlKey) s.setMode('select');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="page-2d">
      <Toolbar wrapRef={wrapRef} />
      <div id="main">
        <Palette wrapRef={wrapRef} />
        <Canvas2D wrapRef={wrapRef} />
        <PropertiesPanel />
      </div>
      <CableModal />
    </div>
  );
}
