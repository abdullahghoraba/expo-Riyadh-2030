import { Injectable, inject } from '@angular/core';
import Graphic from '@arcgis/core/Graphic';
import Mesh from '@arcgis/core/geometry/Mesh';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import Polyline from '@arcgis/core/geometry/Polyline';
import MeshMaterial from '@arcgis/core/geometry/support/MeshMaterial';
import LineSymbol3D from '@arcgis/core/symbols/LineSymbol3D';
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D';
import PolygonSymbol3D from '@arcgis/core/symbols/PolygonSymbol3D';
import { Color, heading, mix, rgb } from '../core/geo';
import { LonLat, PavilionDetail, PavilionMeta, PavilionSpec, RenderMode } from '../core/models';
import { LayersService } from '../map/layers.service';
import { pavilionFrame } from './pavilion-frame';
import { PavilionPlan, PlanPoint, grid, paletteOf, pavilionPlan } from './pavilion-plan';

const SR = { wkid: 4326 };

export interface PavilionBuildOptions {
  mode?: RenderMode;
  /** Show floors 0…isolate only, with an open (low-alpha) façade on the top one; −1 = all floors. */
  isolate?: number;
  explode?: boolean;
  labels?: boolean;
  furniture?: boolean;
  /** 'full' = BIM detail (rooms, partitions, columns, furniture); 'lite' = shells only. */
  detail?: 'full' | 'lite';
  /** Night glazing + façade glow; defaults to the layers' night state (realistic mode only). */
  night?: boolean;
}

/** Result of {@link Pavilion3dService.build}. */
export type PavilionBuild = PavilionDetail<PavilionPlan, Graphic>;

/** Attributes carried by every pavilion graphic (used by map clicks and analysis tools). */
export interface PavilionGraphicAttrs {
  kind: 'pav';
  /** Spec id: plot id or building id. */
  sid: string;
  kindOf: PavilionSpec['kind'];
  floor?: number | 'roof';
  label?: string;
  area?: number;
  room?: 1;
}

type Role = 'slab' | 'glass' | 'wall' | 'floor' | 'furn' | 'core' | 'fin' | 'text';
type EdgesProps = (__esri.SolidEdges3DProperties & { type: 'solid' }) | (__esri.SketchEdges3DProperties & { type: 'sketch' });
type Primitive = 'cube' | 'cylinder' | 'sphere';
type Anchor = 'bottom' | 'center';

const BLUEPRINT: Record<Role, Color> = {
  slab: [110, 190, 255, 0.35], glass: [90, 170, 255, 0.1], wall: [190, 230, 255, 0.55], floor: [60, 130, 220, 0.35],
  furn: [170, 220, 255, 0.65], core: [120, 180, 240, 0.5], fin: [150, 210, 255, 0.75], text: [225, 245, 255, 1]
};
const ROLE = { slab: [205, 202, 195], wall: [244, 241, 234], core: [141, 153, 174] };

/** 3D graphics builder for parametric pavilions (port of reference pavilion.js `build`). */
@Injectable({ providedIn: 'root' })
export class Pavilion3dService {
  private readonly layers = inject(LayersService);

