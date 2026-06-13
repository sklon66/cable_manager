import { chromium } from 'playwright-core';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
await page.addInitScript(() => {
  if (localStorage.getItem('kvm-vis-state')) return;
  localStorage.setItem('kvm-vis-state', JSON.stringify({
    nextId: 5,
    devices: [{ id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' }],
    cables: [],
  }));
  localStorage.setItem('kvm-3d-state', JSON.stringify({
    desk: { main_w: 140, main_d: 60, ext_w: 0, ext_d: 0, ext_side: 'right' },
    devices3d: [{ id: 1, x: 20, z: 10, w: 20, d: 45, h: 45, name: 'PC 1', elevation: 0, rotation: 0 }],
    cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.waitForTimeout(700);
const count = async () => page.locator('.device-label, .dim-label').count();

log('1: layout labels (initial):', await count());

// 3D mode, turn labels OFF
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(400);
log('2: 3d labels before toggle:', await count());
await page.click('button[title="Toggle labels"]');
await page.waitForTimeout(400);
log('3: 3d labels after toggling OFF:', await count(), '(expect 0)');

// Back to layout — labels must reappear
await page.click('button[title="Back to layout"]');
await page.waitForTimeout(400);
log('4: layout labels after 3d-off:', await count(), '(expect > 0)');

// Return to 3D — should still be OFF (3D state preserved)
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(400);
log('5: 3d labels still off:', await count(), '(expect 0)');
await browser.close();
log('DONE');
