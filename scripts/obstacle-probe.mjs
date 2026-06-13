import { chromium } from 'playwright-core';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
await page.addInitScript(() => {
  if (localStorage.getItem('kvm-vis-state')) return;
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 20,
    devices: [
      { id: 1, type: 'pc', name: 'PC', x: 80, y: 200, color: '#6366f1' },
      { id: 2, type: 'monitor', name: 'Monitor', x: 600, y: 200, color: '#0ea5e9' },
      { id: 3, type: 'audio', name: 'Blocker', x: 340, y: 200, color: '#db2777' },
    ],
    // PC <-> Monitor cable; Blocker sits between them
    cables: [{ id: 12, fromId: 1, toId: 2, cableType: 'HDMI', label: '', direction: 'to', waypoints: [] }],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      { id: 1, x: 10, z: 30, w: 20, d: 20, h: 10, name: 'PC', elevation: 0, rotation: 0 },
      { id: 2, x: 170, z: 30, w: 20, d: 20, h: 10, name: 'Monitor', elevation: 0, rotation: 0 },
      // big blocker straddling the straight PC->Monitor line at routing height
      { id: 3, x: 80, z: 15, w: 30, d: 50, h: 20, name: 'Blocker', elevation: 0, rotation: 0 },
    ],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(500);
await page.click('button[title="Route cables"]');
await page.waitForTimeout(600);
log('1: routed toast:', JSON.stringify(await page.locator('#toast').textContent()));

// Read cable cylinder world centers and check none sit inside the blocker footprint
const inside = await page.evaluate(() => {
  // walk the r3f scene via the canvas' __r3f
  const cv = document.querySelector('#canvas3d canvas');
  const root = cv && cv.__r3f && cv.__r3f.root;
  if (!root) return 'no-r3f';
  const state = root.getState ? root.getState() : root.store.getState();
  const scene = state.scene;
  const centers = [];
  scene.traverse(o => {
    if (o.geometry && o.geometry.type === 'CylinderGeometry') {
      const p = new (o.position.constructor)();
      o.getWorldPosition(p);
      centers.push([+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]);
    }
  });
  // blocker footprint x:80..110, z:15..65 (w30,d50). Count cable-height centers inside.
  const within = centers.filter(([x, y, z]) => x >= 80 && x <= 110 && z >= 15 && z <= 65 && y > 3 && y < 6);
  return { total: centers.length, insideBlocker: within.length, sample: centers.slice(0, 3) };
});
log('2: cable segments:', JSON.stringify(inside));
await page.screenshot({ path: '/tmp/kvm-verify/23-obstacle.png' });

// Compare: clear the blocker out of the way and confirm a clean run still works
await browser.close();
log('DONE');