  /**
   * Constructs an array of ArcGIS 3D Graphics representing the pavilion model according to its specification.
   * Renders floor slabs, core circulation towers, interior partitions, structural columns, furniture,
   * glass façades, style embellishments (e.g. desert terraces, twisting envelopes, domes, lattice exoskeletons),
   * roof solar PV arrays, entrance canopies, flags, and night lighting glows.
   *
   * @param s Pavilion specification defining dimensions, style, palette, and centroid.
   * @param opts Rendering options controlling mode, floor isolation, exploded diagram view, labels, and furniture.
   * @returns PavilionBuild object containing graphics array, underlying floor plan, and spatial navigation metadata.
   */
  build(s: PavilionSpec, opts: PavilionBuildOptions = {}): PavilionBuild {
    const o = { mode: 'realistic' as RenderMode, isolate: -1, explode: false, labels: true, furniture: true, detail: 'full' as const, ...opts };
    const P = pavilionPlan(s), pal = paletteOf(s.palette), mode = o.mode, out: Graphic[] = [], symC = new Map<string, unknown>();
    const frame = pavilionFrame(s);
    const tf = frame.floor, hdgOf = frame.objectHeading;
    const last = P.floors.length - 1, full = o.detail === 'full';
    const top = o.isolate >= 0 ? Math.min(o.isolate, last) : last;
    const exH = o.explode ? Math.max(6, s.H * 1.4) : 0;
    const zOf = (i: number) => s.base + i * s.H + i * exH;
    const night = o.night ?? (mode === 'realistic' && this.layers.night());

    const col = (c: string | readonly number[], a: number | undefined, rl: Role): Color => {
      if (mode === 'blueprint') return BLUEPRINT[rl] || [150, 200, 255, a === undefined ? 1 : a];
      let base: number[] = typeof c === 'string' ? rgb(c) : c.slice(0, 3);
      if (mode === 'sketch' && rl !== 'text') base = mix(base, [255, 255, 255], rl === 'floor' ? 0.5 : rl === 'glass' ? 0.4 : 0.7);
      return [...base, a === undefined ? 1 : a];
    };
    const edges = (strong: boolean): EdgesProps => mode === 'blueprint' ? { type: 'solid', color: [190, 235, 255, 0.95], size: 1 }
      : mode === 'sketch' ? { type: 'sketch', color: [25, 25, 25, 0.9], size: 1.2, extensionLength: 1.5 }
      : strong ? { type: 'solid', color: rgb(pal.fin === '#f2f0ea' ? '#9aa4a8' : pal.fin, 1), size: 1.3 }
      : { type: 'solid', color: [30, 30, 30, 0.35], size: 0.6 };
    const cache = <T>(k: string, f: () => T): T => {
      if (!symC.has(k)) symC.set(k, f());
      return symC.get(k) as T;
    };
    const extrude = (color: Color, size: number, edge: EdgesProps | null, shadows = true) =>
      cache('e' + color + size + JSON.stringify(edge) + shadows, () => new PolygonSymbol3D({
        symbolLayers: [{ type: 'extrude', size, material: { color }, edges: edge || undefined, castShadows: shadows }]
      }));
    const obj = (prim: Primitive, w: number, d: number, h: number, color: Color, hdg: number, anchor: Anchor = 'bottom') =>
      cache(['o', prim, w, d, h, color, Math.round(hdg)].join(), () => new PointSymbol3D({
        symbolLayers: [{ type: 'object', resource: { primitive: prim }, width: w, depth: d, height: h, heading: hdg, anchor, material: { color } }]
      }));
    const path = (w: number, h: number, color: Color) => cache(['p', w, h, color].join(), () => new LineSymbol3D({
      symbolLayers: [{ type: 'path', profile: 'quad', width: w, height: h, anchor: 'bottom', profileRotation: 'heading', cap: 'butt', join: 'miter', material: { color } }]
    }));
    const text = (t: string, size: number, color: Color, halo?: Color) => new PointSymbol3D({
      symbolLayers: [{ type: 'text', text: t, size, material: { color }, halo: { color: halo || [0, 0, 0, 0.55], size: 1.2 }, font: { weight: 'bold' } }]
    });

    const ring = (pts: LonLat[], z: number): number[][] => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p[0] * q[1] - q[0] * p[1];
      }
      const rr = (a > 0 ? pts.slice().reverse() : pts.slice()).map(p => [p[0], p[1], z]);
      rr.push(rr[0]);
      return rr;
    };
    const poly = (pts: LonLat[], z: number) => new Polygon({ rings: [ring(pts, z)], spatialReference: SR, hasZ: true });
    const pt = (p: LonLat, z: number) => new Point({ x: p[0], y: p[1], z, spatialReference: SR });
    const line = (pts: LonLat[], z: number | number[]) =>
      new Polyline({ paths: [pts.map((p, i) => [p[0], p[1], Array.isArray(z) ? z[i] : z])], spatialReference: SR, hasZ: true });
    const add = (geometry: __esri.GraphicProperties['geometry'], symbol: __esri.GraphicProperties['symbol'], attrs: Partial<PavilionGraphicAttrs>) => {
      const attributes: PavilionGraphicAttrs = { kind: 'pav', sid: s.id, kindOf: s.kind, ...attrs };
      out.push(new Graphic({ geometry, symbol, attributes }));
    };
    const rect = (T: (x: number, y: number) => LonLat, x0: number, y0: number, x1: number, y1: number): LonLat[] => [T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)];

    for (let i = 0; i <= top; i++) {
      const f = P.floors[i], T = tf(f), z = zOf(i), hdg = hdgOf(f), W2 = f.W / 2, D2 = f.D / 2;
      const focus = full && (o.explode || i === (o.isolate >= 0 ? top : 0));
      const wallH = s.H - 0.9;
      add(poly(rect(T, -W2, -D2, W2, D2), z), extrude(col(ROLE.slab, 1, 'slab'), 0.3, edges(false)), { floor: i, label: f.name, area: f.area });
      if (full) {
        f.rooms.forEach(rm => {
          if (rm.type === 'core') add(poly(rect(T, rm.x0 + 0.1, rm.y0 + 0.1, rm.x1 - 0.1, rm.y1 - 0.1), z + 0.3), extrude(col(ROLE.core, 1, 'core'), s.H - 0.3, edges(false)), { floor: i, label: rm.label, area: rm.area, room: 1 });
          else add(poly(rect(T, rm.x0 + 0.08, rm.y0 + 0.08, rm.x1 - 0.08, rm.y1 - 0.08), z + 0.3), extrude(col(rm.color, 1, 'floor'), 0.04, null, false), { floor: i, label: rm.label, area: rm.area, room: 1 });
        });
        f.walls.filter(w => !w.ext).forEach(w => add(line([T(...w.a), T(...w.b)], z + 0.32), path(0.16, wallH, col(ROLE.wall, mode === 'realistic' ? 1 : 0.8, 'wall')), { floor: i, label: 'Partition wall' }));
        f.columns.forEach(c => add(pt(T(...c), z + 0.3), obj('cylinder', 0.55, 0.55, s.H - 0.3, col([235, 235, 230], 1, 'wall'), hdg), { floor: i, label: 'Column' }));
        if (focus && o.furniture) f.furniture.forEach(it => add(pt(T(it.x, it.y), z + 0.34 + it.z), obj(it.t === 'cyl' ? 'cylinder' : 'cube', it.w, it.d, it.h, col(it.c, 1, 'furn'), hdg), { floor: i, label: it.room }));
        if (focus && o.labels && (o.explode || o.isolate >= 0)) f.rooms.forEach(rm => add(pt(T((rm.x0 + rm.x1) / 2, (rm.y0 + rm.y1) / 2), z + 2.6), text(`${rm.label}\n${Math.round(rm.area)} m²`, 9, col([255, 255, 255], 1, 'text')), { floor: i, label: rm.label, area: rm.area, room: 1 }));
      }
      // glazed envelope (open dollhouse for the isolated floor)
      const glassA = mode === 'blueprint' ? 0.1 : (o.isolate >= 0 && i === top) ? 0.12 : night ? 0.82 : 0.3;
      add(poly(rect(T, -W2, -D2, W2, D2), z + 0.3), extrude(night ? [255, 205, 120, glassA] : col(pal.glass, glassA, 'glass'), s.H - 0.3, edges(true), false), { floor: i, label: f.name + ' façade', area: f.area });
      if (night) {
        const glow = cache('glow', () => new PointSymbol3D({
          symbolLayers: [
            { type: 'icon', resource: { primitive: 'circle' }, size: 20, material: { color: [255, 200, 110, 0.16] } },
            { type: 'icon', resource: { primitive: 'square' }, size: 4, material: { color: [255, 236, 190, 0.9] } }
          ]
        }));
        const step = full ? 4 : 8, zz = z + s.H * 0.5;
        const sides: [PlanPoint, PlanPoint][] = [[[-W2, D2], [W2, D2]], [[W2, D2], [W2, -D2]], [[W2, -D2], [-W2, -D2]], [[-W2, -D2], [-W2, D2]]];
        sides.forEach(([a, b]) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.floor(L / step));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            add(pt(T(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), zz), glow, { floor: i, label: 'Façade lighting' });
          }
        });
      }
      if (s.style === 'ribbon') {
        const per = 2 * (f.W + f.D), nF = Math.min(90, Math.floor(per / 2.6));
        for (let k = 0; k < nF; k++) {
          let d = k / nF * per, x: number, y: number;
          if (d < f.W) { x = -W2 + d; y = D2 + 0.7; }
          else if ((d -= f.W) < f.D) { x = W2 + 0.7; y = D2 - d; }
          else if ((d -= f.D) < f.W) { x = W2 - d; y = -D2 - 0.7; }
          else { d -= f.W; x = -W2 - 0.7; y = -D2 + d; }
          const hh = s.H * (0.55 + 0.45 * Math.abs(Math.sin(k * 0.35 + i * 0.9)));
          add(pt(T(x, y), z + 0.3 + (s.H - 0.3 - hh) / 2), obj('cube', 0.35, 0.35, hh, col(pal.fin, 1, 'fin'), hdg + k * 7), { floor: i, label: 'Façade fin' });
        }
      }
    }

    // roof & style features
    const fT = P.floors[top], T = tf(fT), hdgT = hdgOf(fT), roofZ = zOf(top) + s.H, W2 = fT.W / 2, D2 = fT.D / 2;
    if (top === last) {
      add(poly(rect(T, -W2, -D2, W2, D2), roofZ), extrude(col(ROLE.slab, 1, 'slab'), 0.45, edges(false)), { floor: 'roof', label: 'Roof' });
      add(line([T(-W2, -D2), T(W2, -D2), T(W2, D2), T(-W2, D2), T(-W2, -D2)], roofZ + 0.45), path(0.25, 1.1, col(pal.fin, 1, 'fin')), { label: 'Parapet' });
      if (s.style === 'dome') {
        const R = Math.min(fT.W, fT.D) * 0.42, c = T(0, 0);
        const color = col(mode === 'realistic' ? pal.glass.map(v => Math.min(255, v + 30)) : pal.fin, mode === 'blueprint' ? 0.3 : 0.85, 'fin');
        const m = Mesh.createSphere(pt(c, roofZ - R * 0.25), { size: { width: 2 * R, depth: 2 * R, height: R * 1.5 }, densificationFactor: 2, material: new MeshMaterial({ color }) });
        add(m, { type: 'mesh-3d', symbolLayers: [{ type: 'fill', castShadows: true }] }, { label: 'Oasis dome' });
      } else if (full) {
        const pv = cache('pv', () => new PointSymbol3D({
          symbolLayers: [{ type: 'object', resource: { primitive: 'cube' }, width: 2.2, depth: 1.2, height: 0.06, heading: hdgT, tilt: 22, anchor: 'center', material: { color: col([30, 50, 90], 1, 'fin') } }]
        }));
        grid({ x0: -W2, x1: W2, y0: -D2, y1: 0, w: fT.W, d: D2 }, 3.2, 2.4, 1.6, 40, (x, y) => add(pt(T(x, y), roofZ + 0.9), pv, { label: 'Solar PV panels' }));
        ([[-W2 + 2, D2 - 2], [W2 - 2, D2 - 2]] as PlanPoint[]).forEach(p => {
          add(pt(T(...p), roofZ + 0.45), obj('cube', 1.4, 1.4, 0.7, col('#8d6e63', 1, 'furn'), hdgT), { label: 'Roof garden' });
          add(pt(T(...p), roofZ + 1.15), obj('sphere', 1.8, 1.8, 1.6, col('#4f772d', 1, 'furn'), hdgT), { label: 'Roof garden' });
        });
      }
      if (s.style === 'lattice') {
        const F0 = P.floors[0], T0 = tf(F0), h = roofZ - s.base, segs = Math.max(2, s.floors);
        const faces: [PlanPoint, PlanPoint][] = [
          [[-F0.W / 2, F0.D / 2 + 0.8], [F0.W / 2, F0.D / 2 + 0.8]], [[F0.W / 2 + 0.8, F0.D / 2], [F0.W / 2 + 0.8, -F0.D / 2]],
          [[F0.W / 2, -F0.D / 2 - 0.8], [-F0.W / 2, -F0.D / 2 - 0.8]], [[-F0.W / 2 - 0.8, -F0.D / 2], [-F0.W / 2 - 0.8, F0.D / 2]]
        ];
        const latS = cache('lat', () => new LineSymbol3D({ symbolLayers: [{ type: 'path', profile: 'quad', width: 0.45, height: 0.45, material: { color: col(pal.fin, 1, 'fin') } }] }));
        faces.forEach(([a, b]) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nb = Math.max(2, Math.round(L / 7));
          const at = (t: number): PlanPoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          for (let k = 0; k < nb; k++) {
            const zz: number[] = [], pts: LonLat[] = [];
            for (let j = 0; j <= segs; j++) {
              pts.push(T0(...at((k + (j % 2)) / nb)));
              zz.push(s.base + h * j / segs);
            }
            add(line(pts, zz), latS, { label: 'Lattice exoskeleton' });
          }
        });
      }
    }

    // plot frontage: canopy, flags, plaza
    if (s.kind === 'plot' && full) {
      const F0 = P.floors[0], T0 = tf(F0), h0 = hdgOf(F0), fy = F0.D / 2;
      add(pt(T0(0, fy + 3), s.base + 4.6), obj('cube', 12, 6, 0.35, col(pal.fin, 1, 'fin'), h0), { label: 'Entrance canopy' });
      [-5.5, 5.5].forEach(x => add(pt(T0(x, fy + 5.5), s.base), obj('cylinder', 0.3, 0.3, 4.6, col([60, 60, 60], 1, 'furn'), h0), { label: 'Canopy column' }));
      ([['#012169', -9], ['#C8102E', -10.6], ['#0b3d2e', 9], ['#c9a24b', 10.6]] as [string, number][]).forEach(([c, x]) => {
        add(pt(T0(x, fy + 7), s.base), obj('cylinder', 0.14, 0.14, 9, col([220, 220, 220], 1, 'furn'), h0), { label: 'Flag pole' });
        add(pt(T0(x + 0.9, fy + 7), s.base + 7.2), obj('cube', 1.8, 0.05, 1.2, col(c, 1, 'fin'), h0), { label: 'Flag' });
      });
      for (let x = -12; x <= 12; x += 6) add(pt(T0(x, fy + 11), s.base), obj('sphere', 1.4, 1.4, 1.2, col('#6a994e', 1, 'furn'), h0), { label: 'Planting' });
    }
    if (o.labels) {
      add(pt(T(0, 0), roofZ + (s.style === 'dome' ? Math.min(fT.W, fT.D) * 0.9 : 6)),
        text(s.kind === 'plot' ? `${s.label} · ${s.name}` : s.name, 11, col([255, 255, 255], 1, 'text'), [11, 61, 46, 0.85]), { label: s.name });
    }

    const F0 = P.floors[0], T0 = tf(F0);
    const meta: PavilionMeta = {
      center: [s.cx, s.cy], roofZ, height: P.height + s.base, frontHeading: heading(T0(0, 0), T0(0, 10)),
      door: T0(0, F0.D / 2 + 1), approach: T0(0, F0.D / 2 + (s.kind === 'plot' ? 16 : 12)), lobby: T0(0, F0.D / 2 - 3),
      hall: T0(0, 0), roofFront: T(0, D2 - 2.5), roofCenter: T(0, 0)
    };
    return { graphics: out, plan: P, meta };
  }
}
