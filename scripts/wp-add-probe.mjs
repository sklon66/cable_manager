import { chromium } from 'playwright-core';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
await page.addInitScript(() => {
  if (localStorage.getItem('kvm-vis-state')) return;
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 30,
    devices: [
      { id: 1, type: 'pc', name: 'PC', x: 80, y: 200, color: '#6366f1' },
      { id: 3, type: 'monitor', name: 'Monitor', x: 600, y: 200, color: '#0ea5e9' },
    ],
    cables: [{ id: 11, fromId: 1, toId: 3, cableType: 'HDMI', label: '', direction: 'to', waypoints: [] }],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      { id: 1, x: 10, z: 35, w: 20, d: 20, h: 12, name: 'PC', elevation: 0, rotation: 0 },
      { id: 3, x: 170, z: 35, w: 20, d: 20, h: 12, name: 'Monitor', elevation: 0, rotation: 0 },
    ],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(400);
await page.click('button[title="Route cables"]');
await page.waitForTimeout(500);

const wps = async () => page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).cables3d[0]?.userWaypoints || []);
let hit = null;
outer:
for (let x = 500; x <= 760 && !hit; x += 60) {
  for (let y = 470; y <= 505; y += 3) {
    await page.mouse.dblclick(x, y);
    await page.waitForTimeout(120);
    const w = await wps();
    if (w.length) { hit = { x, y, w }; break outer; }
  }
}
log('1: waypoint added at screen', hit ? `${hit.x},${hit.y}` : 'MISS', '→', JSON.stringify(hit?.w));
await page.screenshot({ path: '/tmp/kvm-verify/29-wp-add.png' });

if (hit) {
  // 90° check: the route through the waypoint must use only axis-aligned segments.
  // Drag isn't trivial headless; instead move the waypoint via store-equivalent: re-add offset
  // Verify reload persistence
  await page.reload();
  await page.waitForTimeout(900);
  await page.click('button[title="Switch to 3D view"]');
  await page.waitForTimeout(300);
  await page.click('button[title="Route cables"]');
  await page.waitForTimeout(400);
  log('2: after reload waypoints:', JSON.stringify(await wps()));
  await page.screenshot({ path: '/tmp/kvm-verify/30-wp-reload.png' });

  // Clear via props: select the device, click Clear
  const lbl = await page.locator('.device-label', { hasText: 'PC' }).boundingBox();
  await page.mouse.click(lbl.x + lbl.width / 2, lbl.y + lbl.height / 2 + 30);
  await page.waitForTimeout(300);
  const clearBtn = page.locator('#props-content button', { hasText: 'Clear' });
  log('3: Clear button present:', await clearBtn.count());
  if (await clearBtn.count()) { await clearBtn.first().click(); await page.waitForTimeout(300); }
  log('4: waypoints after Clear:', JSON.stringify(await wps()));
}
await browser.close();
log('DONE');
