import { Injectable, Injector, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import Graphic from '@arcgis/core/Graphic';
import LineOfSightAnalysis from '@arcgis/core/analysis/LineOfSightAnalysis';
import SliceAnalysis from '@arcgis/core/analysis/SliceAnalysis';
import SlicePlane from '@arcgis/core/analysis/SlicePlane';
import Viewshed from '@arcgis/core/analysis/Viewshed';
import ViewshedAnalysis from '@arcgis/core/analysis/ViewshedAnalysis';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import Polyline from '@arcgis/core/geometry/Polyline';
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator';
import * as geodeticAreaOperator from '@arcgis/core/geometry/operators/geodeticAreaOperator';
import * as geodeticLengthOperator from '@arcgis/core/geometry/operators/geodeticLengthOperator';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import WebStyleSymbol from '@arcgis/core/symbols/WebStyleSymbol';
import { DataService } from '../core/data.service';
import { Color, XY, along, clamp, dist, fmt, hash, heading, ll, mix, move, offset, pathLength, rgb, xy } from '../core/geo';
import { LonLat, PavilionMeta, ServiceType } from '../core/models';
import { SERVICE } from '../core/service-catalog';
import { StateService } from '../core/state.service';
import { ToastService } from '../core/toast.service';
import { LayersService } from '../map/layers.service';
import { SceneService } from '../map/scene.service';
import { PlotSelectionService } from '../plots/plot-selection.service';
import { pavilionPlan } from '../pavilion/pavilion-plan';

const SR = { wkid: 4326 };

export type ToolId = 'iso' | 'heat' | 'prox' | 'evac' | 'view' | 'los' | 'shadow' | 'crowd' | 'build' | 'under' | 'profile' | 'measure' | 'slice' | 'zone';

export interface ToolDef { id: ToolId; icon: string; name: string; badge: string; desc: string }

/** The 14 GIS tools (reference analysis.js `AN.tools`). */
export const TOOLS: readonly ToolDef[] = [
  { id: 'iso', icon: '🚶', name: 'Walking time (isochrones)', badge: 'Network', desc: '2 / 5 / 10-minute walking areas from your plot along the real path network.' },
  { id: 'heat', icon: '🏅', name: 'Plot suitability score', badge: 'Suitability', desc: 'Score every plot by walking time to restrooms, prayer, first aid, food and the metro.' },
  { id: 'prox', icon: '◎', name: 'Proximity rings', badge: 'Buffer', desc: '100 / 250 / 500 m buffers and what falls inside each ring.' },
  { id: 'evac', icon: '🚑', name: 'Emergency & evacuation routes', badge: 'Routing', desc: 'Fastest route to first aid and to the nearest exit gate, with moving responders.' },
  { id: 'view', icon: '👁', name: 'Rooftop viewshed', badge: '3D', desc: 'What visitors can see from your pavilion roof – green visible, red hidden.' },
  { id: 'los', icon: '↗', name: 'Line of sight to landmarks', badge: '3D', desc: 'Can you see the Globe, the Saudi pavilion, the metro and the gates from your plot?' },
  { id: 'shadow', icon: '🌗', name: 'Sun & shadow study', badge: 'Climate', desc: 'Hours of shadow on the ground for any day – plan shaded queues and terraces.' },
  { id: 'crowd', icon: '👥', name: 'Visitor density forecast', badge: 'Time', desc: 'Hour-by-hour crowd heat in 3D hexagons, with a play button.' },
  { id: 'build', icon: '🏗', name: 'Construction timeline 2026–2030', badge: 'Time', desc: 'Watch the Expo being built quarter by quarter, with tower cranes.' },
  { id: 'under', icon: '⛏', name: 'Underground utilities', badge: 'Subsurface', desc: 'Water, power, fibre and district cooling networks below the streets.' },
  { id: 'profile', icon: '📈', name: 'Skyline profile', badge: 'Profile', desc: 'Ground and building-height profile along the walk from the metro to your plot.' },
  { id: 'measure', icon: '📏', name: 'Measure distance & area', badge: 'Measure', desc: '3D measuring tools – click points on the map.' },
  { id: 'slice', icon: '✂', name: 'Section cut through the pavilion', badge: 'BIM', desc: 'Cut the building open to see inside every floor.' },
  { id: 'zone', icon: '✏', name: 'Draw a zone – capacity check', badge: 'Sketch', desc: 'Draw any area: size, how many 40 × 40 plots fit (auto-layout) and what is inside.' }
];

export interface ToolButton { label: string; cls?: string; action: () => void }
export interface ToolRange { min: number; max: number; step: number; value: number; onInput: (v: number) => void }

export interface SliderConfig {
  title: string; min: number; max: number; step: number; value: number; speed?: number; ticks: string[];
  legend?: [color: string, label: string][]; format: (v: number) => string; onChange: (v: number) => void; autoplay?: boolean;
}

type Cleanup = () => void;
type ToolResult = Cleanup | void | Promise<Cleanup | void>;

/**
 * HTML-escapes a data value before injecting into the analysis tool panel DOM.
 *
 * @param v Raw value to sanitize.
 * @returns Escaped HTML string.
 */
export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Descriptive alias for {@link esc}. */
export const escapeHtml = esc;

/**
 * Formats a label-value pair as a styled flex row item.
 *
 * @param label Text label on the left.
 * @param value Formatted value or metric on the right.
 * @returns HTML string for the row.
 */
const row = (label: string, value: string): string => `<div class="row"><span>${label}</span><b>${value}</b></div>`;

/**
 * Renders a small inline color swatch indicator.
 *
 * @param c CSS color string (hex or rgb).
 * @returns HTML string for the swatch.
 */
const swatch = (c: string): string => `<i style="background:${c}"></i>`;

/**
 * Ray-casting algorithm to test if a 2D point lies inside a polygon contour.
 *
 * @param q [x, y] coordinate pair of the query point.
 * @param poly Array of [x, y] polygon vertices.
 * @returns True if point is contained within the polygon.
 */
const inPoly = (q: readonly number[], poly: readonly XY[]): boolean => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
};

/** Descriptive alias for {@link inPoly}. */
const isPointInPolygon = inPoly;

