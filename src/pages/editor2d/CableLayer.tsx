import { useLayoutStore } from '../../stores/layoutStore';
import { buildPairGroups } from '../../lib/geometry2d';
import CablePathEl from './CablePathEl';

export default function CableLayer() {
  const cables = useLayoutStore(s => s.cables);
  const devices = useLayoutStore(s => s.devices);
  const selected = useLayoutStore(s => s.selected);

  const pairGroups = buildPairGroups(cables);

  return (
    <svg id="cables">
      {cables.map(c => {
        const from = devices.find(d => d.id === c.fromId);
        const to = devices.find(d => d.id === c.toId);
        if (!from || !to) return null;
        return (
          <CablePathEl
            key={c.id}
            cable={c}
            from={from}
            to={to}
            isSelected={selected?.kind === 'cable' && selected.id === c.id}
            pairGroups={pairGroups}
          />
        );
      })}
    </svg>
  );
}
