/** CAD drawings: canvas floor plans (blueprint / paper) + DXF R12 export (port of reference js/cad.js). */
import { DEG, clamp, fmt } from '../core/geo';
import { CadTheme, PavilionSpec } from '../core/models';
import { PAL, STYLES, pavilionPlan } from '../pavilion/pavilion-plan';

interface Theme {
  bg1: string; bg2: string; grid: string; grid5: string; ink: string; soft: string; accent: string; wall: string;
  room: (c: string) => string; hatch: string; furn: string; title: string;
}

export const THEMES: Record<CadTheme, Theme> = {
  blueprint: { bg1: '#0d2b52', bg2: '#081a33', grid: 'rgba(160,210,255,0.07)', grid5: 'rgba(160,210,255,0.14)', ink: '#e6f3ff', soft: 'rgba(200,230,255,0.55)', accent: '#7fd3ff', wall: '#ffffff', room: () => 'rgba(127,211,255,0.06)', hatch: 'rgba(127,211,255,0.45)', furn: 'rgba(200,230,255,0.6)', title: 'rgba(8,26,51,0.92)' },
  paper: { bg1: '#fbfaf6', bg2: '#f1efe7', grid: 'rgba(0,0,0,0.035)', grid5: 'rgba(0,0,0,0.07)', ink: '#1d1d1d', soft: 'rgba(0,0,0,0.5)', accent: '#b03a2e', wall: '#111111', room: c => c + '30', hatch: 'rgba(0,0,0,0.35)', furn: 'rgba(0,0,0,0.45)', title: '#ffffff' }
};

export interface CadDrawOptions {
  theme?: CadTheme;
  zoom?: number;
  px?: number;
  py?: number;
  /** Without title block, north arrow and scale bar. */
  compact?: boolean;
}

type P2 = [number, number];

/**
 * Renders an architectural 2D floor plan for the specified pavilion level onto an HTML5 canvas.
 * Handles architectural drafting elements: coordinate transforms, drafting grid, structural axes
 * with grid bubbles, colored room zoning, furniture layouts, core shafts with stairs/lift,
 * exterior/interior walls, door swings, structural columns, dimension strings, entrance markers,
 * and optional title block, scale bar, and north arrow.
 *
 * @param cv The HTML5 canvas element to draw onto.
 * @param spec Specification of the pavilion being rendered.
 * @param level Zero-based floor index (0 = Ground floor).
 * @param options Styling and transformation options (theme, zoom, pan offsets, compact mode).
 */
