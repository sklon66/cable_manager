import { chromium } from 'playwright-core';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
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
    desk: { main_w: 140, main_d: 60, ext_w: 80, ext_d: 120, ext_side: 'right' },
    devices3d: [], cables3d: [],
  }));
});
await page.goto('http://localhost:5199/3d');
await page.waitForSelector('#canvas3d canvas');
await page.waitForTimeout(800);

const lblPos = () => page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();

// 1. Pan: drag empty canvas area → label moves with the view
const before = await lblPos();
await page.mouse.move(900, 700); // empty area below desk
await page.mouse.down();
await page.mouse.move(1100, 600, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await lblPos();
log('1: pan delta of PC 1 label:', Math.round(after.x - before.x), Math.round(after.y - before.y));

// 2. Device drag still works and doesn't pan the view
const kvmBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).devices3d?.find(d => d.id === 3) ?? null);
const otherBefore = await lblPos(); // PC 1 = view reference
const kvmLbl = await page.locator('.device-label', { hasText: 'KVM' }).boundingBox();
await page.mouse.move(kvmLbl.x + kvmLbl.width / 2, kvmLbl.y + kvmLbl.height / 2);
await page.mouse.down();
await page.mouse.move(kvmLbl.x + kvmLbl.width / 2 + 80, kvmLbl.y + kvmLbl.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const kvmAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')).devices3d.find(d => d.id === 3));
const otherAfter = await lblPos();
log('2: KVM x moved:', (kvmBefore?.x ?? 'unsaved'), '→', kvmAfter.x,
  '| view stayed put (PC 1 label delta):', Math.round(otherAfter.x - otherBefore.x), Math.round(otherAfter.y - otherBefore.y));

// 3. Wheel zoom in layout
const z1 = await lblPos();
await page.mouse.move(600, 450);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(300);
const z2 = await lblPos();
log('3: wheel zoom changed view (label moved):', Math.abs(z2.x - z1.x) + Math.abs(z2.y - z1.y) > 5);
await page.screenshot({ path: '/tmp/kvm-verify/16-layout-pan.png' });

// 4. 3D mode orbit unaffected
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(500);
const o1 = await page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();
await page.mouse.move(600, 450);
await page.mouse.down();
await page.mouse.move(750, 400, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const o2 = await page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();
log('4: 3d orbit still works (label moved):', Math.abs(o2.x - o1.x) + Math.abs(o2.y - o1.y) > 5);

await browser.close();
log('DONE');