/**
 * GIS analysis tools running on the digital twin (port of reference js/analysis.js).
 * The floating tool panel and the time slider render the signals exposed here.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly layers = inject(LayersService);
  private readonly scene = inject(SceneService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly injector = inject(Injector);

  readonly tools = TOOLS;
  readonly active = signal<ToolId | null>(null);

  // ---- tool panel ----
  readonly title = signal('Tool');
  readonly body = signal<SafeHtml>('');
  /** Live-updated result block (stats under the intro text). */
  readonly live = signal<SafeHtml>('');
  readonly buttons = signal<ToolButton[]>([]);
  readonly range = signal<ToolRange | null>(null);
  readonly foot = signal<SafeHtml>('');
  /** Container for ArcGIS widgets (registered by the tool panel component). */
  widgetHost: HTMLElement | null = null;

  // ---- time slider ----
  readonly slider = signal<SliderConfig | null>(null);
  readonly sliderValue = signal(0);
  readonly sliderPlaying = signal(false);
  private sliderTimer: ReturnType<typeof setInterval> | undefined;

  private cleanup: Cleanup | null = null;
  private token = 0;

  private get plots(): PlotSelectionService {
    return this.injector.get(PlotSelectionService);
  }

  private get view() {
    const v = this.scene.view;
    if (!v) throw new Error('3D view not ready');
    return v;
  }

  // ---------------- lifecycle ----------------
  /**
   * Toggles an analysis tool: deactivates if currently active, otherwise activates it.
   *
   * @param id Identifier of the tool to toggle.
   */
  toggle(id: ToolId): void {
    if (this.active() === id) this.stop();
    else this.start(id);
  }

  /**
   * Stops the active analysis tool, invokes its cleanup handler, clears graphics,
   * hides time sliders/widgets, and restores standard plot route indicators.
   */
  stop(): void {
    const c = this.cleanup;
    this.cleanup = null;
    this.token++;
    if (c) {
      try { c(); } catch (e) { console.warn(e); }
    }
    const wasActive = this.active() !== null;
    this.active.set(null);
    this.stopSlider();
    this.range.set(null);
    this.buttons.set([]);
    if (this.widgetHost) this.widgetHost.innerHTML = '';
    if (!this.layers.ready) return;
    this.layers.analysis.removeAll();
    this.layers.analysis3d.removeAll();
    if (wasActive) this.plots.drawNearRoutes();
  }

  /**
   * Activates and executes the specified GIS analysis tool.
   *
   * @param id Identifier of the tool to run.
   */
  start(id: ToolId): void {
    this.stop();
    const t = TOOLS.find(x => x.id === id);
    if (!t || !this.scene.view || !this.layers.ready || !this.state.currentPlot()) return;
    this.active.set(id);
    this.title.set(t.icon + ' ' + t.name);
    this.setBody('');
    this.layers.routes.removeAll();
    const tok = ++this.token;
    let res: ToolResult;
    try {
      res = this.run[id]();
    } catch (e) {
      res = Promise.reject(e);
    }
    // sync tools register cleanup immediately; async ones that were superseded clean up after themselves
    if (typeof res === 'function') {
      this.cleanup = res;
      return;
    }
    Promise.resolve(res)
      .then(c => {
        if (tok === this.token) this.cleanup = c || null;
        else if (c) {
          try { c(); } catch (e) { console.warn(e); }
        }
      })
      .catch(e => {
        console.error(e);
        if (tok === this.token) this.setFoot(`<p class="muted">This tool is not available in this browser (${esc(e instanceof Error ? e.message : e)}).</p>`);
      });
  }

  // ---------------- panel helpers ----------------
  /**
   * Sanitizes trusted HTML for insertion into Angular templates.
   */
  private trust(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * Sets the main descriptive body HTML and optional footer text in the tool panel.
   *
   * @param html Main content HTML string.
   * @param foot Optional footer HTML string.
   */
  private setBody(html: string, foot = ''): void {
    this.body.set(this.trust(html));
    this.live.set('');
    this.foot.set(this.trust(foot));
  }

  /**
   * Updates the dynamic live calculation/stats block in the tool panel.
   *
   * @param html HTML string representing live metrics.
   */
  private setLive(html: string): void {
    this.live.set(this.trust(html));
  }

  /**
   * Updates the footer note HTML in the tool panel.
   *
   * @param html HTML string for footer notes.
   */
  private setFoot(html: string): void {
    this.foot.set(this.trust(html));
  }

  /**
   * Creates and returns a fresh container div element within the widget host for ArcGIS UI widgets.
   *
   * @param append Whether to append the container to the host element.
   */
  private widgetContainer(append = true): HTMLDivElement {
    const d = document.createElement('div');
    if (append && this.widgetHost) this.widgetHost.appendChild(d);
    return d;
  }

  // ---------------- slider (shared by time tools) ----------------
  /**
   * Configures and opens the floating time/parameter slider bar.
   *
   * @param o Slider configuration options.
   * @returns Cleanup callback to stop the slider.
   */
  private openSlider(o: SliderConfig): Cleanup {
    this.stopSlider();
    this.slider.set(o);
    this.setSliderValue(o.value);
    if (o.autoplay) this.togglePlay();
    return () => this.stopSlider();
  }

  /**
   * Sets the slider position to the given numeric value and triggers its change handler.
   *
   * @param v New slider value.
   */
  setSliderValue(v: number): void {
    const o = this.slider();
    if (!o) return;
    this.sliderValue.set(v);
    o.onChange(v);
  }

  /**
   * Toggles automatic playback of the time slider animation.
   */
  togglePlay(): void {
    const o = this.slider();
    if (!o) return;
    if (this.sliderTimer) {
      clearInterval(this.sliderTimer);
      this.sliderTimer = undefined;
      this.sliderPlaying.set(false);
      return;
    }
    this.sliderPlaying.set(true);
    this.sliderTimer = setInterval(() => {
      let v = +(this.sliderValue() + o.step).toFixed(4);
      if (v > o.max) v = o.min;
      this.setSliderValue(v);
    }, o.speed || 700);
  }

  /**
   * Stops any running slider interval timer and resets slider signals to null.
   */
  private stopSlider(): void {
    clearInterval(this.sliderTimer);
    this.sliderTimer = undefined;
    this.sliderPlaying.set(false);
    this.slider.set(null);
  }

  // ---------------- small helpers ----------------
  /** Returns the currently selected plot properties object. */
  private plot() {
    return this.state.currentPlot()!;
  }

  /** Returns [longitude, latitude] entrance point of the currently selected plot. */
  private ent(): LonLat {
    const p = this.plot();
    return [p.ex, p.ey];
  }

  /** Returns the metadata associated with the open pavilion. */
  private meta(): PavilionMeta {
    const d = this.state.detail();
    if (!d) throw new Error('No pavilion open');
    return d.meta;
  }

  /** Constructs an ArcGIS Point geometry in WGS84 spatial reference. */
  private pt(p: readonly number[], z = 0): Point {
    return new Point({ x: p[0], y: p[1], z, spatialReference: SR });
  }

  /** Triggers a camera flight to the specified 3D target. */
  private fly(target: __esri.GoToTarget3D, ms?: number): void {
    void this.scene.fly(target, ms);
  }

  /** Constructs a PolygonSymbol3D fill symbol with custom color and outline. */
  private fillSym(c: Color, o?: Color | string): __esri.PolygonSymbol3DProperties & { type: 'polygon-3d' } {
    return { type: 'polygon-3d', symbolLayers: [{ type: 'fill', material: { color: c }, outline: { color: o || c.slice(0, 3), size: 1.5 } }] };
  }

  /** Constructs a LineSymbol3D polyline symbol with custom color and width. */
  private lineSym(c: Color, w = 4): __esri.LineSymbol3DProperties & { type: 'line-3d' } {
    return { type: 'line-3d', symbolLayers: [{ type: 'line', size: w, material: { color: c }, cap: 'round', join: 'round' }] };
  }

  /** Calculates a geodesic buffer polygon around a Point or Polyline geometry. */
  private buffer(geom: Point | Polyline, metres: number): Polygon {
    const g = geodesicBufferOperator.execute(geom, metres, { unit: 'meters' });
    if (!g) throw new Error('Buffer failed');
    return g;
  }

  /**
   * Animates a 3D marker looping along a given coordinate path.
   *
   * @param coords Path vertices as [lon, lat].
   * @param color RGB color array.
   * @param ms Loop duration in milliseconds.
   * @param label Attribution label for the marker graphic.
   * @returns Cleanup callback to cancel the animation loop.
   */
  private walker(coords: LonLat[], color: number[], ms: number, label: string): Cleanup {
    const sym = {
      type: 'point-3d' as const, symbolLayers: [
        { type: 'object' as const, resource: { primitive: 'cylinder' as const }, width: 1.6, depth: 1.6, height: 3.2, anchor: 'bottom' as const, material: { color } },
        { type: 'icon' as const, resource: { primitive: 'circle' as const }, size: 14, material: { color }, outline: { color: 'white', size: 2 } }
      ]
    };
    const g = new Graphic({ geometry: this.pt(coords[0]), symbol: sym, attributes: { kind: 'walker', name: label } });
    this.layers.analysis3d.add(g);
    const len = pathLength(coords), t0 = performance.now();
    let raf = 0;
    const tick = (): void => {
      const t = ((performance.now() - t0) % ms) / ms;
      g.geometry = this.pt(along(coords, t * len).p, 0);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }

  /**
   * Toggles underground utility layers and scene ground transparency for subsurface inspection.
   *
   * @param on True to enable underground mode, false to restore normal ground.
   */
  private underground(on: boolean): void {
    const L = this.layers, ground = this.scene.map?.ground;
    L.utilities.visible = on;
    if (ground) {
      ground.opacity = on ? 0.35 : 1;
      ground.navigationConstraint = { type: on ? 'none' : 'stay-above' };
    }
    L.seeThrough(on, 0.35);
  }

  // ---------------- the tools ----------------
  private readonly run: Record<ToolId, () => ToolResult> = {
    /**
     * Walking time isochrones: calculates and displays 2, 5, and 10 minute pedestrian reachable
     * service areas from the plot entrance along the network graph.
     */
    iso: async () => {
      await Promise.all([geodesicBufferOperator.load(), geodeticAreaOperator.load()]);
      const router = this.data.router, spt = router.from(this.ent()), mpm = this.data.d.site.walkingSpeedMpm;
      const rings: [number, Color, string][] = [[10, [255, 140, 0, 0.22], '#ff8c00'], [5, [255, 205, 40, 0.3], '#f0be28'], [2, [46, 184, 114, 0.42], '#2eb872']];
      const rows: string[] = [];
      rings.forEach(([min, c, o]) => {
        const paths = router.reach(spt, min * mpm);
        if (!paths.length) return;
        const line = new Polyline({ paths, spatialReference: SR });
        const geo = this.buffer(line, 22);
        this.layers.analysis.add(new Graphic({ geometry: geo, symbol: this.fillSym(c, o), attributes: { kind: 'iso', name: `${min}-minute walk` } }));
        this.layers.routes.add(new Graphic({ geometry: line, symbol: this.lineSym(rgb(o, 0.95), 2.5) }));
        const svc = this.data.d.services.features.filter(f => spt.dist[router.nearest(f.geometry.coordinates).node] <= min * mpm);
        const area = geodeticAreaOperator.execute(geo, { unit: 'square-meters' });
        rows.push(`<div class="row"><span>${swatch(o)}<b>${min} min</b> (${min * mpm} m)</span><span>${fmt(area / 10000, 1)} ha · ${svc.length} services</span></div>`);
      });
      this.setBody(`<p>Walking speed ${mpm} m/min along streets & promenades – not straight lines.</p><div class="legend">${rows.join('')}</div>`,
        `<p class="muted small">Network analysis on the street graph (${router.nodes.length} nodes). With ArcGIS this runs on the Network Analyst service.</p>`);
      this.fly({ target: this.pt(this.ent()), zoom: 16, tilt: 45, heading: 0 } as __esri.GoToTarget3D);
    },

    /**
     * Plot suitability score: performs multi-criteria evaluation of all plots based on weighted
     * walking times to essential amenities (restrooms, prayer halls, first aid, food, metro).
     */
    heat: () => {
      const D = this.data.d, router = this.data.router, mpm = D.site.walkingSpeedMpm, L = this.layers;
      const types: Partial<Record<ServiceType, number>> = { restroom: 3, prayer: 2, aid: 2, food: 1.5, metro: 1 };
      const svcNodes: Partial<Record<ServiceType, number[]>> = {};
      (Object.keys(types) as ServiceType[]).forEach(t => (svcNodes[t] = D.services.features.filter(f => f.properties.type === t).map(f => router.nearest(f.geometry.coordinates).node)));
      const res = D.plots.features.map(f => {
        const p = f.properties, spt = router.from([p.ex, p.ey]), mins: Partial<Record<ServiceType, number>> = {};
        let pen = 0;
        (Object.entries(types) as [ServiceType, number][]).forEach(([t, w]) => {
          const m = Math.min(...svcNodes[t]!.map(n => spt.dist[n])) / mpm;
          mins[t] = m;
          pen += w * (t === 'metro' ? m * 0.35 : m);
        });
        return { p, mins, raw: pen, score: 0 };
      });
      const lo = Math.min(...res.map(r => r.raw)), hi = Math.max(...res.map(r => r.raw));
      res.forEach(r => (r.score = Math.round(100 - 45 * (r.raw - lo) / (hi - lo || 1))));
      res.sort((a, b) => b.score - a.score);
      L.labels.visible = false;
      res.forEach(r => {
        const g = L.plotGraphics?.[r.p.pid];
        const t = (r.score - 55) / 45, col = t > 0.5 ? mix([250, 210, 60], [30, 170, 90], (t - 0.5) * 2) : mix([220, 50, 60], [250, 210, 60], t * 2);
        if (g) g.symbol = { type: 'polygon-3d', symbolLayers: [{ type: 'extrude', size: 2 + r.score * 0.35, material: { color: col.concat(0.92) }, edges: { type: 'solid', color: [255, 255, 255], size: 1 } }] } as never;
        L.analysis3d.add(new Graphic({
          geometry: this.pt([r.p.cx, r.p.cy], 4 + r.score * 0.35),
          symbol: { type: 'point-3d', symbolLayers: [{ type: 'text', text: `${r.p.pid}\n${r.score}`, size: 11, material: { color: 'white' }, halo: { color: col.map(v => v * 0.5).concat(1), size: 1.5 }, font: { weight: 'bold' } }] },
          attributes: { kind: 'plot', pid: r.p.pid }
        }));
      });
      const mine = res.find(r => r.p.pid === this.plot().pid)!;
      this.setBody(`<p>Weighted walking time to essentials (restroom ×3, prayer ×2, first aid ×2, food ×1.5, metro ×1). 100 = best on site.</p>
        <div class="row"><span>Your plot <b>${esc(mine.p.pid)}</b></span><b>${mine.score} / 100 · rank ${res.indexOf(mine) + 1} of ${res.length}</b></div>
        ${(Object.entries(mine.mins) as [ServiceType, number][]).map(([t, m]) => `<div class="row"><span>${SERVICE[t].glyph} ${SERVICE[t].label}</span><span>${m.toFixed(1)} min</span></div>`).join('')}
        <h4>Top plots</h4>${res.slice(0, 6).map((r, i) => `<div class="row"><span>${i + 1}. ${esc(r.p.pid)} <span class="muted">${r.p.status === 'taken' ? '(taken)' : ''}</span></span><b>${r.score}</b></div>`).join('')}`);
      this.fly({ target: this.pt(D.site.globe), zoom: 15.6, tilt: 55, heading: 15 } as __esri.GoToTarget3D);
      return () => {
        L.labels.visible = true;
        L.refreshPlots();
      };
    },

    /**
     * Proximity concentric buffers: draws 100m, 250m, and 500m radius buffer rings around the
     * plot centroid and tallies all enclosed services, buildings, and landscape trees.
     */
    prox: () => {
      const D = this.data.d, p = this.plot(), c: LonLat = [p.cx, p.cy], rows: string[] = [];
      ([[500, [58, 110, 165, 0.12]], [250, [42, 157, 143, 0.16]], [100, [240, 190, 40, 0.25]]] as [number, Color][]).forEach(([r, col]) => {
        this.layers.analysis.add(new Graphic({ geometry: this.buffer(this.pt(c), r), symbol: this.fillSym(col, col.slice(0, 3)) }));
        const svc = D.services.features.filter(f => dist(f.geometry.coordinates, c) <= r).length;
        const bld = D.buildings.features.filter(f => dist([f.properties.cx, f.properties.cy], c) <= r).length;
        const trees = D.trees.features.filter(f => dist(f.geometry.coordinates, c) <= r).length;
        rows.unshift(`<div class="row"><b>${r} m</b><span>${svc} services · ${bld} buildings · ${trees} palms</span></div>`);
      });
      this.setBody(`<p>Straight-line buffers around <b>${esc(p.pid)}</b>.</p>${rows.join('')}`,
        '<p class="muted small">Compare with the walking-time tool: real walking distance is longer than the crow flies.</p>');
      this.fly({ target: this.pt(c), zoom: 15.8, tilt: 40, heading: 0 } as __esri.GoToTarget3D);
    },

    /**
     * Emergency and evacuation routing: calculates fastest walking paths to first aid and nearest
     * exit gate, animating responder markers along the path.
     */
    evac: () => {
      const D = this.data.d, router = this.data.router, spt = router.from(this.ent()), mpm = D.site.walkingSpeedMpm;
      const near = (type: ServiceType) => D.services.features.filter(f => f.properties.type === type)
        .map(f => ({ f, r: router.to(spt, f.geometry.coordinates) })).sort((a, b) => a.r.length - b.r.length)[0];
      const aid = near('aid'), gate = near('visitor'), stops: Cleanup[] = [];
      ([[aid, [214, 69, 69], 'First-aid responder'], [gate, [123, 94, 167], 'Evacuation to exit gate']] as const).forEach(([n, c, l]) => {
        this.layers.routes.add(new Graphic({ geometry: new Polyline({ paths: [n.r.coords], spatialReference: SR }), symbol: this.lineSym([...c, 1], 6) }));
        stops.push(this.walker(n.r.coords, [...c], Math.max(6000, n.r.length * 14), l));
      });
      this.setBody(`<div class="row"><span>🚑 <b>First aid</b> – ${esc(aid.f.properties.location)}</span></div>${row('Walk', `${Math.round(aid.r.length)} m · ${Math.ceil(aid.r.length / mpm)} min`)}${row('Paramedic on cart (15 km/h)', `${Math.ceil(aid.r.length / 250 * 60)} s`)}
        <div class="row"><span>🚪 <b>Nearest exit</b> – ${esc(gate.f.properties.location)}</span></div>${row('Evacuation walk', `${Math.round(gate.r.length)} m · ${Math.ceil(gate.r.length / mpm)} min`)}`,
        '<p class="muted small">Routes follow the walkway network; in production they come from ArcGIS routing with closures and crowd levels.</p>');
      this.fly({ target: this.pt(this.ent()), zoom: 16.2, tilt: 50, heading: 20 } as __esri.GoToTarget3D);
      return () => stops.forEach(s => s());
    },

    /**
     * Rooftop viewshed: calculates 3D visual coverage (visible green vs occluded red)
     * from an observer positioned on the pavilion roof looking towards the central Globe.
     */
    view: async () => {
      const m = this.meta(), s = this.state.detailSpec()!, globe = this.data.d.site.globe, hG = heading(m.center, globe);
      const eye = move(m.center, hG, Math.min(s.W, s.D) / 2 + 0.3);
      const vs = new Viewshed({ observer: this.pt(eye, m.roofZ + 2), farDistance: 450, heading: hG, tilt: 82, horizontalFieldOfView: 120, verticalFieldOfView: 70 });
      const an = new ViewshedAnalysis({ viewsheds: [vs] });
      const view = this.view;
      view.analyses.add(an);
      this.setBody(`<p>Observer on the roof of <b>${esc(s.label)}</b>, eye height 2 m, looking towards the Globe (450 m range, 120° field of view).</p>
        <div class="legend"><div class="row"><span>${swatch('#3ddc84')}Visible</span><span>${swatch('#ff4d4d')}Hidden</span></div></div>`);
      this.buttons.set([
        {
          label: 'Place a new observer', action: async () => {
            try {
              const av = await view.whenAnalysisView(an) as __esri.ViewshedAnalysisView3D;
              this.toast.show('Click on the map to place the observer, then the target');
              await av.place();
            } catch {
              this.toast.show('Interactive placement needs a newer ArcGIS version');
            }
          }
        },
        { label: '360° dome', cls: 'ghost', action: () => { vs.horizontalFieldOfView = 360; vs.verticalFieldOfView = 180; vs.farDistance = 300; } }
      ]);
      this.fly({ position: this.pt(move(eye, hG + 180, 160), m.roofZ + 120), heading: hG, tilt: 62 } as __esri.GoToTarget3D);
      return () => view.analyses.remove(an);
    },

    /**
     * Line of sight to landmarks: casts 3D sight lines from pavilion roof to major landmarks
     * (The Globe, Saudi Pavilion, Expo Metro Station, gates) testing for obstruction.
     */
    los: async () => {
      const m = this.meta(), D = this.data.d, view = this.view;
      const saudi = D.buildings.features.find(f => f.properties.type === 'saudi')!.properties, metro = D.buildings.features.find(f => f.properties.type === 'metro')!.properties;
      const tg: [string, LonLat, number][] = [
        ['The Globe', D.site.globe, 22], ['Saudi Arabia Pavilion', [saudi.cx, saudi.cy], saudi.height + 3], ['Expo Metro Station', [metro.cx, metro.cy], 18],
        ...D.services.features.filter(f => f.properties.type === 'visitor').map(f => [f.properties.name + ' – ' + f.properties.location.split(',')[0], f.geometry.coordinates, 8] as [string, LonLat, number])
      ];
      const an = new LineOfSightAnalysis({ observer: { position: this.pt(m.roofFront, m.roofZ + 1.7) }, targets: tg.map(t => ({ position: this.pt(t[1], t[2]) })) });
      view.analyses.add(an);
      const spec = this.state.detailSpec()!;
      this.setBody(`<p>From the roof terrace of <b>${esc(spec.label)}</b> (eye 1.7 m):</p>`,
        '<p class="muted small">Green = visible, red = blocked by a building. Recomputed live by the 3D engine.</p>');
      // geometric fallback (flat site): sample the sight line against building footprints + heights
      const polys = D.buildings.features.map(f => ({ p: f.geometry.coordinates[0].map(c => xy(c)), h: f.properties.height }));
      const geo = tg.map(t => {
        const a = xy(m.roofFront), b = xy(t[1]), z0 = m.roofZ + 1.7, z1 = t[2], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const own = polys.filter(o => inPoly(b, o.p));
        for (let d = 4; d < len - 4; d += 2) {
          const k = d / len, q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], z = z0 + (z1 - z0) * k;
          if (polys.some(o => !own.includes(o) && o.h > z && inPoly(q, o.p))) return false;
        }
        return true;
      });
      const render = (vis: (i: number) => boolean) =>
        this.setLive(tg.map((t, i) => `<div class="row"><span>${esc(t[0])}</span><b style="color:${vis(i) ? '#1a9e5a' : '#d64545'}">${vis(i) ? '✔ visible' : '✖ blocked'}</b></div>`).join(''));
      this.setLive(tg.map(t => `<div class="row"><span>${esc(t[0])}</span><span>…</span></div>`).join(''));
      let h: IHandle | null = null, timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const av = await view.whenAnalysisView(an) as __esri.LineOfSightAnalysisView3D;
        const results = () => (av.results.toArray ? av.results.toArray() : (av.results as unknown as __esri.LineOfSightAnalysisResult[]));
        const upd = () => {
          const res = results();
          render(i => (res[i] && res[i].visible != null ? !!res[i].visible : geo[i]));
        };
        h = reactiveUtils.watch(() => results().map(r => (r ? r.visible : null)).join(), upd, { initial: true });
        timer = setTimeout(upd, 1500);
      } catch (e) {
        console.warn(e);
        render(i => geo[i]);
      }
      const hG = heading(m.roofFront, D.site.globe);
      this.fly({ position: this.pt(move(m.roofFront, hG + 180, 110), m.roofZ + 85), heading: hG, tilt: 62 } as __esri.GoToTarget3D);
      return () => {
        clearTimeout(timer);
        h?.remove();
        view.analyses.remove(an);
      };
    },

    /**
     * Sun and shadow analysis: the ArcGIS ShadowCast widget accumulates shadow for the chosen day, while the app's own
     * time slider and day buttons move the sun (replaces the Daylight widget, deprecated in ArcGIS 4.34).
     */
    shadow: async () => {
      const view = this.view, p = this.plot();
      const { default: ShadowCast } = await import('@arcgis/core/widgets/ShadowCast');
      // key days of the year in Riyadh; the Expo runs 1 Oct 2030 – 31 Mar 2031
      const DAYS: [label: string, year: number, month: number, day: number][] = [
        ['21 Mar', 2031, 2, 21], ['21 Jun', 2030, 5, 21], ['23 Sep', 2030, 8, 23], ['1 Oct · opening', 2030, 9, 1], ['21 Dec', 2030, 11, 21]
      ];
      const UTC_OFFSET = 3;
      let day = DAYS[3];
      const d1 = this.widgetContainer();
      let sc: InstanceType<typeof ShadowCast> | null = null;
      try {
        sc = new ShadowCast({ view, container: d1 });
        sc.viewModel.utcOffset = UTC_OFFSET;
      } catch {
        d1.innerHTML = '<p class="muted small">Shadow cast widget unavailable.</p>';
      }
      const sun = (hours: number): void => {
        const lighting = view.environment.lighting;
        if ('date' in lighting) lighting.date = new Date(Date.UTC(day[1], day[2], day[3]) + (hours - UTC_OFFSET) * 3600000);
        lighting.directShadowsEnabled = true;
      };
      const showDays = (): void => this.buttons.set(DAYS.map(d => ({
        label: d[0], cls: d === day ? 'primary' : '',
        action: () => {
          day = d;
          if (sc) sc.viewModel.date = new Date(Date.UTC(d[1], d[2], d[3], 12 - UTC_OFFSET));
          sun(this.sliderValue());
          showDays();
        }
      })));
      if (sc) sc.viewModel.date = new Date(Date.UTC(day[1], day[2], day[3], 12 - UTC_OFFSET));
      showDays();
      this.setBody('<p>Accumulated shadow on the ground for the selected day (Riyadh, UTC+3). Use it to place shaded queues, seating and terraces.</p>',
        '<p class="muted small">Pick a day with the buttons, then move or play the time slider to see the sun and shadows through the day.</p>');
      const stopSlider = this.openSlider({
        title: 'Time of day (Riyadh)', min: 6, max: 18.5, step: 0.25, value: 10, speed: 350,
        ticks: ['06:00', '09:00', '12:00', '15:00', '18:00'],
        format: v => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`,
        onChange: v => sun(v)
      });
      this.fly({ target: this.pt([p.cx, p.cy]), zoom: 17, tilt: 35, heading: 0 } as __esri.GoToTarget3D);
      return () => {
        stopSlider();
        sc?.destroy();
        this.scene.applyLight(this.state.light(), true);
      };
    },

    /**
     * Visitor density forecast: renders hourly crowd heat maps in 3D hexagons with an animated time slider.
     */
    crowd: () => {
      const D = this.data.d, L = this.layers;
      L.crowd.visible = true;
      L.people.visible = false;
      const total = (h: number) => D.crowd.features.reduce((s, f) => s + f.properties[`h${h}`], 0);
      this.setBody('<p>Forecast visitor density per hexagon (people per 1,000 m²) for a peak Saturday in November.</p>',
        '<p class="muted small">Production: live counts from gates, Wi-Fi and cameras streamed into an ArcGIS stream layer.</p>');
      const stop = this.openSlider({
        title: 'Visitor density', min: 8, max: 23, step: 1, value: 18, speed: 900, ticks: ['08:00', '12:00', '16:00', '20:00', '23:00'], autoplay: true,
        legend: [['#78d25a', 'Low'], ['#fad23c', 'Busy'], ['#dc283c', 'Crowded']],
        format: v => `${String(v).padStart(2, '0')}:00`,
        onChange: v => {
          L.setCrowdHour(v);
          this.setLive(row('Estimated people on site', fmt(total(v) * 31)) + row('Hexagons crowded (>28)', String(D.crowd.features.filter(f => f.properties[`h${v}`] > 28).length)));
        }
      });
      this.fly({ target: this.pt(D.site.globe), zoom: 15.2, tilt: 55, heading: 10 } as __esri.GoToTarget3D);
      return () => {
        stop();
        L.crowd.visible = false;
        L.people.visible = L.mode() !== 'blueprint';
      };
    },

    /**
     * Construction timeline simulation (2026–2030): visualizes Expo site evolution quarter by quarter,
     * extruding structures in progress and placing active tower cranes.
     */
    build: () => {
      const D = this.data.d, L = this.layers, C = L.construction;
      C.visible = true;
      const crane = new WebStyleSymbol({ name: 'Tower_Crane', styleName: 'EsriRealisticTransportationStyle' });
      const lite = L.pavLite.graphics.toArray(), pav = L.pav.graphics.toArray();
      const phaseOf: Record<string, number> = {};
      D.buildings.features.forEach(f => (phaseOf[f.properties.bid] = f.properties.phase));
      const set = (y: number) => {
        L.setBuildingFilter({ year: y });
        C.removeAll();
        let under = 0;
        D.buildings.features.forEach(f => {
          const p = f.properties;
          if (p.phase <= y || p.phase > y + 1.25) return;
          const prog = clamp(1 - (p.phase - y) / 1.25, 0.05, 1), ring = f.geometry.coordinates[0].map(c => [c[0], c[1], 0]);
          under++;
          C.add(new Graphic({
            geometry: new Polygon({ rings: [ring], spatialReference: SR, hasZ: true }),
            symbol: { type: 'polygon-3d', symbolLayers: [{ type: 'extrude', size: Math.max(1, p.height * prog), material: { color: [240, 150, 50, 0.55] }, edges: { type: 'solid', color: [255, 255, 255, 0.9], size: 1 } }] } as never,
            attributes: { kind: 'construction', name: p.name + ' (under construction)' }
          }));
          if (p.height > 6 && hash(p.bid) % 2 === 0) C.add(new Graphic({ geometry: this.pt(move([p.cx, p.cy], 45, Math.min(p.w, p.d) / 2 + 6), 0), symbol: crane, attributes: { kind: 'construction', name: 'Tower crane' } }));
        });
        lite.forEach(g => {
          const sid = g.attributes?.['sid'] as string;
          g.visible = phaseOf[sid] === undefined ? y >= 2029.5 : phaseOf[sid] <= y;
        });
        pav.forEach(g => (g.visible = y >= 2029.75));
        const open = y >= 2030.5;
        L.trees.visible = y >= 2029.5;
        L.people.visible = open && L.mode() !== 'blueprint';
        L.vehicles.visible = open && L.mode() === 'realistic';
        const done = D.buildings.features.filter(f => f.properties.phase <= y).length;
        this.setLive(row('Buildings completed', `${done} / ${D.buildings.features.length}`) + row('Under construction', String(under)) +
          (open ? '<div class="row"><b>🎉 Expo 2030 opens – 1 October 2030</b></div>' : ''));
      };
      this.setBody('<p>Every building carries a completion date in the database. Orange = under construction.</p>');
      const q = (v: number) => { const yy = Math.floor(v), qq = Math.round((v - yy) * 4) + 1; return `${yy} Q${qq}`; };
      const stop = this.openSlider({ title: 'Construction programme', min: 2026.75, max: 2030.75, step: 0.25, value: 2026.75, speed: 900, ticks: ['2027', '2028', '2029', '2030', 'Opening'], format: q, onChange: set, autoplay: true });
      this.fly({ target: this.pt(D.site.globe), zoom: 15.3, tilt: 58, heading: 330 } as __esri.GoToTarget3D);
      return () => {
        stop();
        C.removeAll();
        C.visible = false;
        L.setBuildingFilter({ year: null });
        lite.forEach(g => (g.visible = true));
        pav.forEach(g => (g.visible = true));
        L.trees.visible = true;
        L.people.visible = L.mode() !== 'blueprint';
        L.vehicles.visible = L.mode() === 'realistic';
        const id = this.state.detailId();
        if (id) L.hideLite(id);
      };
    },

    /**
     * Underground utilities visualization: renders water, power, telecom, and district cooling
     * networks at their accurate sub-grade depths, making surface layers translucent.
     */
    under: () => {
      const D = this.data.d, p = this.plot();
      this.underground(true);
      const by: Record<string, { n: number; len: number }> = {};
      D.utilities.features.forEach(f => {
        const t = f.properties.type;
        by[t] = by[t] || { n: 0, len: 0 };
        by[t].n++;
        by[t].len += pathLength(f.geometry.coordinates);
      });
      const col: Record<string, string> = { water: '#1f78ff', power: '#ff3b30', telecom: '#b45cff', cooling: '#00d1c1' };
      const nm: Record<string, string> = { water: 'Water', power: 'Power (MV)', telecom: 'Telecom fibre', cooling: 'District cooling' };
      this.setBody(`<p>Utility networks at their real depth below the streets (ground made transparent). Click a pipe for depth, diameter and material.</p>${Object.entries(by).map(([k, v]) => `<div class="row"><span>${swatch(col[k])}${nm[k]}</span><span>${v.n} lines · ${fmt(v.len / 1000, 1)} km</span></div>`).join('')}`,
        '<p class="muted small">Source: utility network / as-built CAD, converted with ArcGIS Pro.</p>');
      this.fly({ position: this.pt(offset([p.cx, p.cy], -70, -95), -14), heading: 35, tilt: 96 } as __esri.GoToTarget3D, 2600);
      return () => this.underground(false);
    },

    /**
     * Skyline profile analysis: uses ArcGIS ElevationProfile widget to trace elevation and
     * structure clearance along the route from Expo Metro Station to the plot.
     */
    profile: async () => {
      const st = this.data.d.site.station, r = this.data.router.route(st, this.ent()), view = this.view;
      const line = new Graphic({ geometry: new Polyline({ paths: [r.coords], spatialReference: SR }), symbol: this.lineSym([240, 190, 40, 1], 5) });
      this.layers.routes.add(line);
      this.setBody(`<p>Profile along the ${fmt(r.length)} m walk from Expo Station to <b>${esc(this.plot().pid)}</b>. The “view” line shows buildings, palms and the viaduct the visitor passes.</p>`);
      const { default: ElevationProfile } = await import('@arcgis/core/widgets/ElevationProfile');
      const w = new ElevationProfile({
        view, container: this.widgetContainer(), input: line,
        profiles: [{ type: 'ground' }, { type: 'view', title: 'Buildings & landscape' }],
        visibleElements: { selectButton: false, sketchButton: false, legend: true }
      });
      this.fly({ target: line.geometry, tilt: 50, heading: 200 } as __esri.GoToTarget3D);
      return () => w.destroy();
    },

    /**
     * Direct line and area measurement with the ArcGIS measurement analyses (DirectLineMeasurementAnalysis /
     * AreaMeasurementAnalysis – the core API behind the deprecated DirectLineMeasurement3D / AreaMeasurement3D widgets).
     * Results are shown live in the tool panel.
     */
    measure: async () => {
      const [{ default: DirectLineMeasurementAnalysis }, { default: AreaMeasurementAnalysis }, reactive] = await Promise.all([
        import('@arcgis/core/analysis/DirectLineMeasurementAnalysis'), import('@arcgis/core/analysis/AreaMeasurementAnalysis'), import('@arcgis/core/core/reactiveUtils')
      ]);
      const view = this.view;
      const UNIT: Record<string, string> = {
        meters: 'm', kilometers: 'km', centimeters: 'cm', millimeters: 'mm',
        'square-meters': 'm²', 'square-kilometers': 'km²', hectares: 'ha'
      };
      const q = (x: { value: number; unit: string } | null | undefined): string =>
        x ? `${fmt(x.value, Math.abs(x.value) < 100 ? 2 : 0)} ${UNIT[x.unit] ?? x.unit}` : '–';
      const row = (label: string, value: string): string => `<div class="row"><span>${label}</span><b>${value}</b></div>`;
      let an: InstanceType<typeof DirectLineMeasurementAnalysis> | InstanceType<typeof AreaMeasurementAnalysis> | null = null;
      let watcher: __esri.WatchHandle | null = null;
      let abort: AbortController | null = null;
      let run = 0;
      const clear = (): void => {
        abort?.abort();
        watcher?.remove();
        if (an) view.analyses.remove(an);
        an = null; watcher = null; abort = null;
      };
      const runTool = async (kind: 'dist' | 'area'): Promise<void> => {
        clear();
        const my = ++run;
        this.buttons.set([
          { label: '📏 Distance', cls: kind === 'dist' ? 'primary' : '', action: () => void runTool('dist') },
          { label: '⬛ Area', cls: kind === 'area' ? 'primary' : '', action: () => void runTool('area') }
        ]);
        const a = kind === 'dist' ? new DirectLineMeasurementAnalysis({ unit: 'metric' }) : new AreaMeasurementAnalysis({ unit: 'metric' });
        an = a;
        view.analyses.add(a);
        this.setLive(row(kind === 'dist' ? 'Distance' : 'Area', 'click on the map…'));
        const av = await view.whenAnalysisView(a);
        if (my !== run) return;
        watcher = reactive.watch(() => (av as { result?: unknown }).result, r => {
          if (!r) return;
          if (kind === 'dist') {
            const d = r as __esri.DirectLineMeasurementAnalysisResult;
            this.setLive(row('Direct distance', q(d.directDistance)) + row('Horizontal', q(d.horizontalDistance)) + row('Vertical (height difference)', q(d.verticalDistance)));
          } else {
            const d = r as __esri.AreaMeasurementAnalysisResult;
            this.setLive(row('Area', q(d.area)) + row('Perimeter', q(d.perimeter)));
          }
        }, { initial: true });
        abort = new AbortController();
        (av as { place(o: { signal: AbortSignal }): Promise<unknown> }).place({ signal: abort.signal }).catch(() => undefined);
      };
      this.setBody('<p>Click points on the model to measure. Distance shows direct, horizontal and vertical (height) values.</p>',
        '<p class="muted small">Click to add points; double-click to finish. Press a button again to start a new measurement.</p>');
      void runTool('dist');
      return () => {
        run++;
        clear();
      };
    },

    /**
     * Building section slice: creates an interactive 3D cutting plane through the pavilion structure,
     * with slider control to reveal interior architectural floor plans and mezzanines.
     */
    slice: () => {
      const s = this.state.detailSpec()!, m = this.meta(), P = pavilionPlan(s), view = this.view;
      const mk = (off: number) => new SlicePlane({
        position: this.pt(move(m.hall, m.frontHeading, off), P.height / 2 + s.base), heading: m.frontHeading, tilt: 0,
        width: Math.max(s.W, s.D) * 1.6, height: P.height * 2.5
      });
      const an = new SliceAnalysis({ shape: mk(0), excludeGroundSurface: true });
      view.analyses.add(an);
      this.layers.analysis3d.visible = true;
      this.setBody(`<p>A vertical section through <b>${esc(s.label)}</b>. Drag the slider to move the cut through the building.</p>`,
        '<p class="muted small">Works the same on BIM models published as Building Scene Layers.</p>');
      this.range.set({ min: -s.D / 2, max: s.D / 2, step: 0.5, value: 0, onInput: v => (an.shape = mk(v)) });
      this.state.slice.set(true);
      this.fly({ position: this.pt(move(m.hall, m.frontHeading + 60, Math.max(s.W, s.D) * 2.2), P.height * 1.4 + 20), heading: (m.frontHeading + 240) % 360, tilt: 68 } as __esri.GoToTarget3D);
      return () => {
        view.analyses.remove(an);
        this.state.slice.set(false);
      };
    },

    /**
     * Zone drawing and subdivision capacity check: lets the user sketch a custom boundary polygon
     * and automatically calculates area, perimeter, 40x40m plot fit, and existing impacted assets.
     */
    zone: async () => {
      const D = this.data.d, L = this.layers, view = this.view;
      const [{ default: Sketch }] = await Promise.all([import('@arcgis/core/widgets/Sketch'), geodeticAreaOperator.load(), geodeticLengthOperator.load()]);
      this.setBody('<p>Draw a polygon, rectangle or circle anywhere on the site.</p>');
      this.setLive('<div class="muted small">Waiting for a sketch…</div>');
      const sk = new Sketch({
        view, layer: L.sketch, container: this.widgetContainer(), creationMode: 'update', availableCreateTools: ['polygon', 'rectangle', 'circle'],
        visibleElements: { selectionTools: { 'lasso-selection': false, 'rectangle-selection': false }, settingsMenu: false, undoRedoMenu: false }
      });
      const evaluate = (geom: __esri.Geometry | null | undefined) => {
        if (!geom) return;
        const g = (geom.spatialReference?.isWebMercator ? webMercatorUtils.webMercatorToGeographic(geom as Polygon) : geom) as Polygon;
        const ring = g.rings[0], local = ring.map(p => xy(p));
        const area = geodeticAreaOperator.execute(g, { unit: 'square-meters' }), per = geodeticLengthOperator.execute(g, { unit: 'meters' });
        const inside = (p: readonly number[]) => inPoly(xy(p), local);
        const xs = local.map(p => p[0]), ys = local.map(p => p[1]), cells: XY[][] = [];
        for (let x = Math.min(...xs) + 3; x + 40 <= Math.max(...xs); x += 46) {
          for (let y = Math.min(...ys) + 3; y + 40 <= Math.max(...ys); y += 46) {
            const q: XY[] = [[x, y], [x + 40, y], [x + 40, y + 40], [x, y + 40]];
            if (q.every(p => inPoly(p, local))) cells.push(q);
          }
        }
        L.analysis.removeAll();
        cells.forEach((q, i) => L.analysis.add(new Graphic({
          geometry: new Polygon({ rings: [q.map(p => ll(p))], spatialReference: SR }),
          symbol: this.fillSym([46, 184, 114, 0.45], [255, 255, 255]), attributes: { kind: 'zone', name: `Proposed plot Z-${i + 1}` }
        })));
        const svc = D.services.features.filter(f => inside(f.geometry.coordinates)).length, bld = D.buildings.features.filter(f => inside([f.properties.cx, f.properties.cy])).length;
        const trees = D.trees.features.filter(f => inside(f.geometry.coordinates)).length, util = D.utilities.features.filter(f => f.geometry.coordinates.some(inside)).length;
        this.setLive(row('Area', `${fmt(area)} m² (${fmt(area / 10000, 2)} ha)`) + row('Perimeter', `${fmt(per)} m`) +
          row('40 × 40 plots that fit (6 m lanes)', String(cells.length)) + row('Event capacity (2 p/m², 60% usable)', fmt(area * 0.6 * 2)) +
          row('Existing buildings inside', String(bld)) + row('Services inside', String(svc)) + row('Palms affected', String(trees)) + row('Utility lines crossing', String(util)));
      };
      sk.on('create', e => { if (e.state === 'complete') evaluate(e.graphic?.geometry); });
      sk.on('update', e => {
        const ev = e as { graphics: Graphic[]; state: string; toolEventInfo?: { type: string } | null };
        if (ev.graphics[0] && (ev.state === 'complete' || (ev.toolEventInfo && /stop/.test(ev.toolEventInfo.type)))) evaluate(ev.graphics[0].geometry);
      });
      void sk.create('rectangle');
      this.fly({ target: this.pt(D.site.globe), zoom: 15.6, tilt: 0, heading: 0 } as __esri.GoToTarget3D);
      return () => {
        sk.destroy();
        L.sketch.removeAll();
      };
    }
  };
}
