export interface DeskDraft {
  main_w: number; main_d: number;
  ext_w: number; ext_d: number;
  ext_side: 'right' | 'left';
}

/** Top-down desk preview with dimension lines, drawn on the setup modal canvas. */
export function drawDeskPreview(cv: HTMLCanvasElement, draft: DeskDraft): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const CW = cv.width, CH = cv.height;
  ctx.clearRect(0, 0, CW, CH);

  const mw = Math.max(1, draft.main_w || 140);
  const md = Math.max(1, draft.main_d || 60);
  const ew = Math.max(0, draft.ext_w || 0);
  const ed = Math.max(0, draft.ext_d || 0);
  const side = draft.ext_side;

  const totalW = mw + ew, totalD = Math.max(md, ed);
  const PAD = 30; // room for dimension labels
  const scale = Math.min((CW - PAD * 2) / totalW, (CH - PAD * 2) / totalD);

  const ox = PAD + ((CW - PAD * 2) - totalW * scale) / 2;
  const oy = PAD + ((CH - PAD * 2) - totalD * scale) / 2;

  const mainX = side === 'right' ? 0 : ew;
  const extX = side === 'right' ? mw : 0;

  function drawRect(dx: number, dz: number, dw: number, dd: number, fill: string, stroke: string) {
    const rx = ox + dx * scale, ry = oy + dz * scale;
    const rw = dw * scale, rh = dd * scale;
    ctx!.fillStyle = fill;
    ctx!.fillRect(rx, ry, rw, rh);
    ctx!.strokeStyle = stroke;
    ctx!.lineWidth = 1.5;
    ctx!.strokeRect(rx, ry, rw, rh);
  }

  drawRect(mainX, 0, mw, md, 'rgba(99,102,241,0.18)', 'rgba(99,102,241,0.7)');
  if (ew > 0 && ed > 0) {
    drawRect(extX, 0, ew, ed, 'rgba(8,145,178,0.15)', 'rgba(8,145,178,0.6)');
  }

  ctx.font = 'bold 9px -apple-system,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(99,102,241,0.9)';
  ctx.fillText('MAIN', ox + (mainX + mw / 2) * scale, oy + md / 2 * scale);
  if (ew > 0 && ed > 0) {
    ctx.fillStyle = 'rgba(8,145,178,0.9)';
    ctx.fillText('EXT', ox + (extX + ew / 2) * scale, oy + ed / 2 * scale);
  }

  ctx.strokeStyle = '#4a5380'; ctx.fillStyle = '#4a5380'; ctx.lineWidth = 1;
  ctx.font = '9px -apple-system,sans-serif';

  function hDim(x1: number, x2: number, y: number, txt: string) {
    const A = 4;
    ctx!.beginPath();
    ctx!.moveTo(x1, y); ctx!.lineTo(x2, y);
    ctx!.moveTo(x1, y); ctx!.lineTo(x1 + A, y - A * 0.5); ctx!.moveTo(x1, y); ctx!.lineTo(x1 + A, y + A * 0.5);
    ctx!.moveTo(x2, y); ctx!.lineTo(x2 - A, y - A * 0.5); ctx!.moveTo(x2, y); ctx!.lineTo(x2 - A, y + A * 0.5);
    ctx!.stroke();
    ctx!.textAlign = 'center'; ctx!.textBaseline = 'bottom';
    ctx!.fillText(txt, (x1 + x2) / 2, y - 2);
  }

  function vDim(y1: number, y2: number, x: number, txt: string) {
    const A = 4;
    ctx!.beginPath();
    ctx!.moveTo(x, y1); ctx!.lineTo(x, y2);
    ctx!.moveTo(x, y1); ctx!.lineTo(x - A * 0.5, y1 + A); ctx!.moveTo(x, y1); ctx!.lineTo(x + A * 0.5, y1 + A);
    ctx!.moveTo(x, y2); ctx!.lineTo(x - A * 0.5, y2 - A); ctx!.moveTo(x, y2); ctx!.lineTo(x + A * 0.5, y2 - A);
    ctx!.stroke();
    ctx!.save();
    ctx!.translate(x, (y1 + y2) / 2);
    ctx!.rotate(-Math.PI / 2);
    ctx!.textAlign = 'center'; ctx!.textBaseline = 'bottom';
    ctx!.fillText(txt, 0, -3);
    ctx!.restore();
  }

  hDim(ox + mainX * scale, ox + (mainX + mw) * scale, oy + md * scale + 10, `${mw} cm`);
  vDim(oy, oy + md * scale, ox + mainX * scale - 10, `${md} cm`);

  if (ew > 0 && ed > 0) {
    const extBotY = oy + Math.max(md, ed) * scale + (ed > md ? 10 : 20);
    hDim(ox + extX * scale, ox + (extX + ew) * scale, extBotY, `${ew} cm`);
    const extSideX = side === 'right' ? ox + (extX + ew) * scale + 10 : ox + extX * scale - 22;
    vDim(oy, oy + ed * scale, extSideX, `${ed} cm`);
  }
}