export function drawPlan(cv: HTMLCanvasElement, spec: PavilionSpec, level: number, options: CadDrawOptions = {}): void {
  const opt = { theme: 'blueprint' as CadTheme, zoom: 1, px: 0, py: 0, compact: false, ...options };
  const P = pavilionPlan(spec), f = P.floors[Math.min(level, P.floors.length - 1)], th = THEMES[opt.theme];
  const g = cv.getContext('2d');
  if (!g) return;
  const cw = cv.width, ch = cv.height, k = cw / 900;
  g.save();
  const bg = g.createLinearGradient(0, 0, cw, ch);
  bg.addColorStop(0, th.bg1);
  bg.addColorStop(1, th.bg2);
  g.fillStyle = bg;
  g.fillRect(0, 0, cw, ch);

  const tbW = opt.compact ? 0 : 250 * k, margin = 9;
  const sc = Math.min((cw - tbW - 60 * k) / (f.W + 2 * margin), (ch - 50 * k) / (f.D + 2 * margin)) * opt.zoom;
  const ox = (cw - tbW) / 2 + opt.px, oy = ch / 2 + opt.py;
  const X = (x: number) => ox - x * sc, Y = (y: number) => oy + y * sc;
  const lw = (m: number) => Math.max(1, m * sc);

  // drafting grid
  const step = sc > 9 ? 1 : 5;
  for (let m = -60; m <= 60; m += step) {
    g.strokeStyle = m % 5 === 0 ? th.grid5 : th.grid;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(m), 0); g.lineTo(X(m), ch); g.moveTo(0, Y(m)); g.lineTo(cw, Y(m)); g.stroke();
  }
  // structural grid + bubbles
  g.setLineDash([10 * k, 5 * k, 2 * k, 5 * k]); g.strokeStyle = th.accent; g.globalAlpha = 0.55; g.lineWidth = 1;
  const ext = 5.5;
  f.xs.forEach(x => { g.beginPath(); g.moveTo(X(x), Y(-f.D / 2 - ext)); g.lineTo(X(x), Y(f.D / 2 + 1.5)); g.stroke(); });
  f.ys.forEach(y => { g.beginPath(); g.moveTo(X(f.W / 2 + ext), Y(y)); g.lineTo(X(-f.W / 2 - 1.5), Y(y)); g.stroke(); });
  g.setLineDash([]); g.globalAlpha = 1;
  const bubble = (x: number, y: number, t: string) => {
    const r = Math.max(9 * k, 0.9 * sc);
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = th.bg2; g.fill(); g.strokeStyle = th.accent; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = th.accent; g.font = `600 ${Math.round(r * 1.05)}px Segoe UI`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y + 1);
  };
  f.xs.forEach((x, i) => bubble(X(x), Y(-f.D / 2 - ext), String.fromCharCode(65 + i)));
  f.ys.forEach((y, i) => bubble(X(f.W / 2 + ext), Y(y), String(i + 1)));

  // rooms
  f.rooms.forEach(r => { g.fillStyle = th.room(r.color); g.fillRect(X(r.x1), Y(r.y0), (r.x1 - r.x0) * sc, (r.y1 - r.y0) * sc); });
  // furniture
  g.strokeStyle = th.furn; g.lineWidth = 1;
  f.furniture.forEach(it => {
    if (it.h < 0.05 && it.w > 3) { g.setLineDash([3, 3]); g.strokeRect(X(it.x + it.w / 2), Y(it.y - it.d / 2), it.w * sc, it.d * sc); g.setLineDash([]); return; }
    if (it.t === 'cyl') { g.beginPath(); g.arc(X(it.x), Y(it.y), it.w / 2 * sc, 0, 7); g.stroke(); }
    else g.strokeRect(X(it.x + it.w / 2), Y(it.y - it.d / 2), it.w * sc, it.d * sc);
  });
  // core: hatch + stair + lift
  if (f.core) {
    const c = f.core, x0 = X(c.x1), y0 = Y(c.y0), w = c.w * sc, h = c.d * sc;
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    g.strokeStyle = th.hatch; g.lineWidth = 1;
    for (let t = -h; t < w + h; t += Math.max(4, 0.45 * sc)) { g.beginPath(); g.moveTo(x0 + t, y0); g.lineTo(x0 + t - h, y0 + h); g.stroke(); }
    g.restore();
    const sw = w * 0.58;
    g.fillStyle = th.bg2; g.fillRect(x0 + 2, y0 + 2, sw - 4, h - 4);
    g.strokeStyle = th.ink; g.lineWidth = 1;
    for (let t = y0 + 4; t < y0 + h - 3; t += Math.max(3, 0.28 * sc)) { g.beginPath(); g.moveTo(x0 + 3, t); g.lineTo(x0 + sw - 3, t); g.stroke(); }
    g.beginPath(); g.moveTo(x0 + sw / 2, y0 + h - 4); g.lineTo(x0 + sw / 2, y0 + 6); g.lineTo(x0 + sw / 2 - 4, y0 + 12); g.moveTo(x0 + sw / 2, y0 + 6); g.lineTo(x0 + sw / 2 + 4, y0 + 12); g.stroke();
    const lx = x0 + sw + 3, lwid = w - sw - 6, lh = Math.min(h - 6, lwid * 1.1);
    g.fillStyle = th.bg2; g.fillRect(lx, y0 + 3, lwid, lh); g.strokeRect(lx, y0 + 3, lwid, lh);
    g.beginPath(); g.moveTo(lx, y0 + 3); g.lineTo(lx + lwid, y0 + 3 + lh); g.moveTo(lx + lwid, y0 + 3); g.lineTo(lx, y0 + 3 + lh); g.stroke();
  }
  // walls
  g.lineCap = 'square'; g.strokeStyle = th.wall;
  f.walls.forEach(w => { g.lineWidth = lw(w.ext ? 0.35 : 0.15); g.beginPath(); g.moveTo(X(w.a[0]), Y(w.a[1])); g.lineTo(X(w.b[0]), Y(w.b[1])); g.stroke(); });
  if (f.level === 0) { // glazing line on façade
    g.strokeStyle = th.accent; g.lineWidth = 1; g.strokeRect(X(f.W / 2 + 0.35), Y(-f.D / 2 - 0.35), (f.W + 0.7) * sc, (f.D + 0.7) * sc);
  }
  // doors
  g.lineCap = 'butt'; g.strokeStyle = th.ink; g.lineWidth = 1;
  const leaf = (hx: number, y: number, w: number, dir: number) => { // hinge at hx; open leaf points to -y, closed position toward dir·x
    const c: P2 = [X(hx), Y(y)], p1: P2 = [X(hx), Y(y - w)], p2: P2 = [X(hx + dir * w), Y(y)];
    g.beginPath(); g.moveTo(...c); g.lineTo(...p1); g.stroke();
    const a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    g.setLineDash([4, 3]); g.beginPath(); g.arc(c[0], c[1], w * sc, a1, a1 + d, d < 0); g.stroke(); g.setLineDash([]);
  };
  f.doors.forEach(d => {
    if (d.main) { leaf(d.x - d.w / 2, d.y, d.w / 2, 1); leaf(d.x + d.w / 2, d.y, d.w / 2, -1); }
    else leaf(d.x - d.w / 2, d.y, d.w, 1);
  });
  // columns
  g.fillStyle = th.ink;
  const cs = Math.max(4, 0.55 * sc);
  f.columns.forEach(c => g.fillRect(X(c[0]) - cs / 2, Y(c[1]) - cs / 2, cs, cs));
  // room labels
  g.textAlign = 'center'; g.textBaseline = 'middle';
  f.rooms.forEach(r => {
    if (r.type === 'core') return;
    const fs = clamp(Math.min(r.w, r.d) * sc * 0.13, 9 * k, 17 * k);
    const cx = X((r.x0 + r.x1) / 2), cy = Y((r.y0 + r.y1) / 2);
    g.font = `600 ${fs}px Segoe UI`;
    const tw = g.measureText(r.label.toUpperCase()).width;
    if (tw > r.w * sc * 0.95) g.font = `600 ${fs * 0.75}px Segoe UI`;
    g.fillStyle = th.bg2; g.globalAlpha = 0.75; g.fillRect(cx - Math.min(tw, r.w * sc) / 2 - 4, cy - fs * 1.05, Math.min(tw, r.w * sc) + 8, fs * 2.3); g.globalAlpha = 1;
    g.fillStyle = th.ink; g.fillText(r.label.toUpperCase(), cx, cy - fs * 0.35);
    g.font = `${fs * 0.85}px Segoe UI`; g.fillStyle = th.accent; g.fillText(`${fmt(r.area, 1)} m²`, cx, cy + fs * 0.75);
  });
  // dimensions
  const dim = (x1: number, y1: number, x2: number, y2: number, txt: string, off: number, vert: boolean) => {
    g.strokeStyle = th.soft; g.fillStyle = th.ink; g.lineWidth = 1;
    const a: P2 = [X(x1), Y(y1)], b: P2 = [X(x2), Y(y2)];
    if (vert) { a[0] += off; b[0] += off; } else { a[1] += off; b[1] += off; }
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
    [a, b].forEach(p => { g.beginPath(); g.moveTo(p[0] - 4, p[1] + 4); g.lineTo(p[0] + 4, p[1] - 4); g.stroke(); });
    g.save(); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); if (vert) g.rotate(-Math.PI / 2);
    g.font = `${11 * k + 1}px Segoe UI`; g.fillStyle = th.bg2;
    const tw = g.measureText(txt).width;
    g.fillRect(-tw / 2 - 3, -8 * k - 2, tw + 6, 15 * k + 2);
    g.fillStyle = th.ink; g.fillText(txt, 0, 0); g.restore();
  };
  dim(f.W / 2, f.D / 2, -f.W / 2, f.D / 2, `${fmt(f.W, 2)} m`, 2.6 * sc, false);
  dim(-f.W / 2, -f.D / 2, -f.W / 2, f.D / 2, `${fmt(f.D, 2)} m`, 2.6 * sc, true);
  for (let i = 1; i < f.xs.length; i++) dim(f.xs[i - 1], f.D / 2, f.xs[i], f.D / 2, `${fmt(f.xs[i] - f.xs[i - 1], 2)}`, 1.3 * sc, false);
  // entrance arrow
  if (f.level === 0) {
    const d = f.doors.find(x => x.main);
    if (d) { g.fillStyle = th.accent; g.font = `700 ${12 * k + 1}px Segoe UI`; g.fillText('▲ MAIN ENTRANCE', X(d.x), Y(f.D / 2 + 4.2)); }
  }

  if (!opt.compact) {
    // north arrow: plan axes in world
    const r = spec.rot * DEG, s = spec.side, dr = f.dr * DEG;
    const u = [Math.cos(r), Math.sin(r)], n = [-Math.sin(r) * s, Math.cos(r) * s];
    const ex = [u[0] * Math.cos(dr) + n[0] * Math.sin(dr), u[1] * Math.cos(dr) + n[1] * Math.sin(dr)];
    const ey = [-u[0] * Math.sin(dr) + n[0] * Math.cos(dr), -u[1] * Math.sin(dr) + n[1] * Math.cos(dr)];
    const nx = -ex[1], ny = ey[1]; // north (0,1) projected, then canvas mapping (-x, +y)
    const ang = Math.atan2(ny, nx), ax = 46 * k, ay = 54 * k, L = 26 * k;
    g.save(); g.translate(ax, ay); g.rotate(ang + Math.PI / 2);
    g.fillStyle = th.ink; g.beginPath(); g.moveTo(0, -L); g.lineTo(L * 0.35, L * 0.6); g.lineTo(0, L * 0.3); g.closePath(); g.fill();
    g.strokeStyle = th.ink; g.beginPath(); g.moveTo(0, -L); g.lineTo(-L * 0.35, L * 0.6); g.lineTo(0, L * 0.3); g.stroke();
    g.restore();
    g.fillStyle = th.ink; g.font = `700 ${13 * k}px Segoe UI`; g.fillText('N', ax + Math.cos(ang) * (L + 12 * k), ay + Math.sin(ang) * (L + 12 * k));
    // scale bar
    const sbx = 24 * k, sby = ch - 28 * k;
    g.font = `${10 * k + 1}px Segoe UI`; g.textAlign = 'center';
    [0, 5, 10, 20].forEach((m, i, arr) => {
      if (i < arr.length - 1) {
        g.fillStyle = i % 2 ? th.bg2 : th.ink; g.fillRect(sbx + m * sc, sby, (arr[i + 1] - m) * sc, 6 * k);
        g.strokeStyle = th.ink; g.strokeRect(sbx + m * sc, sby, (arr[i + 1] - m) * sc, 6 * k);
      }
      g.fillStyle = th.ink; g.fillText(m + (i === arr.length - 1 ? ' m' : ''), sbx + m * sc, sby - 8 * k);
    });
    // title block
    const tx = cw - tbW - 12 * k, ty = ch - 230 * k, tw = tbW, tH = 218 * k;
    g.fillStyle = th.title; g.fillRect(tx, ty, tw, tH); g.strokeStyle = th.ink; g.lineWidth = 1.5; g.strokeRect(tx, ty, tw, tH);
    const rowsT: [string, string][] = [
      ['PROJECT', 'Expo 2030 Riyadh'], ['PAVILION', spec.kind === 'plot' ? `${spec.label} · ${spec.name}` : spec.name], ['DRAWING', `${f.name} plan`],
      ['DESIGN', `${STYLES[spec.style] || 'Standard'} · ${PAL[spec.palette % 5].name}`], ['AREA', `${fmt(f.area)} m²  ·  GFA ${fmt(P.gfa)} m²`],
      ['SCALE', '1:200 @ A1   ·   DWG A-1' + String(f.level).padStart(2, '0')], ['STATUS', 'Concept – illustrative']
    ];
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `800 ${15 * k}px Segoe UI`; g.fillStyle = th.accent; g.fillText('EXPO 2030 RIYADH', tx + 12 * k, ty + 26 * k);
    rowsT.forEach(([a, b], i) => {
      const yy = ty + 50 * k + i * 24 * k;
      g.strokeStyle = th.soft; g.lineWidth = 0.6; g.beginPath(); g.moveTo(tx, yy - 16 * k); g.lineTo(tx + tw, yy - 16 * k); g.stroke();
      g.fillStyle = th.soft; g.font = `${9 * k}px Segoe UI`; g.fillText(a, tx + 12 * k, yy);
      g.fillStyle = th.ink; g.font = `600 ${11 * k}px Segoe UI`;
      let t = b;
      while (g.measureText(t).width > tw - 85 * k && t.length > 4) t = t.slice(0, -2);
      g.fillText(t === b ? t : t + '…', tx + 75 * k, yy);
    });
  }
  g.restore();
}

