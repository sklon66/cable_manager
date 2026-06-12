import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://localhost:5199';
const OUT = '/tmp/kvm-verify';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') log('CONSOLE-ERR:', m.text()); });

// ── 1. 2D page first load ────────────────────────────────────────────────────
await page.goto(BASE + '/');
await page.waitForSelector('.device-card');
const cardCount = await page.locator('.device-card').count();
log('STEP1 2D loads, device cards:', cardCount);
await page.screenshot({ path: OUT + '/01-2d-initial.png' });

// ── 2. Drag a device ─────────────────────────────────────────────────────────
const card = page.locator('.device-card', { hasText: 'KVM Switch' }).first();
const before = await card.boundingBox();
await card.hover();
await page.mouse.down();
await page.mouse.move(before.x + 120, before.y + 80, { steps: 8 });
await page.mouse.up();
const after = await card.boundingBox();
log('STEP2 drag delta:', Math.round(after.x - before.x), Math.round(after.y - before.y));
const lsAfterDrag = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-vis-state')));
log('STEP2 localStorage keys:', Object.keys(lsAfterDrag).join(','), '| devices:', lsAfterDrag.devices.length);

// ── 3. Cable mode via keyboard, connect two devices, modal, confirm ─────────
await page.keyboard.press('c');
await page.locator('.device-card', { hasText: 'PC 1' }).first().click();
await page.locator('.device-card', { hasText: 'KVM Switch' }).first().click();
await page.waitForSelector('#modal-overlay.open');
log('STEP3 modal open, conn label:', await page.locator('#modal h2').textContent());
await page.selectOption('#modal select', 'HDMI');
await page.fill('#modal input[type=text]', 'Ch1');
await page.click('#modal .btn.primary');
await page.waitForSelector('svg#cables g path.cable-line');
const cableCount = await page.locator('svg#cables g').count();
const labelText = await page.locator('svg#cables text').first().textContent();
log('STEP3 cables rendered:', cableCount, '| label:', labelText);
await page.screenshot({ path: OUT + '/02-2d-cable.png' });

// ── 4. Waypoint via double-click, then fit view ──────────────────────────────
await page.locator('svg#cables path.cable-hit').first().dblclick({ force: true });
const wpCount = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('kvm-vis-state')).cables[0].waypoints.length);
log('STEP4 waypoints after dblclick:', wpCount);
await page.click('button[title="Fit all devices"]');
await page.screenshot({ path: OUT + '/03-2d-fit.png' });

// ── 5. Probe: Escape cancels cable mode; Delete removes selection ───────────
await page.keyboard.press('c');
await page.locator('.device-card', { hasText: 'PC 2' }).first().click();
await page.keyboard.press('Escape');
const toastText = await page.locator('#toast').textContent();
log('STEP5 probe: toast after cable-source click:', JSON.stringify(toastText));
const cableSourceCards = await page.locator('.device-card.cable-source').count();
log('STEP5 probe: cable-source highlight after Esc:', cableSourceCards);

// ── 6. 3D page: setup modal → Start ──────────────────────────────────────────
await page.click('a[title="Open 3D desk view"]');
await page.waitForSelector('.page-3d #modal-overlay.open');
const dataInfo = await page.locator('#modal div', { hasText: 'device' }).last().textContent();
log('STEP6 3D setup modal, data info:', dataInfo.trim());
await page.screenshot({ path: OUT + '/04-3d-setup.png' });
await page.click('#modal .btn.primary');
await page.waitForSelector('canvas', { timeout: 10000 });
await page.waitForTimeout(800);
log('STEP6 layout mode, labels:', await page.locator('.device-label').count());
await page.screenshot({ path: OUT + '/05-3d-layout.png' });

// ── 7. Switch to 3D, route cables ────────────────────────────────────────────
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/06-3d-view.png' });
await page.click('button[title="Route cables"]');
await page.waitForTimeout(500);
const toast3d = await page.locator('#toast').textContent();
log('STEP7 route cables toast:', JSON.stringify(toast3d));
await page.screenshot({ path: OUT + '/07-3d-routed.png' });

// ── 8. Persistence: reload skips modal, layout intact ────────────────────────
const saved3d = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-3d-state')));
log('STEP8 kvm-3d-state keys:', Object.keys(saved3d).join(','),
  '| devices3d:', saved3d.devices3d.length, '| cables3d:', saved3d.cables3d.length);
await page.reload();
await page.waitForTimeout(1200);
const modalOpenAfterReload = await page.locator('#modal-overlay.open').count();
log('STEP8 setup modal after reload (expect 0):', modalOpenAfterReload);
await page.screenshot({ path: OUT + '/08-3d-reload.png' });

// ── 9. Probe: select device in 3D, R rotates, props panel ────────────────────
const canvas = page.locator('#canvas3d canvas');
const cb = await canvas.boundingBox();
await canvas.click({ position: { x: cb.width * 0.5, y: cb.height * 0.55 } });
await page.waitForTimeout(300);
const propsName = await page.locator('#props-content input').first().inputValue().catch(() => null);
log('STEP9 clicked center device, props name:', JSON.stringify(propsName));
if (propsName !== null) {
  const rotBefore = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('kvm-3d-state'));
    return s.devices3d.map(d => d.rotation);
  });
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  const rotAfter = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('kvm-3d-state'));
    return s.devices3d.map(d => d.rotation);
  });
  log('STEP9 rotations before:', JSON.stringify(rotBefore), 'after R:', JSON.stringify(rotAfter));
}

// ── 10. Back to 2D, state survived round trip ────────────────────────────────
await page.click('a[title="Back to 2D tool"]');
await page.waitForSelector('.device-card');
const finalCables = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('kvm-vis-state')).cables.length);
log('STEP10 back on 2D, cables in storage:', finalCables,
  '| cards:', await page.locator('.device-card').count());
await page.screenshot({ path: OUT + '/09-2d-roundtrip.png' });

await browser.close();
log('DONE');
