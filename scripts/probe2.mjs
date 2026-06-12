import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5199';
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => log('PAGEERROR:', e.message));

// Seed a legacy-format layout including one cable (fresh profile has none)
await page.addInitScript(() => {
  if (!localStorage.getItem('kvm-vis-state')) {
    localStorage.setItem('kvm-vis-state', JSON.stringify({
      nextId: 13,
      devices: [
        { id: 1, type: 'pc', name: 'PC 1', x: 80, y: 180, color: '#6366f1' },
        { id: 3, type: 'kvm', name: 'KVM Switch', x: 340, y: 270, color: '#f59e0b' },
      ],
      cables: [{ id: 12, fromId: 1, toId: 3, cableType: 'HDMI', label: 'Ch1', direction: 'to', waypoints: [] }],
    }));
  }
});

// ── A. Waypoint dblclick exactly on the cable stroke ─────────────────────────
await page.goto(BASE + '/');
await page.waitForSelector('svg#cables path.cable-line');
const pt = await page.evaluate(() => {
  const p = document.querySelector('svg#cables path.cable-hit');
  const mid = p.getPointAtLength(p.getTotalLength() / 2);
  const r = p.ownerSVGElement.getBoundingClientRect();
  // svg origin is world 0,0; zoom is 1, so client = svgRect + world
  return { x: r.left + mid.x, y: r.top + mid.y };
});
log('A: dblclick at on-stroke point', pt);
await page.mouse.dblclick(pt.x, pt.y);
await page.waitForTimeout(200);
const wp = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-vis-state')).cables[0].waypoints);
log('A: waypoints after dblclick:', JSON.stringify(wp));

// waypoint drag: selected cable shows handles (r=6 circles)
const handle = await page.locator('svg#cables circle[r="6"]').count();
log('A: waypoint handles visible (cable selected):', handle);

// dblclick the handle removes it
if (handle > 0) {
  const hb = await page.locator('svg#cables circle[r="6"]').first().boundingBox();
  await page.mouse.dblclick(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.waitForTimeout(200);
  const wp2 = await page.evaluate(() => JSON.parse(localStorage.getItem('kvm-vis-state')).cables[0].waypoints);
  log('A: waypoints after handle dblclick (expect 0):', JSON.stringify(wp2));
}

// ── B. Layout-mode selection + drag in 3D page ────────────────────────────────
await page.goto(BASE + '/3d');
await page.waitForSelector('#modal-overlay.open, #canvas3d canvas');
if (await page.locator('#modal-overlay.open').count()) {
  await page.click('#modal .btn.primary');
}
await page.waitForSelector('canvas');
await page.waitForTimeout(1000);

// find a device's screen position: use its Html label location
const lbl = page.locator('.device-label', { hasText: 'PC 1' });
const lb = await lbl.boundingBox();
log('B: PC 1 label at', lb && { x: Math.round(lb.x), y: Math.round(lb.y) });
// label sits at device center in layout (top-down); click right at it
await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
await page.waitForTimeout(300);
let propsName = await page.locator('#props-content input').first().inputValue().catch(() => null);
log('B: layout-mode click selects, props name:', JSON.stringify(propsName));

// drag the device 60px right
const devBefore = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('kvm-3d-state')).devices3d.find(d => d.id === 1));
await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2 + 25);
await page.mouse.down();
await page.mouse.move(lb.x + lb.width / 2 + 60, lb.y + lb.height / 2 + 25, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const devAfter = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('kvm-3d-state')).devices3d.find(d => d.id === 1));
log('B: drag x before/after:', devBefore.x, '→', devAfter.x);

// ── C. 3D-mode selection via label position ──────────────────────────────────
await page.click('button[title="Switch to 3D view"]');
await page.waitForTimeout(600);
const lb3 = await page.locator('.device-label', { hasText: 'PC 1' }).boundingBox();
// label floats above the box; click slightly below it to hit the box
await page.mouse.click(lb3.x + lb3.width / 2, lb3.y + lb3.height / 2 + 30);
await page.waitForTimeout(300);
propsName = await page.locator('#props-content input').first().inputValue().catch(() => null);
log('C: 3D-mode click below label, props name:', JSON.stringify(propsName));

// rotate via R
if (propsName) {
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  const rot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kvm-3d-state')).devices3d.find(d => d.id === 1).rotation);
  log('C: rotation after R (expect 90):', rot);
}

// ── D. Port face select + elevation change with routed cables ─────────────────
await page.click('button[title="Route cables"]');
await page.waitForTimeout(400);
const faceSelects = await page.locator('#props-content select').count();
log('D: port-face selects in props (device selected, routed):', faceSelects);
if (faceSelects > 0) {
  await page.selectOption('#props-content select >> nth=0', 'b');
  await page.waitForTimeout(300);
  const face = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kvm-3d-state')).cables3d[0]);
  log('D: cable3d after face change:', JSON.stringify(face));
}
await page.screenshot({ path: '/tmp/kvm-verify/10-3d-portface.png' });

await browser.close();
log('DONE');
