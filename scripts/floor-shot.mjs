import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 13,
    devices: [
      { id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' },
      { id: 3, type: 'kvm', name: 'KVM', x: 340, y: 270, color: '#f59e0b' },
    ],
    cables: [],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 140, main_d: 60, ext_w: 0, ext_d: 0, ext_side: 'right' },
    // PC below the desk so the floor sits under it and overlaps the view
    devices3d: [{ id: 1, x: 20, z: 8, w: 20, d: 45, h: 45, name: 'PC 1', elevation: -60, rotation: 0 }],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/kvm-verify/15-floor-transparent.png' });
await browser.close();
console.log('DONE');
