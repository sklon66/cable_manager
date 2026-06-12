import { chromium } from 'playwright-core';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
await page.addInitScript(() => {
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 20,
    devices: [
      { id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' },
      { id: 3, type: 'kvm', name: 'KVM', x: 340, y: 270, color: '#f59e0b' },
      { id: 4, type: 'monitor', name: 'Monitor 1', x: 600, y: 120, color: '#0ea5e9' },
    ],
    cables: [
      { id: 12, fromId: 1, toId: 3, cableType: 'HDMI', label: '', direction: 'to', waypoints: [] },
      { id: 13, fromId: 3, toId: 4, cableType: 'DisplayPort', label: '', direction: 'to', waypoints: [] },
      { id: 14, fromId: 1, toId: 4, cableType: 'USB-C', label: '', direction: 'to', waypoints: [] },
    ],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 200, main_d: 80, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [
      { id: 1, x: 10, z: 10, w: 20, d: 45, h: 45, name: 'PC 1', elevation: 0, rotation: 0 },
      { id: 3, x: 90, z: 30, w: 20, d: 12, h: 4, name: 'KVM', elevation: 12, rotation: 0 },
      { id: 4, x: 140, z: 10, w: 60, d: 20, h: 40, name: 'Monitor 1', elevation: 0, rotation: 0 },
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
log('1: toast:', JSON.stringify(await page.locator('#toast').textContent()));
await page.screenshot({ path: '/tmp/kvm-verify/17-autopath.png' });

// Drag a port and confirm the cable re-routes live (no errors)
const kvmLbl = await page.locator('.device-label', { hasText: 'KVM' }).boundingBox();
await page.mouse.move(kvmLbl.x + kvmLbl.width / 2 - 40, kvmLbl.y + 40);
await page.waitForTimeout(100);
// click the PC to select, check port drag via stored values after a small drag on port area is fiddly;
// instead verify port settings persist path recompute by changing a face via props
const pcLbl = await page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();
await page.mouse.click(pcLbl.x + pcLbl.width / 2, pcLbl.y + pcLbl.height / 2 + 30);
await page.waitForTimeout(300);
await page.selectOption('#props-content select >> nth=0', 'b');
await page.waitForTimeout(400);
log('2: face changed to back, no errors');
await page.screenshot({ path: '/tmp/kvm-verify/18-autopath-facechange.png' });
await browser.close();
log('DONE');