/**
 * Generates an AutoCAD DXF R12 (AC1009) compatible vector CAD drawing containing all floor plans
 * of the given pavilion arranged side-by-side in real-world metric coordinates.
 * Includes distinct standard CAD layers for walls, columns, doors, furniture, grids, and annotations.
 *
 * @param spec Specification of the pavilion to generate DXF geometry for.
 * @returns ASCII formatted DXF document string ready for download or file export.
 */
export function planDxf(spec: PavilionSpec): string {
  const P = pavilionPlan(spec), o: string[] = [];
  const L: Record<string, number> = { 'A-WALL': 7, 'A-WALL-EXT': 1, 'A-DOOR': 3, 'A-COLS': 5, 'A-FURN': 8, 'A-ANNO': 2, 'A-GRID': 9, 'A-CORE': 4 };
  const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
  const line = (l: string, a: P2, b: P2) => o.push('0', 'LINE', '8', l, '10', n(a[0]), '20', n(a[1]), '30', '0.0', '11', n(b[0]), '21', n(b[1]), '31', '0.0');
  const circle = (l: string, c: P2, r: number) => o.push('0', 'CIRCLE', '8', l, '10', n(c[0]), '20', n(c[1]), '30', '0.0', '40', n(r));
  const arc = (l: string, c: P2, r: number, a1: number, a2: number) => o.push('0', 'ARC', '8', l, '10', n(c[0]), '20', n(c[1]), '30', '0.0', '40', n(r), '50', n(a1), '51', n(a2));
  const text = (l: string, p: P2, h: number, t: string) => o.push('0', 'TEXT', '8', l, '10', n(p[0]), '20', n(p[1]), '30', '0.0', '40', n(h), '1', t.replace(/[^\x20-\x7e]/g, ''), '72', '1', '11', n(p[0]), '21', n(p[1]), '31', '0.0');
  const rect = (l: string, a: P2, b: P2) => {
    const [x0, y0] = a, [x1, y1] = b;
    line(l, [x0, y0], [x1, y0]); line(l, [x1, y0], [x1, y1]); line(l, [x1, y1], [x0, y1]); line(l, [x0, y1], [x0, y0]);
  };
  let ox = 0;
  P.floors.forEach(f => {
    const T = (p: readonly number[]): P2 => [p[0] + ox + f.W / 2, p[1]];
    f.walls.forEach(w => line(w.ext ? 'A-WALL-EXT' : 'A-WALL', T(w.a), T(w.b)));
    const t = 0.35;
    rect('A-WALL-EXT', T([-f.W / 2 - t, -f.D / 2 - t]), T([f.W / 2 + t, f.D / 2 + t]));
    f.doors.forEach(d => {
      const leaves: [number, number, number, number][] = d.main ? [[d.x - d.w / 2, d.w / 2, 270, 360], [d.x + d.w / 2, d.w / 2, 180, 270]] : [[d.x - d.w / 2, d.w, 270, 360]];
      leaves.forEach(([hx, w, a1, a2]) => { line('A-DOOR', T([hx, d.y]), T([hx, d.y - w])); arc('A-DOOR', T([hx, d.y]), w, a1, a2); });
    });
    f.columns.forEach(c => rect('A-COLS', T([c[0] - 0.275, c[1] - 0.275]), T([c[0] + 0.275, c[1] + 0.275])));
    f.furniture.forEach(it => it.t === 'cyl' ? circle('A-FURN', T([it.x, it.y]), it.w / 2) : rect('A-FURN', T([it.x - it.w / 2, it.y - it.d / 2]), T([it.x + it.w / 2, it.y + it.d / 2])));
    if (f.core) {
      const c = f.core;
      for (let s = 0.4; s < c.w + c.d; s += 0.4) {
        const a = [c.x0 + Math.max(0, s - c.d), c.y0 + Math.min(s, c.d)], b = [c.x0 + Math.min(s, c.w), c.y0 + Math.max(0, s - c.w)];
        line('A-CORE', T(a), T(b));
      }
    }
    f.xs.forEach((x, i) => { line('A-GRID', T([x, -f.D / 2 - 4]), T([x, f.D / 2 + 1])); circle('A-GRID', T([x, -f.D / 2 - 5]), 0.9); text('A-GRID', T([x, -f.D / 2 - 5.3]), 0.7, String.fromCharCode(65 + i)); });
    f.ys.forEach((y, i) => { line('A-GRID', T([-f.W / 2 - 4, y]), T([f.W / 2 + 1, y])); circle('A-GRID', T([-f.W / 2 - 5, y]), 0.9); text('A-GRID', T([-f.W / 2 - 5, y - 0.3]), 0.7, String(i + 1)); });
    f.rooms.forEach(r => {
      text('A-ANNO', T([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 + 0.4]), 0.6, r.label.toUpperCase());
      text('A-ANNO', T([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 - 0.6]), 0.45, `${r.area.toFixed(1)} m2`);
    });
    text('A-ANNO', T([0, -f.D / 2 - 8]), 1.2, `${f.name.toUpperCase()} PLAN - ${f.area.toFixed(0)} m2`);
    ox += f.W + 16;
  });
  text('A-ANNO', [ox / 2, P.floors[0].D / 2 + 8], 1.8, `EXPO 2030 RIYADH - ${spec.kind === 'plot' ? spec.label + ' ' : ''}${spec.name} - CONCEPT (ILLUSTRATIVE)`);
  const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB',
    '0', 'TABLE', '2', 'LAYER', '70', String(Object.keys(L).length)];
  Object.entries(L).forEach(([k, c]) => head.push('0', 'LAYER', '2', k, '70', '0', '62', String(c), '6', 'CONTINUOUS'));
  head.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  return head.concat(o, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n');
}
